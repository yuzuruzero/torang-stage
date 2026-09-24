/**
 * Panel guru (display operator) — ditata ulang 24 Sep 2026 mengikuti deck
 * "Theater of AI — Deck Friesca & Arief" layar 1: bilah atas status, tiga
 * kolom (rundown · posisi Torang & ruangan · riwayat cue & efek), dan bilah
 * bawah suara (PTT · transkrip Whisper · konfirmasi 1 detik · GO/ULANG/STOP).
 *
 * Yang tidak ada di mockup tapi sudah jalan (tata layar, antrean, video baru,
 * mode video, pemulihan) ditaruh di tempat yang tidak mengganggu: chip tata
 * di peta ruangan, antrean di bawahnya, sisanya di laci "⚙ Alat".
 *
 * Aturan keamanan tetap: teks dari luar (transkrip, nama murid, nama berkas)
 * lewat textContent, TIDAK PERNAH innerHTML.
 */
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const pa = document.getElementById("pa") as HTMLAudioElement;
let audioTimer: number | null = null;

const api = window as unknown as Record<string, unknown>;
const intent = (i: unknown) => window.torang.sendIntent(i);
api.intent = intent;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, kelas?: string, teks?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (kelas) e.className = kelas;
  if (teks !== undefined) e.textContent = teks;
  return e;
}

// ---------------------------------------------------------------------------
// Ringkasan untuk manusia
// ---------------------------------------------------------------------------
function namaLayar(t: unknown): string {
  const s = String(t ?? "");
  if (/^tv[1-4]$/.test(s)) return `TV${s.slice(2)}`;
  if (s === "all_tv") return "semua layar";
  if (s === "all_student") return "semua komp";
  if (s === "teacher") return "PA";
  return s.replace(/^komp/, "komp ");
}

function ringkas(i: Record<string, unknown>): string {
  switch (i.intent) {
    case "PLAY_MODULE": return `puter ${i.alias} ${i.target ? `di ${namaLayar(i.target)}` : "di layar Torang"}`;
    case "MOVE": return `Torang pindah ke ${namaLayar(i.to)}`;
    case "OPEN_SCENE": return `buka ${i.scene} di ${namaLayar(i.target)}`;
    case "CLOSE_SCENE": return `tutup ${namaLayar(i.target)}`;
    case "SAPA": return `sapa ${namaLayar(i.target)}`;
    case "GLOW": return `glow ${namaLayar(i.target)}`;
    case "TATA": return `tata layar “${i.nama}”`;
    case "GO": return "lanjut";
    case "REPLAY": return "ulang";
    case "STOP": return "STOP";
    case "REOPEN_WINDOW": return `buka ulang window ${namaLayar(i.target)}`;
    case "MAJEMUK": {
      const tahap = (i.tahap as Record<string, unknown>[][]) ?? [];
      return tahap.map((g) => g.map(ringkas).join(" + ")).join(" → lalu ");
    }
    default: return String(i.intent);
  }
}

/** Gaya kartu konfirmasi deck: "MOVE → TV3". */
function ringkasTeknis(i: Record<string, unknown>): string {
  const t = i.target ?? i.to;
  const inti = String(i.intent).replace("PLAY_MODULE", "PLAY").replace("OPEN_SCENE", "SCENE").replace("CLOSE_SCENE", "TUTUP");
  if (i.intent === "MAJEMUK") {
    const tahap = (i.tahap as Record<string, unknown>[][]) ?? [];
    return tahap.map((g) => g.map(ringkasTeknis).join(" + ")).join(" → ");
  }
  if (i.intent === "TATA") return `TATA ${String(i.nama).toUpperCase()}`;
  const obj = i.alias ?? i.scene;
  return `${inti}${obj ? ` ${obj}` : ""}${t ? ` → ${namaLayar(t)}` : i.intent === "PLAY_MODULE" ? " → layar Torang" : ""}`;
}

/** Chip "Dikenali:" — aksi / modul / target. */
function chipsIntent(i: Record<string, unknown>): string[] {
  const aksi: Record<string, string> = {
    PLAY_MODULE: "puter", MOVE: "pindah", OPEN_SCENE: "buka", CLOSE_SCENE: "tutup", SAPA: "sapa", GLOW: "glow",
    TATA: "tata", GO: "lanjut", REPLAY: "ulang", STOP: "stop", REOPEN_WINDOW: "buka window",
  };
  const c = [`aksi: ${aksi[String(i.intent)] ?? String(i.intent).toLowerCase()}`];
  if (i.alias) c.push(`modul: ${i.alias}`);
  if (i.scene) c.push(`scene: ${i.scene}`);
  if (i.nama) c.push(`tata: ${i.nama}`);
  const t = i.target ?? i.to;
  if (t) c.push(`target: ${namaLayar(t)}`);
  else if (i.intent === "PLAY_MODULE") c.push("target: layar Torang");
  return c;
}

