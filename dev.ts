/**
 * Local development server (Node) — NOT deployed to Cloudflare.
 *
 * Runs the exact same worker code as Cloudflare Workers (worker.ts) behind a
 * Node HTTP server, with Vite middleware for the frontend (HMR included).
 * Storage is in-memory locally; production uses Cloudflare D1.
 *
 *   npm run dev       → development with HMR
 *   npm run preview   → serves the production build (dist/) like Workers
 */

import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { handleRequest, type WorkerEnv, type WorkerContext } from "./worker";
import { createMemoryStore } from "./src/lib/store";

const PORT = Number(process.env.PORT || 3000);
const isProd =
  process.argv.includes("--preview") || process.env.NODE_ENV === "production";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, "dist");

const env: WorkerEnv = {
  RECAPS_DB: undefined,
  ASSETS: undefined,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  APP_SECRET: process.env.APP_SECRET,
  DATABASE_URL: process.env.DATABASE_URL,
};

const store = createMemoryStore(env);

const ctx: WorkerContext = {
  waitUntil(promise) {
    promise.catch((err) =>
      console.error("[dev] background task failed:", err)
    );
  },
  passThroughOnException() {},
};

async function nodeRequestToWebRequest(
  req: http.IncomingMessage
): Promise<Request> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);

  const host = req.headers.host || `localhost:${PORT}`;
  const url = `http://${host}${req.url || "/"}`;

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(", ");
  }

  const init: any = { method: req.method || "GET", headers };
  if (body.length > 0 && req.method !== "GET" && req.method !== "HEAD") {
    init.body = body;
  }
  return new Request(url, init);
}

async function sendWebResponse(
  res: http.ServerResponse,
  webRes: Response
): Promise<void> {
  const headers: Record<string, string> = {};
  webRes.headers.forEach((value, key) => {
    headers[key] = value;
  });
  res.writeHead(webRes.status, headers);
  const buffer = Buffer.from(await webRes.arrayBuffer());
  res.end(buffer);
}

async function handleApi(
  req: http.IncomingMessage,
  res: http.ServerResponse
): Promise<void> {
  try {
    const webReq = await nodeRequestToWebRequest(req);
    const webRes = await handleRequest(webReq, env, ctx, store);
    await sendWebResponse(res, webRes);
  } catch (err: any) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: err?.message || "Server error" }));
  }
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): void {
  const decoded = decodeURIComponent(pathname);
  let filePath = path.join(DIST_DIR, decoded);
  const distRoot = path.resolve(DIST_DIR) + path.sep;
  if (!filePath.startsWith(distRoot)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  try {
    let stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
      stat = fs.statSync(filePath);
    }
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  } catch {
    // SPA fallback → index.html
    try {
      const index = fs.readFileSync(path.join(DIST_DIR, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(index);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end('Not found. Run "npm run build" first.');
    }
  }
}

async function start(): Promise<void> {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    const server = http.createServer((req, res) => {
      const pathname = (req.url || "/").split("?")[0];
      if (pathname === "/api" || pathname.startsWith("/api/")) {
        void handleApi(req, res);
        return;
      }
      vite.middlewares(req, res);
    });
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Dev server running at http://localhost:${PORT}`);
      console.log(
        "(Local dev uses in-memory storage — production on Cloudflare Workers uses D1)"
      );
    });
  } else {
    const server = http.createServer((req, res) => {
      const pathname = (req.url || "/").split("?")[0];
      if (pathname === "/api" || pathname.startsWith("/api/")) {
        void handleApi(req, res);
        return;
      }
      serveStatic(req, res, pathname);
    });
    server.listen(PORT, "0.0.0.0", () => {
      console.log(
        `Preview server running at http://localhost:${PORT} (production build)`
      );
    });
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
