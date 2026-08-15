/**
 * Recap Pro — Cloudflare Worker entry point.
 *
 * - `/api/*`        : API routes (recaps + settings), backed by D1 / memory.
 * - everything else : the React frontend, served by Cloudflare Workers
 *                     Static Assets (see `assets` in wrangler.jsonc).
 *
 * Gemini recap generation runs inside the request while the client stays
 * connected (HTTP requests have no wall-clock limit on Workers); if it takes
 * longer than SYNC_GENERATION_WAIT_MS we respond early with status
 * "processing" and let `ctx.waitUntil()` carry the work for ~30 more seconds.
 * Stuck "processing" entries are converted to "failed" after 3 minutes so the
 * user can retry.
 */

import {
  createStore,
  type RecapItem,
  type RecapStore,
  type StoreEnv,
} from "./src/lib/store";
import { buildRecapPrompt } from "./src/lib/prompt";
import {
  generateRecapWithFrames,
  testGeminiApiKey,
  type FramePayload,
} from "./src/lib/gemini";
import { MAX_FILE_SIZE, MAX_DURATION_SEC } from "./src/lib/constants";

export interface WorkerEnv extends StoreEnv {
  /** Cloudflare Workers Static Assets binding (serves dist/) */
  ASSETS?: {
    fetch(request: Request): Promise<Response>;
  };
}

export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const SYNC_GENERATION_WAIT_MS = 25_000;
const STALE_PROCESSING_MS = 3 * 60 * 1000;
const STALE_ERROR_MESSAGE =
  "ដំណើរការបង្កើតស្គ្រីបត្រូវបានផ្អាកដោយសារដែនកំណត់ពេលវេលារបស់ Cloudflare Worker។ សូមសាកល្បងម្តងទៀតជាមួយវីដេអូខ្លីជាង ឬម៉ូដែលដែលលឿនជាង។";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });
}

async function readJson(request: Request): Promise<any> {
  try {
    return await request.json();
  } catch {
    throw new Error("ទិន្នន័យ JSON មិនត្រឹមត្រូវ");
  }
}

async function ensureNotStale(
  store: RecapStore,
  recap: RecapItem
): Promise<RecapItem> {
  if (recap.status !== "processing") return recap;
  const age = Date.now() - new Date(recap.createdAt).getTime();
  if (age <= STALE_PROCESSING_MS) return recap;
  const updated = await store.updateRecap(recap.id, {
    status: "failed",
    error: STALE_ERROR_MESSAGE,
  });
  return (
    updated ?? {
      ...recap,
      status: "failed" as const,
      error: STALE_ERROR_MESSAGE,
    }
  );
}

async function runGeneration(
  store: RecapStore,
  params: {
    recap: RecapItem;
    fileName: string;
    durationSec: number;
    frameCount: number;
    intervalSec: number;
    model: string;
    frames: FramePayload[];
  }
): Promise<void> {
  const { recap, fileName, durationSec, frameCount, intervalSec, model, frames } =
    params;
  try {
    const keyInfo = await store.getActiveApiKey();
    if (!keyInfo.decrypted) {
      throw new Error(
        "ខ្វះ GEMINI_API_KEY។ សូមបញ្ចូលក្នុងទំព័រកំណត់ (Settings) ឬកំណត់ក្នុង Environment Variable។"
      );
    }

    const prompt = buildRecapPrompt({
      fileName,
      durationSec,
      frameCount,
      intervalSec,
    });

    const generatedScript = await generateRecapWithFrames({
      apiKey: keyInfo.decrypted,
      model,
      prompt,
      frames,
    });

    // Extract title if available in the first line of the script
    const titleMatch = generatedScript.match(
      /^#+\s*(?:ចំណងជើង:\s*|Title:\s*)?([^\n]+)/i
    );
    const customTitle = titleMatch ? titleMatch[1].trim() : recap.title;

    await store.updateRecap(recap.id, {
      status: "done",
      title: customTitle || recap.title,
      script: generatedScript,
      error: null,
    });
  } catch (genErr: any) {
    console.error("Gemini generation failed:", genErr);
    try {
      await store.updateRecap(recap.id, {
        status: "failed",
        error:
          genErr?.message ||
          "ការបង្កើតស្គ្រីបជាមួយ Gemini បានបរាជ័យ។",
      });
    } catch (updateErr) {
      console.error("Failed to persist generation error:", updateErr);
    }
  }
}

async function handleCreateRecap(
  request: Request,
  ctx: WorkerContext,
  store: RecapStore
): Promise<Response> {
  const body = await readJson(request);
  const {
    fileName = "video.mp4",
    fileSize = 0,
    durationSec = 30,
    model = "gemini-2.0-flash",
    frames = [],
  } = body ?? {};

  if (typeof fileSize === "number" && fileSize > MAX_FILE_SIZE) {
    return json(
      {
        error: `ទំហំឯកសារលើសពីកម្រិតកំណត់ ${
          MAX_FILE_SIZE / (1024 * 1024)
        }MB`,
      },
      400
    );
  }

  if (typeof durationSec === "number" && durationSec > MAX_DURATION_SEC) {
    return json(
      {
        error: `ប្រវែងវីដេអូលើសពីកម្រិតកំណត់អតិបរមា (${
          MAX_DURATION_SEC / 60
        } នាទី)`,
      },
      400
    );
  }

  const frameList: FramePayload[] = Array.isArray(frames) ? frames : [];
  const frameCount = frameList.length;
  const intervalSec = frameCount > 1 ? durationSec / frameCount : durationSec;

  // Create initial recap entry
  const recap = await store.createRecap({
    fileName,
    fileSize: Number(fileSize) || 0,
    durationSec: Math.round(Number(durationSec) || 0),
    frameCount,
    model,
    title: fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
    script: null,
    status: "processing",
    error: null,
    isPublic: true,
  });

  const generation = runGeneration(store, {
    recap,
    fileName,
    durationSec: Number(durationSec) || 0,
    frameCount,
    intervalSec,
    model,
    frames: frameList,
  });

  // Register with waitUntil so generation keeps running even after we respond.
  ctx.waitUntil(generation);

  // Keep the request open while the client is connected (unlimited wall time
  // on Workers). If generation is still running past the sync window, respond
  // with "processing" and let the frontend poll while waitUntil finishes it.
  const finished = await Promise.race([
    generation.then(() => true),
    sleep(SYNC_GENERATION_WAIT_MS).then(() => false),
  ]);

  if (finished) {
    const finalRecap = await store.getRecapById(recap.id);
    return json({
      recapId: recap.id,
      status: finalRecap?.status ?? "done",
      script: finalRecap?.script ?? null,
      error: finalRecap?.error ?? null,
    });
  }

  return json({ recapId: recap.id, status: "processing" });
}