// ---------------------------------------------------------------------------
// Bilah atas
// ---------------------------------------------------------------------------
function applyStatus(s: PanelStatus): void {
  if (s.cloud) {
    const p = $("#pilCloud");
    p.textContent = s.cloud === "online" ? "☁ Cloud OK" : "☁ Cloud TERPUTUS";
    p.className = `pil ${s.cloud === "online" ? "ok" : "buruk"}`;
  }
  if (s.note) $("#note").textContent = s.note;
  if (typeof s.clock_offset_ms === "number") {
    const p = $("#pilJam");
    const ok = Math.abs(s.clock_offset_ms) <= 250;
    p.textContent = ok ? "⏱ Jam sinkron" : `⏱ Jam selisih ${s.clock_offset_ms} ms`;
    p.className = `pil ${ok ? "ok" : "buruk"}`;
  }
}
window.torang.onStatus(applyStatus);

// ---------------------------------------------------------------------------
// Bilah bawah: suara
// ---------------------------------------------------------------------------
let tombolBicara = "";
let tombolYa = "";
let konfirmasi: { sampai: number; total_ms: number } | null = null;
let keadaanVoice: VoiceStatus["keadaan"] = "mati";

function terapkanVoice(v: VoiceStatus): void {
  keadaanVoice = v.keadaan;
  const menunggu = Boolean(v.konfirmasi);
  const ptt = $("#ptt");
  ptt.className = `ptt ${menunggu ? "konfirmasi" : v.keadaan}`;
  $("#pttBulat").textContent = v.keadaan === "merekam" ? "🎙" : "PTT";
  $("#pttKet").textContent = menunggu ? "KONFIRMASI"
    : v.keadaan === "merekam" ? "MIC DITEKAN"
    : v.keadaan === "memproses" ? "MEMPROSES…"
    : v.keadaan === "diam" ? `SIAP · ${tombolBicara || "PTT"}` : "VOICE MATI";
  const pil = $("#pilVoice");
  pil.className = `pil ${v.keadaan === "mati" ? "voice-mati" : v.keadaan === "merekam" ? "voice-merekam" : "voice-diam"}`;
  pil.textContent = v.keadaan === "mati" ? "🎤 voice mati" : v.keadaan === "merekam" ? "🎤 merekam" : "🎤 voice siap";

  if (v.konfirmasi !== undefined) {
    konfirmasi = v.konfirmasi ?? null;
    const k = $("#konf");
    k.classList.toggle("aktif", Boolean(konfirmasi));
    $("#konfBilahWadah").style.visibility = konfirmasi ? "visible" : "hidden";
    if (konfirmasi) requestAnimationFrame(animasiKonfirmasi);
  }

  const adaHasil = Boolean(v.didengar || v.alasan || v.intent);
  if (!adaHasil) return; // laporan keadaan saja - hasil sebelumnya tetap terbaca

  if (v.didengar !== undefined) {
    const t = $("#transkrip");
    t.className = v.didengar ? "kotak-t" : "kotak-t kosong";
    t.textContent = v.didengar ? `“${v.didengar}”` : "(kosong)";
  }

  // Dikenali: per bagian kalimat majemuk, atau chip intent tunggal.
  const d = $("#dikenali");
  d.textContent = "";
  const sumber = v.bagian && v.bagian.length > 0
    ? v.bagian
    : v.intent ? [{ teks: "", intent: v.intent, jenis: null as null }] : [];
  if (sumber.length > 0) {
    d.appendChild(el("span", undefined, "Dikenali:"));
    for (const b of sumber) {
      if (b.jenis) d.appendChild(el("span", "sambung", b.jenis === "urut" ? "→ lalu" : "+ dan"));
      for (const c of chipsIntent(b.intent)) d.appendChild(el("span", "chip", c));
    }
  }
  $("#tolak").textContent = !v.intent && v.alasan && !v.dibatalkan ? `✕ ditolak: ${v.alasan}` : "";
  $("#saran").textContent = v.saran
    ? `maksudnya “Torang, ${v.saran.kalimat}”? tekan ${tombolYa || "tombol ya"} untuk membenarkan`
    : "";
  $("#petunjuk").textContent = v.mirip
    ? `⚠ dengar “${v.mirip.didengar}” → dipakai “${v.mirip.dipakai}”`
    : "Hotkey selalu aktif — kalau suara gagal, guru tetap bisa menembak cue tanpa penonton sadar.";

  // Kartu konfirmasi
  const k = $("#konf");
  k.classList.remove("terkirim", "batal");
  if (v.intent && v.konfirmasi) {
    $("#konfIsi").textContent = ringkasTeknis(v.intent);
  } else if (v.dibatalkan) {
    k.classList.add("batal");
    $("#konfKet").textContent = "dibatalkan — tidak ada yang dikirim";
  } else if (v.intent) {
    k.classList.add("terkirim");
    $("#konfIsi").textContent = ringkasTeknis(v.intent);
    $("#konfKet").textContent = `✓ terkirim${v.ms ? ` · whisper ${v.ms} ms` : ""}`;
  }
}

function animasiKonfirmasi(): void {
  if (!konfirmasi) return;
  const sisa = Math.max(0, konfirmasi.sampai - Date.now());
  $("#konfBilah").style.width = `${(sisa / konfirmasi.total_ms) * 100}%`;
  $("#konfKet").textContent =
    `Esc / ${tombolBicara || "tombol bicara"} untuk batal · tembak dalam ${(sisa / 1000).toFixed(1).replace(".", ",")} dtk` +
    (tombolYa ? ` · ${tombolYa} kirim sekarang` : "");
  if (sisa > 0) requestAnimationFrame(animasiKonfirmasi);
}

