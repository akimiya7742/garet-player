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
 * Verifies that an array of lines has substantial romanization
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

/**
 * Sanitizes a romanized line, ensuring leftover kana is converted
 */
export function sanitizeRomajiLine(text: string): string {
  if (!text) return "";
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

  // 1. Check in-memory cache
  if (romanizationCache.has(key)) {
    const cached = romanizationCache.get(key)!;
    if (cached.length === lines.length) {
      return cached;
    }
    romanizationCache.delete(key);
  }

  // 2. Check localStorage cache
  const stored = getStoredRomanization(key);
  if (stored && stored.length === lines.length) {
    romanizationCache.set(key, stored);
    return stored;
  }

  try {
    const res = await fetch("/api/lyrics/romanize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.romanizedLines) && data.romanizedLines.length > 0) {
        // Guarantee exact 1-to-1 match with input lines length
        const sanitized: string[] = lines.map((originalLine, idx) => {
          const apiLine = data.romanizedLines[idx];
          if (typeof apiLine === "string" && apiLine.trim()) {
            return sanitizeRomajiLine(apiLine);
          }
          return quickRomanize(originalLine);
        });

        romanizationCache.set(key, sanitized);
        saveStoredRomanization(key, sanitized);
        return sanitized;
      }
    }
  } catch (err) {
    console.warn("[Japanese Romanization] API request failed:", err);
  }

  // Fallback if API totally unreachable
  const fallback = lines.map((l) => quickRomanize(l));
  romanizationCache.set(key, fallback);
  return fallback;
}


