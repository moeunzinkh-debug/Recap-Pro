import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import {
  getAllRecaps,
  getRecapById,
  createRecap,
  updateRecap,
  deleteRecap,
  clearAllRecaps,
  getActiveApiKey,
  setApiKey,
  deleteApiKey,
} from "./src/lib/db";
import { buildRecapPrompt } from "./src/lib/prompt";
import { generateRecapWithFrames, testGeminiApiKey } from "./src/lib/gemini";
import { MAX_FILE_SIZE, MAX_DURATION_SEC } from "./src/lib/constants";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON parsing with large limit for frame payloads
  app.use(express.json({ limit: "150mb" }));
  app.use(express.urlencoded({ extended: true, limit: "150mb" }));

  // API Routes
  app.get("/api/health", async (req, res) => {
    const keyInfo = await getActiveApiKey();
    res.json({
      status: "ok",
      hasApiKey: keyInfo.hasKey,
      maskedKey: keyInfo.masked,
    });
  });

  // 1. Get all recaps
  app.get("/api/recaps", async (req, res) => {
    try {
      const list = await getAllRecaps();
      res.json({ recaps: list });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "មិនអាចទាញយកបញ្ជីស្គ្រីបបានទេ។" });
    }
  });

  // 2. Get single recap
  app.get("/api/recaps/:id", async (req, res) => {
    try {
      const recap = await getRecapById(req.params.id);
      if (!recap) {
        return res.status(404).json({ error: "រកមិនឃើញស្គ្រីបសម្រាយរឿងនេះឡើយ" });
      }
      res.json({ recap });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "មិនអាចទាញយកព័ត៌មានស្គ្រីបបានឡើយ" });
    }
  });

  // Delete single recap
  app.delete("/api/recaps/:id", async (req, res) => {
    try {
      const deleted = await deleteRecap(req.params.id);
      if (!deleted) {
        return res.status(404).json({ error: "រកមិនឃើញស្គ្រីបដែលត្រូវលុបឡើយ" });
      }
      res.json({ success: true, message: "បានលុបស្គ្រីបដោយជោគជ័យ" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "មិនអាចលុបស្គ្រីបបានទេ" });
    }
  });

  // Clear all recap history
  app.delete("/api/recaps", async (req, res) => {
    try {
      await clearAllRecaps();
      res.json({ success: true, message: "បានសម្អាតប្រវត្តិទាំងអស់ដោយជោគជ័យ" });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "មិនអាចសម្អាតប្រវត្តិបានឡើយ" });
    }
  });

  // 3. Create and generate recap
  app.post("/api/recaps", async (req, res) => {
    try {
      const {
        fileName = "video.mp4",
        fileSize = 0,
        durationSec = 30,
        model = "gemini-2.0-flash",
        frames = [],
      } = req.body;

      if (fileSize > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: `ទំហំឯកសារលើសពីកម្រិតកំណត់ ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
        });
      }

      if (durationSec > MAX_DURATION_SEC) {
        return res.status(400).json({
          error: `ប្រវែងវីដេអូលើសពីកម្រិតកំណត់អតិបរមា (${MAX_DURATION_SEC / 60} នាទី)`,
        });
      }

      const frameCount = frames.length;
      const intervalSec = frameCount > 1 ? durationSec / frameCount : durationSec;

      // Create initial recap entry
      const recap = await createRecap({
        fileName,
        fileSize,
        durationSec: Math.round(durationSec),
        frameCount,
        model,
        title: fileName.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
        script: null,
        status: "processing",
        error: null,
        isPublic: true,
      });

      // Respond immediately with recap ID
      res.json({ recapId: recap.id });

      // Run Gemini generation asynchronously
      (async () => {
        try {
          const keyInfo = await getActiveApiKey();
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
          const titleMatch = generatedScript.match(/^#+\s*(?:ចំណងជើង:\s*|Title:\s*)?([^\n]+)/i);
          const customTitle = titleMatch ? titleMatch[1].trim() : recap.title;

          await updateRecap(recap.id, {
            status: "done",
            title: customTitle || recap.title,
            script: generatedScript,
            error: null,
          });
        } catch (genErr: any) {
          console.error("Gemini generation failed:", genErr);
          await updateRecap(recap.id, {
            status: "failed",
            error: genErr.message || "ការបង្កើតស្គ្រីបជាមួយ Gemini បានបរាជ័យ។",
          });
        }
      })();
    } catch (err: any) {
      console.error("Create recap failed:", err);
      res.status(500).json({ error: err.message || "មានបញ្ហាបច្ចេកទេសក្នុងម៉ាស៊ីនមេ" });
    }
  });

  // 4. API Key Settings
  app.get("/api/settings/key", async (req, res) => {
    try {
      const keyInfo = await getActiveApiKey();
      res.json({ hasKey: keyInfo.hasKey, masked: keyInfo.masked });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/settings/key", async (req, res) => {
    try {
      const { apiKey } = req.body;
      if (!apiKey || typeof apiKey !== "string" || !apiKey.trim()) {
        return res.status(400).json({ error: "សូមបញ្ចូល API Key ឱ្យបានត្រឹមត្រូវ" });
      }
      await setApiKey("GEMINI_API_KEY", apiKey.trim());
      const keyInfo = await getActiveApiKey();
      
      // Perform quick test
      const testResult = await testGeminiApiKey(apiKey.trim());

      res.json({
        success: true,
        hasKey: keyInfo.hasKey,
        masked: keyInfo.masked,
        verified: testResult.ok,
        verificationMessage: testResult.message,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/settings/key/test", async (req, res) => {
    try {
      const { apiKey } = req.body;
      const keyToTest = apiKey || (await getActiveApiKey()).decrypted;
      if (!keyToTest) {
        return res.status(400).json({ ok: false, error: "មិនមាន API Key សម្រាប់ធ្វើតេស្តឡើយ" });
      }
      const testResult = await testGeminiApiKey(keyToTest);
      res.json(testResult);
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  app.delete("/api/settings/key", async (req, res) => {
    try {
      await deleteApiKey("GEMINI_API_KEY");
      const keyInfo = await getActiveApiKey();
      res.json({
        success: true,
        hasKey: keyInfo.hasKey,
        masked: keyInfo.masked,
        message: "បានលុប API Key ដោយជោគជ័យ",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware setup
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