api.batalVoice = () => window.torang.voiceBatal();
window.torang.onVoice(terapkanVoice);

// Tombol papan ketik saat panel fokus (deck: GO Spasi · ULANG R · STOP Esc).
// Esc selama jeda konfirmasi = BATAL, bukan STOP. Tidak aktif saat mengetik.
document.addEventListener("keydown", (e) => {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
  if (document.body.classList.contains("laci-buka")) {
    if (e.key === "Escape") tutupLaci();
    return;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    if ($("#popover").classList.contains("tampil")) { tutupPopover(); return; }
    if (konfirmasi) window.torang.voiceBatal();
    else intent({ intent: "STOP" });
  } else if (e.key === " " && !e.repeat) {
    e.preventDefault();
    intent({ intent: "GO" });
  } else if ((e.key === "r" || e.key === "R") && !e.repeat && !e.ctrlKey && !e.altKey) {
    intent({ intent: "REPLAY" });
  }
});

let versiApp = "";
void window.torang.boot().then((b) => {
  versiApp = b.version;
  $("#versiApp").textContent = `v${b.version}`;
  $("#ep").textContent = b.endpoint_id;
  $("#ver").textContent = b.version;
  $("#panelurl").textContent = `${b.cloud_api}/panel`;
  if (b.status) applyStatus(b.status);
  tombolBicara = b.voice_tombol ?? "";
  tombolYa = b.voice_tombol_ya ?? "";
  if (b.voice) terapkanVoice(b.voice);
  const hk = b.hotkeys;
  if (hk) {
    $("#bGo").title = `juga: ${hk.go} dari mana saja`;
    $("#bUlang").title = `juga: ${hk.replay} dari mana saja`;
    $("#bStop").title = `juga: ${hk.stop} dari mana saja`;
  }
});

// ---------------------------------------------------------------------------
// Audio -> PA
// ---------------------------------------------------------------------------
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
// Popover (klik TV / kursi / office)
// ---------------------------------------------------------------------------
type ItemMenu = { teks: string; aksi?: () => void; grup?: string } | "pisah";

function bukaPopover(jangkar: HTMLElement, judul: string, sub: string, item: ItemMenu[]): void {
  const p = $("#popover");
  p.textContent = "";
  p.appendChild(el("div", "kepala-p", judul));
  if (sub) p.appendChild(el("div", "sub-p", sub));
  for (const x of item) {
    if (x === "pisah") { p.appendChild(el("div", "pisah")); continue; }
    if (x.grup) { p.appendChild(el("div", "grup", x.grup)); continue; }
    const b = el("button", undefined, x.teks);
    b.onclick = () => { tutupPopover(); x.aksi?.(); };
    p.appendChild(b);
  }
  p.classList.add("tampil");
  const r = jangkar.getBoundingClientRect();
  const lebar = p.offsetWidth, tinggi = p.offsetHeight;
  let x = r.left, y = r.bottom + 6;
  if (x + lebar > innerWidth - 8) x = innerWidth - lebar - 8;
  if (y + tinggi > innerHeight - 8) y = Math.max(8, r.top - tinggi - 6);
  p.style.left = `${Math.max(8, x)}px`;
  p.style.top = `${y}px`;
}
function tutupPopover(): void { $("#popover").classList.remove("tampil"); }
document.addEventListener("mousedown", (e) => {
  const p = $("#popover");
  if (p.classList.contains("tampil") && !p.contains(e.target as Node) && !(e.target as HTMLElement).closest(".tv, .kursi, .chip-tata")) tutupPopover();
});

// ---------------------------------------------------------------------------
// State live dari cloud (via main, tiap 1,5 dtk)
// ---------------------------------------------------------------------------
type Layar = {
  tv: string;
  torang: boolean;
  scene: string | null;
  materi: { alias: string; mulai: number; sampai: number; torang: boolean } | null;
};
type CueRingkas = {
  cue_id: string; type: string; targets: string[]; asset: string | null; start_at: string;
  expected: string[]; acks: Array<{ endpoint_id: string; status: string; detail?: string }>;
};
type StateSnap = {
  server_now?: number;
  session?: { branch: string; room: string };
  versi?: string;
  batch?: string;
  konten?: string;
  endpoints: Array<{ endpoint_id: string; role: string }>;
  bindings: Array<{ seat_id: string; nama: string }>;
  show?: { screen: string | null; last_dir: string | null; active_module: string | null; scenes: Record<string, string> };
  layar?: Layar[];
  antrean?: { kalimat: string; langkah: Array<{ ringkas: string; perkiraan: number }>; mulai_berikut: number } | null;
  antrean_galat?: { t: number; pesan: string } | null;
  modul?: Array<{ alias: string; presenter: string }>;
  scenes_dikenal?: string[];
  tata?: PresetTata[];
  rundown?: { name: string; steps: string[]; pointer: number; langkah?: Array<{ label: string; ringkas: string; presenter: string | null }> };
  recent_cues?: CueRingkas[];
};

