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
  sendEvent: (payload: unknown) => ipcRenderer.send("tv:event", payload),
  sendIntent: (intent: unknown) => ipcRenderer.send("panel:intent", intent),
});
