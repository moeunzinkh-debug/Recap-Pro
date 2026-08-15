/**
 * Google Gemini integration via the REST API (fetch-based).
 *
 * Calling the Gemini REST endpoint directly (instead of the Node SDK) keeps
 * the worker bundle free of Node-only code, so it runs on Cloudflare Workers
 * (and Node / browsers) without any polyfills.
 */

import { MODEL, normalizeGeminiModel } from "./constants";

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
    const raw =
      (typeof data?.error?.message === "string" && data.error.message) || "";
    const status = res.status;

    // Translate the raw Google error into a clear Khmer message so users know
    // exactly what went wrong (invalid key, unknown model, quota, etc.) instead
    // of seeing a confusing English string.
    let message: string;
    if (/API key not valid|API_KEY_INVALID|invalid.*api.?key/i.test(raw)) {
      message =
        "API Key របស់អ្នកមិនត្រឹមត្រូវ ឬអស់សុពលភាព។ សូមចូលទៅ Google AI Studio ដើម្បីយក Key ថ្មី រួចបញ្ចូលម្តងទៀត។";
    } else if (/not found|NOT_FOUND|does not exist/i.test(raw)) {
      message =
        "រកមិនឃើញម៉ូដែល Gemini ដែលបានជ្រើសរើស។ សូមជ្រើសរើសម៉ូដែលផ្សេងទៀតក្នុងទំព័របង្កើត។";
    } else if (/permission|PERMISSION_DENIED|not authorized|403/i.test(raw)) {
      message =
        "API Key នេះមិនមានសិទ្ធិប្រើប្រាស់ម៉ូដែលនេះទេ។ សូមពិនិត្យការកំណត់ Key របស់អ្នក។";
    } else if (
      status === 429 ||
      /quota|RESOURCE_EXHAUSTED|rate limit/i.test(raw)
    ) {
      message =
        "បានដល់កំរិតកំណត់នៃការប្រើប្រាស់ API។ សូមរង់ចាំបន្តិច ឬពិនិត្យកំរិតកំណត់របស់ Key។";
    } else {
      message = raw || `Gemini API error (HTTP ${status})`;
    }
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
      model: MODEL,
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
    const msg = err?.message || "";
    let message: string;
    if (/fetch failed|network|ECONN|ENOTFOUND|timed? ?out/i.test(msg)) {
      message =
        "មិនអាចតភ្ជាប់ទៅកាន់ Google Gemini បានទេ។ សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត ឬព្យាយាមម្តងទៀត។";
    } else {
      message = msg || "Key មិនត្រឹមត្រូវ ឬអស់សុពលភាព";
    }
    return { ok: false, message };
  }
}

export async function generateRecapWithFrames(opts: {
  apiKey?: string;
  envApiKey?: string;
  model?: string;
  prompt: string;
  frames: FramePayload[];
}): Promise<string> {
  const selectedModel = normalizeGeminiModel(opts.model);

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
  });

  if (!text) {
    throw new Error(
      "មិនមានអត្ថបទស្គ្រីបត្រូវបានបញ្ជូនត្រឡប់មកវិញពី Gemini ឡើយ។"
    );
  }
  return text;
}