const UKURAN: Record<string, string> = { tv1: "65″", tv2: "42″", tv3: "32″", tv4: "32″" };
let snap: StateSnap | null = null;
let modulKini: Array<{ alias: string; presenter: string }> = [];
let sceneKini: string[] = [];
let tataKini: PresetTata[] = [];
let tandaPilihan = "";

function detikLagi(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} dtk`;
}

function renderAtas(s: StateSnap): void {
  // App baru + cloud lama (lupa ditutup-buka setelah update) = fitur baru
  // ditolak cloud dengan galat yang membingungkan. Tunjukkan terang-terangan.
  const pv = $("#pilVersi");
  const beda = Boolean(versiApp && s.versi && s.versi !== versiApp);
  pv.style.display = beda || (versiApp && s.versi === undefined) ? "inline-block" : "none";
  pv.textContent = s.versi ? `⚠ cloud v${s.versi}` : "⚠ cloud versi lama";
  pv.title = `Cloud yang jalan v${s.versi ?? "lama"}, app v${versiApp}. Tutup jendela cloud lalu jalankan ulang (npm run dev:cloud / jalankan-cloud-lan.bat).`;
  const sesi = s.session ? `${s.session.branch} · ${s.session.room}` : "";
  $("#batch").textContent = [s.batch ? `Batch ${s.batch}` : "", sesi].filter(Boolean).join(" · ");
  if (s.konten) $("#pilKonten").textContent = `▣ Konten ${s.konten}`;
}

// --- rundown ---------------------------------------------------------------
let langkahDipilih: number | null = null;

function renderRundown(s: StateSnap): void {
  const r = s.rundown;
  if (!r) return;
  $("#rundownJudul").textContent = `Rundown — ${r.name.length > 34 ? r.name.slice(0, 34) + "…" : r.name}`;
  const wadah = $("#rundownDaftar");
  wadah.textContent = "";
  const langkah = r.langkah ?? r.steps.map((label) => ({ label, ringkas: "", presenter: null }));
  langkah.forEach((l, k) => {
    const baris = el("div", "langkah");
    const tayang = k === r.pointer - 1;
    if (k < r.pointer - 1) baris.classList.add("selesai");
    if (tayang) baris.classList.add("tayang");
    if (k === r.pointer) baris.classList.add("berikut");
    if (k === langkahDipilih) baris.classList.add("dipilih");
    const isi = el("div", "isi");
    isi.append(
      el("div", "lbl", l.label),
      el("div", "alias", [l.ringkas.replace(/\btv([1-4])\b/g, "TV$1"), l.presenter === "torang" ? "Torang" : l.presenter].filter(Boolean).join(" · "))
    );
    const jalan = el("button", "jalankan", `▶ jalankan langkah ${k + 1}`);
    jalan.onclick = (e) => {
      e.stopPropagation();
      langkahDipilih = null;
      intent({ intent: "LOMPAT_RUNDOWN", ke: k });
    };
    isi.appendChild(jalan);
    baris.append(el("span", "no", String(k + 1).padStart(2, "0")), isi);
    if (k < r.pointer - 1) baris.appendChild(el("span", "tanda", "✓"));
    else if (tayang) baris.appendChild(el("span", "tanda", "TAYANG"));
    else if (k === r.pointer) baris.appendChild(el("span", "tanda", "BERIKUTNYA"));
    // Klik = pilih dulu (tombol ▶ muncul). Satu klik salah tidak boleh langsung
    // menayangkan sesuatu di depan kelas.
    baris.onclick = () => {
      langkahDipilih = langkahDipilih === k ? null : k;
      if (snap) renderRundown(snap);
    };
    wadah.appendChild(baris);
  });
  $("#rundownPosisi").textContent = r.pointer >= langkah.length ? "rundown selesai" : `GO berikutnya: langkah ${r.pointer + 1}`;
}

api.resetRundown = () => {
  if (confirm("Ulang rundown dari langkah 1? (tidak menghentikan tayangan)")) window.torang.rundownReset();
};

// --- ruangan ---------------------------------------------------------------
function statusTv(l: Layar | undefined, now: number): { teks: string; kelas: string; progres: number | null } {
  if (!l) return { teks: "idle", kelas: "", progres: null };
  if (l.scene) return { teks: `scene: ${l.scene}`, kelas: "scene", progres: null };
  if (l.materi && l.materi.mulai > now) return { teks: `Torang datang → ${l.materi.alias}`, kelas: l.torang ? "torang" : "", progres: null };
  if (l.materi) {
    const total = l.materi.sampai - l.materi.mulai;
    return {
      teks: `${l.materi.alias} · ${detikLagi(l.materi.sampai - now)} lagi`,
      kelas: l.torang ? "torang" : "",
      progres: Math.min(100, ((now - l.materi.mulai) / total) * 100),
    };
  }
  if (l.torang) return { teks: "Torang di sini", kelas: "torang", progres: null };
  return { teks: "idle", kelas: "", progres: null };
}

function menuTv(tv: string): ItemMenu[] {
  const m: ItemMenu[] = [{ teks: `🚶 Torang pindah ke ${namaLayar(tv)}`, aksi: () => intent({ intent: "MOVE", to: tv }) }];
  if (modulKini.length) {
    m.push({ teks: "", grup: "PUTAR MODUL" });
    for (const x of modulKini) {
      m.push({
        teks: `▶ ${x.alias}${x.presenter === "torang" ? "" : ` (${x.presenter})`}`,
        aksi: () => intent({ intent: "PLAY_MODULE", alias: x.alias, target: tv }),
      });
    }
  }
  if (sceneKini.length) {
    m.push({ teks: "", grup: "SCENE" });
    for (const sc of sceneKini) m.push({ teks: `▣ buka ${sc}`, aksi: () => intent({ intent: "OPEN_SCENE", scene: sc, target: tv }) });
  }
  m.push("pisah", { teks: `✕ kosongkan ${namaLayar(tv)}`, aksi: () => intent({ intent: "CLOSE_SCENE", target: tv }) });
  return m;
}

function renderRuang(s: StateSnap): void {
  const now = s.server_now ?? Date.now();
  const layar = new Map((s.layar ?? []).map((l) => [l.tv, l]));
  document.querySelectorAll<HTMLButtonElement>(".tv[data-tv]").forEach((b) => {
    const tv = b.dataset.tv!;
    const st = statusTv(layar.get(tv), now);
    b.className = `tv ${st.kelas}`;
    b.textContent = "";
    b.append(el("div", "kepala", `${namaLayar(tv)} · ${UKURAN[tv]}`), el("div", "status", st.teks));
    if (layar.get(tv)?.torang) b.appendChild(el("span", "lencana", tv === "tv1" ? "HERO · TORANG" : "TORANG"));
    else if (tv === "tv1") b.appendChild(el("span", "lencana", "HERO")).style.opacity = ".55";
    if (st.progres !== null) {
      const bil = el("div", "bilah");
      const i = el("i");
      i.style.width = `${st.progres}%`;
      bil.appendChild(i);
      b.appendChild(bil);
    }
    b.onclick = () => bukaPopover(b, `${namaLayar(tv)} · ${UKURAN[tv]}`, st.teks, menuTv(tv));
  });

  // Kotak Pixel Office: di TV mana office tampil (host-nya di mesin guru, D18).
  const office = $("#kotakOffice");
  const diTv = Object.entries(s.show?.scenes ?? {}).filter(([, n]) => n === "office").map(([tv]) => namaLayar(tv));
  office.className = `tv ${diTv.length ? "scene" : ""}`;
  office.textContent = "";
  office.append(el("div", "kepala", "Pixel Office"), el("div", "status", diTv.length ? `tampil di ${diTv.join(", ")}` : "tidak ditampilkan"));
  office.onclick = () =>
    bukaPopover(office, "Pixel Office", "tampilkan di layar:", [
      ...["tv1", "tv2", "tv3", "tv4"].map((tv) => ({
        teks: `▣ ${namaLayar(tv)}`,
        aksi: () => intent({ intent: "OPEN_SCENE", scene: "office", target: tv }),
      })),
      "pisah",
      ...Object.entries(s.show?.scenes ?? {}).map(([tv]) => ({
        teks: `✕ tutup di ${namaLayar(tv)}`,
        aksi: () => intent({ intent: "CLOSE_SCENE", target: tv }),
      })),
    ]);

  const torangDi = s.show?.screen;
  const arah = s.show?.last_dir === "left" ? "masuk-kiri" : s.show?.last_dir === "right" ? "masuk-kanan" : "—";
  $("#posisiTorang").textContent = torangDi
    ? `Torang sekarang di ${namaLayar(torangDi)} · arah terakhir: ${arah}`
    : "Torang belum tampil di layar mana pun";

  // Kursi
  const online = new Set(s.endpoints.filter((e) => e.role === "student").map((e) => e.endpoint_id));
  const nama = new Map(s.bindings.map((b) => [b.seat_id, b.nama]));
  for (const [id, dari] of [["#barisA", 1], ["#barisB", 11]] as const) {
    const grid = $(id);
    grid.textContent = "";
    for (let n = dari; n < dari + 10; n++) {
      const seat = `komp${n}`;
      const k = el("button", `kursi ${online.has(seat) ? "online" : "offline"}${nama.has(seat) ? " bernama" : ""}`);
      k.append(el("span", "n", String(n)), el("span", "d"), el("span", "nm", nama.get(seat) ?? ""));
      k.title = `${seat}${nama.has(seat) ? ` — ${nama.get(seat)}` : ""}${online.has(seat) ? " (online)" : " (offline)"}`;
      k.onclick = () => bukaPopover(k, `komp ${n}${nama.has(seat) ? ` — ${nama.get(seat)}` : ""}`,
        online.has(seat) ? "online" : "offline", menuKursi(seat, nama.has(seat)));
      grid.appendChild(k);
    }
  }
  const masuk = [...nama.keys()].filter((x) => online.has(x)).length;
  $("#terisiAngka").textContent = `${masuk} / 20`;
  $("#terisiBar").style.width = `${(masuk / 20) * 100}%`;

  // Antrean
  const a = s.antrean;
  $("#antrean").classList.toggle("tampil", Boolean(a));
  const ol = $("#antreanDaftar");
  ol.textContent = "";
  if (a) {
    a.langkah.forEach((x, k) => {
      const t = k === 0 ? ` — dalam ${detikLagi(a.mulai_berikut - now)}` : "";
      ol.appendChild(el("li", undefined, `${x.ringkas.replace(/\btv([1-4])\b/g, "TV$1")}${t}`));
    });
  }
  const g = s.antrean_galat;
  $("#antreanGalat").textContent = g && now - g.t < 60_000 ? `⚠ ${g.pesan.replace(/\btv([1-4])\b/g, "TV$1")}` : "";
}

function menuKursi(seat: string, bernama: boolean): ItemMenu[] {
  const m: ItemMenu[] = [
    { teks: "👋 Sapa (nama dari login)", aksi: () => intent({ intent: "SAPA", target: seat }) },
    { teks: "✨ Glow", aksi: () => intent({ intent: "GLOW", target: seat, preset: "pulse", duration_ms: 4000 }) },
  ];
  if (modulKini.length) {
    m.push({ teks: "", grup: "KETUK — KIRIM MATERI" });
    for (const x of modulKini) m.push({ teks: `🚪 ${x.alias}`, aksi: () => intent({ intent: "PLAY_MODULE", alias: x.alias, target: seat }) });
  }
  if (bernama) {
    m.push("pisah", {
      teks: "✕ lepas kursi ini",
      aksi: () => { if (confirm(`Lepas kursi ${seat}? (murid bisa login ulang dengan nama baru)`)) window.torang.panelUnbind(seat); },
    });
  }
  m.push("pisah", { teks: "✨ Glow SEMUA murid", aksi: () => intent({ intent: "GLOW", target: "all_student", preset: "pulse", duration_ms: 4000 }) });
  return m;
}

// --- riwayat cue ------------------------------------------------------------
function renderRiwayat(s: StateSnap): void {
  const w = $("#riwayatCue");
  const daftar = (s.recent_cues ?? []).filter((c) => !(c.type === "PLAY_VIDEO" && c.targets.join() === "teacher")).slice(0, 7);
  w.textContent = "";
  if (daftar.length === 0) {
    w.appendChild(el("div", "redup", "belum ada cue."));
    return;
  }
  for (const c of daftar) {
    const baris = el("div", "cue");
    const jam = new Date(c.start_at).toLocaleTimeString("id-ID", { hour12: false });
    const gagal = c.acks.find((a) => a.status === "error" || a.status === "rejected");
    const selesai = c.acks.some((a) => a.status === "played");
    const ack = el("span", `ack ${gagal ? "gagal" : c.acks.length ? "ok" : "tunggu"}`,
      gagal ? "GAGAL" : selesai ? "ACK ✓" : c.acks.length ? "TERJADWAL" : "…");
    if (gagal?.detail) ack.title = gagal.detail;
    baris.append(
      el("span", "jam", jam),
      el("span", "apa", `${c.type} → ${c.targets.map(namaLayar).join(", ")}`),
      ack,
      el("span", "rinci", gagal?.detail ?? c.asset ?? "")
    );
    w.appendChild(baris);
  }
}

// --- tata layar --------------------------------------------------------------
let tandaTata = "";

function isiPilihan(sel: HTMLSelectElement, nilaiAwal?: string): void {
  const dipilih = nilaiAwal ?? sel.value;
  sel.textContent = "";
  sel.appendChild(new Option("— biarkan —", "biarkan"));
  const gm = document.createElement("optgroup");
  gm.label = "Modul";
  for (const m of modulKini) gm.appendChild(new Option(m.presenter === "torang" ? `${m.alias} (Torang)` : m.alias, `modul:${m.alias}`));
  const gs = document.createElement("optgroup");
  gs.label = "Scene";
  for (const s of sceneKini) gs.appendChild(new Option(s, `scene:${s}`));
  sel.append(gm, gs, new Option("kosongkan layar", "kosong"));
  if (dipilih && [...sel.options].some((o) => o.value === dipilih)) sel.value = dipilih;
}

function renderTata(daftar: PresetTata[]): void {
  const tanda = JSON.stringify(daftar);
  if (tanda === tandaTata) return;
  tandaTata = tanda;
  tataKini = daftar;
  const chips = $("#tataChips");
  chips.textContent = "";
  for (const p of daftar) {
    const b = el("button", "chip-tata", `▶ ${p.nama}`);
    b.title = (["tv1", "tv2", "tv3", "tv4"] as const).map((tv) => `${namaLayar(tv)}: ${p.layar[tv]}`).join(" · ");
    b.onclick = () => intent({ intent: "TATA", nama: p.nama });
    chips.appendChild(b);
  }
  const sunting = el("button", "chip-tata", "✎ sunting");
  sunting.style.opacity = ".7";
  sunting.onclick = () => bukaLaci();
  chips.appendChild(sunting);

  const pilih = $("#tataPilih") as HTMLSelectElement;
  const kini = pilih.value;
  pilih.textContent = "";
  pilih.appendChild(new Option("+ tata baru", ""));
  for (const p of daftar) pilih.appendChild(new Option(p.nama, p.nama));
  pilih.value = daftar.some((p) => p.nama === kini) ? kini : "";
  if (!pilih.dataset.dipasang) {
    pilih.dataset.dipasang = "1";
    pilih.onchange = () => muatKeEditor(pilih.value);
    muatKeEditor(pilih.value);
  }
}

function muatKeEditor(nama: string): void {
  const p = tataKini.find((x) => x.nama === nama);
  ($("#tataNama") as HTMLInputElement).value = p?.nama ?? "";
  for (const tv of ["tv1", "tv2", "tv3", "tv4"] as const) ($(`#tata-${tv}`) as HTMLSelectElement).value = p?.layar[tv] ?? "biarkan";
  ($("#tataHapusTombol") as HTMLButtonElement).disabled = !p;
  pesanTata("", true);
}

