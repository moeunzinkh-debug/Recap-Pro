import React, { useState, useEffect, useCallback } from "react";
import {
  Clapperboard,
  Sparkles,
  Settings as SettingsIcon,
  History,
  ArrowLeft,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  UploadCloud,
  Check,
  Trash2,
  Palette,
  Copy,
  ZoomIn,
  ZoomOut,
  X,
  RefreshCw,
  Key,
  Eye,
  EyeOff,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { GEMINI_MODELS, MODEL, formatBytes } from "./lib/constants";
import { extractVideoFramesClient } from "./lib/clientFrames";

interface RecapItem {
  id: string;
  fileName: string;
  fileSize: number;
  durationSec: number;
  frameCount: number;
  model: string;
  title: string | null;
  script: string | null;
  status: "processing" | "done" | "failed";
  error: string | null;
  isPublic: boolean;
  createdAt: string;
}

// ពណ៌អក្សរដែលបានកំណត់ជាស្រេច (Preset Text Colors)
export const SCRIPT_COLOR_PALETTES = [
  { id: "white", name: "សធម្មជាតិ", hex: "#f8fafc" },
  { id: "amber", name: "មាសលឿង", hex: "#fde047" },
  { id: "emerald", name: "បៃតងត្បូង", hex: "#34d399" },
  { id: "sky", name: "ផ្ទៃមេឃ", hex: "#38bdf8" },
  { id: "purple", name: "ស្វាយស្រទន់", hex: "#c084fc" },
  { id: "rose", name: "ផ្កាឈូក", hex: "#f472b6" },
  { id: "orange", name: "ទឹកក្រូច", hex: "#fb923c" },
  { id: "cyan", name: "ទឹកសមុទ្រ", hex: "#22d3ee" },
  { id: "lime", name: "បៃតងខ្ចី", hex: "#a3e635" },
];

export function App() {
  const [currentPath, setCurrentPath] = useState<string>(() => {
    return window.location.pathname || "/";
  });

  // Global API Key Status
  const [apiKeyInfo, setApiKeyInfo] = useState<{
    hasKey: boolean;
    masked: string;
  }>({ hasKey: false, masked: "" });

  const fetchApiKeyStatus = useCallback(() => {
    fetch("/api/settings/key")
      .then((res) => res.json())
      .then((data) => {
        setApiKeyInfo({
          hasKey: !!data.hasKey,
          masked: data.masked || "",
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchApiKeyStatus();
  }, [fetchApiKeyStatus]);

  // Global Script Text Color Preference
  const [scriptTextColor, setScriptTextColor] = useState<string>(() => {
    return localStorage.getItem("recap_script_text_color") || "#f8fafc";
  });

  // Global Script Font Size Preference
  const [scriptFontSize, setScriptFontSize] = useState<number>(() => {
    const saved = localStorage.getItem("recap_script_font_size");
    return saved ? Number(saved) : 16;
  });

  // Global Notification Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((current) => (current === msg ? null : current));
    }, 3000);
  }, []);

  const updateScriptTextColor = (colorHex: string) => {
    setScriptTextColor(colorHex);
    localStorage.setItem("recap_script_text_color", colorHex);
  };

  const updateScriptFontSize = (sizePx: number) => {
    const clamped = Math.min(28, Math.max(13, sizePx));
    setScriptFontSize(clamped);
    localStorage.setItem("recap_script_font_size", clamped.toString());
  };

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname || "/");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // កំណត់ទំព័រតាម Route
  let content = null;
  if (currentPath === "/create") {
    content = (
      <CreatePage
        onNavigate={navigate}
        apiKeyInfo={apiKeyInfo}
        showToast={showToast}
      />
    );
  } else if (currentPath.startsWith("/recap/")) {
    const recapId = currentPath.replace("/recap/", "");
    content = (
      <RecapDetailPage
        recapId={recapId}
        onNavigate={navigate}
        textColor={scriptTextColor}
        onTextColorChange={updateScriptTextColor}
        fontSize={scriptFontSize}
        onFontSizeChange={updateScriptFontSize}
        showToast={showToast}
      />
    );
  } else if (currentPath === "/settings") {
    content = (
      <SettingsPage
        onNavigate={navigate}
        textColor={scriptTextColor}
        onTextColorChange={updateScriptTextColor}
        fontSize={scriptFontSize}
        onFontSizeChange={updateScriptFontSize}
        showToast={showToast}
        onApiKeyUpdated={fetchApiKeyStatus}
      />
    );
  } else {
    content = (
      <HomePage
        onNavigate={navigate}
        showToast={showToast}
        apiKeyInfo={apiKeyInfo}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white relative">
      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-medium shadow-2xl animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* របារផ្នែកខាងលើ (Header) */}
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2.5 text-left font-semibold text-slate-100 hover:text-white transition group cursor-pointer"
          >
            <div className="p-2 rounded-lg bg-indigo-600/20 text-indigo-400 group-hover:bg-indigo-600/30 transition">
              <Clapperboard className="w-5 h-5" />
            </div>
            <span className="text-lg tracking-tight">Recap Studio</span>
          </button>

          <div className="flex items-center gap-3">
            {/* Status indicator for API Key */}
            <button
              onClick={() => navigate("/settings")}
              className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition cursor-pointer ${
                apiKeyInfo.hasKey
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-500/20"
              }`}
              title={
                apiKeyInfo.hasKey
                  ? `API Key សកម្ម៖ ${apiKeyInfo.masked}`
                  : "ចុចដើម្បីបញ្ចូល API Key"
              }
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  apiKeyInfo.hasKey
                    ? "bg-emerald-400 animate-pulse"
                    : "bg-amber-400"
                }`}
              />
              <span>
                {apiKeyInfo.hasKey ? "Gemini AI: រួចរាល់" : "កំណត់ API Key"}
              </span>
            </button>

            <button
              onClick={() => navigate("/create")}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm shadow-indigo-950 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>បង្កើតស្គ្រីបសម្រាយ</span>
            </button>

            <button
              onClick={() => navigate("/settings")}
              aria-label="ការកំណត់"
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 rounded-lg transition cursor-pointer flex items-center gap-1.5"
              title="ការកំណត់ & គ្រប់គ្រង API Key"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* ខ្លឹមសារចម្បង (Main Body) */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {content}
      </main>
    </div>
  );
}


