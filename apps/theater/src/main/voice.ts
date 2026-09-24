/**
 * Voice command di dalam app panggung — push-to-talk, tanpa jendela konsol.
 *
 * Alur satu ucapan:
 *
 *     tombol PTT -> ffmpeg merekam mic -> whisper-cli -> normalisasi
 *                -> parser grammar tertutup -> POST /api/intent
 *
 * KENAPA DI SINI, BUKAN DI SKRIP TERPISAH:
 * app panggung memang sudah berjalan sepanjang kelas, jadi tidak ada jendela
 * PowerShell yang harus disembunyikan, dan tombolnya terbaca lewat
 * `globalShortcut` walau panel tidak sedang aktif — guru menghadap murid.
 *
 * DUA KEPUTUSAN YANG PERLU DIINGAT:
 *
 * 1. `toggle`, bukan tahan-tombol, sebagai bawaan. `globalShortcut` Electron
 *    hanya memberi satu callback saat tombol DITEKAN; tidak ada callback saat
 *    dilepas. Jadi "tahan untuk bicara" perlu modul native (`uiohook-napi`),
 *    dan lagi pula belum tentu didukung clicker yang nanti dibeli — sebagian
 *    clicker cuma mengirim ketukan singkat berapa lama pun ditahan. `toggle`
 *    jalan dengan clicker apa pun. Batas `maks_detik` menutup risiko guru lupa
 *    menekan tombol kedua. Mode `hold` disiapkan di config untuk nanti, saat
 *    perilaku clicker sungguhan sudah diketahui.
 *
 * 2. Mic diambil lewat ffmpeg, bukan `getUserMedia` di renderer seperti yang
 *    ditulis INSTRUKSI-VOICE-PENUH.md. Alasannya: jalur ffmpeg -> whisper
 *    inilah yang 18 Sep 2026 terbukti jalan dari suara manusia sampai video
 *    tayang di TV. Menukar jalur yang sudah terbukti dengan yang belum, di
 *    bagian paling rawan, bukan pertukaran yang bagus.
 *
 * PAGAR KEAMANAN: intent hanya lahir dari `parseKalimat` — grammar tertutup
 * yang sama dengan jalur teks. Tidak ada jalan dari suara ke aksi yang
 * melewatinya, dan kalimat di luar kosakata DITOLAK, tidak dikira-kira.
 */
import { globalShortcut, ipcMain } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
// Parser yang SAMA dengan jalur teks & tes. Kalau ini pernah jadi salinan
// kedua, dua jalur akan menyimpang diam-diam - dan yang menyimpang adalah
// bagian yang menentukan apa yang boleh dieksekusi.
import { parseKalimat, type HasilParse, type VocabParser } from "../../../../tools/openclaw/parser.mjs";
import { rapikanTranskrip } from "../../../../tools/voice/normalisasi-stt.mjs";
import { cariSaran } from "../../../../tools/openclaw/saran.mjs";
// Contekan Whisper yang SAMA dengan torang-dengar & nilai-stt (dulu 3 salinan).
import { promptWhisper } from "../../../../tools/voice/prompt-whisper.mjs";
// Pembaca daftar mic yang SAMA dengan torang-dengar.mjs - dua format ffmpeg.
import { uraiMicDshow, pilihMic } from "../../../../tools/voice/mic-dshow.mjs";

