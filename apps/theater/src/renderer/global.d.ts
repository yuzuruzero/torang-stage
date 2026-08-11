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

type TvEvent = { cue_id: string; tv: string; status: string; detail?: string };

type PanelStatus = {
  cloud?: "online" | "offline";
  note?: string;
  lastCue?: string;
  clock_offset_ms?: number;
};

type AudioMsg = { stop?: boolean; fileUrl?: string; playAtEpoch?: number };

type BootInfo = {
  mode: string;
  endpoint_id: string;
  cloud_api: string;
  room_key: string;
  version: string;
  isPanel: boolean;
  status?: PanelStatus;
};

interface TorangBridge {
  boot: () => Promise<BootInfo>;
  onCue: (cb: (data: TvCue) => void) => void;
  onStop: (cb: () => void) => void;
  onAudio: (cb: (a: AudioMsg) => void) => void;
  onStatus: (cb: (s: PanelStatus) => void) => void;
  sendEvent: (p: TvEvent) => void;
  sendIntent: (intent: unknown) => void;

  // mode student
  studentBoot: () => Promise<unknown>;
  studentOptions: () => Promise<unknown>;
  studentLogin: (p: { student_id: string; seat_id: string }) => Promise<unknown>;
  onStudentStatus: (cb: (data: unknown) => void) => void;

  // overlay & glow
  onOverlayShow: (cb: (data: unknown) => void) => void;
  overlayOpen: () => void;
  overlayShown: (p: { cue_id: string }) => void;
  onGlowShow: (cb: (data: unknown) => void) => void;
}

interface Window {
  torang: TorangBridge;
}
