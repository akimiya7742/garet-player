import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";

// Regex for detecting any lingering Japanese characters (Hiragana, Katakana, Kanji)
const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]/;

// Lazy Kuroshiro instance for high-accuracy local morphological romanization
let kuroshiroInstance: any = null;
let kuroshiroInitPromise: Promise<any> | null = null;

async function getKuroshiro() {
  if (kuroshiroInstance) return kuroshiroInstance;
  if (!kuroshiroInitPromise) {
    kuroshiroInitPromise = (async () => {
      try {
        const ks = new (Kuroshiro as any)();
        const analyzer = new (KuromojiAnalyzer as any)();
        await ks.init(analyzer);
        kuroshiroInstance = ks;
        return ks;
      } catch (err) {
        console.error("[Romanize API] Failed to initialize Kuroshiro analyzer:", err);
        return null;
      }
    })();
  }
  return kuroshiroInitPromise;
}

async function convertWithKuroshiro(line: string): Promise<string> {
  if (!line || !line.trim()) return line;
  try {
    const ks = await getKuroshiro();
    if (!ks) return line;
    const res = await ks.convert(line, {
      to: "romaji",
      mode: "spaced",
      romajiSystem: "hepburn",
    });
    // Collapse redundant spaces
    return (res || line).replace(/\s+/g, " ").trim();
  } catch (err) {
    console.warn("[Romanize API] Kuroshiro line conversion error:", err);
    return line;
  }
}

async function convertWithGemini(lines: string[]): Promise<string[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const systemInstruction = `You are a professional linguistic transcription system specialized in PHONETIC ROMANIZATION.

# ABSOLUTE MISSION
Transform Japanese lyrics into clean, standard Hepburn Romaji based on actual pronunciation in natural speech context.

# STRICT RULES & CONSTRAINTS
1. ABSOLUTELY NO Japanese characters (Kanji, Hiragana, Katakana) allowed in the output. Every single character must be converted to Latin script.
2. Translate ALL Kanji using context-appropriate readings (e.g., 今 -> ima, 強がら -> tsuyogara, 柔く -> yawaraku, 夜 -> yoru, 声 -> koe, 歌 -> uta, 夢 -> yume, 届 -> todoke/todoku).
3. Do not leave partially converted words.
4. Particles: は = wa, へ = e, を = wo/o.
5. Preserve original punctuation, spaces, numbers, and non-Japanese text.
6. Match the input array length precisely (exact 1:1 mapping per line).`;

    const prompt = `Convert each line of the following Japanese song lyrics into natural standard Hepburn Romanization (Romaji).

Input lines to process:
${JSON.stringify(lines, null, 2)}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING,
            description: "Fully romanized lyric line in Hepburn Romaji with zero Japanese characters remaining",
          },
        },
      },
    });

    const rawText = response.text?.trim() || "[]";
    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed) && parsed.length === lines.length) {
      return parsed;
    }
  } catch (err) {
    console.warn("[Romanize API] Gemini conversion failed:", err);
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { lines } = await req.json();

    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: "Lines array is required." },
        { status: 400 }
      );
    }

    // ── Primary Strategy: Kuroshiro morphological analyzer ──────────────────
    let kuroshiroSuccess = false;
    let kuroshiroLines: string[] = [];

    try {
      kuroshiroLines = await Promise.all(
        lines.map(async (line) => {
          if (!line || !line.trim()) return "";
          if (JAPANESE_CHAR_REGEX.test(line)) {
            return await convertWithKuroshiro(line);
          }
          return line;
        })
      );

      // Check if all lines were successfully converted with zero lingering Japanese
      const hasLingeringJapanese = kuroshiroLines.some((l) => JAPANESE_CHAR_REGEX.test(l));
      if (!hasLingeringJapanese && kuroshiroLines.length === lines.length) {
        kuroshiroSuccess = true;
      }
    } catch (kError) {
      console.warn("[Romanize API] Kuroshiro batch failed, attempting Gemini fallback:", kError);
    }

    if (kuroshiroSuccess) {
      return NextResponse.json({
        romanizedLines: kuroshiroLines,
        source: "kuroshiro",
      });
    }

    // ── Secondary Strategy: Gemini AI ───────────────────────────────────────
    console.log("[Romanize API] Falling back to Gemini AI...");
    const geminiLines = await convertWithGemini(lines);
    if (geminiLines && geminiLines.length === lines.length) {
      return NextResponse.json({
        romanizedLines: geminiLines,
        source: "Gemini AI",
      });
    }

    // Fallback: If Gemini also fails, return best-effort Kuroshiro result
    return NextResponse.json({
      romanizedLines: kuroshiroLines.length === lines.length ? kuroshiroLines : lines,
      source: "kuroshiro",
    });
  } catch (error: any) {
    console.error("[Romanize API] Top-level error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to romanize lyrics", fallback: true },
      { status: 500 }
    );
  }
}

