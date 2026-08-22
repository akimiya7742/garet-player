// Utility for managing cached lyrics and romanization data in localStorage

export type RomajiSource = "Built-in" | "kuroshiro" | "Gemini AI";

export interface StoredRomanizationData {
  lines: string[];
  source: RomajiSource;
}

const LYRICS_CACHE_PREFIX = "garret_lyrics_";
const ROMAJI_CACHE_PREFIX = "garret_romaji_";

// In-memory fallback
const memoryLyricsCache = new Map<string, string>();
const memoryRomajiCache = new Map<string, StoredRomanizationData>();

export function getLyricsCacheKey(title: string, artist?: string): string {
  const cleanTitle = (title || "").trim().toLowerCase();
  const cleanArtist = (artist || "").trim().toLowerCase();
  return `${cleanTitle}:::${cleanArtist}`;
}

export function getStoredLyrics(key: string): string | null {
  if (memoryLyricsCache.has(key)) {
    return memoryLyricsCache.get(key)!;
  }
  if (typeof window === "undefined") return null;
  try {
    const val = localStorage.getItem(`${LYRICS_CACHE_PREFIX}${key}`);
    if (val) {
      memoryLyricsCache.set(key, val);
      return val;
    }
  } catch (e) {
    console.warn("[LyricsCache] Read error:", e);
  }
  return null;
}

export function saveStoredLyrics(key: string, content: string): void {
  if (!key || !content) return;
  memoryLyricsCache.set(key, content);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${LYRICS_CACHE_PREFIX}${key}`, content);
  } catch (e) {
    console.warn("[LyricsCache] Write error (storage might be full):", e);
  }
}

export function getStoredRomanization(key: string): StoredRomanizationData | null {
  if (memoryRomajiCache.has(key)) {
    return memoryRomajiCache.get(key)!;
  }
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${ROMAJI_CACHE_PREFIX}${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const data: StoredRomanizationData = { lines: parsed, source: "kuroshiro" };
        memoryRomajiCache.set(key, data);
        return data;
      }
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.lines)) {
        const data: StoredRomanizationData = {
          lines: parsed.lines,
          source: (parsed.source as RomajiSource) || "kuroshiro",
        };
        memoryRomajiCache.set(key, data);
        return data;
      }
    }
  } catch (e) {
    console.warn("[LyricsCache] Romaji read error:", e);
  }
  return null;
}

export function saveStoredRomanization(
  key: string,
  lines: string[],
  source: RomajiSource = "kuroshiro"
): void {
  if (!key || !lines || lines.length === 0) return;
  const payload: StoredRomanizationData = { lines, source };
  memoryRomajiCache.set(key, payload);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${ROMAJI_CACHE_PREFIX}${key}`, JSON.stringify(payload));
  } catch (e) {
    console.warn("[LyricsCache] Romaji write error:", e);
  }
}

/**
 * Clears all cached lyrics and romanization from localStorage and in-memory map.
 * Dispatches a 'lyrics-cache-cleared' event so components can refresh.
 */
export function clearAllLyricsCache(): { clearedCount: number } {
  let clearedCount = 0;
  memoryLyricsCache.clear();
  memoryRomajiCache.clear();

  if (typeof window !== "undefined") {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith(LYRICS_CACHE_PREFIX) || k.startsWith(ROMAJI_CACHE_PREFIX))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => {
        localStorage.removeItem(k);
        clearedCount++;
      });

      window.dispatchEvent(new CustomEvent("lyrics-cache-cleared", { detail: { clearedCount } }));
    } catch (e) {
      console.warn("[LyricsCache] Clear error:", e);
    }
  }

  return { clearedCount };
}