function pesanTata(teks: string, ok: boolean): void {
  const e = $("#tataPesan");
  e.className = ok ? "ok" : "galat";
  e.textContent = teks;
}

api.tataSimpan = async () => {
  const nama = ($("#tataNama") as HTMLInputElement).value.trim().toLowerCase().replace(/\s+/g, " ");
  const layar = {} as PresetTata["layar"];
  for (const tv of ["tv1", "tv2", "tv3", "tv4"] as const) layar[tv] = ($(`#tata-${tv}`) as HTMLSelectElement).value;
  const r = await window.torang.tataSimpan({ nama, layar });
  if (r.ok) {
    if (r.presets) renderTata(r.presets);
    ($("#tataPilih") as HTMLSelectElement).value = nama;
    ($("#tataHapusTombol") as HTMLButtonElement).disabled = false;
    pesanTata(`✓ tersimpan — ucapkan: “Torang, tata ${nama}”`, true);
  } else {
    pesanTata(`✕ ${r.error ?? "gagal menyimpan"}`, false);
  }
};

api.tataHapus = async () => {
  const nama = ($("#tataPilih") as HTMLSelectElement).value;
  if (!nama || !confirm(`Hapus tata layar “${nama}”?`)) return;
  const r = await window.torang.tataHapus(nama);
  if (r.ok) {
    if (r.presets) renderTata(r.presets);
    ($("#tataPilih") as HTMLSelectElement).value = "";
    muatKeEditor("");
    pesanTata(`✓ “${nama}” dihapus`, true);
  } else {
    pesanTata(`✕ ${r.error ?? "gagal menghapus"}`, false);
  }
};

