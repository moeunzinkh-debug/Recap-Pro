export interface PromptParams {
  fileName: string;
  durationSec: number;
  frameCount: number;
  intervalSec: number;
}

export function buildRecapPrompt(params: PromptParams): string {
  const mins = Math.floor(params.durationSec / 60);
  const secs = Math.round(params.durationSec % 60);
  const formattedDur = `${mins} នាទី ${secs} វិនាទី`;

  return `You are an elite Anime & Movie Recap Narrator and Content Creator for YouTube/TikTok recap channels.
You are provided with a sequence of ${params.frameCount} keyframes extracted uniformly (every ~${params.intervalSec.toFixed(1)} seconds) from a video clip named "${params.fileName}" (Total duration: ${formattedDur}).

### YOUR CRITICAL TASK:
Write an engaging, fast-paced, entertaining, and highly professional ANIME / MOVIE RECAP SCRIPT ENTIRELY IN NATURAL, FLUENT KHMER LANGUAGE (ភាសាខ្មែរ) tailored for cinematic voiceover narration.

### SCRIPT STRUCTURE REQUIREMENTS (MUST BE IN KHMER):
1. **ចំណងជើង (Title)**: Catchy, click-worthy YouTube title in Khmer for this recap.
2. **ផ្តើមសាច់រឿងទាក់ទាញ (Hook 0:00 - 0:15)**: Instant high-energy opening line in Khmer to grab viewer attention immediately.
3. **ដំណើររឿងលម្អិតតាមលំដាប់ (Core Narrative - Chronological)**:
   - Walk through the storyline strictly matching the sequential visual clues in the frames.
   - Describe character motivations, key action scenes, plot twists, and emotional climaxes in fluent storytelling Khmer.
   - Maintain continuous storytelling flow that matches audio-visual timing.
4. **បញ្ចប់សាច់រឿង និងការដាស់តឿនទស្សនិកជន (Cinematic Outro & Call-to-Action)**: Strong concluding remarks in Khmer teasing the next episode and asking viewers to like/subscribe.

### STYLE GUIDELINES:
- Output MUST be 100% in Khmer (ភាសាខ្មែរ) suitable for voice narration (សម្លេងអានរឿងសម្រាយ).
- Use active, punchy, cinematic voiceover phrasing (ឧទាហរណ៍៖ "សូមស្វាគមន៍មកកាន់...", "រឿងរ៉ាវបានចាប់ផ្ដើមឡើងនៅពេលដែល...", "ប៉ុន្តែអ្វីៗមិនដូចការគិតឡើយ...").
- Format with clear structural headers and timestamps like [0:00 - 0:30].
- Output clean markdown formatted text ready for production copy-pasting.`;
}
