/** SPEC §8.3 screen 3: "If WebGL is unavailable... render Body2DFallback."
 * Checked once, client-side, via a throwaway canvas — the cheapest honest
 * way to know before mounting the real `<Canvas>`. */
export function isWebGLAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}
