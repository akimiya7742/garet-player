import { GoogleGenAI, Type } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import Kuroshiro from "kuroshiro";
import KuromojiAnalyzer from "kuroshiro-analyzer-kuromoji";

// Regex for detecting any lingering Japanese characters (Hiragana, Katakana, Kanji)
const JAPANESE_CHAR_REGEX = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\u3400-\u4DBF]/;

// Lazy Kuroshiro instance for high-accuracy local morphological romanization fallback
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

export async function POST(req: NextRequest) {
  try {
    const { lines } = await req.json();

    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json(
        { error: "Lines array is required." },
        { status: 400 }
      );
    }

    let romanizedLines: string[] = [];
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
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
3. Do not leave partially converted words (e.g., NEVER output "soredakede今haiindayo", ALWAYS output "soredakede ima haiindayo").
4. Particles: は = wa, へ = e, を = wo/o.
5. Preserve original punctuation, spaces, numbers, and non-Japanese text (like English words).
6. Match the input array length precisely (exact 1:1 mapping per line).`;

        const prompt = `Convert each line of the following Japanese song lyrics into natural standard Hepburn Romanization (Romaji).

FEW-SHOT EXAMPLES:
Input: [
  "もうさ強がらなくてもいいんだよ",
  "過去の夜の涙ひとつ",
  "それを柔く持って歩いて征く",
  "声も出ないまま 歌を歌ってる",
  "届かな夢の奥に 柔く咲いていて",
  "それ me だけ今がいい"
]
Output: [
  "mou sa tsuyogaranakutemo iindayo",
  "kako no yoru no namida hitotsu",
  "sore wo yawaraku motte aruite yuku",
  "koe mo denai mama uta wo utatteru",
  "todokana yume no oku ni yawaraku saiteite",
  "sore me dake ima ga ii"
]

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
        try {
          const parsed = JSON.parse(rawText);
          if (Array.isArray(parsed) && parsed.length === lines.length) {
            romanizedLines = parsed;
          }
        } catch {
          console.warn("[Romanize API] Failed to parse JSON response from Gemini");
        }
      } catch (geminiError) {
        console.warn("[Romanize API] Gemini call failed, using morphological analyzer:", geminiError);
      }
    }

    // Post-process / Library Fallback:
    // If Gemini was unavailable, timed out, rate limited, or any line still contains
    // lingering Japanese characters, convert those lines using the Kuroshiro morphological engine.
    const finalLines: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let candidate = romanizedLines[i];

      // If no candidate from Gemini or candidate still has un-romanized Japanese characters (Kanji/Kana)
      if (!candidate || JAPANESE_CHAR_REGEX.test(candidate)) {
        if (JAPANESE_CHAR_REGEX.test(line)) {
          candidate = await convertWithKuroshiro(line);
        } else {
          candidate = line;
        }
      }
      finalLines.push(candidate);
    }

    return NextResponse.json({
      romanizedLines: finalLines,
      source: apiKey && romanizedLines.length === lines.length ? "gemini+kuroshiro" : "kuroshiro-library",
    });
  } catch (error: any) {
    console.warn("[Romanize API] Top-level error, attempting emergency full Kuroshiro conversion:", error);
    try {
      const { lines } = await req.json();
      if (Array.isArray(lines)) {
        const emergencyLines: string[] = [];
        for (const line of lines) {
          emergencyLines.push(await convertWithKuroshiro(line));
        }
        return NextResponse.json({
          romanizedLines: emergencyLines,
          source: "kuroshiro-emergency",
        });
      }
    } catch {
      // ignore secondary error
    }

    return NextResponse.json(
      { error: error?.message || "Failed to romanize lyrics", fallback: true },
      { status: 500 }
    );
  }
}
