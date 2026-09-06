"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Music, FileText, Loader2, RefreshCw, Languages, Sparkles } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useMusicWS } from "../contexts/MusicWSContext";
import { getApiUrl } from "../utils/apiUrl";
import {
  hasJapaneseInLines,
  hasJapanese,
  romanizeLyricsLines,
  parseRomanizationFromPayload,
} from "../utils/japanese";
import {
  getLyricsCacheKey,
  getStoredLyrics,
  saveStoredLyrics,
  getStoredRomanization,
  saveStoredRomanization,
  RomajiSource,
} from "../utils/lyricsCache";
import styles from "./LyricsPanel.module.css";

interface SyncedLine {
  time: number;
  text: string;
}

function parseLRC(raw: string): { lines: SyncedLine[]; isSynced: boolean } {
  const lrcRegex = /^\[\s*(\d{1,3})\s*:\s*(\d{2})(?:\s*[.:]\s*(\d+))?\s*\]\s*(.*)/;
  const lines: SyncedLine[] = [];
  let isSynced = false;

  for (const rawLine of raw.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const match = trimmed.match(lrcRegex);
    if (match) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      const sub = match[3] ?? "0";
      const ms = sub.length <= 2
        ? parseInt(sub, 10) * 10
        : parseInt(sub.substring(0, 3), 10);
      const timeInMs = (mins * 60 + secs) * 1000 + ms;
      const text = match[4].trim();
      lines.push({ time: timeInMs, text });
      isSynced = true;
    } else {
      lines.push({ time: -1, text: trimmed });
    }
  }

  if (isSynced) {
    return {
      lines: lines.filter((l) => l.time >= 0).sort((a, b) => a.time - b.time),
      isSynced: true,
    };
  }
  return { lines, isSynced: false };
}

function extractLyrics(data: unknown): { content: string; preferSynced: boolean } {
  if (typeof data === "string") return { content: data, preferSynced: false };
  if (!data || typeof data !== "object") return { content: "", preferSynced: false };

  const d = data as Record<string, unknown>;

  const synced =
    (typeof d.synced === "string" && d.synced) ||
    (typeof d.syncedLyrics === "string" && d.syncedLyrics) ||
    (typeof d.lrc === "string" && d.lrc) ||
    (typeof d.subtitles === "string" && d.subtitles) ||
    "";

  if (synced.trim()) return { content: synced.trim(), preferSynced: true };

  const plain =
    (typeof d.lyrics === "string" && d.lyrics) ||
    (typeof d.text === "string" && d.text) ||
    (typeof d.content === "string" && d.content) ||
    (typeof d.plainLyrics === "string" && d.plainLyrics) ||
    (typeof d.body === "string" && d.body) ||
    "";

  return { content: plain.trim(), preferSynced: false };
}