async function handleApi(
  request: Request,
  env: WorkerEnv,
  ctx: WorkerContext,
  path: string,
  storeOverride?: RecapStore
): Promise<Response> {
  const store = storeOverride ?? createStore(env);
  const method = (request.method || "GET").toUpperCase();
  const route = path.slice("/api".length) || "/";

  if (method === "OPTIONS") return json({ ok: true });

  try {
    if (method === "GET" && route === "/health") {
      const keyInfo = await store.getActiveApiKey();
      return json({
        status: "ok",
        hasApiKey: keyInfo.hasKey,
        maskedKey: keyInfo.masked,
        storage: store.backend,
      });
    }

    if (route === "/recaps") {
      if (method === "GET") {
        const list = await store.getAllRecaps();
        const fixed = await Promise.all(
          list.map((r) => ensureNotStale(store, r))
        );
        return json({ recaps: fixed });
      }
      if (method === "POST") {
        return handleCreateRecap(request, ctx, store);
      }
      if (method === "DELETE") {
        await store.clearAllRecaps();
        return json({
          success: true,
          message: "បានសម្អាតប្រវត្តិទាំងអស់ដោយជោគជ័យ",
        });
      }
    }

    const recapMatch = route.match(/^\/recaps\/([^/]+)$/);
    if (recapMatch) {
      const id = decodeURIComponent(recapMatch[1]);
      if (method === "GET") {
        const found = await store.getRecapById(id);
        if (!found) {
          return json(
            { error: "រកមិនឃើញស្គ្រីបសម្រាយរឿងនេះឡើយ" },
            404
          );
        }
        return json({ recap: await ensureNotStale(store, found) });
      }
      if (method === "DELETE") {
        const deleted = await store.deleteRecap(id);
        if (!deleted) {
          return json(
            { error: "រកមិនឃើញស្គ្រីបដែលត្រូវលុបឡើយ" },
            404
          );
        }
        return json({
          success: true,
          message: "បានលុបស្គ្រីបដោយជោគជ័យ",
        });
      }
    }

    if (route === "/settings/key") {
      if (method === "GET") {
        const keyInfo = await store.getActiveApiKey();
        return json({ hasKey: keyInfo.hasKey, masked: keyInfo.masked });
      }
      if (method === "POST") {
        const body = await readJson(request);
        const { apiKey } = body ?? {};
        if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
          return json({ error: "សូមបញ្ចូល API Key ឱ្យបានត្រឹមត្រូវ" }, 400);
        }
        await store.setApiKey("GEMINI_API_KEY", apiKey.trim());
        const keyInfo = await store.getActiveApiKey();

        // Perform quick test
        const testResult = await testGeminiApiKey(apiKey.trim());

        return json({
          success: true,
          hasKey: keyInfo.hasKey,
          masked: keyInfo.masked,
          verified: testResult.ok,
          verificationMessage: testResult.message,
        });
      }
      if (method === "DELETE") {
        await store.deleteApiKey("GEMINI_API_KEY");
        const keyInfo = await store.getActiveApiKey();
        return json({
          success: true,
          hasKey: keyInfo.hasKey,
          masked: keyInfo.masked,
          message: "បានលុប API Key ដោយជោគជ័យ",
        });
      }
    }

    if (route === "/settings/key/test" && method === "POST") {
      const body = await readJson(request);
      const { apiKey } = body ?? {};
      const keyToTest = apiKey || (await store.getActiveApiKey()).decrypted;
      if (!keyToTest) {
        return json(
          { ok: false, error: "មិនមាន API Key សម្រាប់ធ្វើតេស្តឡើយ" },
          400
        );
      }
      return json(await testGeminiApiKey(keyToTest));
    }

    return json({ error: "រកមិនឃើញ API នេះទេ" }, 404);
  } catch (err: any) {
    console.error(`API error on ${method} ${path}:`, err);
    return json(
      { error: err?.message || "មានបញ្ហាបច្ចេកទេសក្នុងម៉ាស៊ីនមេ" },
      500
    );
  }
}

export async function handleRequest(
  request: Request,
  env: WorkerEnv,
  ctx: WorkerContext,
  storeOverride?: RecapStore
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (path === "/api" || path.startsWith("/api/")) {
    return handleApi(request, env, ctx, path, storeOverride);
  }

  // Frontend — defer to Cloudflare Workers Static Assets.
  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  return json({ error: "Not found" }, 404);
}

export default {
  fetch(request: Request, env: WorkerEnv, ctx: WorkerContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
};
