/**
 * Renderer panel operator (display 1 guru): status koneksi, kendali intent,
 * dan pemutar AUDIO → PA (keputusan #5: semua suara dari mesin guru).
 */
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const pa = document.getElementById("pa") as HTMLAudioElement;
let audioTimer: number | null = null;

function applyStatus(s: PanelStatus): void {
  if (s.cloud) {
    $("#cloud").textContent = s.cloud === "online" ? "tersambung" : "TERPUTUS — mencoba lagi…";
    $("#dot").className = `dot ${s.cloud}`;
  }
  if (s.note) $("#note").textContent = s.note;
  if (s.lastCue) $("#lastcue").textContent = s.lastCue;
  if (typeof s.clock_offset_ms === "number") {
    const el = $("#off");
    el.textContent = String(s.clock_offset_ms);
    el.style.color = Math.abs(s.clock_offset_ms) > 250 ? "#ff8d7d" : "#7dffa8";
  }
}

window.torang.onStatus(applyStatus);

void window.torang.boot().then((b) => {
  $("#ep").textContent = b.endpoint_id;
  $("#ver").textContent = b.version;
  $("#panelurl").textContent = `${b.cloud_api}/panel`;
  if (b.status) applyStatus(b.status);
});

window.torang.onAudio((a) => {
  if (audioTimer !== null) {
    clearTimeout(audioTimer);
    audioTimer = null;
  }
  if (a.stop) {
    pa.pause();
    pa.removeAttribute("src");
    return;
  }
  if (!a.fileUrl) return;
  pa.src = a.fileUrl;
  pa.load();
  const start = () => void pa.play().catch(() => {});
  const delay = (a.playAtEpoch ?? Date.now()) - Date.now();
  if (delay <= 30) start();
  else audioTimer = window.setTimeout(start, delay);
});

// Tombol → intent (dipanggil dari HTML)
(window as unknown as Record<string, unknown>).intent = (i: unknown) =>
  window.torang.sendIntent(i);

export {};
