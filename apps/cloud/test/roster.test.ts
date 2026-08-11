import { beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Roster } from "../src/roster.js";

function buatRoster() {
  const dir = mkdtempSync(path.join(tmpdir(), "torang-roster-"));
  const cohortFile = path.join(dir, "cohort.json");
  writeFileSync(
    cohortFile,
    JSON.stringify({
      cohort: "TEST-1",
      students: [
        { id: "s1", nama: "Andi" },
        { id: "s2", nama: "Budi" },
      ],
    })
  );
  return { dir, cohortFile, roster: new Roster(cohortFile, dir) };
}

describe("Roster login sederhana (§8 subset)", () => {
  let r: ReturnType<typeof buatRoster>;
  beforeEach(() => {
    r = buatRoster();
  });

  it("login normal mengikat kursi", () => {
    const res = r.roster.login("s1", "komp3");
    expect(res.ok).toBe(true);
    expect(r.roster.bindingBySeat("komp3")?.nama).toBe("Andi");
  });

  it("kursi dipakai murid lain → ditolak dengan pesan jelas", () => {
    r.roster.login("s1", "komp3");
    const res = r.roster.login("s2", "komp3");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/dipakai Andi/);
  });

  it("murid sama login ulang di kursi lain → pindah (kursi lama lepas)", () => {
    r.roster.login("s1", "komp3");
    const res = r.roster.login("s1", "komp7");
    expect(res.ok).toBe(true);
    expect(r.roster.bindingBySeat("komp3")).toBeUndefined();
    expect(r.roster.bindingBySeat("komp7")?.nama).toBe("Andi");
  });

  it("murid di luar cohort / kursi asing → ditolak", () => {
    expect(r.roster.login("s99", "komp1").ok).toBe(false);
    expect(r.roster.login("s1", "komp99").ok).toBe(false);
    expect(r.roster.login("s1", "tv1").ok).toBe(false);
  });

  it("binding TAHAN RESTART (persist ke file)", () => {
    r.roster.login("s1", "komp3");
    const kedua = new Roster(r.cohortFile, r.dir); // simulasi cloud restart
    expect(kedua.bindingBySeat("komp3")?.nama).toBe("Andi");
  });

  it("unbind melepas kursi", () => {
    r.roster.login("s1", "komp3");
    expect(r.roster.unbind("komp3")).toBe(true);
    expect(r.roster.bindingBySeat("komp3")).toBeUndefined();
  });

  it("loginOptions menandai kursi terpakai + kursi murid", () => {
    r.roster.login("s2", "komp1");
    const o = r.roster.loginOptions();
    expect(o.seats.find((s) => s.seat_id === "komp1")).toMatchObject({
      taken: true,
      by: "Budi",
    });
    expect(o.students.find((s) => s.id === "s2")?.seat).toBe("komp1");
    expect(o.seats).toHaveLength(20);
  });
});

describe("loginByName (murid KETIK nama — keputusan #14) + reset", () => {
  let r: ReturnType<typeof buatRoster>;
  beforeEach(() => {
    r = buatRoster();
  });

  it("nama diketik bebas mengikat kursi (trim + rapikan spasi)", () => {
    const res = r.roster.loginByName("  Siti   Aminah ", "komp4");
    expect(res.ok).toBe(true);
    expect(r.roster.bindingBySeat("komp4")?.nama).toBe("Siti Aminah");
  });

  it("kursi terisi DIGANTI (murid di PC itu yang mengetik) + note", () => {
    r.roster.loginByName("Andi", "komp4");
    const res = r.roster.loginByName("Budi", "komp4");
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.note).toMatch(/menggantikan "Andi"/);
    expect(r.roster.bindingBySeat("komp4")?.nama).toBe("Budi");
  });

  it("validasi nama: kependekan / karakter aneh ditolak", () => {
    expect(r.roster.loginByName("A", "komp1").ok).toBe(false);
    expect(r.roster.loginByName("<script>x</script>", "komp1").ok).toBe(false);
    expect(r.roster.loginByName("Bagus", "tv1").ok).toBe(false);
  });

  it("client_id kursi dipertahankan saat ganti nama (resume telemetri)", () => {
    r.roster.loginByName("Andi", "komp4");
    const b = r.roster.bindingBySeat("komp4")!;
    b.client_id = "uuid-123"; // simulasi binding telemetri fase 2
    r.roster.loginByName("Andi Baru", "komp4");
    expect(r.roster.bindingBySeat("komp4")?.client_id).toBe("uuid-123");
  });

  it("resetAll melepas semua kursi + TAHAN RESTART", () => {
    r.roster.loginByName("Andi", "komp1");
    r.roster.loginByName("Budi", "komp2");
    expect(r.roster.resetAll()).toBe(2);
    expect(r.roster.list()).toHaveLength(0);
    const kedua = new Roster(r.cohortFile, r.dir); // simulasi cloud restart
    expect(kedua.list()).toHaveLength(0);
  });
});
