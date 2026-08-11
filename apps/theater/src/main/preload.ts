/**
 * Preload: jembatan sempit renderer ↔ main. Renderer TIDAK punya akses Node —
 * hanya kanal di bawah ini (least privilege).
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("torang", {
  boot: () => ipcRenderer.invoke("boot"),
  onCue: (cb: (data: unknown) => void) =>
    ipcRenderer.on("tv:cue", (_e, data) => cb(data)),
  onStop: (cb: () => void) => ipcRenderer.on("tv:stop", () => cb()),
  onAudio: (cb: (data: unknown) => void) =>
    ipcRenderer.on("panel:audio", (_e, data) => cb(data)),
  onStatus: (cb: (data: unknown) => void) =>
    ipcRenderer.on("panel:status", (_e, data) => cb(data)),
  onState: (cb: (data: unknown) => void) =>
    ipcRenderer.on("panel:state", (_e, data) => cb(data)),
  sendEvent: (payload: unknown) => ipcRenderer.send("tv:event", payload),
  sendIntent: (intent: unknown) => ipcRenderer.send("panel:intent", intent),

  // --- mode student (login window; room_key TIDAK pernah lewat sini) ---
  studentBoot: () => ipcRenderer.invoke("student:boot"),
  studentOptions: () => ipcRenderer.invoke("student:options"),
  studentLogin: (p: { student_id: string; seat_id: string }) =>
    ipcRenderer.invoke("student:login", p),
  onStudentStatus: (cb: (data: unknown) => void) =>
    ipcRenderer.on("student:status", (_e, data) => cb(data)),

  // --- overlay & glow ---
  onOverlayShow: (cb: (data: unknown) => void) =>
    ipcRenderer.on("overlay:show", (_e, data) => cb(data)),
  overlayOpen: () => ipcRenderer.send("overlay:open"),
  overlayShown: (p: { cue_id: string }) => ipcRenderer.send("overlay:shown", p),
  onGlowShow: (cb: (data: unknown) => void) =>
    ipcRenderer.on("glow:show", (_e, data) => cb(data)),
});