export interface VoiceConfig {
  enabled: boolean;
  /** Tombol PTT. Clicker presentasi biasanya mengirim salah satu tombol ini. */
  tombol: string;
  mode: "toggle" | "hold";
  /** Batas rekam. Menutup risiko guru lupa menekan tombol kedua di mode toggle. */
  maks_detik: number;
  model: string;
  /** Batasi keluaran Whisper ke kalimat yang sah saja (torang.gbnf). */
  grammar: boolean;
  denda_grammar: number;
  threads: number;
  /** Nama perangkat mic (ffmpeg dshow). Kosong = pakai yang pertama terbaca. */
  mic: string;
  /**
   * Tombol "ya, benar" untuk membenarkan usulan kalimat.
   *
   * SENGAJA BUKAN tombol PTT yang sama. Kalau tombolnya satu, guru yang cuma
   * ingin mengulang ucapannya akan menjalankan usulan tanpa bermaksud - dan
   * video yang salah tayang di depan kelas jauh lebih buruk daripada satu
   * tombol tambahan. Clicker presentasi umumnya punya dua tombol.
   */
  tombol_ya: string;
  /**
   * Uji tanpa mic: kalau diisi path berkas suara, tombol PTT MEMUTAR berkas
   * itu lewat rantai yang sama persis - whisper, normalisasi, parser, cue -
   * alih-alih merekam.
   *
   * Gunanya bukan main-main. Mesin tanpa mic tetap bisa membuktikan empat dari
   * lima bagian jalur voice bekerja di dalam app; yang tersisa belum terbukti
   * cuma penangkapan mic-nya. Memisahkan "jalur app rusak" dari "mic rusak"
   * jauh lebih murah daripada mencarinya nanti saat keduanya tercampur.
   *
   * Kosongkan untuk pemakaian sungguhan.
   */
  berkas_uji: string;
  /**
   * Jeda konfirmasi sebelum perintah suara dikirim (ms). Bawaan 1000.
   *
   * Kenapa WAJIB (surat amandemen #3, 17 Sep): parser menolak kalimat janggal,
   * tapi tidak bisa menolak kalimat yang SAH namun salah dengar - "komp enam"
   * dan "komp enam belas" dua-duanya sah. Kalimat majemuk memperbesar taruhan:
   * satu salah dengar bisa mengubah dua layar sekaligus. Selama jeda ini
   * transkrip + rinciannya tampil besar di panel, dan guru bisa membatalkan
   * dengan menekan PTT lagi atau tombol Batal. Tombol "ya" = kirim sekarang.
   * 0 = langsung kirim (perilaku lama).
   */
  konfirmasi_ms: number;
}

export interface StatusVoice {
  keadaan: "mati" | "diam" | "merekam" | "memproses";
  didengar?: string;
  intent?: Record<string, unknown> | null;
  alasan?: string;
  ms?: number;
  mirip?: { didengar: string; dipakai: string };
  /** Usulan kalimat setelah perintah ditolak - MENUNGGU dibenarkan guru. */
  saran?: { kalimat: string } | null;
  /** Rincian kalimat majemuk, satu baris per perintah. */
  bagian?: Array<{ teks: string; intent: Record<string, unknown>; jenis: "serentak" | "urut" | null }>;
  /** Sedang menunggu konfirmasi: dikirim pada `sampai` (epoch ms) kecuali dibatalkan. */
  konfirmasi?: { sampai: number; total_ms: number } | null;
  /** Perintah yang barusan DIBATALKAN guru selama jeda konfirmasi. */
  dibatalkan?: boolean;
}

type Kirim = (intent: Record<string, unknown>) => Promise<void>;
type Lapor = (s: StatusVoice) => void;

// Semua proses anak dijalankan tanpa jendela konsol. Tanpa ini, tiap ucapan
// memunculkan kedipan jendela hitam di depan kelas.
const TANPA_JENDELA = { windowsHide: true } as const;

/**
 * Nama tombol -> akselerator Electron.
 *
 * Cara mencari tahu tombol apa yang dikirim clicker adalah
 * `[Console]::ReadKey()` di PowerShell, dan nama yang ditulisnya BEDA dengan
 * nama yang diterima Electron ("OemPeriod" vs ".", "MediaPlay" vs
 * "MediaPlayPause"). Diterjemahkan di sini supaya guru bisa menyalin apa yang
 * terlihat di layar ke config apa adanya - tanpa kamus, tanpa salah tebak.
 */
export function akselerator(nama: string): string {
  const n = String(nama ?? "").trim();
  const peta: Record<string, string> = {
    OemPeriod: ".", OemComma: ",", OemMinus: "-", OemPlus: "=",
    Spacebar: "Space", Enter: "Return",
    LeftArrow: "Left", RightArrow: "Right", UpArrow: "Up", DownArrow: "Down",
    MediaPlay: "MediaPlayPause", MediaNext: "MediaNextTrack", MediaPrevious: "MediaPreviousTrack",
    Next: "PageDown", Prior: "PageUp",
  };
  if (peta[n]) return peta[n];
  const angka = n.match(/^D([0-9])$/);   // ReadKey menulis angka 5 sebagai "D5"
  if (angka?.[1]) return angka[1];
  return n;
}

/**
 * Seberapa keras rekaman ini? Angka "max_volume" dari filter volumedetect ffmpeg,
 * dalam dB (0 = paling keras, -91 = hening digital sempurna).
 */
