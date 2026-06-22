"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { Music, FileText, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useMusicWS } from "../contexts/MusicWSContext";import { getApiUrl } from \"../utils/apiUrl\";import styles from "./LyricsPanel.module.css";

interface SyncedLine {
  time: number; // milliseconds; -1 = unsynced plain text
  text: string;
}

// Parse an LRC string into timed lines.
// Handles: [mm:ss.xx], [mm:ss.xxx], [mm:ss] — ignores metadata tags like [ti:…]
function parseLRC(raw: string): { lines: SyncedLine[]; isSynced: boolean } {
  const lrcRegex = /^\[(\d{1,3}):(\d{2})(?:[.:](\d+))?\](.*)/;
  const lines: SyncedLine[] = [];
  let isSynced = false;

  for (const rawLine of raw.split("\n")) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const match = trimmed.match(lrcRegex);
    if (match) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      // Normalize sub-second part to ms (could be 2 or 3 digits)
      const sub = match[3] ?? "0";
      const ms = sub.length <= 2
        ? parseInt(sub, 10) * 10   // centiseconds → ms
        : parseInt(sub.substring(0, 3), 10); // already ms
      const timeInMs = (mins * 60 + secs) * 1000 + ms;
      const text = match[4].trim();
      lines.push({ time: timeInMs, text });
      isSynced = true;
    } else {
      lines.push({ time: -1, text: trimmed });
    }
  }

  if (isSynced) {
    // Keep only timed lines (drop plain-text lines mixed in) and sort ascending
    return {
      lines: lines.filter((l) => l.time >= 0).sort((a, b) => a.time - b.time),
      isSynced: true,
    };
  }
  return { lines, isSynced: false };
}

// Extract the most useful lyrics string from any API response shape
function extractLyrics(data: unknown): { content: string; preferSynced: boolean } {
  if (typeof data === "string") return { content: data, preferSynced: false };
  if (!data || typeof data !== "object") return { content: "", preferSynced: false };

  const d = data as Record<string, unknown>;

  // LRCLIB / common synced key — prefer these first
  const synced =
    (typeof d.synced === "string" && d.synced) ||         // LRCLIB: { synced: "[00:08.11] ..." }
    (typeof d.syncedLyrics === "string" && d.syncedLyrics) ||
    (typeof d.lrc === "string" && d.lrc) ||
    (typeof d.subtitles === "string" && d.subtitles) ||
    "";

  if (synced.trim()) return { content: synced.trim(), preferSynced: true };

  // Plain-text fallbacks
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

  // Derive stable primitives — avoids object-reference churn from WS updates
  const trackUrl    = statistics?.track?.url ?? null;
  const trackTitle  = statistics?.track?.title ?? null;
  const isPaused    = statistics?.paused ?? true;
  const hasTrack    = !!statistics?.track;

  // FIX #1: stable boolean so the ticking interval isn't rebuilt every WS heartbeat
  const isPlaying = hasTrack && !isPaused;

  // Use a ref so the interval closure can read the latest value without re-creating
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

  // FIX #2: store local playback time in a ref and only use setState for active-line changes
  // This avoids the "sync override kills ticking" problem entirely.
  const localTimeRef   = useRef<number>(statistics?.timestamp ?? 0);
  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollAreaRef  = useRef<HTMLDivElement>(null);
  const activeLineRef  = useRef<HTMLParagraphElement>(null);
  const syncedLinesRef = useRef<SyncedLine[]>([]);
  syncedLinesRef.current = syncedLines;

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_API_URL || "";

  // ── Fetch lyrics ──────────────────────────────────────────────────────────
  const fetchLyrics = useCallback(async (queryText: string) => {
    if (!queryText.trim() || !token) return;

    setLoading(true);
    setError(null);
    setLyrics("");
    setSyncedLines([]);
    setCurrentLineIndex(-1);

    try {
      const url = `${getApiUrl(backendUrl, \"music/lyrics\")}?q=${encodeURIComponent(queryText)}`;
      const res = await fetch(url, {
          headers: {
            Authorization: `Bearer ${token}`,
            "ngrok-skip-browser-warning": "69420",
          },
        }
      );

      if (res.ok) {
        const data = await res.json();
        console.log("[Lyrics] API response:", data);

        // FIX #3: check all known API response keys, prefer synced LRC
        const { content, preferSynced } = extractLyrics(data);

        if (content) {
          console.log("[Lyrics] Content found, preferSynced:", preferSynced);
          setLyrics(content);
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

  // ── Auto-fetch once when the track changes ───────────────────────────────
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
      setCurrentLineIndex(-1);
    }
  }, [trackUrl, trackTitle]); // intentionally omit fetchLyrics to not re-trigger on token refresh

  // ── Parse LRC whenever lyrics text changes ───────────────────────────────
  useEffect(() => {
    if (!lyrics) {
      setSyncedLines([]);
      setIsSynced(false);
      return;
    }
    const { lines, isSynced: synced } = parseLRC(lyrics);
    console.log("[Lyrics] Parsed lines:", lines.length, "isSynced:", synced);
    setSyncedLines(lines);
    setIsSynced(synced);
    setCurrentLineIndex(-1);
  }, [lyrics]);

  // ── Snap localTime to WS timestamp on each heartbeat ────────────────────
  // FIX #2: Update only the ref, not state — no re-render storm
  useEffect(() => {
    const wsTs = statistics?.timestamp ?? 0;
    wsTimestampRef.current = wsTs;
    localTimeRef.current = wsTs;
  }, [statistics?.timestamp]);

  // ── Single long-lived interval that ticks localTime every 100ms ──────────
  // FIX #1: created ONCE on mount, reads isPlaying from ref to avoid restarts
  useEffect(() => {
    const TICK = 100;
    intervalRef.current = setInterval(() => {
      if (!isPlayingRef.current) return; // paused — don't advance
      localTimeRef.current += TICK;

      // Compute active line directly from ref — no setState for time
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
      // Only trigger a re-render when the active line actually changes
      setCurrentLineIndex((prev) => (prev === idx ? prev : idx));
    }, TICK);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []); // empty deps — single instance for the component's lifetime

  // ── Scroll active line into view ─────────────────────────────────────────
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
    <div className={`glass-panel ${styles.lyricsContainer}`}>
      <div className={styles.header}>
        <div className={styles.titleWrapper}>
          <FileText className={styles.headerIcon} />
          <h2 className={styles.title}>
            Lyrics
            {isSynced && syncedLines.length > 0 && (
              <span className={styles.syncBadge}>SYNCED</span>
            )}
          </h2>
        </div>
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

              return (
                <p
                  key={idx}
                  ref={isActive ? activeLineRef : null}
                  className={[
                    styles.lyricsLine,
                    isActive ? styles.lyricsLineActive : "",
                    isPast   ? styles.lyricsLinePast   : "",
                    line.text === "" ? styles.breakLine : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {line.text === "" ? "•" : line.text}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default LyricsPanel;