// --- laci alat ---------------------------------------------------------------
api.bukaLaci = () => document.body.classList.add("laci-buka");
api.tutupLaci = () => document.body.classList.remove("laci-buka");
function bukaLaci(): void { document.body.classList.add("laci-buka"); }
function tutupLaci(): void { document.body.classList.remove("laci-buka"); }

api.bukaTv = () => {
  const pilih = document.getElementById("bukaTv") as HTMLSelectElement | null;
  window.torang.panelBukaTv(pilih?.value ?? "semua");
};
api.resetMurid = () => {
  if (confirm("Reset SEMUA murid? Semua binding kursi dilepas — kelas berikutnya login dengan nama baru.")) {
    window.torang.panelResetMurid();
  }
};

// --- satu pintu state ----------------------------------------------------------
window.torang.onState((raw) => {
  const s = raw as StateSnap;
  snap = s;
  const tanda = JSON.stringify([s.modul, s.scenes_dikenal]);
  if (tanda !== tandaPilihan) {
    tandaPilihan = tanda;
    modulKini = s.modul ?? [];
    sceneKini = s.scenes_dikenal ?? [];
    for (const tv of ["tv1", "tv2", "tv3", "tv4"]) isiPilihan($(`#tata-${tv}`) as HTMLSelectElement);
  }
  renderAtas(s);
  renderRundown(s);
  renderRuang(s);
  renderRiwayat(s);
  renderTata(s.tata ?? []);
});

