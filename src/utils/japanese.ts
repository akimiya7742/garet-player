import * as wanakana from "wanakana";
import { getStoredRomanization, saveStoredRomanization } from "./lyricsCache";

// Regex for Japanese characters: Hiragana (\u3040-\u309F), Katakana (\u30A0-\u30FF), Kanji (\u4E00-\u9FAF, \u3400-\u4DBF)
const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]/;

/**
 * Checks if a string contains any Japanese characters (Hiragana, Katakana, Kanji)
 */
export function hasJapanese(text: string): boolean {
  if (!text) return false;
  return JAPANESE_CHAR_REGEX.test(text);
}

/**
 * Checks if an array of lines contains Japanese text
 */
export function hasJapaneseInLines(lines: { text: string }[]): boolean {
  return lines.some((l) => hasJapanese(l.text));
}

/**
 * Verifies that all lines in the array are fully romanized (contain 0 Japanese Kanji/Kana characters)
 */
export function isFullyRomanized(lines: string[]): boolean {
  if (!Array.isArray(lines) || lines.length === 0) return false;
  return !lines.some((l) => hasJapanese(l));
}

/**
 * Client-side fast phonetic romanizer using wanakana (handles Kana directly)
 */
export function quickRomanize(text: string): string {
  if (!text || !text.trim()) return text;
  try {
    return wanakana.toRomaji(text);
  } catch {
    return text;
  }
}

// In-memory cache for romanized lyrics
const romanizationCache = new Map<string, string[]>();

if (typeof window !== "undefined") {
  window.addEventListener("lyrics-cache-cleared", () => {
    romanizationCache.clear();
  });
}

/**
 * Romanizes an array of lines using the Next.js server API (with Gemini AI + Kuroshiro morphological engine)
 */
export async function romanizeLyricsLines(
  lines: string[],
  cacheKey?: string
): Promise<string[]> {
  if (!lines || lines.length === 0) return [];

  const key = cacheKey || lines.slice(0, 10).join("|");

  // 1. Check in-memory cache (ensure it is fully romanized)
  if (romanizationCache.has(key)) {
    const cached = romanizationCache.get(key)!;
    if (isFullyRomanized(cached)) {
      return cached;
    }
    romanizationCache.delete(key);
  }

  // 2. Check localStorage cache (ensure it is clean with 0 Japanese characters)
  const stored = getStoredRomanization(key);
  if (stored && stored.length === lines.length) {
    if (isFullyRomanized(stored)) {
      romanizationCache.set(key, stored);
      return stored;
    }
    // Corrupted previous cache entry containing raw Kanji -> purge it
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(`garret_romaji_${key}`);
      } catch (e) {
        console.warn("[Lyrics] Failed to purge dirty romaji cache:", e);
      }
    }
  }

  try {
    const res = await fetch("/api/lyrics/romanize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });

    if (res.ok) {
      const data = await res.json();
      if (
        Array.isArray(data.romanizedLines) &&
        data.romanizedLines.length === lines.length &&
        isFullyRomanized(data.romanizedLines)
      ) {
        romanizationCache.set(key, data.romanizedLines);
        saveStoredRomanization(key, data.romanizedLines);
        return data.romanizedLines;
      }
    }
  } catch (err) {
    console.warn("[Japanese Romanization] API request failed:", err);
  }

  return [];
}


