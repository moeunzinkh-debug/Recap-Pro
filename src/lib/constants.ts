export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
export const MAX_DURATION_SEC = 10 * 60; // 10 minutes
export const MIN_DURATION_SEC = 3;
export const MAX_FRAMES = 110;
export const FRAME_WIDTH = 640;
export const MODEL = "gemini-3.7-flash";

export interface GeminiModelOption {
  id: string;
  label: string;
  tag: string;
  description: string;
}

// Keep the model catalogue deliberately small so the UI and API expose only
// the currently supported Gemini Flash models.
export const GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: "gemini-3.1-flash",
    label: "Gemini 3.1 Flash",
    tag: "លឿន និងឆ្លាតវៃ",
    description: "សមត្ថភាពវិភាគ និងគិតស៊ីជម្រៅលឿន",
  },
  {
    id: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    tag: "Multimodal",
    description: "ម៉ូដែល Multimodal លឿន និងឆ្លាតវៃខ្ពស់",
  },
  {
    id: "gemini-3.7-flash",
    label: "Gemini 3.7 Flash",
    tag: "ណែនាំ",
    description: "ជំនាន់ថ្មីសម្រាប់ស្គ្រីបសម្រាយរឿងដែលមានគុណភាពខ្ពស់",
  },
];

export function isKnownGeminiModel(id: string): boolean {
  return GEMINI_MODELS.some((m) => m.id === id);
}

export function normalizeGeminiModel(value: unknown): string {
  return typeof value === "string" && isKnownGeminiModel(value)
    ? value
    : MODEL;
}

export interface AnalyzeProgress {
  stage: "upload" | "probe" | "frames" | "gemini" | "saving";
  message: string;
  percent?: number;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}