// ---------------------------------------------------------------------------
// Saklar mode video (24 Sep 2026). Bawaan: video diputar prosesor (D21).
// Mode cadangan memakai kartu grafis - untuk PC yang justru tersendat dengan
// mode normal. Mengganti = simpan di PC ini + app membuka ulang dirinya.
// ---------------------------------------------------------------------------
function pasangSaklarVideo(pesanKonfirmasi: string): void {
  const cb = document.getElementById("saklarVideo") as HTMLInputElement | null;
  const ket = document.getElementById("saklarVideoKet");
  if (!cb || !ket) return;
  const tulis = () => {
    ket.textContent = cb.checked
      ? "Sekarang: mode CADANGAN (kartu grafis)"
      : "Sekarang: mode normal (disarankan)";
  };
  void window.torang.modeVideo().then((m) => {
    cb.checked = m.kartu_grafis;
    tulis();
  });
  cb.onchange = async () => {
    const mau = cb.checked;
    if (!confirm(pesanKonfirmasi)) {
      cb.checked = !mau;
      return;
    }
    cb.disabled = true;
    ket.textContent = "menyimpan & membuka ulang\u2026";
    const r = await window.torang.gantiModeVideo(mau);
    if (!r.ok) {
      cb.checked = !mau;
      cb.disabled = false;
      ket.textContent = `\u26a0 ${r.error ?? "gagal menyimpan"}`;
    }
  };
}