export const LyricsPanel: React.FC = () => {
  const { token } = useAuth();
  const { statistics } = useMusicWS();

  const trackUrl    = statistics?.track?.url ?? null;
  const trackTitle  = statistics?.track?.title ?? null;
  const isPaused    = statistics?.paused ?? true;
  const hasTrack    = !!statistics?.track;

  const isPlaying = hasTrack && !isPaused;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const wsTimestampRef = useRef<number>(statistics?.timestamp ?? 0);

  const [lyrics, setLyrics]               = useState("");
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [searchQuery, setSearchQuery]     = useState("");
  const [syncedLines, setSyncedLines]     = useState<SyncedLine[]>([]);
  const [isSynced, setIsSynced]           = useState(false);
  const [currentLineIndex, setCurrentLineIndex] = useState(-1);

  const [romajiMode, setRomajiMode]       = useState<"both" | "romaji" | "off">("both");
  const [romanizedLines, setRomanizedLines] = useState<string[]>([]);
  const [romajiSource, setRomajiSource]   = useState<RomajiSource | null>(null);
  const [isRomanizing, setIsRomanizing]   = useState(false);

  // FIX: Theo dõi key của lyrics hiện tại để phát hiện khi fetch mới
  const activeLyricsKeyRef = useRef<string>("");
  const hasBuiltInRef = useRef<boolean>(false);

  const isJapaneseLyrics = hasJapanese(lyrics) || hasJapaneseInLines(syncedLines);

  const localTimeRef   = useRef<number>(statistics?.timestamp ?? 0);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollAreaRef  = useRef<HTMLDivElement>(null);
  const activeLineRef  = useRef<HTMLParagraphElement>(null);
  const syncedLinesRef = useRef<SyncedLine[]>([]);
  syncedLinesRef.current = syncedLines;

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "";

  // ── Auto-Romanize Fallback (Kuroshiro -> Gemini AI) ──────────────────────────
  useEffect(() => {
    if (!lyrics || syncedLines.length === 0 || !isJapaneseLyrics) {
      setRomanizedLines([]);
      setRomajiSource(null);
      setIsRomanizing(false);
      return;
    }

    // FIX: Kiểm tra flag TRƯỚC khi tiếp tục
    if (hasBuiltInRef.current) {
      console.log("[Lyrics] Built-in romanization already applied, skipping fallback");
      setIsRomanizing(false);
      return;
    }

    // BỎ QUA NẾU: Đã có kết quả romaji hợp lệ từ trước
    if (
      romajiSource === "Built-in" ||
      (romanizedLines.length === syncedLines.length &&
        romajiSource !== null &&
        romanizedLines.some((l) => l.trim() !== ""))
    ) {
      console.log("[Lyrics] Valid romanization already exists, skipping fallback");
      setIsRomanizing(false);
      return;
    }

    const rawLines = syncedLines.map((l) => l.text);
    const lyricsKey = `${trackTitle || "track"}_${rawLines.length}_${lyrics.slice(0, 30)}`;

    // FIX: Chỉ gọi fallback nếu key khác (fetch mới) hoặc romanizedLines chưa được set
    if (activeLyricsKeyRef.current === lyricsKey && romanizedLines.length > 0) {
      console.log("[Lyrics] Romanization already in progress for this track");
      return;
    }

    activeLyricsKeyRef.current = lyricsKey;
    setIsRomanizing(true);
    const cacheKey = `${trackTitle || "lyrics"}_${rawLines.length}_${rawLines.slice(0, 3).join("_")}`;

    console.log("[Lyrics] Starting fallback romanization...");
    romanizeLyricsLines(rawLines, cacheKey)
      .then((res) => {
        // FIX: Kiểm tra key và flag một lần nữa để tránh override built-in
        if (
          activeLyricsKeyRef.current === lyricsKey &&
          !hasBuiltInRef.current &&
          res &&
          Array.isArray(res.lines) &&
          res.lines.length > 0
        ) {
          console.log(
            "[Lyrics] Fallback Romanization applied. Lines:",
            res.lines.length,
            "Source:",
            res.source
          );
          setRomanizedLines(res.lines);
          setRomajiSource(res.source);
        } else if (hasBuiltInRef.current) {
          console.log("[Lyrics] Fallback skipped: built-in romanization already set");
        }
      })
      .catch((err) => {
        console.error("[Lyrics] Romanization error:", err);
      })
      .finally(() => {
        if (activeLyricsKeyRef.current === lyricsKey) {
          setIsRomanizing(false);
        }
      });
  }, [lyrics, syncedLines, isJapaneseLyrics, trackTitle]);

  // ── Fetch lyrics ──────────────────────────────────────────────────────────
  const fetchLyrics = useCallback(async (queryText: string, bypassCache = false) => {
    if (!queryText.trim() || !token) return;

    const cacheKey = getLyricsCacheKey(queryText);

    // FIX: Reset flag TRƯỚC khi fetch mới
    hasBuiltInRef.current = false;
    activeLyricsKeyRef.current = "";

    if (!bypassCache) {
      const cached = getStoredLyrics(cacheKey);
      const cachedRomaji = getStoredRomanization(cacheKey);
      if (cached) {
        console.log("[Lyrics] Loaded lyrics from cache for:", queryText);
        setLyrics(cached);
        if (cachedRomaji && Array.isArray(cachedRomaji.lines) && cachedRomaji.lines.length > 0) {
          setRomanizedLines(cachedRomaji.lines);
          const source = cachedRomaji.source || "kuroshiro";
          setRomajiSource(source);
          // FIX: Set flag ngay nếu cached romanization là built-in
          if (source === "Built-in") {
            hasBuiltInRef.current = true;
            console.log("[Lyrics] Cached built-in romanization loaded");
          }
        }
        setError(null);
        setLoading(false);
        return;
      }
    }

    setLoading(true);
    setError(null);
    setLyrics("");
    setSyncedLines([]);
    setRomanizedLines([]);
    setRomajiSource(null);
    setCurrentLineIndex(-1);

    try {
      const url = `${getApiUrl(backendUrl, "music/lyrics")}?q=${encodeURIComponent(queryText)}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "ngrok-skip-browser-warning": "69420",
        },
      });

      if (res.ok) {
        const data = await res.json();
        console.log("[Lyrics] API response:", data);

        const { content } = extractLyrics(data);

        if (content) {
          // FIX: Parse LRC trước khi check romanization
          const { lines: parsedLines } = parseLRC(content);

          // 1. Primary: Check if built-in romanization exists in API response
          const rawRomanization =
            (typeof data.lyrics_romanization === "string" && data.lyrics_romanization) ||
            (typeof data.romanized_lyrics === "string" && data.romanized_lyrics) ||
            (typeof data.romanizedLyrics === "string" && data.romanizedLyrics) ||
            "";

          // FIX: Set flag TRƯỚC khi cập nhật state
          let hasBuiltIn = false;
          let builtInLines: string[] = [];

          if (rawRomanization && rawRomanization.trim()) {
            const parsed = parseRomanizationFromPayload(rawRomanization, parsedLines);
            if (parsed && parsed.length > 0) {
              hasBuiltIn = true;
              builtInLines = parsed;
              console.log("[Lyrics] Found built-in romanization from API, lines:", parsed.length);
            }
          }

          // Update state and refs in correct order
          setLyrics(content);
          saveStoredLyrics(cacheKey, content);
          setSyncedLines(parsedLines);
          setIsSynced(parsedLines.length > 0);

          if (hasBuiltIn) {
            // FIX: Set flag TRƯỚC state update
            hasBuiltInRef.current = true;
            console.log("[Lyrics] Setting built-in romanization, flag set before state update");
            
            setRomanizedLines(builtInLines);
            setRomajiSource("Built-in");
            saveStoredRomanization(cacheKey, builtInLines, "Built-in");
          }
          // Nếu không có built-in, để useEffect tự xử lý fallback
        } else {
          setError("No lyrics found for this track.");
        }
      } else {
        setError("Could not find lyrics for this song.");
      }
    } catch (err) {
      console.error("[Lyrics] Fetch error:", err);
      setError("Network error fetching lyrics.");
    } finally {
      setLoading(false);
    }
  }, [backendUrl, token]);

  useEffect(() => {
    const handleCacheCleared = () => {
      console.log("[Lyrics] Cache cleared notification received.");
      if (trackTitle) {
        fetchLyrics(trackTitle, true);
      }
    };
    window.addEventListener("lyrics-cache-cleared", handleCacheCleared);
    return () => window.removeEventListener("lyrics-cache-cleared", handleCacheCleared);
  }, [trackTitle, fetchLyrics]);

  useEffect(() => {
    if (trackTitle && trackUrl) {
      setSearchQuery(trackTitle);
      const cleanedTitle = trackTitle
        .replace(/\(Official\s*(?:Music\s*)?Video\)/gi, "")
        .replace(/\[Official\s*(?:Music\s*)?Video\]/gi, "")
        .replace(/\[MV\]/gi, "")
        .replace(/\((?:Official\s*)?Audio\)/gi, "")
        .replace(/\(Lyrics(?:\s*Video)?\)/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      fetchLyrics(cleanedTitle);
    } else if (!trackUrl) {
      setLyrics("");
      setError(null);
      setSyncedLines([]);
      setRomanizedLines([]);
      setRomajiSource(null);
      setCurrentLineIndex(-1);
      hasBuiltInRef.current = false;
    }
  }, [trackUrl, trackTitle, fetchLyrics]);

  useEffect(() => {
    if (!lyrics) {
      setSyncedLines([]);
      setIsSynced(false);
      return;
    }
    const { lines, isSynced: synced } = parseLRC(lyrics);
    setSyncedLines(lines);
    setIsSynced(synced);
    setCurrentLineIndex(-1);
  }, [lyrics]);

  useEffect(() => {
    const wsTs = statistics?.timestamp ?? 0;
    wsTimestampRef.current = wsTs;
    localTimeRef.current = wsTs;
  }, [statistics?.timestamp]);

  useEffect(() => {
    const TICK = 100;
    intervalRef.current = setInterval(() => {
      if (!isPlayingRef.current) return;
      localTimeRef.current += TICK;

      const lines = syncedLinesRef.current;
      if (lines.length === 0 || lines[0].time < 0) return;

      let idx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (localTimeRef.current >= lines[i].time) {
          idx = i;
        } else {
          break;
        }
      }
      setCurrentLineIndex((prev) => (prev === idx ? prev : idx));
    }, TICK);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (currentLineIndex >= 0 && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentLineIndex]);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLyrics(searchQuery);
  };

  return (
    <div className={`content-surface ${styles.lyricsContainer}`}>
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <FileText className={styles.headerIcon} />
          <h2 className={styles.title}>
            Lyrics
            {isSynced && syncedLines.length > 0 && (
              <span className={styles.syncBadge}>SYNCED</span>
            )}
            {isJapaneseLyrics && (
              <span className={styles.romajiBadge} title="Japanese lyrics detected">
                <Languages style={{ width: 11, height: 11 }} />
                Romaji
                {isRomanizing && (
                  <Loader2 style={{ width: 10, height: 10, animation: "spin 1s linear infinite" }} />
                )}
              </span>
            )}
          </h2>
        </div>
        <div className={styles.headerActions}>
          {hasTrack && (
            <button
              type="button"
              onClick={() => trackTitle && fetchLyrics(trackTitle)}
              className={styles.refreshBtn}
              disabled={loading}
              title="Refresh lyrics"
              aria-label="Refresh lyrics"
            >
              <RefreshCw className={`${styles.refreshIcon} ${loading ? styles.spinning : ""}`} />
            </button>
          )}
        </div>
      </div>

      {isJapaneseLyrics && lyrics && syncedLines.length > 0 && (
        <div className={styles.romajiControls}>
          <div className={styles.romajiControlsLeft}>
            <span className={styles.romajiLabel}>
              <Sparkles style={{ width: 12, height: 12, color: "var(--accent-secondary)" }} />
              Romaji Mode:
            </span>
            <button
              type="button"
              className={`${styles.romajiModeBtn} ${romajiMode === "both" ? styles.romajiModeBtnActive : ""}`}
              onClick={() => setRomajiMode("both")}
              title="Show Japanese Kanji/Kana with Romaji subtext"
            >
              JP + Romaji
            </button>
            <button
              type="button"
              className={`${styles.romajiModeBtn} ${romajiMode === "romaji" ? styles.romajiModeBtnActive : ""}`}
              onClick={() => setRomajiMode("romaji")}
              title="Show Romaji only"
            >
              Romaji Only
            </button>
            <button
              type="button"
              className={`${styles.romajiModeBtn} ${romajiMode === "off" ? styles.romajiModeBtnActive : ""}`}
              onClick={() => setRomajiMode("off")}
              title="Show original Japanese text only"
            >
              Original
            </button>
          </div>

          {romajiMode !== "off" && (
            <div className={styles.romajiControlsRight}>
              {isRomanizing ? (
                <span className={styles.romajiStatus}>
                  <Loader2 className={styles.romajiSpinner} />
                  Romanizing...
                </span>
              ) : romajiSource ? (
                <span
                  className={styles.romajiSourceBadge}
                  title={`Romanization source: ${romajiSource}`}
                >
                  Source: <strong className={styles.romajiSourceValue}>{romajiSource}</strong>
                </span>
              ) : null}
            </div>
          )}
        </div>
      )}

      {hasTrack && (
        <form onSubmit={handleManualSearch} className={styles.searchBar}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search lyrics manually..."
            className={`glass-input ${styles.searchInput}`}
            aria-label="Manual lyrics search input"
          />
          <button type="submit" className={`glass-btn ${styles.searchBtn}`} disabled={loading}>
            Search
          </button>
        </form>
      )}

      <div ref={scrollAreaRef} className={styles.scrollArea}>
        {loading && (
          <div className={styles.loadingState}>
            <Loader2 className={styles.spinner} />
            <p>Fetching lyrics...</p>
          </div>
        )}

        {!loading && error && (
          <div className={styles.errorState}>
            <Music className={styles.errorIcon} />
            <p className={styles.errorText}>{error}</p>
            <p className={styles.errorSubtext}>Try the manual search bar above.</p>
          </div>
        )}

        {!loading && !hasTrack && (
          <div className={styles.emptyState}>
            <Music className={styles.emptyIcon} />
            <p className={styles.emptyText}>No track active</p>
            <p className={styles.emptySubtext}>Play a track to view synced lyrics!</p>
          </div>
        )}

        {!loading && lyrics && syncedLines.length > 0 && (
          <div className={styles.lyricsList}>
            {syncedLines.map((line, idx) => {
              const isActive = idx === currentLineIndex;
              const isPast   = isSynced && idx < currentLineIndex;
              const romajiLine = (romanizedLines[idx] || "").trim();
              const hasRomaji =
                isJapaneseLyrics &&
                romajiLine !== "" &&
                romajiLine.toLowerCase() !== line.text.trim().toLowerCase();

              let mainText = line.text;
              let subText: string | null = null;

              if (romajiMode === "romaji" && hasRomaji) {
                mainText = romajiLine;
              } else if (romajiMode === "both" && hasRomaji) {
                mainText = line.text;
                subText = romajiLine;
              }

              return (
                <div
                  key={idx}
                  ref={isActive ? activeLineRef : null}
                  className={[
                    styles.lyricsLineContainer,
                    isActive ? styles.lyricsLineContainerActive : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <p
                    className={[
                      styles.lyricsLine,
                      isActive ? styles.lyricsLineActive : "",
                      isPast   ? styles.lyricsLinePast   : "",
                      line.text === "" ? styles.breakLine : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {mainText === "" ? "•" : mainText}
                  </p>
                  {subText && (
                    <span
                      className={[
                        styles.romajiSubline,
                        isActive ? styles.romajiSublineActive : "",
                        isPast   ? styles.romajiSublinePast   : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {subText}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LyricsPanel;
