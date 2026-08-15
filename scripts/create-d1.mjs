#!/usr/bin/env node
/**
 * Creates the Cloudflare D1 database used by Recap Pro and wires the binding
 * into wrangler.jsonc automatically.
 *
 * Run once before the first deploy:
 *   1. npx wrangler login
 *   2. npm run db:create
 *   3. npm run deploy
 *
 * Safe to re-run: it reuses the existing database if it already exists.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "wrangler.jsonc");
const DB_NAME = "recap-pro-db";
const BINDING = "RECAPS_DB";

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

function wranglerBin() {
  const local = path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "wrangler.cmd" : "wrangler"
  );
  if (existsSync(local)) return [local, []];
  return ["npx", ["wrangler"]];
}

function runWrangler(args) {
  const [bin, prefix] = wranglerBin();
  return execFileSync(bin, [...prefix, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function findDatabaseId(text, name) {
  // Preferred: `database_id = "…"` printed by `wrangler d1 create`
  const direct = text.match(/database_id\s*=\s*"?([0-9a-f-]{36})"?/i);
  if (direct) return direct[1];

  // Fallback: uuid near the database name
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(name)) {
      const near = lines.slice(i, i + 6).join(" ").match(UUID_RE);
      if (near) return near[0];
    }
  }

  const any = text.match(UUID_RE);
  if (any && any.length === 1) return any[0];
  return null;
}

async function main() {
  if (!existsSync(configPath)) {
    console.error("wrangler.jsonc not found — are you in the project root?");
    process.exit(1);
  }

  let output = "";
  try {
    output = runWrangler(["d1", "create", DB_NAME]);
    console.log(output);
  } catch (err) {
    output = `${err.stdout || ""}\n${err.stderr || ""}`;
    console.log(output);
    if (!/already exists/i.test(output)) {
      console.error(
        "Failed to create the D1 database. Make sure you are logged in:\n  npx wrangler login"
      );
      process.exit(1);
    }
  }

  let databaseId = findDatabaseId(output, DB_NAME);

  if (!databaseId) {
    try {
      const listOut = runWrangler(["d1", "list", "--json"]);
      const start = listOut.indexOf("[");
      if (start !== -1) {
        const arr = JSON.parse(listOut.slice(start));
        const found = arr.find((d) => d.name === DB_NAME);
        if (found) databaseId = found.uuid;
      }
    } catch {
      // ignore — handled below
    }
  }

  if (!databaseId) {
    console.error(
      "Could not determine the database_id automatically.\n" +
        "Run `npx wrangler d1 list` and set `database_id` in wrangler.jsonc manually."
    );
    process.exit(1);
  }

  let config = readFileSync(configPath, "utf8");

  const d1BlockMatch = config.match(/"d1_databases"\s*:\s*\[([\s\S]*?)\]/);

  if (d1BlockMatch) {
    // The d1_databases block already exists: patch our binding's entry (or
    // append a new one) without touching entries for other databases.
    const blockText = d1BlockMatch[0];
    const entryRe = new RegExp(
      `\\{\\s*"binding"\\s*:\\s*"${BINDING}"[^}]*\\}`,
      "s"
    );
    const entryMatch = blockText.match(entryRe);

    if (entryMatch) {
      let newEntry;
      if (/["']database_id["']\s*:/.test(entryMatch[0])) {
        newEntry = entryMatch[0].replace(
          /("database_id"\s*:\s*")[0-9a-f-]*(")/,
          `$1${databaseId}$2`
        );
      } else {
        newEntry = entryMatch[0].replace(
          /\}$/,
          `, "database_name": "${DB_NAME}", "database_id": "${databaseId}" }`
        );
      }
      config = config.replace(entryMatch[0], newEntry);
    } else {
      const blockBody = d1BlockMatch[1];
      const entry = `\n    { "binding": "${BINDING}", "database_name": "${DB_NAME}", "database_id": "${databaseId}" }\n  `;
      const entries = blockBody.trim();
      config = config.replace(
        blockText,
        `"d1_databases": [${entries}${entries ? "," : ""}${entry}]`
      );
    }
  } else {
    const block = `\n  "d1_databases": [\n    { "binding": "${BINDING}", "database_name": "${DB_NAME}", "database_id": "${databaseId}" }\n  ],`;
    config = config.replace("{", `{${block}`);
  }

  writeFileSync(configPath, config, "utf8");

  console.log(
    `\n✅ D1 database "${DB_NAME}" (${databaseId}) is bound to ${BINDING} in wrangler.jsonc.`
  );
  console.log("Next steps:");
  console.log("  1. (optional) npx wrangler secret put GEMINI_API_KEY");
  console.log("  2. npm run deploy");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