/* =========================================================================
   1. ទំព័រដើម (HOME PAGE)
   ========================================================================= */
function HomePage({
  onNavigate,
  showToast,
  apiKeyInfo,
}: {
  onNavigate: (path: string) => void;
  showToast: (msg: string) => void;
  apiKeyInfo?: { hasKey: boolean; masked: string };
}) {
  const [recaps, setRecaps] = useState<RecapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showClearModal, setShowClearModal] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchRecaps = useCallback(() => {
    setLoading(true);
    fetch("/api/recaps")
      .then((res) => res.json())
      .then((data) => {
        if (data.recaps) setRecaps(data.recaps);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load recaps:", err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchRecaps();
  }, [fetchRecaps]);

  // លុបធាតុនីមួយៗភ្លាមៗ (Instant 1-Click Delete Single Recap)
  const handleDeleteRecap = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setDeletingId(id);

    // Optimistic UI update: remove immediately from list
    const previousRecaps = [...recaps];
    setRecaps((prev) => prev.filter((r) => r.id !== id));

    try {
      const res = await fetch(`/api/recaps/${id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("បានលុបស្គ្រីបសម្រាយរឿងដោយជោគជ័យ!");
      } else {
        // Rollback on failure
        setRecaps(previousRecaps);
        showToast("មិនអាចលុបស្គ្រីបបានឡើយ");
      }
    } catch (err) {
      console.error("Failed to delete recap:", err);
      setRecaps(previousRecaps);
      showToast("មានបញ្ហាក្នុងការលុបស្គ្រីប");
    } finally {
      setDeletingId(null);
    }
  };

  // សម្អាតប្រវត្តិទាំងអស់ (Clear All History)
  const handleClearAllHistory = async () => {
    setIsClearing(true);
    try {
      const res = await fetch("/api/recaps", { method: "DELETE" });
      if (res.ok) {
        setRecaps([]);
        setShowClearModal(false);
        showToast("បានសម្អាតប្រវត្តិទាំងអស់ដោយជោគជ័យ!");
      } else {
        showToast("មិនអាចសម្អាតប្រវត្តិបានឡើយ");
      }
    } catch (err) {
      console.error("Failed to clear history:", err);
      showToast("មានបញ្ហាក្នុងការសម្អាតប្រវត្តិ");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* ផ្នែក Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900/90 to-slate-950 p-8 sm:p-12 text-center">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>ស្ទូឌីយោបញ្ញាសិប្បនិម្មិត AI Multimodal</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white leading-snug">
            បង្កើតស្គ្រីបសម្រាយរឿង និង Anime ដោយស្វ័យប្រវត្តិតាម AI
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            ផ្ទុកឡើងវីដេអូ ដើម្បីស្រង់យករូបភាពប្លង់សំខាន់ៗដោយស្វ័យប្រវត្តិ
            និងបង្កើតអត្ថបទស្គ្រីបអានសម្លេងជាភាសាខ្មែរយ៉ាងរលូនជាមួយ Google Gemini AI។
          </p>
          <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => onNavigate("/create")}
              className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-lg shadow-indigo-600/20 transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>ចាប់ផ្តើមគម្រោងថ្មី</span>
            </button>
            <button
              onClick={() => onNavigate("/settings")}
              className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-800 rounded-xl border border-slate-700/60 transition cursor-pointer"
            >
              <Palette className="w-4 h-4 text-indigo-400" />
              <span>ប្តូរពណ៌អក្សរ & កំណត់</span>
            </button>
          </div>
        </div>
      </section>

      {/* បញ្ជីស្គ្រីបសម្រាយរឿងថ្មីៗ */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 text-slate-200 font-semibold text-lg">
            <History className="w-5 h-5 text-indigo-400" />
            <h2>ស្គ្រីបសម្រាយរឿងថ្មីៗ</h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-mono">
              {recaps.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {recaps.length > 0 && (
              <button
                onClick={() => setShowClearModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg transition cursor-pointer"
                title="លុបប្រវត្តិទាំងអស់"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>លុបប្រវត្តិទាំងអស់</span>
              </button>
            )}
            <button
              onClick={fetchRecaps}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
              title="ផ្ទុកឡើងវិញ"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-500 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
            <p className="text-sm">កំពុងផ្ទុកបញ្ជីស្គ្រីប...</p>
          </div>
        ) : recaps.length === 0 ? (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-12 text-center space-y-4">
            <p className="text-slate-400 text-sm">
              មិនទាន់មានស្គ្រីបសម្រាយរឿងនៅឡើយទេ។ ចាប់ផ្តើមបង្កើតឥឡូវនេះ!
            </p>
            <button
              onClick={() => onNavigate("/create")}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 rounded-lg transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
              <span>បង្កើតស្គ្រីបដំបូង</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recaps.map((item) => (
              <div
                key={item.id}
                onClick={() => onNavigate(`/recap/${item.id}`)}
                className="group relative cursor-pointer rounded-xl border border-slate-800 bg-slate-900/60 p-5 hover:border-indigo-500/50 hover:bg-slate-900 transition flex flex-col justify-between space-y-4 shadow-sm"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[11px]">
                      {item.model}
                    </span>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-[11px]">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                      {/* ប៊ូតុងលុបធាតុនីមួយៗ (1-Click Delete Button) */}
                      <button
                        onClick={(e) => handleDeleteRecap(e, item.id)}
                        disabled={deletingId === item.id}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition cursor-pointer"
                        title="លុបស្គ្រីបនេះភ្លាមៗ"
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <h3 className="font-semibold text-slate-200 group-hover:text-white line-clamp-1 text-base">
                    {item.title || item.fileName}
                  </h3>
                  <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                    {item.script ||
                      (item.status === "processing"
                        ? "កំពុងដំណើរការបង្កើតអត្ថបទស្គ្រីប..."
                        : item.status === "failed"
                        ? "ដំណើរការបង្កើតស្គ្រីបបរាជ័យ។"
                        : "")}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span>ប្រវែងវីដេអូ៖ {item.durationSec} វិនាទី</span>
                  <span className="flex items-center gap-1.5 font-medium">
                    {item.status === "done" && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> រួចរាល់
                      </span>
                    )}
                    {item.status === "processing" && (
                      <span className="text-amber-400 flex items-center gap-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> កំពុងដំណើរការ
                      </span>
                    )}
                    {item.status === "failed" && (
                      <span className="text-rose-400 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> បរាជ័យ
                      </span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ផ្ទាំងបញ្ជាក់ការលុបប្រវត្តិទាំងអស់ (In-UI Clear All History Modal - No native alert/confirm) */}
      {showClearModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-rose-400 font-semibold">
                <Trash2 className="w-5 h-5" />
                <h3>បញ្ជាក់ការលុបប្រវត្តិទាំងអស់</h3>
              </div>
              <button
                onClick={() => setShowClearModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              តើអ្នកពិតជាចង់លុបស្គ្រីបសម្រាយរឿងទាំងអស់ (
              <span className="font-bold text-white">{recaps.length} គម្រោង</span>)
              ចេញពីប្រព័ន្ធមែនទេ?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowClearModal(false)}
                disabled={isClearing}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 transition cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                onClick={handleClearAllHistory}
                disabled={isClearing}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-500 transition flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20"
              >
                {isClearing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>កំពុងលុប...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>លុបទាំងអស់</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   2. ទំព័របង្កើតស្គ្រីប (CREATE PAGE)
   ========================================================================= */
function CreatePage({
  onNavigate,
  apiKeyInfo,
  showToast,
}: {
  onNavigate: (path: string) => void;
  apiKeyInfo?: { hasKey: boolean; masked: string };
  showToast: (msg: string) => void;
}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>(MODEL);
  const [loading, setLoading] = useState<boolean>(false);
  const [progressMsg, setProgressMsg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleClearSelectedFile = () => {
    setSelectedFile(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setError("សូមជ្រើសរើសឯកសារវីដេអូដើម្បីបន្ត។");
      return;
    }

    setLoading(true);
    setError(null);
    setProgressMsg("កំពុងវិភាគវីដេអូ និងទាញយករូបភាពប្លង់សំខាន់ៗ...");

    try {
      // 1. ទាញយករូបភាពប្លង់ (Client-side)
      const { durationSec, frames } = await extractVideoFramesClient(
        selectedFile,
        (pct, msg) => {
          setProgressMsg(msg);
        }
      );

      setProgressMsg(
        "កំពុងផ្ញើរូបភាព និងរង់ចាំ AI បង្កើតស្គ្រីប... (អាចចំណាយពេលបន្តិច)"
      );

      // 2. បញ្ជូនទិន្នន័យទៅ Server
      const response = await fetch("/api/recaps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          durationSec,
          model: selectedModel,
          frames,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.recapId) {
        throw new Error(data.error || "ការបង្កើតគម្រោងស្គ្រីបសម្រាយរឿងបានបរាជ័យ។");
      }

      // បញ្ជូនទៅទំព័រលម្អិត
      onNavigate(`/recap/${data.recapId}`);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "ការវិភាគវីដេអូ និងបង្កើតស្គ្រីបបានបរាជ័យ។");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => onNavigate("/")}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition mb-3 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>ត្រឡប់ទៅទំព័រដើម</span>
        </button>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          បង្កើតស្គ្រីបសម្រាយរឿងថ្មី
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          ផ្ទុកឡើងវីដេអូដើម្បីឱ្យ AI វិភាគរូបភាព និងរៀបចំអត្ថបទស្គ្រីបអានសម្លេងជាភាសាខ្មែរ។
        </p>
      </div>

      {/* ស្ថានភាព API Key Banner */}
      {apiKeyInfo?.hasKey ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 flex items-center justify-between gap-3 text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>
              Google Gemini API ត្រូវបានភ្ជាប់រួចរាល់ ({apiKeyInfo.masked})
            </span>
          </div>
          <button
            onClick={() => onNavigate("/settings")}
            className="text-emerald-400 hover:text-emerald-200 underline font-medium cursor-pointer"
          >
            ពិនិត្យការកំណត់
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-center justify-between gap-3 text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>មិនទាន់កំណត់ API Key សម្រាប់ដំណើរការ AI នៅឡើយទេ</span>
          </div>
          <button
            onClick={() => onNavigate("/settings")}
            className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold border border-amber-500/30 transition cursor-pointer"
          >
            កំណត់ Key ឥឡូវនេះ
          </button>
        </div>
      )}


      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ជ្រើសរើសឯកសារវីដេអូ */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-200">
              ជ្រើសរើសឯកសារវីដេអូ
            </label>
            {selectedFile && !loading && (
              <button
                type="button"
                onClick={handleClearSelectedFile}
                className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>សម្អាត / ដកវីដេអូចេញ</span>
              </button>
            )}
          </div>

          <label className="border-2 border-dashed border-slate-700 hover:border-indigo-500/60 rounded-xl p-8 flex flex-col items-center justify-center gap-3 bg-slate-900/40 hover:bg-slate-900/60 transition cursor-pointer relative">
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={loading}
            />
            <div className="p-3 rounded-full bg-indigo-500/10 text-indigo-400">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-200">
                {selectedFile ? selectedFile.name : "ចុច ឬទម្លាក់ឯកសារវីដេអូនៅទីនេះ"}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {selectedFile
                  ? `${formatBytes(selectedFile.size)} • រួចរាល់សម្រាប់ដំណើរការ`
                  : "គាំទ្រទ្រង់ទ្រាយ MP4, WebM, MOV (ទំហំអតិបរមា 100MB)"}
              </p>
            </div>
          </label>
        </div>

        {/* ជ្រើសរើសម៉ូដែល Gemini AI */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-200">
            ជ្រើសរើសម៉ូដែល Gemini AI
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {GEMINI_MODELS.map((m) => {
              const isSelected = selectedModel === m.id;
              return (
                <button
                  type="button"
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  disabled={loading}
                  className={`text-left p-3.5 rounded-xl border transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-500/10 shadow-sm"
                      : "border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-slate-200">
                      {m.label}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                      {m.tag}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{m.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ប៊ូតុងបង្កើតស្គ្រីប */}
        <button
          type="submit"
          disabled={loading || !selectedFile}
          className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{progressMsg || "កំពុងវិភាគវីដេអូ និងទាញយករូបភាពប្លង់..."}</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>បង្កើតស្គ្រីបសម្រាយរឿង</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

/* =========================================================================
   3. ទំព័រព័ត៌មានលម្អិតនៃស្គ្រីប (RECAP DETAIL PAGE)
   ========================================================================= */
function RecapDetailPage({
  recapId,
  onNavigate,
  textColor,
  onTextColorChange,
  fontSize,
  onFontSizeChange,
  showToast,
}: {
  recapId: string;
  onNavigate: (path: string) => void;
  textColor: string;
  onTextColorChange: (color: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  showToast: (msg: string) => void;
}) {
  const [recap, setRecap] = useState<RecapItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchRecap = useCallback(async () => {
    try {
      const res = await fetch(`/api/recaps/${encodeURIComponent(recapId)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error || "រកមិនឃើញព័ត៌មានស្គ្រីបសម្រាយរឿងនេះឡើយ។"
        );
      }
      if (!data.recap) {
        throw new Error("រកមិនឃើញព័ត៌មានស្គ្រីបសម្រាយរឿងនេះឡើយ។");
      }
      setRecap(data.recap);
      setLoading(false);
      return data.recap;
    } catch (err: any) {
      setError(err.message || "មិនអាចផ្ទុកព័ត៌មានស្គ្រីបសម្រាយរឿងបានទេ។");
      setLoading(false);
      return null;
    }
  }, [recapId]);

  useEffect(() => {
    let intervalId: any = null;
    fetchRecap().then((initial) => {
      if (initial && initial.status === "processing") {
        intervalId = setInterval(async () => {
          const updated = await fetchRecap();
          if (updated && updated.status !== "processing") {
            clearInterval(intervalId);
          }
        }, 2500);
      }
    });

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchRecap]);

  const handleCopyScript = () => {
    if (!recap?.script) return;
    navigator.clipboard.writeText(recap.script);
    setCopied(true);
    showToast("បានចម្លងអត្ថបទស្គ្រីប!");
    setTimeout(() => setCopied(false), 2500);
  };

  // លុបស្គ្រីបនេះភ្លាមៗ (Instant 1-Click Delete from Detail Page)
  const handleDeleteThisRecap = async () => {
    if (!recap || isDeleting) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/recaps/${recap.id}`, { method: "DELETE" });
      if (res.ok) {
        showToast("បានលុបស្គ្រីបដោយជោគជ័យ!");
        onNavigate("/");
      } else {
        showToast("មិនអាចលុបស្គ្រីបបានឡើយ");
        setIsDeleting(false);
      }
    } catch (err) {
      console.error(err);
      showToast("មានបញ្ហាក្នុងការលុបស្គ្រីប");
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="w-7 h-7 animate-spin text-indigo-500 mx-auto" />
        <p className="text-slate-400 text-sm">កំពុងផ្ទុកព័ត៌មានស្គ្រីបសម្រាយរឿង...</p>
      </div>
    );
  }

  if (error || !recap) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <button
          onClick={() => onNavigate("/")}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>ត្រឡប់ទៅទំព័រដើម</span>
        </button>
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-300 text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-rose-400 mx-auto" />
          <p className="font-semibold">{error || "រកមិនឃើញស្គ្រីបសម្រាយរឿង"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => onNavigate("/")}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>ត្រឡប់ទៅទំព័រដើម</span>
        </button>

        {/* ប៊ូតុងលុបស្គ្រីបនេះ (1-Click Delete This Recap) */}
        <button
          onClick={handleDeleteThisRecap}
          disabled={isDeleting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 rounded-lg transition cursor-pointer"
        >
          {isDeleting ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>កំពុងលុប...</span>
            </>
          ) : (
            <>
              <Trash2 className="w-3.5 h-3.5" />
              <span>លុបស្គ្រីបនេះ</span>
            </>
          )}
        </button>
      </div>

      {/* កាតព័ត៌មានចំណងជើង */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            {recap.title || recap.fileName}
          </h1>

          <div>
            {recap.status === "done" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>រួចរាល់</span>
              </span>
            )}
            {recap.status === "processing" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>កំពុងដំណើរការ</span>
              </span>
            )}
            {recap.status === "failed" && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>បរាជ័យ</span>
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
          <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60">
            {recap.fileName}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60">
            ប្រវែង {recap.durationSec} វិនាទី
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60">
            {recap.model}
          </span>
        </div>
      </div>

      {/* របារឧបករណ៍កំណត់ពណ៌អក្សរ និងទំហំ (Text Color & Appearance Toolbar) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Palette className="w-4 h-4 text-indigo-400" />
            <span>ប្តូរពណ៌អក្សរស្គ្រីប (Text Color Palette)៖</span>
          </div>

          <div className="flex items-center gap-2">
            {/* ប៊ូតុងពង្រីក/បង្រួមអក្សរ (Font size) */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => onFontSizeChange(fontSize - 1)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
                title="បង្រួមអក្សរ"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-2 text-slate-300 font-mono text-[11px]">
                {fontSize}px
              </span>
              <button
                onClick={() => onFontSizeChange(fontSize + 1)}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition"
                title="ពង្រីកអក្សរ"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* ប៊ូតុងចម្លងអត្ថបទស្គ្រីប (Copy Script) */}
            {recap.script && (
              <button
                onClick={handleCopyScript}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg transition cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">បានចម្លង!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>ចម្លងស្គ្រីប</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* ជម្រើសពណ៌អក្សរលឿន (Color Swatches) */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-800/80">
          {SCRIPT_COLOR_PALETTES.map((c) => {
            const isSelected = textColor.toLowerCase() === c.hex.toLowerCase();
            return (
              <button
                key={c.id}
                onClick={() => onTextColorChange(c.hex)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs transition border cursor-pointer ${
                  isSelected
                    ? "border-white bg-slate-800 font-semibold shadow-sm"
                    : "border-slate-800 bg-slate-950/60 hover:bg-slate-800 text-slate-300"
                }`}
                style={{ color: c.hex }}
                title={`ជ្រើសរើសពណ៌ ${c.name}`}
              >
                <span
                  className="w-3 h-3 rounded-full border border-slate-700 shrink-0"
                  style={{ backgroundColor: c.hex }}
                />
                <span>{c.name}</span>
                {isSelected && <Check className="w-3 h-3 ml-0.5 text-white" />}
              </button>
            );
          })}

          {/* ឧបករណ៍រើសពណ៌ផ្ទាល់ខ្លួន (Custom Hex Color Picker) */}
          <label
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 cursor-pointer transition"
            title="ជ្រើសរើសពណ៌ផ្ទាល់ខ្លួនតាមចិត្ត"
          >
            <input
              type="color"
              value={textColor}
              onChange={(e) => onTextColorChange(e.target.value)}
              className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <span className="font-mono text-[11px]">{textColor}</span>
          </label>
        </div>
      </div>

      {/* កាតអត្ថបទស្គ្រីបអានសម្លេង */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-slate-200 font-semibold">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <h2>អត្ថបទស្គ្រីបអានសម្លេង (Generated Voiceover Script)</h2>
          </div>

          <span
            className="text-xs px-2.5 py-0.5 rounded-md border font-mono"
            style={{
              borderColor: textColor,
              color: textColor,
              backgroundColor: `${textColor}15`,
            }}
          >
            ពណ៌អក្សរ៖ {textColor}
          </span>
        </div>

        {recap.error ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-rose-300 text-sm space-y-1">
            <p className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" /> ការបង្កើតស្គ្រីបបានបរាជ័យ
            </p>
            <p className="text-xs opacity-90">{recap.error}</p>
          </div>
        ) : (
          <div
            className="max-w-none whitespace-pre-wrap font-sans leading-relaxed transition-colors duration-200 select-text"
            style={{
              color: textColor,
              fontSize: `${fontSize}px`,
              lineHeight: "1.8",
            }}
          >
            {recap.script || (
              <div className="flex items-center gap-2 text-slate-500 py-6">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                <span>កំពុងដំណើរការបង្កើតអត្ថបទស្គ្រីបជាភាសាខ្មែរ សូមរង់ចាំបន្តិច...</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   4. ទំព័រកំណត់ & ប្តូរពណ៌អក្សរ (SETTINGS & PREFERENCES PAGE)
   ========================================================================= */
function SettingsPage({
  onNavigate,
  textColor,
  onTextColorChange,
  fontSize,
  onFontSizeChange,
  showToast,
  onApiKeyUpdated,
}: {
  onNavigate: (path: string) => void;
  textColor: string;
  onTextColorChange: (color: string) => void;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  showToast: (msg: string) => void;
  onApiKeyUpdated?: () => void;
}) {
  const [hasKey, setHasKey] = useState<boolean>(false);
  const [maskedKey, setMaskedKey] = useState<string>("");
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [showInputPassword, setShowInputPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Testing Key State
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Deleting Key State
  const [showDeleteKeyModal, setShowDeleteKeyModal] = useState<boolean>(false);
  const [deletingKey, setDeletingKey] = useState<boolean>(false);

  // ប្រវត្តិស្គ្រីប
  const [historyCount, setHistoryCount] = useState<number>(0);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [showClearConfirmModal, setShowClearConfirmModal] = useState(false);

  const fetchKeyStatus = useCallback(() => {
    fetch("/api/settings/key")
      .then((res) => res.json())
      .then((data) => {
        setHasKey(!!data.hasKey);
        if (data.masked) setMaskedKey(data.masked);
        else setMaskedKey("");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchKeyStatus();

    fetch("/api/recaps")
      .then((res) => res.json())
      .then((data) => {
        if (data.recaps) setHistoryCount(data.recaps.length);
      })
      .catch(() => {});
  }, [fetchKeyStatus]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;

    setSaving(true);
    setError(null);
    setSaved(false);
    setTestResult(null);

    try {
      const res = await fetch("/api/settings/key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "ការរក្សាទុក Key បានបរាជ័យ។");
      }
      setHasKey(true);
      setMaskedKey(data.masked || maskKey(apiKeyInput.trim()));
      setApiKeyInput("");
      setSaved(true);
      if (data.verificationMessage) {
        setTestResult({
          ok: !!data.verified,
          message: data.verificationMessage,
        });
      }
      showToast("បានរក្សាទុក និងភ្ជាប់ API Key ដោយជោគជ័យ!");
      if (onApiKeyUpdated) onApiKeyUpdated();
      setTimeout(() => setSaved(false), 4000);
    } catch (err: any) {
      setError(err.message || "មិនអាចរក្សាទុក API key បានឡើយ។");
    } finally {
      setSaving(false);
    }
  };

  const handleTestKey = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/settings/key/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setTestResult({
        ok: !!data.ok,
        message: data.message || (data.ok ? "ការតភ្ជាប់ជោគជ័យ!" : data.error || "ការតភ្ជាប់បរាជ័យ"),
      });
      if (data.ok) {
        showToast("ការតភ្ជាប់ទៅកាន់ Google Gemini API ដំណើរការជោគជ័យ!");
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err.message || "មិនអាចតភ្ជាប់ទៅកាន់ Google Gemini API បានឡើយ",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDeleteApiKey = async () => {
    setDeletingKey(true);
    try {
      const res = await fetch("/api/settings/key", { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setHasKey(false);
        setMaskedKey("");
        setTestResult(null);
        setShowDeleteKeyModal(false);
        showToast("បានលុប API Key ចេញពីប្រព័ន្ធរួចរាល់!");
        if (onApiKeyUpdated) onApiKeyUpdated();
      } else {
        showToast("មិនអាចលុប API Key បានឡើយ");
      }
    } catch (err) {
      console.error(err);
      showToast("មានបញ្ហាក្នុងការលុប API Key");
    } finally {
      setDeletingKey(false);
    }
  };

  const handleCopyKey = () => {
    if (!maskedKey) return;
    navigator.clipboard.writeText(maskedKey);
    showToast("បានចម្លង Key!");
  };

  function maskKey(key: string) {
    if (key.length <= 8) return "••••••••";
    return key.slice(0, 6) + "••••••••" + key.slice(-4);
  }

  const handleClearAllHistory = async () => {
    setClearingHistory(true);
    try {
      const res = await fetch("/api/recaps", { method: "DELETE" });
      if (res.ok) {
        setHistoryCount(0);
        setShowClearConfirmModal(false);
        showToast("បានសម្អាតប្រវត្តិទាំងអស់ដោយជោគជ័យ!");
      } else {
        showToast("មិនអាចសម្អាតប្រវត្តិបានឡើយ");
      }
    } catch (err) {
      console.error(err);
      showToast("មានបញ្ហាក្នុងការសម្អាតប្រវត្តិ");
    } finally {
      setClearingHistory(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <button
          onClick={() => onNavigate("/")}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition mb-3 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>ត្រឡប់ទៅទំព័រដើម</span>
        </button>
        <h1 className="text-2xl font-bold tracking-tight text-white">ការកំណត់</h1>
        <p className="text-slate-400 text-sm mt-1">
          គ្រប់គ្រង Google Gemini API Key ប្តូរពណ៌អក្សរស្គ្រីប និងសម្អាតប្រវត្តិ។
        </p>
      </div>

      {/* 1. ផ្ទាំង Google Gemini API Key (API Key Management Dashboard) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-5 shadow-lg">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5 text-slate-200 font-semibold">
            <Key className="w-5 h-5 text-indigo-400" />
            <h2>Google Gemini API Key</h2>
          </div>
          {/* Active Status Badge */}
          {hasKey ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>បានភ្ជាប់ & សកម្ម</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>មិនទាន់មាន Key</span>
            </span>
          )}
        </div>

        {/* បង្ហាញព័ត៌មាន Key ដែលកំពុងដំណើរការ (Current Active Key Card) */}
        {hasKey && (
          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                Key ដែលកំពុងប្រើប្រាស់ក្នុងប្រព័ន្ធ៖
              </span>
              <button
                type="button"
                onClick={handleCopyKey}
                className="text-xs text-slate-400 hover:text-slate-200 inline-flex items-center gap-1 transition cursor-pointer"
                title="ចម្លង Key"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>ចម្លង</span>
              </button>
            </div>

            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="font-mono text-sm text-indigo-300 font-semibold tracking-wider select-all">
                {maskedKey || "AIzaSy••••••••••••••••"}
              </span>
              <span className="text-[11px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                ✓ រួចរាល់
              </span>
            </div>

            {/* ប៊ូតុងសាកល្បងតភ្ជាប់ និងប៊ូតុងលុប Key */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestKey}
                disabled={testing}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-300 hover:text-white bg-indigo-600/20 hover:bg-indigo-600 border border-indigo-500/30 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {testing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>កំពុងសាកល្បង...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>សាកល្បងតភ្ជាប់ AI (Test Key)</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowDeleteKeyModal(true)}
                disabled={testing || deletingKey}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:text-rose-200 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>លុប Key ចេញ</span>
              </button>
            </div>

            {/* Test Result Message */}
            {testResult && (
              <div
                className={`p-3 rounded-lg text-xs border transition ${
                  testResult.ok
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                }`}
              >
                <div className="flex items-start gap-2">
                  {testResult.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ទម្រង់បញ្ចូល ឬផ្លាស់ប្តូរ Key (Input Form) */}
        <form onSubmit={handleSave} className="space-y-3.5">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-300">
              {hasKey
                ? "បញ្ចូល Gemini API Key ថ្មី (ប្រសិនបើចង់ផ្លាស់ប្តូរ)៖"
                : "បញ្ចូល Gemini API Key របស់អ្នក៖"}
            </label>
            <p className="text-[11px] text-slate-400">
              Key ត្រូវបានរក្សាទុកដោយសុវត្ថិភាពសម្រាប់ការវិភាគវីដេអូ និងបង្កើតស្គ្រីប។
            </p>
          </div>

          <div className="relative">
            <input
              type={showInputPassword ? "text" : "password"}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="ឧទាហរណ៍៖ AIzaSy..."
              className="w-full pl-3.5 pr-10 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-indigo-500 font-mono placeholder:text-slate-600 transition"
            />
            <button
              type="button"
              onClick={() => setShowInputPassword(!showInputPassword)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200 transition cursor-pointer"
              title={showInputPassword ? "លាក់ Key" : "បង្ហាញ Key"}
            >
              {showInputPassword ? (
                <EyeOff className="w-4 h-4" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1 transition"
            >
              <span>យក API Key ឥតគិតថ្លៃនៅ Google AI Studio</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <button
              type="submit"
              disabled={saving || !apiKeyInput.trim()}
              className="py-2.5 px-4 rounded-lg font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-indigo-600/20"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>កំពុងរក្សាទុក...</span>
                </>
              ) : saved ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>បានរក្សាទុក!</span>
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  <span>រក្សាទុក Key</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* 2. ផ្ទាំងប្តូរពណ៌អក្សរស្គ្រីប (Text Color & Typography Settings) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 shadow-lg">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-slate-200 font-semibold">
          <Palette className="w-5 h-5 text-indigo-400" />
          <h2>ប្តូរពណ៌ និងទំហំអក្សរស្គ្រីប (Text Color & Size)</h2>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          ជ្រើសរើសពណ៌អក្សរដែលអ្នកចូលចិត្តសម្រាប់អាន និងបង្ហាញអត្ថបទស្គ្រីបសម្រាយរឿង។
        </p>

        {/* ជម្រើសពណ៌អក្សរ (Color Swatches) */}
        <div className="grid grid-cols-3 gap-2.5">
          {SCRIPT_COLOR_PALETTES.map((c) => {
            const isSelected = textColor.toLowerCase() === c.hex.toLowerCase();
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onTextColorChange(c.hex)}
                className={`p-3 rounded-xl border transition cursor-pointer flex flex-col items-center justify-center gap-1.5 text-center ${
                  isSelected
                    ? "border-indigo-500 bg-indigo-500/10 shadow-sm"
                    : "border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900"
                }`}
              >
                <div
                  className="w-5 h-5 rounded-full border border-slate-700 shadow-inner"
                  style={{ backgroundColor: c.hex }}
                />
                <span className="text-xs font-medium" style={{ color: c.hex }}>
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* ជ្រើសរើសពណ៌ផ្ទាល់ខ្លួន (Custom Hex Color) */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
          <span className="text-xs text-slate-300 font-medium">
            ជ្រើសរើសពណ៌ផ្ទាល់ខ្លួន (Custom Color)៖
          </span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={textColor}
              onChange={(e) => onTextColorChange(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer bg-transparent border-0 p-0"
            />
            <span className="text-xs font-mono text-indigo-400 font-semibold">
              {textColor}
            </span>
          </div>
        </div>

        {/* គំរូអក្សរផ្ទាល់ (Live Text Preview) */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
          <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider">
            គំរូបង្ហាញអក្សរ (Live Preview)
          </span>
          <p
            className="font-sans leading-relaxed transition-colors duration-150"
            style={{ color: textColor, fontSize: `${fontSize}px` }}
          >
            "រឿងរ៉ាវបានចាប់ផ្ដើមឡើងនៅពេលដែលតួអង្គឯកបានរកឃើញថាមពលអាថ៌កំបាំង..."
          </p>
        </div>
      </div>

      {/* 3. ផ្ទាំងគ្រប់គ្រងប្រវត្តិស្គ្រីប (History & Delete Management) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 shadow-lg">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-slate-200 font-semibold">
          <Trash2 className="w-5 h-5 text-rose-400" />
          <h2>គ្រប់គ្រង និងសម្អាតប្រវត្តិ (History Management)</h2>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-300">
            ចំនួនស្គ្រីបសម្រាយរឿងក្នុងប្រវត្តិ៖
          </span>
          <span className="font-mono font-bold text-white bg-slate-800 px-2.5 py-1 rounded-md">
            {historyCount} គម្រោង
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowClearConfirmModal(true)}
          disabled={clearingHistory || historyCount === 0}
          className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm text-rose-400 hover:text-white bg-rose-500/10 hover:bg-rose-600 border border-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 cursor-pointer shadow-sm"
        >
          <Trash2 className="w-4 h-4" />
          <span>លុប និងសម្អាតប្រវត្តិទាំងអស់ (Clear All History)</span>
        </button>
      </div>

      {/* Modal បញ្ជាក់ការលុប API Key */}
      {showDeleteKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-rose-400 font-semibold">
                <Trash2 className="w-5 h-5" />
                <h3>បញ្ជាក់ការដក API Key ចេញ</h3>
              </div>
              <button
                onClick={() => setShowDeleteKeyModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              តើអ្នកពិតជាចង់ដក ឬលុប Google Gemini API Key ចេញពីប្រព័ន្ធមែនទេ?
              បន្ទាប់ពីលុប អ្នកត្រូវបញ្ចូល Key ថ្មីដើម្បីអាចដំណើរការ AI បាន។
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowDeleteKeyModal(false)}
                disabled={deletingKey}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 transition cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                onClick={handleDeleteApiKey}
                disabled={deletingKey}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-500 transition flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20"
              >
                {deletingKey ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>កំពុងលុប...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>លុប Key</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal បញ្ជាក់ការសម្អាតប្រវត្តិក្នុង Settings */}
      {showClearConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-rose-400 font-semibold">
                <Trash2 className="w-5 h-5" />
                <h3>បញ្ជាក់ការលុបប្រវត្តិទាំងអស់</h3>
              </div>
              <button
                onClick={() => setShowClearConfirmModal(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              តើអ្នកពិតជាចង់លុបស្គ្រីបសម្រាយរឿងទាំងអស់ (
              <span className="font-bold text-white">{historyCount} គម្រោង</span>)
              ចេញពីប្រព័ន្ធមែនទេ?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowClearConfirmModal(false)}
                disabled={clearingHistory}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:bg-slate-800 transition cursor-pointer"
              >
                បោះបង់
              </button>
              <button
                onClick={handleClearAllHistory}
                disabled={clearingHistory}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-rose-600 hover:bg-rose-500 transition flex items-center gap-2 cursor-pointer shadow-lg shadow-rose-600/20"
              >
                {clearingHistory ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>កំពុងលុប...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>លុបទាំងអស់</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default App;
