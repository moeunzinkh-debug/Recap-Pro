import { MAX_FRAMES, FRAME_WIDTH } from "./constants";

export interface ExtractedFrame {
  index: number;
  timeSec: number;
  base64: string;
}

export async function extractVideoFramesClient(
  file: File,
  onProgress?: (percent: number, message: string) => void
): Promise<{
  durationSec: number;
  frames: ExtractedFrame[];
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.remove();
    };

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration;
        if (!duration || duration <= 0 || isNaN(duration)) {
          cleanup();
          return reject(new Error("មិនអាចកំណត់ប្រវែងវីដេអូបានទេ។"));
        }

        // Determine frame count based on duration (1 frame every 4-8s, bounded by [4, MAX_FRAMES])
        let targetFrameCount = Math.min(
          MAX_FRAMES,
          Math.max(4, Math.floor(duration / 5))
        );
        if (duration < 10) targetFrameCount = Math.min(4, Math.floor(duration));

        const interval = duration / (targetFrameCount + 1);
        const timestamps: number[] = [];
        for (let i = 1; i <= targetFrameCount; i++) {
          timestamps.push(Math.min(duration - 0.1, i * interval));
        }

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          return reject(new Error("មិនអាចដំណើរការ Canvas 2D បានទេ។"));
        }

        const aspect = (video.videoHeight || 9) / (video.videoWidth || 16);
        canvas.width = FRAME_WIDTH;
        canvas.height = Math.round(FRAME_WIDTH * aspect);

        const frames: ExtractedFrame[] = [];

        for (let i = 0; i < timestamps.length; i++) {
          const t = timestamps[i];
          if (onProgress) {
            const pct = Math.round(((i + 1) / timestamps.length) * 100);
            onProgress(
              pct,
              `កំពុងទាញយករូបភាពប្លង់ទី ${i + 1} នៃ ${timestamps.length} (${pct}%)`
            );
          }

          await new Promise<void>((resSeek) => {
            const onSeeked = () => {
              video.removeEventListener("seeked", onSeeked);
              resSeek();
            };
            video.addEventListener("seeked", onSeeked);
            video.currentTime = t;
          });

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const base64 = canvas.toDataURL("image/jpeg", 0.75);
          frames.push({
            index: i + 1,
            timeSec: t,
            base64,
          });
        }

        cleanup();
        resolve({
          durationSec: duration,
          frames,
        });
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error("មិនអាចបើក និងអានឯកសារវីដេអូនេះបានទេ។"));
    };
  });
}
