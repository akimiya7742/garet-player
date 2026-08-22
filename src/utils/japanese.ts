import * as wanakana from "wanakana";
import {
  RomajiSource,
  StoredRomanizationData,
  getStoredRomanization,
  saveStoredRomanization,
} from "./lyricsCache";

// Regex for Japanese characters: Hiragana (\u3040-\u309F), Katakana (\u30A0-\u30FF), Kanji (\u4E00-\u9FAF, \u3400-\u4DBF)
const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]/;

// Regex for standard or spaced bracket LRC timestamps like [00:22.08] or [ 00 : 22 . 08 ]
const LRC_TIMESTAMP_REGEX = /^\[\s*(\d{1,3})\s*:\s*(\d{2})(?:\s*[.:]\s*(\d+))?\s*\]\s*(.*)/;

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

export interface TimedRomanizedLine {
  time: number;
  text: string;
}

/**
 * Parses a raw `lyrics_romanization` string from the backend API (e.g. LRCLIB /music/lyrics).
 * Handles both timestamped LRC formats (standard or spaced brackets) and plain text lines.
 * Accurately aligns the romanized lines 1-to-1 with the target synced lines.
 */
export function parseRomanizationFromPayload(
  rawRomanization: unknown,
  targetSyncedLines: { time: number; text: string }[]
): string[] | null {
  if (!rawRomanization || typeof rawRomanization !== "string") return null;
  const trimmed = rawRomanization.trim();
  if (!trimmed) return null;

  const rawLines = trimmed.split("\n");
  const parsedTimedLines: TimedRomanizedLine[] = [];
  const parsedPlainLines: string[] = [];
  let hasTimedLines = false;

  for (const rawLine of rawLines) {
    const lineTrimmed = rawLine.trim();
    if (!lineTrimmed) continue;

    const match = lineTrimmed.match(LRC_TIMESTAMP_REGEX);
    if (match) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      const sub = match[3] ?? "0";
      const ms =
        sub.length <= 2
          ? parseInt(sub, 10) * 10
          : parseInt(sub.substring(0, 3), 10);
      const timeInMs = (mins * 60 + secs) * 1000 + ms;
      const text = match[4].trim();
      parsedTimedLines.push({ time: timeInMs, text });
      hasTimedLines = true;
    } else {
      parsedPlainLines.push(lineTrimmed);
    }
  }

  // Case 1: Romanization has timestamps and we have target synced lines
  if (hasTimedLines && targetSyncedLines.length > 0 && targetSyncedLines[0].time >= 0) {
    parsedTimedLines.sort((a, b) => a.time - b.time);

    const alignedLines: string[] = targetSyncedLines.map((target, idx) => {
      // Find exact or closest timestamp match within 300ms
      const exactMatch = parsedTimedLines.find(
        (r) => Math.abs(r.time - target.time) <= 300
      );
      if (exactMatch && exactMatch.text) {
        return sanitizeRomajiLine(exactMatch.text);
      }
      // Fallback by index if close
      if (parsedTimedLines[idx] && parsedTimedLines[idx].text) {
        return sanitizeRomajiLine(parsedTimedLines[idx].text);
      }
      return "";
    });

    // Check if we produced non-empty lines
    const nonEmptyCount = alignedLines.filter((l) => l.trim() !== "").length;
    if (nonEmptyCount > 0) {
      return alignedLines;
    }
  }

  // Case 2: Plain-text lines mapping
  const sourceLines = hasTimedLines
    ? parsedTimedLines.map((p) => p.text)
    : parsedPlainLines;

  if (sourceLines.length > 0) {
    const mappedLines: string[] = targetSyncedLines.map((target, idx) => {
      if (sourceLines[idx] !== undefined) {
        return sanitizeRomajiLine(sourceLines[idx]);
      }
      return "";
    });

    if (mappedLines.some((l) => l.trim() !== "")) {
      return mappedLines;
    }
  }

  return null;
}

// In-memory cache for romanized lyrics
const romanizationCache = new Map<string, StoredRomanizationData>();

if (typeof window !== "undefined") {
  window.addEventListener("lyrics-cache-cleared", () => {
    romanizationCache.clear();
  });
}

export interface RomajiResult {
  lines: string[];
  source: RomajiSource;
}

/**
 * Romanizes an array of lines using cached entries or Next.js server API (Kuroshiro -> Gemini AI)
 */
export async function romanizeLyricsLines(
  lines: string[],
  cacheKey?: string
): Promise<RomajiResult> {
  if (!lines || lines.length === 0) return { lines: [], source: "kuroshiro" };

  const key = cacheKey || lines.slice(0, 10).join("|");

  // 1. Check in-memory cache
  if (romanizationCache.has(key)) {
    const cached = romanizationCache.get(key)!;
    if (cached.lines.length === lines.length) {
      return cached;
    }
    romanizationCache.delete(key);
  }

  // 2. Check localStorage cache
  const stored = getStoredRomanization(key);
  if (stored && stored.lines.length === lines.length) {
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

        const source: RomajiSource =
          data.source === "Gemini AI" ? "Gemini AI" : "kuroshiro";

        const result: RomajiResult = { lines: sanitized, source };
        romanizationCache.set(key, result);
        saveStoredRomanization(key, sanitized, source);
        return result;
      }
    }
  } catch (err) {
    console.warn("[Japanese Romanization] API request failed:", err);
  }

  // Fallback if API totally unreachable
  const fallback = lines.map((l) => quickRomanize(l));
  const fallbackResult: RomajiResult = { lines: fallback, source: "kuroshiro" };
  romanizationCache.set(key, fallbackResult);
  return fallbackResult;
}