pasangSaklarVideo(
  "Ganti mode video? Aplikasi panggung akan DITUTUP lalu dibuka lagi (\u00b1 5 detik) - " +
    "jangan lakukan saat video sedang tayang di depan murid."
);

// ---------------------------------------------------------------------------
// Video baru -> modul
//
// Pendaftarannya sendiri dikerjakan `torang-modul` lewat main. Yang dihapus di
// sini cuma satu hal: keharusan guru membuka PowerShell. Aturan apa yang boleh
// masuk folder aset tetap satu, di CLI.
// ---------------------------------------------------------------------------
const zonaLepas = $("#lepas");
const vbDaftar = $("#vbDaftar");

function detik(ms: number): string {
  return ms > 0 ? `${(ms / 1000).toFixed(1)} dtk` : "";
}

/** Satu baris berkas: nama, kotak alias, tombol daftar. */
function barisVideo(item: ItemInbox): HTMLElement {
  const baris = document.createElement("div");
  baris.className = "vb-baris";

  const nama = document.createElement("span");
  nama.className = "vb-nama";
  nama.textContent = item.nama; // nama berkas = ketikan bebas, JANGAN lewat innerHTML
  baris.appendChild(nama);

  if (item.galat) {
    const g = document.createElement("span");
    g.className = "vb-galat";
    g.textContent = item.galat;
    baris.appendChild(g);
    return baris;
  }

  const dur = document.createElement("span");
  dur.className = "vb-dur";
  dur.textContent = `${detik(item.durasi_ms)}${item.modul_baru ? "" : " \u00b7 modul sudah ada"}`;

  const kotak = document.createElement("input");
  kotak.value = item.alias;
  kotak.title = "kata yang nanti diucapkan guru";
  kotak.setAttribute("aria-label", "alias");

  const tombol = document.createElement("button");
  tombol.textContent = "Daftarkan";
  tombol.onclick = async () => {
    const alias = kotak.value.trim().toLowerCase();
    tombol.disabled = true;
    tombol.textContent = "mendaftar\u2026";
    const r = await window.torang.modulDaftar(item.jalur, alias);
    const hasil = document.createElement("span");
    hasil.className = r.ok ? "vb-ok" : "vb-galat";
    // Alias yang berhasil ditampilkan lengkap dengan kalimat yang bisa langsung
    // diucapkan - supaya guru tidak perlu menerjemahkan sendiri dari nama modul.
    hasil.textContent = r.ok
      ? `\u2713 siap \u2014 ucapkan: "Torang, puter ${r.alias} di TV satu"`
      : `\u2715 ${r.pesan}`;
    baris.appendChild(hasil);
    if (r.ok) {
      kotak.disabled = true;
      tombol.remove();
      dur.remove();
    } else {
      tombol.disabled = false;
      tombol.textContent = "Daftarkan";
    }
  };

  baris.append(dur, kotak, tombol);
  return baris;
}

function tampilkan(isi: ItemInbox[], folder: string): void {
  vbDaftar.textContent = "";
  $("#vbFolder").textContent = folder ? `\u00b7 ${folder}` : "";
  if (isi.length === 0) {
    const p = document.createElement("div");
    p.className = "muted";
    p.style.marginTop = "8px";
    p.textContent = "Belum ada video menunggu.";
    vbDaftar.appendChild(p);
    return;
  }
  for (const item of isi) vbDaftar.appendChild(barisVideo(item));
}

async function muatInbox(): Promise<void> {
  vbDaftar.textContent = "memuat\u2026";
  const r = await window.torang.modulInbox();
  tampilkan(r.isi, r.folder);
}
api.muatInbox = () => void muatInbox();

// Tarik-lepas. Berkas bisa berasal dari mana saja (Desktop, flashdisk) - tidak
// harus dari folder video-baru; CLI menerima jalur apa pun.
for (const ev of ["dragenter", "dragover"]) {
  zonaLepas.addEventListener(ev, (e) => {
    e.preventDefault();
    zonaLepas.classList.add("hover");
  });
}
for (const ev of ["dragleave", "drop"]) {
  zonaLepas.addEventListener(ev, () => zonaLepas.classList.remove("hover"));
}
// Seluruh jendela: menjatuhkan berkas di luar kotak TIDAK boleh membuat Electron
// menavigasi ke berkas itu - itu akan mengganti isi panel dengan video.
for (const ev of ["dragover", "drop"]) {
  window.addEventListener(ev, (e) => e.preventDefault());
}

zonaLepas.addEventListener("drop", async (e) => {
  const ev = e as DragEvent;
  ev.preventDefault();
  const berkas = Array.from(ev.dataTransfer?.files ?? []);
  if (berkas.length === 0) return;
  vbDaftar.textContent = "memeriksa\u2026";
  const hasil: ItemInbox[] = [];
  for (const f of berkas) {
    const jalur = window.torang.jalurBerkas(f);
    const u = await window.torang.modulUsul(jalur);
    hasil.push({
      nama: u.nama ?? f.name,
      jalur: u.jalur ?? jalur,
      alias: u.alias ?? "",
      durasi_ms: u.durasi_ms ?? 0,
      modul_baru: u.modul_baru !== false,
      galat: u.ok ? null : u.pesan,
    });
  }
  tampilkan(hasil, "");
});

void muatInbox();

export {};
