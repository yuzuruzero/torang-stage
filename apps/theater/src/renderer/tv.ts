/**
 * Renderer TV window: scene manager kecil (idle | show-video).
 * Menerima cue dari main lewat preload; menjadwalkan mulai pada playAtEpoch;
 * lapor 'played'/'error' balik untuk ACK.
 */
const params = new URLSearchParams(location.search);
const TV = params.get("tv") ?? "tv?";

const elIdle = document.getElementById("idle")!;
const elLabel = document.querySelector<HTMLElement>("#idle .label")!;
const elVideo = document.getElementById("video") as HTMLVideoElement;
const elDbg = document.getElementById("dbg")!;

elLabel.textContent = TV.toUpperCase();

let timer: number | null = null;
let activeCue: TvCue | null = null;

function dbg(text: string): void {
  elDbg.textContent = `${TV} · ${text}`;
}

function showIdle(): void {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  activeCue = null;
  elVideo.pause();
  elVideo.removeAttribute("src");
  elVideo.load();
  elVideo.style.display = "none";
  elVideo.loop = false;
  elIdle.style.display = "flex";
}

function playUrl(url: string, loop: boolean, onEnded: (() => void) | null): void {
  elVideo.loop = loop;
  elVideo.onended = loop ? null : onEnded;
  elVideo.onerror = null;
  elVideo.src = url;
  elVideo.style.display = "block";
  elIdle.style.display = "none";
  void elVideo.play().catch(() => {
    /* error ditangani onerror di jalur cue */
  });
}

function runCue(cue: TvCue): void {
  if (!cue.fileUrl) {
    window.torang.sendEvent({ cue_id: cue.cue_id, tv: TV, status: "error", detail: "tanpa fileUrl" });
    showIdle();
    return;
  }
  activeCue = cue;

  // Pre-load sekarang; mulai tepat pada playAtEpoch.
  elVideo.onended = null;
  elVideo.src = cue.fileUrl;
  elVideo.load();

  const start = () => {
    const telat = Date.now() - cue.playAtEpoch;
    dbg(`${cue.cue_id} ${cue.role}${cue.cut ? " (CUT)" : ""} · telat ${telat} ms`);
    elVideo.onerror = () => {
      window.torang.sendEvent({
        cue_id: cue.cue_id,
        tv: TV,
        status: "error",
        detail: `gagal memutar ${cue.asset ?? "?"}`,
      });
      showIdle();
    };

    const afterMain = () => {
      window.torang.sendEvent({ cue_id: cue.cue_id, tv: TV, status: "played" });
      if (cue.thenUrl) {
        // enter → lanjut idle-loop karakter (atau materi lanjutan)
        playUrl(cue.thenUrl, cue.thenLoop, () => showIdle());
      } else if (cue.role === "exit") {
        // karakter sudah pergi → kembali idle kosong
        showIdle();
      } else {
        showIdle();
      }
    };

    elVideo.style.display = "block";
    elIdle.style.display = "none";
    elVideo.loop = false;
    elVideo.onended = afterMain;
    void elVideo.play().catch((err: unknown) => {
      window.torang.sendEvent({
        cue_id: cue.cue_id,
        tv: TV,
        status: "error",
        detail: String(err),
      });
      showIdle();
    });
  };

  const delay = cue.playAtEpoch - Date.now();
  if (timer !== null) clearTimeout(timer);
  if (delay <= 30) {
    start();
  } else {
    dbg(`${cue.cue_id} terjadwal +${Math.round(delay)} ms`);
    timer = window.setTimeout(start, delay);
  }
}

window.torang.onCue((cue) => runCue(cue));
window.torang.onStop(() => {
  dbg("STOP → idle");
  showIdle();
});

dbg("siap · menunggu cue");

export {};
