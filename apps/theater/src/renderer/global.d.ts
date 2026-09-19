/**
 * Tipe global renderer: kontrak jembatan preload (window.torang) + tipe pesan
 * IPC. Ambient (tanpa import/export) supaya dipakai tv.ts & panel.ts sekaligus.
 */
type TvCue = {
  cue_id: string;
  role: "materi" | "enter" | "exit";
  asset: string | null;
  fileUrl: string | null;
  thenUrl: string | null;
  thenLoop: boolean;
  cut: boolean;
  playAtEpoch: number;
};

type TvScene = { cue_id: string; scene: string; url: string };

type TvEvent = { cue_id: string; tv: string; status: string; detail?: string };

type PanelStatus = {
  cloud?: "online" | "offline";
  note?: string;
  lastCue?: string;
  clock_offset_ms?: number;
};

type AudioMsg = { stop?: boolean; fileUrl?: string; playAtEpoch?: number };

type ItemInbox = {
  nama: string;
  jalur: string;
  alias: string;
  durasi_ms: number;
  modul_baru: boolean;
  galat: string | null;
};

type HasilUsul = {
  ok: boolean;
  pesan: string;
  jalur?: string;
  nama?: string;
  alias?: string;
  durasi_ms?: number;
  modul_baru?: boolean;
};

/** Status jalur voice. Dikirim main lewat IPC `panel:voice`, dan status
 *  TERAKHIR ikut di BootInfo supaya panel yang baru selesai memuat tidak
 *  menampilkan "mati" padahal voice sudah siap sejak sebelum panel ada. */
type VoiceStatus = {
  keadaan: "mati" | "diam" | "merekam" | "memproses";
  didengar?: string;
  intent?: Record<string, unknown> | null;
  alasan?: string;
  ms?: number;
  mirip?: { didengar: string; dipakai: string };
  saran?: { kalimat: string } | null;
};

type BootInfo = {
  mode: string;
  endpoint_id: string;
  cloud_api: string;
  room_key: string;
  version: string;
  isPanel: boolean;
  status?: PanelStatus;
  voice?: VoiceStatus | null;
  voice_tombol?: string | null;
  voice_tombol_ya?: string | null;
  hotkeys?: { go: string; stop: string; replay: string } | null;
};

interface TorangBridge {
  boot: () => Promise<BootInfo>;
  onCue: (cb: (data: TvCue) => void) => void;
  onStop: (cb: () => void) => void;
  onScene: (cb: (data: TvScene) => void) => void;
  onAudio: (cb: (a: AudioMsg) => void) => void;
  onStatus: (cb: (s: PanelStatus) => void) => void;
  onState: (cb: (data: unknown) => void) => void;
  onVoice: (cb: (s: VoiceStatus) => void) => void;
  sendEvent: (p: TvEvent) => void;
  sendIntent: (intent: unknown) => void;

  // mode student
  studentBoot: () => Promise<unknown>;
  studentOptions: () => Promise<unknown>;
  studentLogin: (p: {
    nama?: string;
    student_id?: string;
    seat_id: string;
  }) => Promise<unknown>;
  onStudentStatus: (cb: (data: unknown) => void) => void;
  panelBukaTv: (mana: string) => void;
  panelUnbind: (seat: string) => void;
  panelResetMurid: () => void;

  // daftar video jadi modul
  jalurBerkas: (f: File) => string;
  modulInbox: () => Promise<{ folder: string; isi: ItemInbox[] }>;
  modulUsul: (jalur: string) => Promise<HasilUsul>;
  modulDaftar: (jalur: string, alias: string) => Promise<{ ok: boolean; pesan: string; alias: string }>;

  // overlay & glow
  onOverlayShow: (cb: (data: unknown) => void) => void;
  overlayOpen: () => void;
  overlayShown: (p: { cue_id: string }) => void;
  onGlowShow: (cb: (data: unknown) => void) => void;
}

interface Window {
  torang: TorangBridge;
}
