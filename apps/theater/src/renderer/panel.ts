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

// ---------------------------------------------------------------------------
// State live dari cloud (via main): murid online, binding, pilihan kursi
// ---------------------------------------------------------------------------
type StateSnap = {
  endpoints: Array<{ endpoint_id: string; role: string }>;
  bindings: Array<{ seat_id: string; nama: string }>;
};

const sel = document.getElementById("kursi") as HTMLSelectElement;

function renderState(s: StateSnap): void {
  const online = new Set(
    s.endpoints.filter((e) => e.role === "student").map((e) => e.endpoint_id)
  );
  const nama = new Map(s.bindings.map((b) => [b.seat_id, b.nama]));

  // Dropdown kursi: pertahankan pilihan pengguna saat refresh.
  const dipilih = sel.value;
  sel.innerHTML = "";
  for (let i = 1; i <= 20; i++) {
    const seat = `komp${i}`;
    const o = document.createElement("option");
    o.value = seat;
    o.textContent =
      seat + (online.has(seat) ? " ●" : "") + (nama.has(seat) ? ` — ${nama.get(seat)}` : "");
    sel.appendChild(o);
  }
  if (dipilih) {
    sel.value = dipilih;
  } else {
    const pertamaOnline = [...online].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    )[0];
    if (pertamaOnline) sel.value = pertamaOnline;
  }

  // Kartu ringkas murid.
  const seats = new Set([...online, ...nama.keys()]);
  const el = $("#daftarMurid");
  if (seats.size === 0) {
    el.textContent =
      "Belum ada murid online/login. (Murid: jalankan 'Torang Kelas.bat' lalu pilih nama.)";
    return;
  }
  el.innerHTML = [...seats]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((seat) => {
      const on = online.has(seat);
      const n = nama.get(seat);
      return `<span class="murid-baris"><span class="${on ? "on" : "off"}">${on ? "●" : "○"}</span> ${seat}${n ? ` — ${n}` : ""}${on ? "" : " (offline)"}</span>`;
    })
    .join("");
}

window.torang.onState((raw) => renderState(raw as StateSnap));

const api = (window as unknown as Record<string, unknown>) as Record<string, unknown>;
api.intent = (i: unknown) => window.torang.sendIntent(i);
api.sapaKursi = () => window.torang.sendIntent({ intent: "SAPA", target: sel.value || "komp1" });
api.ketukKursi = () =>
  window.torang.sendIntent({ intent: "PLAY_MODULE", alias: "tes", target: sel.value || "komp1" });
api.glowKursi = () =>
  window.torang.sendIntent({
    intent: "GLOW",
    target: sel.value || "komp1",
    preset: "pulse",
    duration_ms: 4000,
  });

export {};
