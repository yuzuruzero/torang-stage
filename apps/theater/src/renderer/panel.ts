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

// ---------------------------------------------------------------------------
// Indikator voice
//
// Guru menghadap murid, bukan monitor. Yang harus terbaca sekilas cuma satu
// hal: apakah mesin sedang mendengarkan. Sisanya - apa yang terdengar, jadi
// intent apa, kenapa ditolak - dibaca saat ada yang aneh, jadi boleh kecil.
//
// Satu aturan yang menentukan bentuknya: HASIL TIDAK BOLEH HILANG. Tiap ucapan
// berakhir dengan laporan "diam", dan kalau blok hasil ikut dikosongkan, kalimat
// yang ditolak lenyap sebelum sempat dibaca - persis kejadian yang paling perlu
// dilihat guru. Jadi keadaan dan hasil dirawat terpisah.
// ---------------------------------------------------------------------------
const KATA_KEADAAN: Record<VoiceStatus["keadaan"], string> = {
  mati: "VOICE MATI",
  diam: "SIAP MENDENGAR",
  merekam: "MEREKAM...",
  memproses: "memproses...",
};

const riwayat: string[] = [];

function terapkanVoice(v: VoiceStatus): void {
  const pill = $("#vpill");
  pill.className = `vpill ${v.keadaan}`;
  pill.textContent = KATA_KEADAAN[v.keadaan] ?? v.keadaan;

  const adaHasil = Boolean(v.didengar || v.alasan || v.intent);
  if (!adaHasil) return; // laporan keadaan saja - jangan hapus hasil sebelumnya

  const dengar = $("#vdengar");
  if (v.didengar) {
    dengar.className = "";
    dengar.textContent = "";
    const q = document.createElement("span");
    q.className = "kutip";
    q.textContent = `\u201c${v.didengar}\u201d`; // teks dari whisper - JANGAN lewat innerHTML
    dengar.appendChild(q);
  }

  const hasil = $("#vhasil");
  hasil.textContent = "";
  const baris = document.createElement("span");
  if (v.intent) {
    baris.className = "ok";
    const i = v.intent as Record<string, unknown>;
    const bagian = [i.intent, i.alias, i.target, i.to].filter(Boolean).join(" \u00b7 ");
    baris.textContent = `\u2713 ${bagian}${v.ms ? `  (${v.ms} ms)` : ""}`;
  } else if (v.alasan) {
    baris.className = "tolak";
    baris.textContent = `\u2715 ditolak: ${v.alasan}`;
  }
  hasil.appendChild(baris);

  // Pencocokan samar nama modul SELALU ditampilkan. Kalau mesin menebak nama
  // yang mirip, guru harus bisa melihat tebakannya - bukan menemukannya nanti
  // lewat video yang salah tayang.
  const mirip = $("#vmirip");
  mirip.textContent = v.mirip
    ? `\u26a0 dengar \u201c${v.mirip.didengar}\u201d \u2192 dipakai \u201c${v.mirip.dipakai}\u201d`
    : "";

  if (v.didengar || v.alasan) {
    riwayat.unshift(
      `${v.intent ? '<span class="r-ok">\u2713</span>' : '<span class="r-tolak">\u2715</span>'} ${esc(v.didengar ?? "(kosong)")}`
    );
    riwayat.length = Math.min(riwayat.length, 5);
    $("#vriwayat").innerHTML = riwayat.join("<br>");
  }
}

window.torang.onVoice(terapkanVoice);

void window.torang.boot().then((b) => {
  $("#ep").textContent = b.endpoint_id;
  $("#ver").textContent = b.version;
  $("#panelurl").textContent = `${b.cloud_api}/panel`;
  if (b.status) applyStatus(b.status);
  if (b.voice) terapkanVoice(b.voice);
  $("#vtombol").textContent = b.voice_tombol ? `\u00b7 tekan ${b.voice_tombol} untuk bicara` : "";
  const hk = b.hotkeys;
  $("#hkGo").textContent = hk ? hk.go : "(hotkey off)";
  $("#hkUlang").textContent = hk ? hk.replay : "";
  $("#hkStop").textContent = hk ? hk.stop : "";
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

  // Kartu ringkas murid. Nama = ketikan bebas murid → WAJIB di-escape.
  const seats = new Set([...online, ...nama.keys()]);
  const el = $("#daftarMurid");
  if (seats.size === 0) {
    el.textContent =
      "Belum ada murid online/login. (Murid: jalankan 'Torang Kelas.bat' lalu ketik nama.)";
    return;
  }
  el.innerHTML = [...seats]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((seat) => {
      const on = online.has(seat);
      const n = nama.get(seat);
      return `<span class="murid-baris" data-seat="${seat}" title="klik ✕ untuk lepas kursi ini"><span class="${on ? "on" : "off"}">${on ? "●" : "○"}</span> ${seat}${n ? ` — ${esc(n)}` : ""}${on ? "" : " (offline)"} <span class="lepas" data-seat="${seat}">✕</span></span>`;
    })
    .join("");
  el.querySelectorAll<HTMLElement>(".lepas").forEach((x) => {
    x.onclick = () => {
      const seat = x.dataset.seat!;
      if (confirm(`Lepas kursi ${seat}? (murid bisa login ulang dengan nama baru)`)) {
        window.torang.panelUnbind(seat);
      }
    };
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

window.torang.onState((raw) => renderState(raw as StateSnap));

const api = (window as unknown as Record<string, unknown>) as Record<string, unknown>;
api.intent = (i: unknown) => window.torang.sendIntent(i);
// Buka ulang window TV yang hilang. Window yang masih hidup tidak diganggu,
// jadi aman ditekan kapan saja tanpa memutus tayangan yang sedang jalan.
api.bukaTv = () => {
  const sel = document.getElementById("bukaTv") as HTMLSelectElement | null;
  window.torang.panelBukaTv(sel?.value ?? "semua");
};
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
api.resetMurid = () => {
  if (
    confirm(
      "Reset SEMUA murid? Semua binding kursi dilepas — kelas berikutnya login dengan nama baru."
    )
  ) {
    window.torang.panelResetMurid();
  }
};

export {};
