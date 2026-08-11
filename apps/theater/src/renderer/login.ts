/**
 * Renderer login student: pilih nama dari daftar cohort + kursi (bisa preset
 * dari config mesin). Semua panggilan API lewat MAIN (renderer tidak pernah
 * memegang room_key).
 */
const $ = (s: string) => document.querySelector(s) as HTMLElement;

let pilihan: { student_id: string | null; seat_id: string | null } = {
  student_id: null,
  seat_id: null,
};
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

async function muatDaftar(): Promise<void> {
  const res = (await window.torang.studentOptions()) as {
    ok?: boolean;
    error?: string;
    students?: Array<{ id: string; nama: string; seat: string | null }>;
    seats?: Array<{ seat_id: string; taken: boolean; by: string | null }>;
  };
  if (!res || res.ok === false || !res.students) {
    $("#daftar").textContent = "";
    setPesan(`⚠ ${res?.error ?? "gagal memuat daftar — cek cloud"}`);
    return;
  }

  $("#daftar").innerHTML = "";
  for (const s of res.students) {
    const b = document.createElement("button");
    b.className = "nama";
    b.innerHTML = `${s.nama}${s.seat ? `<span class="kursi-info">${s.seat}</span>` : ""}`;
    b.onclick = () => {
      pilihan.student_id = s.id;
      document.querySelectorAll(".nama").forEach((x) => x.classList.remove("pilih"));
      b.classList.add("pilih");
      ($("#masuk") as HTMLButtonElement).disabled = !pilihan.seat_id;
    };
    $("#daftar").appendChild(b);
  }

  const sel = $("#kursi") as HTMLSelectElement;
  sel.innerHTML = "";
  for (const seat of res.seats ?? []) {
    const o = document.createElement("option");
    o.value = seat.seat_id;
    o.textContent = seat.taken ? `${seat.seat_id} — dipakai ${seat.by}` : seat.seat_id;
    o.disabled = seat.taken;
    sel.appendChild(o);
  }
  if (presetSeat) sel.value = presetSeat;
  pilihan.seat_id = sel.value || null;
  sel.onchange = () => {
    pilihan.seat_id = sel.value || null;
    ($("#masuk") as HTMLButtonElement).disabled = !(pilihan.student_id && pilihan.seat_id);
  };
}

($("#masuk") as HTMLButtonElement).onclick = async () => {
  if (!pilihan.student_id || !pilihan.seat_id) return;
  setPesan("masuk…");
  const res = (await window.torang.studentLogin({
    student_id: pilihan.student_id,
    seat_id: pilihan.seat_id,
  })) as { ok: boolean; error?: string; nama?: string; seat?: string };
  if (!res.ok) {
    setPesan(`⚠ ${res.error ?? "login gagal"}`);
    return;
  }
  keSesudah(res.nama ?? "-", res.seat ?? "-");
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
  void muatDaftar();
});

export {};
