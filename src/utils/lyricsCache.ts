// Utility for managing cached lyrics and romanization data in localStorage

const LYRICS_CACHE_PREFIX = "garret_lyrics_";
const ROMAJI_CACHE_PREFIX = "garret_romaji_";

// In-memory fallback
const memoryLyricsCache = new Map<string, string>();
const memoryRomajiCache = new Map<string, string[]>();

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

export function getStoredRomanization(key: string): string[] | null {
  if (memoryRomajiCache.has(key)) {
    return memoryRomajiCache.get(key)!;
  }
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${ROMAJI_CACHE_PREFIX}${key}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        memoryRomajiCache.set(key, parsed);
        return parsed;
      }
    }
  } catch (e) {
    console.warn("[LyricsCache] Romaji read error:", e);
  }
  return null;
}

export function saveStoredRomanization(key: string, lines: string[]): void {
  if (!key || !lines || lines.length === 0) return;
  memoryRomajiCache.set(key, lines);
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${ROMAJI_CACHE_PREFIX}${key}`, JSON.stringify(lines));
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