export function volumeMaks(teksFfmpeg: string): number | null {
  const m = String(teksFfmpeg ?? "").match(/max_volume:\s*(-?[\d.]+|-inf)\s*dB/);
  if (!m?.[1]) return null;
  return m[1] === "-inf" ? -Infinity : parseFloat(m[1]);
}

/**
 * Di bawah ini rekaman dianggap HENING, dan Whisper tidak dijalankan.
 *
 * Kasus 19 Sep 2026 di PC guru: berkali-kali "diproses tapi hasilnya kosong",
 * sementara mic yang sama jalan untuk ChatGPT. Whisper dan model yang sama,
 * dijalankan atas rekaman suara asli, SELALU menghasilkan teks - jadi transkrip
 * kosong berarti yang direkam memang hening: perangkat yang salah, lubang jack
 * yang kosong, mic di-mute, atau izin mic Windows tertutup (dshow tetap
 * "merekam", isinya nol semua). Tanpa pemeriksaan ini, keempatnya tampil sama
 * persis di panel: "(kosong)". Dengannya, panel menyebut perangkat mana yang
 * hening dan seberapa hening.
 *
 * -50 dB: bicara normal di dekat mic berada di sekitar -30..0 dB; derau lubang
 * jack kosong sekitar -70..-60 dB; izin tertutup menghasilkan -91 dB.
 */
const AMBANG_HENING_DB = -50;

/** Daftarkan tombol global; nama yang tidak dikenal Electron MELEMPAR, bukan false. */
function daftarkanTombol(nama: string, aksi: () => void): { ok: true } | { ok: false; alasan: string } {
  const a = akselerator(nama);
  try {
    return globalShortcut.register(a, aksi)
      ? { ok: true }
      : { ok: false, alasan: `tombol "${nama}" sudah dipakai program lain` };
  } catch {
    return { ok: false, alasan: `nama tombol "${nama}" tidak dikenal (contoh yang sah: F8, PageDown, PageUp, B)` };
  }
}

function jalankan(exe: string, args: string[]) {
  const r = spawnSync(exe, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...TANPA_JENDELA });
  return { keluaran: r.stdout ?? "", galat: r.stderr ?? "", kode: r.status, gagal: r.error?.message };
}

export class Voice {
  private cfg: VoiceConfig;
  private dirVoice: string;
  private kirim: Kirim;
  private lapor: Lapor;
  private rekaman: ChildProcess | null = null;
  private wavKini: string | null = null;
  private pewaktu: NodeJS.Timeout | null = null;
  private sibuk = false;
  private ffmpeg: string | null = null;
  private ffmpegUbah: string | null = null;
  private vocab: VocabParser | null = null;
  /**
   * Alamat cloud disimpan sejak mulai(). Dulu dikirim lewat parameter, dan
   * jalur batas-waktu mengirim null - ucapan yang dihentikan oleh batas waktu
   * (bukan tombol kedua) diproses TANPA daftar modul: usulan kalimat tidak
   * punya bahan, dan nama modul tidak dicocokkan sama sekali.
   */
  private apiUrl: string | null = null;
  private saranTertunda: { intent: Record<string, unknown>; kalimat: string; sampai: number } | null = null;
  /** Perintah yang sudah lolos parser dan sedang menunggu jeda konfirmasi. */
  private menunggu: { selesai: (kirim: boolean) => void } | null = null;

  constructor(cfg: VoiceConfig, appRoot: string, kirim: Kirim, lapor: Lapor) {
    this.cfg = cfg;
    this.dirVoice = path.resolve(appRoot, "..", "..", "tools", "voice");
    this.kirim = kirim;
    this.lapor = lapor;
  }

  private berkas(nama: string) {
    return path.join(this.dirVoice, nama);
  }

