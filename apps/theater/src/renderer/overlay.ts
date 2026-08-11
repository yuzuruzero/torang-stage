/**
 * Overlay "jendela sopan": kartu kecil slide-in di pojok. Tidak pernah
 * fullscreen sendiri — kalau jenis "knock", MURID yang mengklik untuk buka.
 */
const kartu = document.getElementById("kartu")!;
const judul = document.getElementById("judul")!;
const sub = document.getElementById("sub")!;

let kind: "greet" | "knock" = "greet";
let cueId = "";

window.torang.onOverlayShow((raw) => {
  const p = raw as {
    kind: "greet" | "knock";
    cue_id: string;
    title: string;
    subtitle: string;
    duration_ms: number;
  };
  kind = p.kind;
  cueId = p.cue_id;
  judul.textContent = p.title;
  sub.textContent = p.subtitle;
  kartu.classList.toggle("knock", kind === "knock");
  // restart animasi
  kartu.classList.remove("tampil");
  void kartu.offsetWidth;
  kartu.classList.add("tampil");
  if (kind === "greet") {
    window.torang.overlayShown({ cue_id: cueId });
    setTimeout(() => kartu.classList.remove("tampil"), Math.max(1000, p.duration_ms));
  }
});

kartu.addEventListener("click", () => {
  if (kind !== "knock") return;
  kartu.classList.remove("tampil");
  window.torang.overlayOpen();
});

export {};
