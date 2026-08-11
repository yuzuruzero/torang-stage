/**
 * Roster & binding fase 1 (master §8, subset login sederhana):
 * daftar murid per cohort (diinput admin/implementor — file JSON dulu) +
 * binding kursi ↔ murid. client_id (telemetri) menyusul fase 2 lewat
 * file-watcher; slot field-nya sudah ada.
 *
 * Persistensi: JSON di logDir (tahan restart cloud). Postgres masuk saat
 * deploy stage.torang.ai (lihat DECISIONS.md D14) — bentuk data sudah
 * mengikuti tabel §8 supaya migrasinya mekanis.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { KOMP_TARGETS } from "@torang/shared";

export const CohortFileSchema = z.object({
  cohort: z.string().min(1),
  students: z
    .array(z.object({ id: z.string().min(1), nama: z.string().min(1) }))
    .min(1),
});
export type CohortFile = z.infer<typeof CohortFileSchema>;

export interface Binding {
  seat_id: string;
  student_id: string;
  nama: string;
  client_id: string | null; // diisi fase 2 (file-watcher telemetri)
  ts: number;
}

const BindingsFileSchema = z.array(
  z.object({
    seat_id: z.string(),
    student_id: z.string(),
    nama: z.string(),
    client_id: z.string().nullable(),
    ts: z.number(),
  })
);

export class Roster {
  readonly cohort: CohortFile;
  private bySeat = new Map<string, Binding>();
  private file: string;

  constructor(cohortPath: string, persistDir: string) {
    this.cohort = CohortFileSchema.parse(
      JSON.parse(fs.readFileSync(cohortPath, "utf8"))
    );
    this.file = path.join(persistDir, `bindings-${this.cohort.cohort}.json`);
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.file)) return;
    try {
      const arr = BindingsFileSchema.parse(
        JSON.parse(fs.readFileSync(this.file, "utf8"))
      );
      for (const b of arr) this.bySeat.set(b.seat_id, b);
    } catch (err) {
      console.error(`[roster] file binding rusak, mulai kosong:`, (err as Error).message);
    }
  }

  private save(): void {
    fs.writeFileSync(this.file, JSON.stringify([...this.bySeat.values()], null, 2));
  }

  student(id: string) {
    return this.cohort.students.find((s) => s.id === id);
  }

  bindingBySeat(seat: string): Binding | undefined {
    return this.bySeat.get(seat);
  }

  bindingByStudent(studentId: string): Binding | undefined {
    for (const b of this.bySeat.values()) if (b.student_id === studentId) return b;
    return undefined;
  }

  /**
   * Login murid MENGETIK NAMA SENDIRI (keputusan #14: "ketik nama + nomor
   * kursi"). Kursi yang sudah terisi DIGANTI — yang mengetik duduk di PC itu
   * (satu PC satu kursi), jadi ini kasus koreksi nama / pergantian murid.
   */
  loginByName(
    namaMentah: string,
    seatId: string
  ): { ok: true; binding: Binding; note?: string } | { ok: false; error: string } {
    const nama = namaMentah.trim().replace(/\s+/g, " ");
    if (nama.length < 2 || nama.length > 24) {
      return { ok: false, error: "nama 2-24 huruf ya" };
    }
    if (!/^[\p{L}\p{N} .'-]+$/u.test(nama)) {
      return { ok: false, error: "nama hanya huruf/angka/spasi/.'-" };
    }
    if (!KOMP_TARGETS.includes(seatId)) {
      return { ok: false, error: `kursi tidak dikenal: ${seatId}` };
    }
    const lama = this.bySeat.get(seatId);
    const binding: Binding = {
      seat_id: seatId,
      student_id: `w-${seatId}`, // identitas kursi; nama = label (pola client_id §C)
      nama,
      client_id: lama?.client_id ?? null,
      ts: Date.now(),
    };
    this.bySeat.set(seatId, binding);
    this.save();
    return {
      ok: true,
      binding,
      ...(lama && lama.nama !== nama ? { note: `menggantikan "${lama.nama}"` } : {}),
    };
  }

  /** Reset SEMUA binding (kelas baru — murid berikutnya pakai nama berbeda). */
  resetAll(): number {
    const n = this.bySeat.size;
    this.bySeat.clear();
    this.save();
    return n;
  }

  /**
   * Login lewat daftar cohort (slot e-learning kelak). Aturan:
   * - kursi dipakai murid LAIN → tolak (implementor yang menengahi);
   * - murid yang sama login ulang (kursi sama/beda) → pindahkan (restart normal).
   */
  login(
    studentId: string,
    seatId: string
  ): { ok: true; binding: Binding } | { ok: false; error: string } {
    const student = this.student(studentId);
    if (!student) return { ok: false, error: "murid tidak ada di daftar cohort" };
    if (!KOMP_TARGETS.includes(seatId)) {
      return { ok: false, error: `kursi tidak dikenal: ${seatId}` };
    }
    const existing = this.bySeat.get(seatId);
    if (existing && existing.student_id !== studentId) {
      return {
        ok: false,
        error: `kursi ${seatId} sudah dipakai ${existing.nama} — pilih kursi lain atau minta implementor membereskan`,
      };
    }
    // login ulang murid yang sama dari kursi lain → lepaskan kursi lama
    const prev = this.bindingByStudent(studentId);
    if (prev && prev.seat_id !== seatId) this.bySeat.delete(prev.seat_id);

    const binding: Binding = {
      seat_id: seatId,
      student_id: studentId,
      nama: student.nama,
      client_id: prev?.client_id ?? existing?.client_id ?? null,
      ts: Date.now(),
    };
    this.bySeat.set(seatId, binding);
    this.save();
    return { ok: true, binding };
  }

  /** Lepas kursi (dipakai panel/implementor). */
  unbind(seatId: string): boolean {
    const had = this.bySeat.delete(seatId);
    if (had) this.save();
    return had;
  }

  list(): Binding[] {
    return [...this.bySeat.values()].sort((a, b) =>
      a.seat_id.localeCompare(b.seat_id, undefined, { numeric: true })
    );
  }

  loginOptions() {
    const taken = new Map(
      [...this.bySeat.values()].map((b) => [b.seat_id, b.nama])
    );
    return {
      cohort: this.cohort.cohort,
      students: this.cohort.students.map((s) => ({
        ...s,
        seat: this.bindingByStudent(s.id)?.seat_id ?? null,
      })),
      seats: KOMP_TARGETS.map((seat) => ({
        seat_id: seat,
        taken: taken.has(seat),
        by: taken.get(seat) ?? null,
      })),
    };
  }
}