  /** Semua ffmpeg.exe yang mungkin ada: PATH dulu, lalu hasil pasangan winget. */
  private calonFfmpeg(): string[] {
    const calon = ["ffmpeg"];
    const wg = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages");
    try {
      const tumpuk = [wg];
      while (tumpuk.length) {
        const d = tumpuk.pop()!;
        for (const isi of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, isi.name);
          if (isi.isDirectory()) tumpuk.push(p);
          else if (isi.name.toLowerCase() === "ffmpeg.exe") calon.push(p);
        }
      }
    } catch { /* folder winget tidak ada */ }
    return calon;
  }

  /** ffmpeg yang benar-benar punya dshow — bukan sekadar ada di PATH. */
  private cariFfmpeg(): string | null {
    if (this.ffmpeg) return this.ffmpeg;
    for (const c of this.calonFfmpeg()) {
      const r = jalankan(c, ["-hide_banner", "-devices"]);
      if (r.gagal) continue;
      if (/^\s*D\w*\s+dshow\b/m.test(r.keluaran + r.galat)) { this.ffmpeg = c; return c; }
    }
    return null;
  }

  /**
   * ffmpeg APA SAJA yang bisa mengubah berkas jadi WAV. Tidak perlu dshow.
   *
   * Dipisah dari cariFfmpeg() dengan sengaja. Mesin tanpa mic sering cuma punya
   * ffmpeg bawaan program lain (mis. ImageMagick) yang tidak punya dshow — dan
   * mesin itulah yang paling butuh mode berkas uji. Memakai syarat dshow di
   * sini berarti menolak persis pemakai yang dituju.
   */
  private cariFfmpegUbah(): string | null {
    if (this.ffmpegUbah) return this.ffmpegUbah;
    if (this.ffmpeg) { this.ffmpegUbah = this.ffmpeg; return this.ffmpeg; }
    for (const c of this.calonFfmpeg()) {
      const r = jalankan(c, ["-hide_banner", "-version"]);
      if (!r.gagal && r.kode === 0) { this.ffmpegUbah = c; return c; }
    }
    return null;
  }

  private micPertama(ff: string): string | null {
    const r = jalankan(ff, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"]);
    // BUKAN yang pertama: di PC guru, yang pertama adalah "Stereo Mix" - suara
    // yang keluar dari speaker PC sendiri. Lihat pilihMic.
    return pilihMic(uraiMicDshow(r.galat + r.keluaran));
  }

  /** Daftar modul diambil ulang tiap ucapan: modul bisa didaftarkan saat kelas berjalan. */
  private async segarkanVocab(apiUrl: string) {
    try {
      const res = await fetch(`${apiUrl}/api/vocab`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) this.vocab = (await res.json()) as VocabParser;
    } catch { /* pakai daftar terakhir */ }
    return this.vocab;
  }

  mulai(apiUrl: string): { ok: boolean; pesan: string } {
    if (!this.cfg.enabled) return { ok: false, pesan: "voice dimatikan di config" };
    this.apiUrl = apiUrl;

    for (const [nama, p] of [["whisper-cli.exe", this.berkas(path.join("bin", "whisper-cli.exe"))],
                             ["model", this.berkas(path.join("model", this.cfg.model))]] as const) {
      if (!fs.existsSync(p)) {
        return { ok: false, pesan: `${nama} belum ada — jalankan tools\\voice\\PASANG-WHISPER.bat` };
      }
    }
    const modeBerkas = this.cfg.berkas_uji.trim().length > 0;
    let sumber: string;

    if (modeBerkas) {
      const f = path.isAbsolute(this.cfg.berkas_uji)
        ? this.cfg.berkas_uji
        : path.resolve(this.dirVoice, this.cfg.berkas_uji);
      if (!fs.existsSync(f)) return { ok: false, pesan: `berkas_uji tidak ada: ${f}` };
      this.cfg.berkas_uji = f;
      if (!this.cariFfmpegUbah()) {
        return { ok: false, pesan: "ffmpeg tidak ditemukan — tidak bisa mengubah berkas uji jadi WAV" };
      }
      sumber = `BERKAS UJI ${path.basename(f)} (mic tidak dipakai)`;
    } else {
      const ff = this.cariFfmpeg();
      if (!ff) return { ok: false, pesan: "ffmpeg dengan dshow tidak ditemukan — perekaman mic tidak bisa jalan" };
      const mic = this.cfg.mic || this.micPertama(ff);
      if (!mic) {
        // Sebutkan ffmpeg MANA yang ditanya: di mesin dengan dua ffmpeg, itu
        // separuh jawabannya. Dan sebutkan penyebab paling umum sesudah format.
        return {
          ok: false,
          pesan: `ffmpeg (${ff}) tidak melihat satu pun mic. Cek: mic tercolok, lalu Settings > Privacy > Microphone - "Let desktop apps access your microphone" harus ON`,
        };
      }
      this.cfg.mic = mic;
      sumber = `mic: ${mic}`;
    }
    const terdaftar = daftarkanTombol(this.cfg.tombol, () => {
      // Ucapan baru membatalkan usulan yang belum dijawab - kalau tidak, usulan
      // lama bisa dibenarkan setelah guru sudah beralih ke perintah lain.
      this.saranTertunda = null;
      if (modeBerkas) { void this.prosesBerkasUji(apiUrl); return; }
      if (this.rekaman) void this.hentikanDanProses(apiUrl);
      else this.mulaiRekam();
    });
    if (!terdaftar.ok) return { ok: false, pesan: terdaftar.alasan };

    const tombolYa = this.cfg.tombol_ya?.trim();
    if (tombolYa) {
      const ya = daftarkanTombol(tombolYa, () => {
        if (this.menunggu) { this.kirimSekarang(); return; }
        void this.benarkanSaran();
      });
      if (!ya.ok) console.warn(`[voice] tombol ya: ${ya.alasan} - usulan tidak bisa dibenarkan lewat tombol`);
    }

    // Tombol Batal di panel. Didaftarkan di sini (bukan di main.ts) supaya
    // seluruh perilaku jeda konfirmasi tinggal di satu berkas.
    ipcMain.removeAllListeners("panel:voice-batal");
    ipcMain.on("panel:voice-batal", () => this.batalkan());

    this.lapor({ keadaan: "diam" });
    const ya = this.cfg.tombol_ya ? `, ${this.cfg.tombol_ya} = ya benar` : "";
    return { ok: true, pesan: `voice siap — ${this.cfg.tombol} (${this.cfg.mode})${ya}, ${sumber}` };
  }

  private mulaiRekam() {
    if (this.sibuk || this.rekaman) return;
    const ff = this.ffmpeg!;
    const wav = path.join(os.tmpdir(), `torang-voice-${Date.now()}.wav`);
    this.wavKini = wav;
    this.rekaman = spawn(ff, [
      "-hide_banner", "-loglevel", "error",
      "-f", "dshow", "-i", `audio=${this.cfg.mic}`,
      "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le",
      "-t", String(this.cfg.maks_detik), "-y", wav,
    ], TANPA_JENDELA);
    this.lapor({ keadaan: "merekam" });
    // Batas keras: kalau tombol kedua tidak pernah ditekan, ffmpeg berhenti
    // sendiri di -t, dan pewaktu ini yang memprosesnya.
    this.pewaktu = setTimeout(() => { void this.hentikanDanProses(this.apiUrl); }, (this.cfg.maks_detik + 1) * 1000);
  }

  /** Mode uji tanpa mic: ubah berkas jadi WAV lalu lewatkan rantai yang sama. */
  private async prosesBerkasUji(apiUrl: string | null) {
    if (this.sibuk) return;
    this.sibuk = true;
    this.lapor({ keadaan: "memproses" });
    const wav = path.join(os.tmpdir(), `torang-voice-uji-${Date.now()}.wav`);
    try {
      const ff = this.cariFfmpegUbah() ?? "ffmpeg";
      const r = jalankan(ff, [
        "-hide_banner", "-loglevel", "error", "-i", this.cfg.berkas_uji,
        "-ar", "16000", "-ac", "1", "-acodec", "pcm_s16le", "-y", wav,
      ]);
      if (r.kode !== 0 || !fs.existsSync(wav)) {
        this.lapor({ keadaan: "memproses", alasan: `gagal mengubah berkas uji: ${r.galat.trim() || r.gagal || "?"}` });
        return;
      }
      await this.proses(wav, apiUrl);
    } finally {
      this.sibuk = false;
      fs.rmSync(wav, { force: true });
      this.lapor({ keadaan: "diam" });
    }
  }

  /** Batalkan perintah yang sedang dalam jeda konfirmasi. */
  batalkan() {
    const m = this.menunggu;
    this.menunggu = null;
    m?.selesai(false);
  }

  /** Lewati sisa jeda: kirim sekarang (tombol ya selama konfirmasi). */
  private kirimSekarang() {
    const m = this.menunggu;
    this.menunggu = null;
    m?.selesai(true);
  }

  /** Tunggu jeda konfirmasi. true = kirim, false = dibatalkan guru. */
  private tungguKonfirmasi(): Promise<boolean> {
    const ms = Math.max(0, Number(this.cfg.konfirmasi_ms ?? 1000));
    if (ms === 0) return Promise.resolve(true);
    return new Promise((selesai) => {
      const pewaktu = setTimeout(() => { this.menunggu = null; selesai(true); }, ms);
      this.menunggu = {
        selesai: (kirim) => { clearTimeout(pewaktu); selesai(kirim); },
      };
    });
  }

  /**
   * Jalankan usulan yang sedang menunggu - HANYA kalau guru menekan tombol ya.
   *
   * Intent-nya sudah jadi sejak usulannya dibuat, dan dibuat oleh `parseKalimat`
   * yang sama dengan jalur normal. Yang terjadi di sini cuma mengirimnya.
   */
  private async benarkanSaran() {
    const s = this.saranTertunda;
    this.saranTertunda = null;
    if (!s) return;
    if (Date.now() > s.sampai) {
      this.lapor({ keadaan: "diam", alasan: "usulan sudah kedaluwarsa - ucapkan lagi", saran: null });
      return;
    }
    this.lapor({ keadaan: "memproses", didengar: s.kalimat, intent: s.intent, saran: null });
    this.catat({ jenis: "saran-dibenarkan", kalimat: s.kalimat, intent: s.intent });
    await this.kirim(s.intent);
    this.lapor({ keadaan: "diam" });
  }

  /**
   * Catatan lapangan. Tiap penolakan ditulis apa adanya ke berkas, supaya
   * keputusan berikutnya - perlu tidaknya korektor LLM - diambil dari kejadian
   * sungguhan di kelas, bukan dari dugaan siapa pun.
   */
  private catat(baris: Record<string, unknown>) {
    try {
      const dir = path.join(this.dirVoice, "rekaman-lapangan");
      fs.mkdirSync(dir, { recursive: true });
      fs.appendFileSync(
        path.join(dir, "catatan.jsonl"),
        JSON.stringify({ waktu: new Date().toISOString(), ...baris }) + "\n"
      );
    } catch { /* catatan tidak boleh menggagalkan perintah */ }
  }

  private async hentikanDanProses(apiUrl: string | null) {
    if (this.pewaktu) { clearTimeout(this.pewaktu); this.pewaktu = null; }
    const proses = this.rekaman;
    const wav = this.wavKini;
    this.rekaman = null;
    this.wavKini = null;
    if (!proses || !wav) return;

    this.sibuk = true;
    this.lapor({ keadaan: "memproses" });
    try {
      // 'q' ke stdin membuat ffmpeg menutup berkas dengan rapi; kill paksa
      // bisa meninggalkan WAV tanpa header yang benar.
      try { proses.stdin?.write("q"); } catch { /* sudah tertutup */ }
      await new Promise<void>((selesai) => {
        const jaga = setTimeout(() => { try { proses.kill(); } catch { /* */ } selesai(); }, 1500);
        proses.once("exit", () => { clearTimeout(jaga); selesai(); });
      });
      await this.proses(wav, apiUrl);
    } finally {
      this.sibuk = false;
      fs.rmSync(wav, { force: true });
      this.lapor({ keadaan: "diam" });
    }
  }

  private async proses(wav: string, apiUrl: string | null) {
    if (!fs.existsSync(wav) || fs.statSync(wav).size < 1000) {
      this.lapor({ keadaan: "memproses", alasan: "rekaman terlalu pendek" });
      return;
    }
    // Rekaman hening? Periksa DULU - lebih murah daripada whisper, dan jauh lebih
    // jelas daripada transkrip kosong. Berkas uji dilewati: itu bukan mic.
    if (!this.cfg.berkas_uji) {
      const ff = this.cariFfmpegUbah();
      if (ff) {
        const v = jalankan(ff, ["-hide_banner", "-nostats", "-i", wav, "-af", "volumedetect", "-f", "null", "-"]);
        const db = volumeMaks(v.galat + v.keluaran);
        if (db !== null && db < AMBANG_HENING_DB) {
          const angka = Number.isFinite(db) ? `${db.toFixed(0)} dB` : "hening total";
          const alasan =
            `mic "${this.cfg.mic}" merekam HENING (${angka}). ` +
            (db <= -85
              ? "Isinya nol: cek Settings > Privacy > Microphone - \"Let desktop apps access your microphone\" harus ON, dan mic tidak di-mute."
              : "Cek kabel/penerima mic masih tercolok, atau mic lain yang dipakai - set \"mic\" di config.");
          this.lapor({ keadaan: "memproses", didengar: "", intent: null, alasan, saran: null });
          this.catat({ jenis: "hening", mic: this.cfg.mic, db: Number.isFinite(db) ? db : null });
          return;
        }
      }
    }

    // Daftar modul diambil SEBELUM whisper jalan: nama modul ikut di contekannya.
    const vocab = await this.segarkanVocab(apiUrl ?? this.apiUrl ?? "");
    const contekan = promptWhisper((vocab?.aliases ?? []).map((a) => a.alias));
    const args = ["-m", this.berkas(path.join("model", this.cfg.model)), "-f", wav,
                  "-l", "id", "-nt", "-t", String(this.cfg.threads), "--prompt", contekan];
    if (this.cfg.grammar) {
      args.push("--grammar", this.berkas("torang.gbnf"), "--grammar-rule", "root",
                "--grammar-penalty", String(this.cfg.denda_grammar));
    }
    const r = jalankan(this.berkas(path.join("bin", "whisper-cli.exe")), args);
    if (r.gagal) { this.lapor({ keadaan: "memproses", alasan: `whisper gagal: ${r.gagal}` }); return; }

    const tTotal = r.galat.match(/total time\s*=\s*([\d.]+)\s*ms/)?.[1];
    const tMuat = r.galat.match(/load time\s*=\s*([\d.]+)\s*ms/)?.[1];
    const ms = tTotal && tMuat ? Math.round(parseFloat(tTotal) - parseFloat(tMuat)) : undefined;

    // Transkrip di STDOUT; log & timing di STDERR. Jangan digabung.
    const teks = r.keluaran.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(" ");
    const rapi = rapikanTranskrip(teks);
    // Tipe eksplisit: tanpa ini, gabungan literal `{ ok: false }` melebar jadi
    // `boolean` dan TypeScript kehilangan kemampuan membedakan kedua cabang.
    const hasil: HasilParse = rapi.ok
      ? parseKalimat(rapi.teks, vocab)
      : { ok: false, error: rapi.alasanTolak ?? "transkrip ditolak" };

    if (!hasil.ok) {
      // Ditolak - tapi jangan tinggalkan guru tanpa jalan keluar. Kalau ada SATU
      // kalimat sah yang jelas paling dekat, tawarkan; guru yang memutuskan.
      const saran = rapi.ok ? cariSaran(rapi.teks, vocab) : null;
      this.saranTertunda = saran
        ? { intent: saran.intent, kalimat: saran.kalimat, sampai: Date.now() + 15000 }
        : null;
      this.lapor({
        keadaan: "memproses", didengar: teks, intent: null, alasan: hasil.error, ms,
        saran: saran ? { kalimat: saran.kalimat } : null,
      });
      this.catat({ jenis: "ditolak", didengar: teks, alasan: hasil.error, saran: saran?.kalimat ?? null });
      return;
    }
    this.saranTertunda = null;
    const totalMs = Math.max(0, Number(this.cfg.konfirmasi_ms ?? 1000));
    this.lapor({
      keadaan: "memproses", didengar: teks, intent: hasil.intent, ms, mirip: hasil.mirip, saran: null,
      bagian: hasil.bagian,
      konfirmasi: totalMs > 0 ? { sampai: Date.now() + totalMs, total_ms: totalMs } : null,
    });
    const jadi = await this.tungguKonfirmasi();
    if (!jadi) {
      this.lapor({
        keadaan: "memproses", didengar: teks, intent: null, alasan: "dibatalkan guru",
        dibatalkan: true, konfirmasi: null, bagian: hasil.bagian,
      });
      this.catat({ jenis: "dibatalkan", didengar: teks, intent: hasil.intent, ms });
      return;
    }
    this.lapor({
      keadaan: "memproses", didengar: teks, intent: hasil.intent, ms, mirip: hasil.mirip,
      konfirmasi: null, bagian: hasil.bagian,
    });
    this.catat({ jenis: "diterima", didengar: teks, intent: hasil.intent, ms });
    await this.kirim(hasil.intent);
  }

  berhenti() {
    this.batalkan();
    ipcMain.removeAllListeners("panel:voice-batal");
    try { globalShortcut.unregister(akselerator(this.cfg.tombol)); } catch { /* */ }
    try { if (this.cfg.tombol_ya) globalShortcut.unregister(akselerator(this.cfg.tombol_ya)); } catch { /* */ }
    if (this.pewaktu) clearTimeout(this.pewaktu);
    try { this.rekaman?.kill(); } catch { /* */ }
    this.lapor({ keadaan: "mati" });
  }
}
