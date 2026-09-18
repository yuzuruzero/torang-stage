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
import { globalShortcut } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
// Parser yang SAMA dengan jalur teks & tes. Kalau ini pernah jadi salinan
// kedua, dua jalur akan menyimpang diam-diam - dan yang menyimpang adalah
// bagian yang menentukan apa yang boleh dieksekusi.
import { parseKalimat, type HasilParse } from "../../../../tools/openclaw/parser.mjs";
import { rapikanTranskrip } from "../../../../tools/voice/normalisasi-stt.mjs";

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
}

export interface StatusVoice {
  keadaan: "mati" | "diam" | "merekam" | "memproses";
  didengar?: string;
  intent?: Record<string, unknown> | null;
  alasan?: string;
  ms?: number;
  mirip?: { didengar: string; dipakai: string };
}

type Kirim = (intent: Record<string, unknown>) => Promise<void>;
type Lapor = (s: StatusVoice) => void;

// Semua proses anak dijalankan tanpa jendela konsol. Tanpa ini, tiap ucapan
// memunculkan kedipan jendela hitam di depan kelas.
const TANPA_JENDELA = { windowsHide: true } as const;

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
  private vocab: { aliases?: { alias: string }[] } | null = null;

  constructor(cfg: VoiceConfig, appRoot: string, kirim: Kirim, lapor: Lapor) {
    this.cfg = cfg;
    this.dirVoice = path.resolve(appRoot, "..", "..", "tools", "voice");
    this.kirim = kirim;
    this.lapor = lapor;
  }

  private berkas(nama: string) {
    return path.join(this.dirVoice, nama);
  }

  /** ffmpeg yang benar-benar punya dshow — bukan sekadar ada di PATH. */
  private cariFfmpeg(): string | null {
    if (this.ffmpeg) return this.ffmpeg;
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
    for (const c of calon) {
      const r = jalankan(c, ["-hide_banner", "-devices"]);
      if (r.gagal) continue;
      if (/^\s*D\w*\s+dshow\b/m.test(r.keluaran + r.galat)) { this.ffmpeg = c; return c; }
    }
    return null;
  }

  private micPertama(ff: string): string | null {
    const r = jalankan(ff, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"]);
    let diAudio = false;
    for (const b of (r.galat + r.keluaran).split(/\r?\n/)) {
      if (/DirectShow audio devices/.test(b)) { diAudio = true; continue; }
      if (/DirectShow video devices/.test(b)) { diAudio = false; continue; }
      if (!diAudio || /Alternative name/.test(b)) continue;
      const m = b.match(/"([^"]+)"/);
      if (m) return m[1];
    }
    return null;
  }

  /** Daftar modul diambil ulang tiap ucapan: modul bisa didaftarkan saat kelas berjalan. */
  private async segarkanVocab(apiUrl: string) {
    try {
      const res = await fetch(`${apiUrl}/api/vocab`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) this.vocab = (await res.json()) as { aliases?: { alias: string }[] };
    } catch { /* pakai daftar terakhir */ }
    return this.vocab;
  }

  mulai(apiUrl: string): { ok: boolean; pesan: string } {
    if (!this.cfg.enabled) return { ok: false, pesan: "voice dimatikan di config" };

    for (const [nama, p] of [["whisper-cli.exe", this.berkas(path.join("bin", "whisper-cli.exe"))],
                             ["model", this.berkas(path.join("model", this.cfg.model))]] as const) {
      if (!fs.existsSync(p)) {
        return { ok: false, pesan: `${nama} belum ada — jalankan tools\\voice\\PASANG-WHISPER.bat` };
      }
    }
    const ff = this.cariFfmpeg();
    if (!ff) return { ok: false, pesan: "ffmpeg dengan dshow tidak ditemukan — perekaman mic tidak bisa jalan" };

    const mic = this.cfg.mic || this.micPertama(ff);
    if (!mic) return { ok: false, pesan: "tidak ada perangkat mic yang terbaca" };
    this.cfg.mic = mic;

    const terdaftar = globalShortcut.register(this.cfg.tombol, () => {
      if (this.rekaman) void this.hentikanDanProses(apiUrl);
      else this.mulaiRekam();
    });
    if (!terdaftar) return { ok: false, pesan: `tombol ${this.cfg.tombol} sudah dipakai app lain` };

    this.lapor({ keadaan: "diam" });
    return { ok: true, pesan: `voice siap — ${this.cfg.tombol} (${this.cfg.mode}), mic: ${mic}` };
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
    this.pewaktu = setTimeout(() => { void this.hentikanDanProses(null); }, (this.cfg.maks_detik + 1) * 1000);
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
    const args = ["-m", this.berkas(path.join("model", this.cfg.model)), "-f", wav,
                  "-l", "id", "-nt", "-t", String(this.cfg.threads), "--prompt", BIAS];
    if (this.cfg.grammar) {
      args.push("--grammar", this.berkas("torang.gbnf"), "--grammar-rule", "root",
                "--grammar-penalty", String(this.cfg.denda_grammar));
    }
    const r = jalankan(this.berkas(path.join("bin", "whisper-cli.exe")), args);
    if (r.gagal) { this.lapor({ keadaan: "memproses", alasan: `whisper gagal: ${r.gagal}` }); return; }

    const m = r.galat.match(/total time\s*=\s*([\d.]+)\s*ms/);
    const mMuat = r.galat.match(/load time\s*=\s*([\d.]+)\s*ms/);
    const ms = m && mMuat ? Math.round(parseFloat(m[1]) - parseFloat(mMuat[1])) : undefined;

    // Transkrip di STDOUT; log & timing di STDERR. Jangan digabung.
    const teks = r.keluaran.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).join(" ");
    const rapi = rapikanTranskrip(teks);
    const vocab = apiUrl ? await this.segarkanVocab(apiUrl) : this.vocab;
    // Tipe eksplisit: tanpa ini, gabungan literal `{ ok: false }` melebar jadi
    // `boolean` dan TypeScript kehilangan kemampuan membedakan kedua cabang.
    const hasil: HasilParse = rapi.ok
      ? parseKalimat(rapi.teks, vocab)
      : { ok: false, error: rapi.alasanTolak ?? "transkrip ditolak" };

    if (!hasil.ok) {
      this.lapor({ keadaan: "memproses", didengar: teks, intent: null, alasan: hasil.error, ms });
      return;
    }
    this.lapor({ keadaan: "memproses", didengar: teks, intent: hasil.intent, ms, mirip: hasil.mirip });
    await this.kirim(hasil.intent);
  }

  berhenti() {
    try { globalShortcut.unregister(this.cfg.tombol); } catch { /* */ }
    if (this.pewaktu) clearTimeout(this.pewaktu);
    try { this.rekaman?.kill(); } catch { /* */ }
    this.lapor({ keadaan: "mati" });
  }
}

const BIAS = [
  "Torang.",
  "Perintah panggung: puter, pindah, buka, tutup, lanjut, ulang, stop, sapa, glow.",
  "Sasaran: TV satu, TV dua, TV tiga, TV empat, layar satu, layar dua, layar tiga,",
  "layar empat, komp, semua layar, semua komp.",
  "Angka: satu, dua, tiga, empat, lima, enam, tujuh, delapan, sembilan, sepuluh,",
  "sebelas, dua belas, tiga belas, empat belas, lima belas, enam belas,",
  "tujuh belas, delapan belas, sembilan belas, dua puluh.",
].join(" ");
