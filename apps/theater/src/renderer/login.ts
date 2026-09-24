/**
 * Renderer login student: murid MENGETIK NAMANYA SENDIRI (keputusan #14)
 * + kursi (preset dari config mesin). Semua panggilan API lewat MAIN —
 * renderer tidak pernah memegang room_key.
 */
const $ = (s: string) => document.querySelector(s) as HTMLElement;

const inputNama = document.getElementById("nama") as HTMLInputElement;
const sel = document.getElementById("kursi") as HTMLSelectElement;
const tombol = document.getElementById("masuk") as HTMLButtonElement;

let presetSeat: string | null = null;

function setPesan(t: string): void {
  $("#pesan").textContent = t;
}

function keSesudah(nama: string, seat: string): void {
  $("#form").style.display = "none";
  $("#sesudah").style.display = "block";
  $("#halo").textContent = `Halo, ${nama}!`;
  $("#kursiku").textContent = `kursi ${seat}`;
}

function cekSiap(): void {
  tombol.disabled = inputNama.value.trim().length < 2 || !sel.value;
}

async function muatKursi(): Promise<void> {
  const res = (await window.torang.studentOptions()) as {
    ok?: boolean;
    error?: string;
    seats?: Array<{ seat_id: string; taken: boolean; by: string | null }>;
  };
  sel.innerHTML = "";
  if (!res || res.ok === false || !res.seats) {
    setPesan(`⚠ ${res?.error ?? "gagal memuat kursi — cek cloud"}`);
    return;
  }
  for (const seat of res.seats) {
    const o = document.createElement("option");
    o.value = seat.seat_id;
    o.textContent = seat.taken ? `${seat.seat_id} — dipakai ${seat.by}` : seat.seat_id;
    sel.appendChild(o);
  }
  if (presetSeat) sel.value = presetSeat;
  cekSiap();
}

inputNama.addEventListener("input", cekSiap);
inputNama.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !tombol.disabled) tombol.click();
});
sel.addEventListener("change", cekSiap);

tombol.onclick = async () => {
  const nama = inputNama.value.trim();
  if (nama.length < 2 || !sel.value) return;
  setPesan("masuk…");
  const res = (await window.torang.studentLogin({
    nama,
    seat_id: sel.value,
  })) as { ok: boolean; error?: string; nama?: string; seat?: string; note?: string };
  if (!res.ok) {
    setPesan(`⚠ ${res.error ?? "login gagal"}`);
    return;
  }
  keSesudah(res.nama ?? nama, res.seat ?? sel.value);
};

window.torang.onStudentStatus((raw) => {
  const s = raw as {
    phase?: string;
    nama?: string;
    seat?: string;
    cloud?: "online" | "offline";
    note?: string;
  };
  if (s.phase === "connected" && s.nama && s.seat) keSesudah(s.nama, s.seat);
  if (s.cloud) {
    $("#dot").className = `dot ${s.cloud === "online" ? "online" : ""}`;
    $("#status").textContent =
      s.cloud === "online" ? "tersambung ke panggung" : "terputus — mencoba lagi…";
  }
  if (s.note) $("#status").textContent = s.note;
});

void window.torang.studentBoot().then((b) => {
  presetSeat = (b as { seat: string | null }).seat;
  void muatKursi();
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
  "Ganti mode video? Jendela ini akan ditutup lalu dibuka lagi, dan kamu perlu " +
    "mengetik namamu sekali lagi."
);


export {};
