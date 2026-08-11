/**
 * GLOW: bingkai cahaya pinggir layar (window transparan click-through).
 * Preset whitelist: pulse | breathe | wave (§3.2).
 */
const el = document.getElementById("glow")!;
let timer: number | null = null;

window.torang.onGlowShow((raw) => {
  const p = raw as { preset: string; duration_ms: number };
  const preset = ["pulse", "breathe", "wave"].includes(p.preset) ? p.preset : "pulse";
  el.className = "";
  void el.offsetWidth;
  el.className = preset;
  if (timer !== null) clearTimeout(timer);
  timer = window.setTimeout(() => {
    el.className = "";
  }, Math.min(p.duration_ms || 4000, 60_000));
});

export {};
