/**
 * Google Gemini integration via the REST API (fetch-based).
 *
 * Calling the Gemini REST endpoint directly (instead of the Node SDK) keeps
 * the worker bundle free of Node-only code, so it runs on Cloudflare Workers
 * (and Node / browsers) without any polyfills.
 */

import { MODEL, isKnownGeminiModel } from "./constants";

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

export interface FramePayload {
  index: number;
  timeSec: number;
  base64: string;
}

function requireApiKey(apiKey?: string, envApiKey?: string): string {
  const key = (apiKey || envApiKey || "").trim();
  if (!key) {
    throw new Error(
      "ខ្វះ GEMINI_API_KEY។ សូមបញ្ចូលក្នុងទំព័រកំណត់ (Settings) ឬកំណត់ក្នុង Environment Variable។"
    );
  }
  return key;
}

interface GenerateContentArgs {
  apiKey?: string;
  envApiKey?: string;
  model: string;
  contents: unknown[];
  systemInstruction?: string;
  generationConfig?: Record<string, unknown>;
}

async function geminiGenerateContent(
  args: GenerateContentArgs
): Promise<{ text: string; raw: unknown }> {
  const apiKey = requireApiKey(args.apiKey, args.envApiKey);

  const body: Record<string, unknown> = { contents: args.contents };
  if (args.systemInstruction) {
    body.systemInstruction = { parts: [{ text: args.systemInstruction }] };
  }
  if (args.generationConfig) {
    body.generationConfig = args.generationConfig;
  }

  const res = await fetch(
    `${GEMINI_API_BASE}/${encodeURIComponent(args.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    }
  );

  const data: any = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data?.error?.message ||
      `Gemini API error (HTTP ${res.status})`;
    throw new Error(message);
  }

  const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .filter((p) => typeof p?.text === "string")
    .map((p) => p.text)
    .join("");

  return { text, raw: data };
}

export async function testGeminiApiKey(
  apiKey?: string
): Promise<{ ok: boolean; message: string }> {
  try {
    const { text } = await geminiGenerateContent({
      apiKey,
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: "Hi" }] }],
    });
    if (typeof text === "string" && text.length > 0) {
      return {
        ok: true,
        message: "ការតភ្ជាប់ទៅកាន់ Google Gemini API ជោគជ័យ ១០០%!",
      };
    }
    return { ok: false, message: "មិនទទួលបានចម្លើយពី Google Gemini" };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || "Key មិនត្រឹមត្រូវ ឬអស់សុពលភាព",
    };
  }
}

export async function generateRecapWithFrames(opts: {
  apiKey?: string;
  envApiKey?: string;
  model?: string;
  prompt: string;
  frames: FramePayload[];
}): Promise<string> {
  const selectedModel =
    opts.model && isKnownGeminiModel(opts.model) ? opts.model : MODEL;

  const parts: any[] = [];

  // Add all frame images in order
  for (const frame of opts.frames) {
    const cleanBase64 = frame.base64.replace(/^data:image\/\w+;base64,/, "");
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: cleanBase64,
      },
    });
  }

  // Add the text prompt at the end
  parts.push({ text: opts.prompt });

  const { text } = await geminiGenerateContent({
    apiKey: opts.apiKey,
    envApiKey: opts.envApiKey,
    model: selectedModel,
    contents: [{ role: "user", parts }],
    systemInstruction:
      "You are an expert anime and movie recap content creator who writes fluent, cinematic, entertaining, and high-impact recap narration scripts in Khmer language.",
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
    },
  });

  if (!text) {
    throw new Error(
      "មិនមានអត្ថបទស្គ្រីបត្រូវបានបញ្ជូនត្រឡប់មកវិញពី Gemini ឡើយ។"
    );
  }
  return text;
}
