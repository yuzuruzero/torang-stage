/**
 * Mode student (fase 1 §3.2 subset): login sederhana + overlay "jendela
 * sopan" + GLOW. Prinsip: TIDAK PERNAH merebut fokus (showInactive),
 * murid selalu yang mengklik untuk fullscreen, STOP membersihkan semuanya.
 *
 * Whitelist cue mode student: PLAY_VIDEO (via jendela sopan), OVERLAY_GREET,
 * GLOW, STOP. Selain itu → ACK rejected. room_key tinggal di proses main —
 * renderer tidak memegangnya.
 */
import { BrowserWindow, ipcMain, screen } from "electron";
import path from "node:path";
import { CueSchema, expandTargets, type Cue } from "@torang/shared";
import type { TheaterConfig } from "./config.js";
import { CloudClient } from "./ws-client.js";
import { loadAssetMap, resolveAssetUrl } from "./assets.js";

const SUPPORTED_STUDENT: ReadonlySet<string> = new Set([
  "PLAY_VIDEO",
  "OVERLAY_GREET",
  "GLOW",
  "STOP",
]);

interface PendingKnock {
  cue: Cue;
  fileUrl: string;
}

export class StudentController {
  private loginWin: BrowserWindow | null = null;
  private overlayWin: BrowserWindow | null = null;
  private glowWin: BrowserWindow | null = null;
  private videoWin: BrowserWindow | null = null;
  private client: CloudClient | null = null;
  private seat: string | null = null;
  private nama: string | null = null;
  private pendingKnock: PendingKnock | null = null;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private cfg: TheaterConfig,
    private distDir: string,
    private version: string
  ) {}

  // ------------------------------------------------------------------ boot
  start(): void {
    loadAssetMap(this.cfg.assets_dir);
    this.registerIpc();

    const area = screen.getPrimaryDisplay().workArea;
    this.loginWin = new BrowserWindow({
      x: area.x + 8,
      y: area.y + area.height - 560,
      width: 380,
      height: 540,
      title: "Torang — Kelas",
      backgroundColor: "#101528",
      webPreferences: {
        preload: path.join(this.distDir, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.loginWin.setMenuBarVisibility(false);
    void this.loginWin.loadFile(path.join(this.distDir, "renderer", "login.html"));
    this.loginWin.on("closed", () => (this.loginWin = null));

    if (this.cfg.auto_login && this.cfg.seat) {
      // Dev/smoke: login tanpa klik begitu renderer siap.
      this.loginWin.webContents.once("did-finish-load", () => {
        void this.doLogin(this.cfg.auto_login!, this.cfg.seat!);
      });
    }
  }

  private api(pathname: string): string {
    return `${this.cfg.cloud_api}${pathname}`;
  }

  // ------------------------------------------------------- login & koneksi
  private async fetchOptions(): Promise<unknown> {
    const res = await fetch(this.api("/api/login/options"), {
      headers: { "x-room-key": this.cfg.room_key },
    });
    return await res.json();
  }

  private async doLogin(
    cred: { nama?: string; student_id?: string },
    seatId: string
  ): Promise<{ ok: boolean; error?: string; nama?: string; seat?: string }> {
    try {
      const res = await fetch(this.api("/api/login"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          room_key: this.cfg.room_key,
          ...cred,
          seat_id: seatId,
        }),
      });
      const j = (await res.json()) as {
        ok: boolean;
        error?: string;
        binding?: { nama: string; seat_id: string };
      };
      if (!j.ok || !j.binding) {
        return { ok: false, error: j.error ?? "login gagal" };
      }
      this.seat = j.binding.seat_id;
      this.nama = j.binding.nama;
      this.connect();
      this.sendLogin({
        phase: "connected",
        nama: this.nama,
        seat: this.seat,
      });
      return { ok: true, nama: this.nama, seat: this.seat };
    } catch (err) {
      return { ok: false, error: `cloud tidak terjangkau: ${(err as Error).message}` };
    }
  }

  private connect(): void {
    if (!this.seat) return;
    this.client?.stop();
    this.client = new CloudClient({
      url: this.cfg.cloud_ws,
      hello: {
        role: "student",
        endpoint_id: this.seat,
        branch: this.cfg.branch,
        room: this.cfg.room,
        room_key: this.cfg.room_key,
        version: this.version,
        targets: [this.seat],
      },
      onCue: (msg) => this.handleCue(msg.cue),
      onStatus: (status, detail) =>
        this.sendLogin({ cloud: status, ...(detail ? { note: detail } : {}) }),
    });
    this.client.start();
  }

  private sendLogin(data: Record<string, unknown>): void {
    this.loginWin?.webContents.send("student:status", data);
  }

  // ------------------------------------------------------------------- IPC
  private registerIpc(): void {
    ipcMain.handle("student:options", async () => {
      try {
        return await this.fetchOptions();
      } catch (err) {
        return { ok: false, error: `cloud tidak terjangkau: ${(err as Error).message}` };
      }
    });
    ipcMain.handle(
      "student:login",
      (_e, p: { nama?: string; student_id?: string; seat_id: string }) =>
        this.doLogin({ nama: p.nama, student_id: p.student_id }, p.seat_id)
    );
    ipcMain.handle("student:boot", () => ({
      seat: this.cfg.seat,
      version: this.version,
      mode: "student",
    }));
    ipcMain.on("overlay:open", () => this.openKnockVideo());
    ipcMain.on("overlay:shown", (_e, p: { cue_id: string }) => {
      this.ack(p.cue_id, "played");
    });
    ipcMain.on("tv:event", (_e, ev: { cue_id: string; status: string; detail?: string }) => {
      if (ev.status === "played") {
        this.ack(ev.cue_id, "played");
        // materi selesai → tutup fullscreen, kembali senyap
        this.closeVideo();
      } else if (ev.status === "error") {
        this.ack(ev.cue_id, "error", ev.detail);
        this.closeVideo();
      }
    });
  }

  private ack(cueId: string, status: "received" | "scheduled" | "played" | "rejected" | "error", detail?: string): void {
    if (!this.client || !this.seat) return;
    this.client.sendAck({
      cue_id: cueId,
      endpoint_id: this.seat,
      status,
      ...(detail ? { detail } : {}),
    });
  }

  // ------------------------------------------------------------ cue runner
  private handleCue(cue: Cue): void {
    if (!this.seat) return;
    const parsed = CueSchema.safeParse(cue);
    if (!parsed.success) {
      this.ack(cue.cue_id ?? "?", "rejected", "cue gagal validasi schema");
      return;
    }
    if (!SUPPORTED_STUDENT.has(cue.type)) {
      this.ack(cue.cue_id, "rejected", `type ${cue.type} tidak didukung mode student (whitelist)`);
      return;
    }
    const mine = expandTargets(cue.targets).includes(this.seat);
    if (!mine) {
      this.ack(cue.cue_id, "rejected", "bukan target kursi ini");
      return;
    }

    const offset = this.client ? Math.round(this.client.offsetMs) : 0;
    const playAt = Date.parse(cue.start_at) - offset;
    const delay = Math.max(0, playAt - Date.now());

    if (cue.type === "STOP") {
      this.clearAll();
      this.ack(cue.cue_id, "played", "senyap");
      return;
    }

    this.ack(cue.cue_id, "scheduled", undefined);
    const timer = setTimeout(() => {
      if (cue.type === "OVERLAY_GREET") this.showGreet(cue);
      else if (cue.type === "GLOW") this.showGlow(cue);
      else if (cue.type === "PLAY_VIDEO") this.showKnock(cue);
    }, delay);
    this.timers.push(timer);
  }

  // ------------------------------------------------- overlay "jendela sopan"
  private ensureOverlay(): BrowserWindow {
    if (this.overlayWin && !this.overlayWin.isDestroyed()) return this.overlayWin;
    const area = screen.getPrimaryDisplay().workArea;
    const w = 400;
    const h = 170;
    this.overlayWin = new BrowserWindow({
      x: area.x + area.width - w - 16,
      y: area.y + area.height - h - 16,
      width: w,
      height: h,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      show: false,
      webPreferences: {
        preload: path.join(this.distDir, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    void this.overlayWin.loadFile(path.join(this.distDir, "renderer", "overlay.html"));
    this.overlayWin.on("closed", () => (this.overlayWin = null));
    return this.overlayWin;
  }

  private overlaySend(payload: Record<string, unknown>): void {
    const win = this.ensureOverlay();
    const send = () => {
      win.showInactive(); // sopan: muncul TANPA merebut fokus
      win.webContents.send("overlay:show", payload);
    };
    if (win.webContents.isLoading()) {
      win.webContents.once("did-finish-load", send);
    } else {
      send();
    }
  }

  private showGreet(cue: Cue): void {
    const p = cue.payload as Record<string, unknown>;
    this.overlaySend({
      kind: "greet",
      cue_id: cue.cue_id,
      title: String(p.title ?? "Halo!"),
      subtitle: String(p.subtitle ?? ""),
      duration_ms: Number(p.duration_ms ?? 6000),
    });
    // auto-sembunyi setelah durasi
    const t = setTimeout(() => {
      this.overlayWin?.hide();
    }, Number(p.duration_ms ?? 6000) + 600);
    this.timers.push(t);
  }

  private showKnock(cue: Cue): void {
    const fileUrl = cue.asset ? resolveAssetUrl(cue.asset) : null;
    if (!fileUrl) {
      this.ack(cue.cue_id, "error", `aset tidak ditemukan: ${cue.asset ?? "?"}`);
      return;
    }
    this.pendingKnock = { cue, fileUrl };
    this.overlaySend({
      kind: "knock",
      cue_id: cue.cue_id,
      title: "Torang mengetuk 🚪",
      subtitle: "Klik untuk membuka di layarmu",
      duration_ms: 0,
    });
  }

  private openKnockVideo(): void {
    const pk = this.pendingKnock;
    if (!pk) return;
    this.pendingKnock = null;
    this.overlayWin?.hide();

    const win = new BrowserWindow({
      fullscreen: true,
      frame: false,
      backgroundColor: "#000000",
      webPreferences: {
        preload: path.join(this.distDir, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.videoWin = win;
    win.setMenuBarVisibility(false);
    void win
      .loadFile(path.join(this.distDir, "renderer", "tv.html"), {
        query: { tv: this.seat ?? "komp?" },
      })
      .then(() => {
        win.webContents.send("tv:cue", {
          cue_id: pk.cue.cue_id,
          role: "materi",
          asset: pk.cue.asset,
          fileUrl: pk.fileUrl,
          thenUrl: null,
          thenLoop: false,
          cut: false,
          playAtEpoch: Date.now() + 300,
        });
      });
    win.on("closed", () => (this.videoWin = null));
  }

  private closeVideo(): void {
    if (this.videoWin && !this.videoWin.isDestroyed()) this.videoWin.close();
    this.videoWin = null;
  }

  // ------------------------------------------------------------------ glow
  private ensureGlow(): BrowserWindow {
    if (this.glowWin && !this.glowWin.isDestroyed()) return this.glowWin;
    const b = screen.getPrimaryDisplay().bounds;
    this.glowWin = new BrowserWindow({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      show: false,
      webPreferences: {
        preload: path.join(this.distDir, "preload.cjs"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    this.glowWin.setIgnoreMouseEvents(true, { forward: true }); // click-through
    void this.glowWin.loadFile(path.join(this.distDir, "renderer", "glow.html"));
    this.glowWin.on("closed", () => (this.glowWin = null));
    return this.glowWin;
  }

  private showGlow(cue: Cue): void {
    const p = cue.payload as Record<string, unknown>;
    const duration = Number(p.duration_ms ?? 4000);
    const win = this.ensureGlow();
    const send = () => {
      win.showInactive();
      win.webContents.send("glow:show", {
        cue_id: cue.cue_id,
        preset: String(p.preset ?? "pulse"),
        duration_ms: duration,
      });
      this.ack(cue.cue_id, "played");
    };
    if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
    else send();
    const t = setTimeout(() => this.glowWin?.hide(), duration + 700);
    this.timers.push(t);
  }

  // ------------------------------------------------------------- kill switch
  private clearAll(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.pendingKnock = null;
    this.overlayWin?.hide();
    this.glowWin?.hide();
    this.closeVideo();
  }

  stop(): void {
    this.clearAll();
    this.client?.stop();
  }
}
