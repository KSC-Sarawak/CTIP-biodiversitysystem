// Colours and fonts for the video. The palette is the app's own dark theme (apps/shared/tokens.js).
import { loadFont as fraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as nunito } from "@remotion/google-fonts/Nunito";
import { loadFont as mono } from "@remotion/google-fonts/JetBrainsMono";

export const C = {
  bg: "#0d1f15", surface: "#15291d", raised: "#1c3526", sunken: "#0a1810", chrome: "#11251a", line: "#2e4d38",
  ink: "#eef4e4", ink2: "#b4c9ab", ink3: "#8ea688", accent: "#9bcf6a", onAccent: "#11281a",
  success: "#8fd18a", info: "#82c8dc", warning: "#e8bd5c", danger: "#f2907b", neutral: "#aabba6", camera: "#06110b",
  washLeaf: "#1d4a2a", washWater: "#113a40",
};
export const F = {
  display: fraunces("normal", { weights: ["600"], subsets: ["latin"] }).fontFamily,
  text: inter("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] }).fontFamily,
  app: nunito("normal", { weights: ["400", "600", "700", "800"], subsets: ["latin"] }).fontFamily,
  mono: mono("normal", { weights: ["500"], subsets: ["latin"] }).fontFamily,
};
fraunces("italic", { weights: ["600"], subsets: ["latin"] });

export const FPS = 30;
export const BAR = 72; // one bar of the soundtrack (100 BPM) in frames
// Where each part starts, in frames. They sit on bar lines so cuts land on the music.
export const T = { opening: 0, overview: 6 * BAR, mobile: 10 * BAR, web: 35 * BAR, pub: 63 * BAR, recap: 72 * BAR, end: 80 * BAR + 90 };
