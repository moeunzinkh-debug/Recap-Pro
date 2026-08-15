import { GoogleGenAI } from "@google/genai";
import { MODEL, isKnownGeminiModel } from "./constants";

export interface FramePayload {
  index: number;
  timeSec: number;
  base64: string;
}

export function createGeminiClient(apiKey?: string): GoogleGenAI {
  const key = apiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "ខ្វះ GEMINI_API_KEY។ សូមបញ្ចូលក្នុងទំព័រកំណត់ (Settings) ឬកំណត់ក្នុង Environment Variable។"
    );
  }
  return new GoogleGenAI({ apiKey: key });
}

export async function testGeminiApiKey(apiKey?: string): Promise<{ ok: boolean; message: string }> {
  try {
    const ai = createGeminiClient(apiKey);
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Hi",
    });
    if (response && response.text !== undefined) {
      return { ok: true, message: "ការតភ្ជាប់ទៅកាន់ Google Gemini API ជោគជ័យ ១០០%!" };
    }
    return { ok: false, message: "មិនទទួលបានចម្លើយពី Google Gemini" };
  } catch (err: any) {
    return { ok: false, message: err.message || "Key មិនត្រឹមត្រូវ ឬអស់សុពលភាព" };
  }
}

export async function generateRecapWithFrames(opts: {
  apiKey?: string;
  model?: string;
  prompt: string;
  frames: FramePayload[];
}): Promise<string> {
  const ai = createGeminiClient(opts.apiKey);
  const selectedModel =
    opts.model && isKnownGeminiModel(opts.model) ? opts.model : MODEL;

  const contents: any[] = [];

  // Add all frame images in order
  for (const frame of opts.frames) {
    const cleanBase64 = frame.base64.replace(/^data:image\/\w+;base64,/, "");
    contents.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: cleanBase64,
      },
    });
  }

  // Add the text prompt at the end
  contents.push(opts.prompt);

  const response = await ai.models.generateContent({
    model: selectedModel,
    contents,
    config: {
      temperature: 0.7,
      topP: 0.95,
      systemInstruction:
        "You are an expert anime and movie recap content creator who writes fluent, cinematic, entertaining, and high-impact recap narration scripts in Khmer language.",
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error("មិនមានអត្ថបទស្គ្រីបត្រូវបានបញ្ជូនត្រឡប់មកវិញពី Gemini ឡើយ។");
  }
  return text;
}


