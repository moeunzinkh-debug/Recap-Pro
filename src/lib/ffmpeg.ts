import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

// Optional dynamic import of ffmpeg/ffprobe static binaries
let ffmpegPath = "ffmpeg";
let ffprobePath = "ffprobe";

try {
  const ffmpegStatic = require("ffmpeg-static");
  if (ffmpegStatic) ffmpegPath = ffmpegStatic;
} catch {}

try {
  const ffprobeStatic = require("ffprobe-static");
  if (ffprobeStatic?.path) ffprobePath = ffprobeStatic.path;
} catch {}

export interface ProbeResult {
  durationSec: number;
  width: number;
  height: number;
}

export async function probeVideo(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=width,height",
      "-of",
      "json",
      filePath,
    ]);

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => (stdout += chunk));
    proc.stderr.on("data", (chunk) => (stderr += chunk));

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`ffprobe failed: ${stderr || code}`));
      }
      try {
        const data = JSON.parse(stdout);
        const durationSec = parseFloat(data?.format?.duration || "0");
        const stream = data?.streams?.[0] || {};
        resolve({
          durationSec,
          width: stream.width || 0,
          height: stream.height || 0,
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

export async function extractFrames(
  videoPath: string,
  outDir: string,
  fps: number = 0.5,
  width: number = 640
): Promise<string[]> {
  await fs.mkdir(outDir, { recursive: true });
  const pattern = path.join(outDir, "frame_%04d.jpg");

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      "-i",
      videoPath,
      "-vf",
      `fps=${fps},scale=${width}:-1`,
      "-q:v",
      "4",
      pattern,
    ]);

    let stderr = "";
    proc.stderr.on("data", (chunk) => (stderr += chunk));

    proc.on("close", async (code) => {
      if (code !== 0) {
        return reject(new Error(`ffmpeg frame extraction failed: ${stderr}`));
      }
      try {
        const files = await fs.readdir(outDir);
        const jpgs = files
          .filter((f) => f.endsWith(".jpg"))
          .sort()
          .map((f) => path.join(outDir, f));
        resolve(jpgs);
      } catch (err) {
        reject(err);
      }
    });
  });
}
