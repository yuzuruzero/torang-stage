/**
 * E2E kalimat majemuk & tata layar (24 Sep 2026) - cloud sungguhan, WS
 * sungguhan, jam sungguhan. Klip dibuat PENDEK (ratusan ms) supaya "tunggu
 * sampai video selesai" bisa diuji dalam hitungan detik.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { CueSchema, type Cue } from "@torang/shared";

const PORT = 20000 + Math.floor(Math.random() * 9000);
const KEY = "kunci-majemuk";
const BASE = `http://127.0.0.1:${PORT}`;
let mod: typeof import("../src/index.js");
let tataPath = "";

const manifest = {
  manifest_version: 1,
  release: "e2e-majemuk",
  modules: [
    {
      id: "m99", alias: "tes", slug: "tes", presenter: "torang",
      assets: [
        { file: "m99_materi_tes.mp4", jenis: "materi", duration_ms: 400 },
        { file: "m99_enter_l_tes.mp4", jenis: "enter_l", duration_ms: 300 },
        { file: "m99_enter_r_tes.mp4", jenis: "enter_r", duration_ms: 300 },
        { file: "m99_exit_l_tes.mp4", jenis: "exit_l", duration_ms: 300 },
        { file: "m99_exit_r_tes.mp4", jenis: "exit_r", duration_ms: 300 },
        { file: "m99_idle_tes.mp4", jenis: "idle", duration_ms: 300 },
      ],
      audio: [],
    },
  ],
};

const cues: Array<{ cue: Cue; t: number }> = [];
let ws: WebSocket;

async function intent(body: unknown) {
  const r = await fetch(`${BASE}/api/intent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ room_key: KEY, intent: body }),
  });
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
}
const state = async () => (await (await fetch(`${BASE}/api/state`)).json()) as Record<string, any>;
const tidur = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "torang-majemuk-"));
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(path.join(dir, "rundown.json"), JSON.stringify({ name: "x", steps: [{ label: "s", intent: { intent: "STOP" } }] }));
  writeFileSync(path.join(dir, "cohort.json"), JSON.stringify({ cohort: "X", students: [{ id: "s1", nama: "Andi" }] }));
  tataPath = path.join(dir, "tata.json");
  writeFileSync(tataPath, JSON.stringify({
    presets: [{ nama: "pembukaan", layar: { tv1: "modul:tes", tv2: "scene:office", tv3: "biarkan", tv4: "biarkan" } }],
  }));
  Object.assign(process.env, {
    TORANG_NO_AUTOSTART: "1", TORANG_PORT: String(PORT), TORANG_ROOM_KEY: KEY,
    TORANG_MANIFEST: path.join(dir, "manifest.json"), TORANG_RUNDOWN: path.join(dir, "rundown.json"),
    TORANG_COHORT: path.join(dir, "cohort.json"), TORANG_LOG_DIR: path.join(dir, "logs"),
    TORANG_TATA: tataPath, TORANG_LEAD_MS: "100", TORANG_OVERLAP_MS: "50",
  });
  mod = await import("../src/index.js");
  await mod.start();
  ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
  await new Promise<void>((r) => ws.once("open", () => r()));
  ws.on("message", (d) => {
    const m = JSON.parse(d.toString());
    if (m.kind === "cue") cues.push({ cue: CueSchema.parse(m.cue), t: Date.now() });
  });
  ws.send(JSON.stringify({
    kind: "hello", role: "teacher", endpoint_id: "teacher-1", branch: "dev", room: "r1",
    room_key: KEY, version: "e2e", targets: ["tv1", "tv2", "tv3", "tv4", "teacher"],
  }));
  await tidur(150);
});

afterAll(async () => {
  ws.close();
  await mod.stop();
});

describe("berurutan: langkah 2 baru DIKIRIM saat video langkah 1 selesai", () => {
  it("pindah ke tv2 lalu ke tv3", async () => {
    cues.length = 0;
    const t0 = Date.now();
    const r = await intent({
      intent: "MAJEMUK",
      tahap: [[{ intent: "MOVE", to: "tv2" }], [{ intent: "MOVE", to: "tv3" }]],
    });
    expect(r.status).toBe(200);
    expect(String(r.json.note)).toMatch(/langkah 1 dari 2/);
    await tidur(80);
    expect(cues).toHaveLength(1); // cuma enter tv2 (Torang belum muncul)
    const s1 = await state();
    expect(s1.antrean.langkah).toHaveLength(1);
    expect(s1.antrean.langkah[0].ringkas).toBe("pindah ke tv3");

    await tidur(700);
    expect(cues.map((c) => c.cue.targets[0])).toEqual(["tv2", "tv2", "tv3"]); // enter, lalu exit+enter
    // langkah 2 mulai tepat setelah enter tv2 (100 lead + 300) selesai
    const exit2 = cues[1]!.cue;
    expect(Date.parse(exit2.start_at) - t0).toBeGreaterThanOrEqual(390);
    expect((await state()).antrean).toBeNull();
    expect((await state()).show.screen).toBe("tv3");
  });
});

describe("STOP & BATAL_ANTREAN mengosongkan antrean", () => {
  it("STOP di tengah → langkah berikut tidak pernah dikirim", async () => {
    await intent({ intent: "MAJEMUK", tahap: [[{ intent: "MOVE", to: "tv4" }], [{ intent: "MOVE", to: "tv1" }]] });
    await tidur(50);
    await intent({ intent: "STOP" });
    cues.length = 0;
    await tidur(900);
    expect(cues).toHaveLength(0);
    expect((await state()).antrean).toBeNull();
  });

  it("BATAL_ANTREAN tidak menghentikan tayangan yang sedang jalan", async () => {
    await intent({ intent: "MAJEMUK", tahap: [[{ intent: "MOVE", to: "tv2" }], [{ intent: "MOVE", to: "tv3" }]] });
    const r = await intent({ intent: "BATAL_ANTREAN" });
    expect(r.json.note).toBe("antrean dibatalkan");
    cues.length = 0;
    await tidur(800);
    expect(cues).toHaveLength(0);
    expect((await state()).show.screen).toBe("tv2"); // langkah 1 tetap terjadi
  });
});

describe("semua-atau-tidak", () => {
  it("langkah terakhir mustahil → seluruh kalimat 422, tidak ada cue terkirim", async () => {
    await intent({ intent: "OPEN_SCENE", scene: "office", target: "tv4" });
    cues.length = 0;
    const r = await intent({
      intent: "MAJEMUK",
      tahap: [[{ intent: "MOVE", to: "tv3" }], [{ intent: "MOVE", to: "tv4" }]],
    });
    expect(r.status).toBe(422);
    expect(String(r.json.error)).toMatch(/langkah 2/);
    await tidur(100);
    expect(cues).toHaveLength(0);
    await intent({ intent: "CLOSE_SCENE", target: "tv4" });
  });

  it("lebih dari 3 perintah ditolak skema (400)", async () => {
    const t = { intent: "CLOSE_SCENE", target: "tv1" };
    const r = await intent({ intent: "MAJEMUK", tahap: [[t], [t], [t], [t]] });
    expect(r.status).toBe(400);
  });
});

describe("tata layar", () => {
  it("TATA pembukaan → modul di tv1 + office di tv2, serentak", async () => {
    await intent({ intent: "STOP" });
    await tidur(50);
    cues.length = 0;
    const r = await intent({ intent: "TATA", nama: "pembukaan" });
    expect(r.status).toBe(200);
    await tidur(80);
    const s = await state();
    expect(s.show.screen).toBe("tv1");
    expect(s.show.scenes).toEqual({ tv2: "office" });
    const l1 = s.layar.find((x: any) => x.tv === "tv1");
    expect(l1.torang).toBe(true);
  });

  it("tata yang tidak ada → 422 dengan daftar", async () => {
    const r = await intent({ intent: "TATA", nama: "penutupan" });
    expect(r.status).toBe(422);
    expect(String(r.json.error)).toMatch(/pembukaan/);
  });

  it("simpan preset baru dari panel → tersimpan di berkas & muncul di vocab", async () => {
    const r = await fetch(`${BASE}/api/tata`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        room_key: KEY,
        preset: { nama: "diskusi", layar: { tv1: "kosong", tv2: "scene:office", tv3: "modul:tes", tv4: "biarkan" } },
      }),
    });
    expect(r.status).toBe(200);
    const berkas = JSON.parse(readFileSync(tataPath, "utf8"));
    expect(berkas.presets.map((p: { nama: string }) => p.nama)).toEqual(["pembukaan", "diskusi"]);
    const vocab = await (await fetch(`${BASE}/api/vocab`)).json();
    expect(vocab.tata).toContain("diskusi");
    expect(vocab.scenes).toEqual(["office"]);
  });

  it("preset dengan modul yang tidak ada / kunci salah / nama terlarang ditolak", async () => {
    const kirim = (body: unknown) =>
      fetch(`${BASE}/api/tata`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const layar = { tv1: "modul:ngawur", tv2: "biarkan", tv3: "biarkan", tv4: "biarkan" };
    expect((await kirim({ room_key: KEY, preset: { nama: "x", layar } })).status).toBe(422);
    expect((await kirim({ room_key: "salah", preset: { nama: "x", layar: { ...layar, tv1: "kosong" } } })).status).toBe(401);
    expect((await kirim({ room_key: KEY, preset: { nama: "dan lalu", layar: { ...layar, tv1: "kosong" } } })).status).toBe(422);
  });

  it("hapus preset", async () => {
    const r = await fetch(`${BASE}/api/tata/hapus`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room_key: KEY, nama: "diskusi" }),
    });
    expect(((await r.json()) as { dihapus: boolean }).dihapus).toBe(true);
    expect(JSON.parse(readFileSync(tataPath, "utf8")).presets).toHaveLength(1);
  });
});

describe("rundown: klik untuk lompat (panel guru)", () => {
  it("LOMPAT_RUNDOWN menjalankan langkah itu & memajukan penunjuk", async () => {
    const r = await intent({ intent: "LOMPAT_RUNDOWN", ke: 0 });
    expect(r.status).toBe(200);
    const s = await state();
    expect(s.rundown.pointer).toBe(1);
    expect(s.rundown.langkah[0]).toMatchObject({ label: "s", ringkas: "stop" });
    expect(s.batch).toBe("X");
    expect(s.konten).toBe("e2e-majemuk");
  });
  it("lompat ke langkah yang tidak ada → 422", async () => {
    expect((await intent({ intent: "LOMPAT_RUNDOWN", ke: 5 })).status).toBe(422);
  });
});
