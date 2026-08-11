/**
 * E2E jalur cue TANPA Electron: server cloud sungguhan + klien WS sungguhan
 * (teacher + student). Menguji hello+auth, intent→cue terjadwal, ACK, arah
 * MOVE, login murid, SAPA bernama, GLOW, routing target, dan penolakan.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { CueSchema } from "@torang/shared";

const PORT = 20000 + Math.floor(Math.random() * 9000);
const KEY = "kunci-e2e";
const BASE = `http://127.0.0.1:${PORT}`;

let mod: typeof import("../src/index.js");

const manifest = {
  manifest_version: 1,
  release: "e2e",
  modules: [
    {
      id: "m99",
      alias: "tes",
      slug: "tes",
      presenter: "torang",
      assets: [
        { file: "m99_materi_tes.mp4", jenis: "materi", duration_ms: 4000 },
        { file: "m99_enter_l_tes.mp4", jenis: "enter_l", duration_ms: 2000 },
        { file: "m99_enter_r_tes.mp4", jenis: "enter_r", duration_ms: 2000 },
        { file: "m99_exit_l_tes.mp4", jenis: "exit_l", duration_ms: 2000 },
        { file: "m99_exit_r_tes.mp4", jenis: "exit_r", duration_ms: 2000 },
        { file: "m99_idle_tes.mp4", jenis: "idle", duration_ms: 3000 },
      ],
      audio: [],
    },
  ],
};

const rundown = {
  name: "e2e",
  steps: [
    { label: "play", intent: { intent: "PLAY_MODULE", alias: "tes", target: "tv1" } },
    { label: "stop", intent: { intent: "STOP" } },
  ],
};

const cohort = {
  cohort: "E2E-1",
  students: [
    { id: "s1", nama: "Andi" },
    { id: "s3", nama: "Citra" },
  ],
};

type Received = { kind: string; [k: string]: unknown };

class FakeClient {
  ws!: WebSocket;
  inbox: Received[] = [];
  waiters: Array<{ pred: (m: Received) => boolean; res: (m: Received) => void }> = [];

  constructor(
    private id: string,
    private role: "teacher" | "student",
    private targets: string[]
  ) {}

  async connect(key = KEY): Promise<Received> {
    this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`);
    await new Promise<void>((res, rej) => {
      this.ws.once("open", () => res());
      this.ws.once("error", rej);
    });
    this.ws.on("message", (d) => {
      const m = JSON.parse(d.toString()) as Received;
      const w = this.waiters.find((x) => x.pred(m));
      if (w) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        w.res(m);
      } else {
        this.inbox.push(m);
      }
    });
    this.ws.send(
      JSON.stringify({
        kind: "hello",
        role: this.role,
        endpoint_id: this.id,
        branch: "dev",
        room: "r1",
        room_key: key,
        version: "e2e",
        targets: this.targets,
      })
    );
    return this.next((m) => m.kind === "hello_ok" || m.kind === "error");
  }

  next(pred: (m: Received) => boolean, timeoutMs = 3000): Promise<Received> {
    const hit = this.inbox.find(pred);
    if (hit) {
      this.inbox.splice(this.inbox.indexOf(hit), 1);
      return Promise.resolve(hit);
    }
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`timeout menunggu pesan (${this.id})`)), timeoutMs);
      this.waiters.push({
        pred,
        res: (m) => {
          clearTimeout(t);
          res(m);
        },
      });
    });
  }

  ack(cue_id: string, status: string) {
    this.ws.send(JSON.stringify({ kind: "ack", cue_id, endpoint_id: this.id, status }));
  }
}

async function intent(body: unknown, key = KEY) {
  const r = await fetch(`${BASE}/api/intent`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ room_key: key, intent: body }),
  });
  return { status: r.status, json: (await r.json()) as Record<string, unknown> };
}

async function stateNow() {
  return (await (await fetch(`${BASE}/api/state`)).json()) as {
    show: { screen: string | null };
    bindings: Array<{ seat_id: string; nama: string }>;
    recent_cues: Array<{ cue_id: string; acks: Array<{ status: string }> }>;
  };
}

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "torang-e2e-"));
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(path.join(dir, "rundown.json"), JSON.stringify(rundown));
  writeFileSync(path.join(dir, "cohort.json"), JSON.stringify(cohort));
  process.env.TORANG_NO_AUTOSTART = "1";
  process.env.TORANG_PORT = String(PORT);
  process.env.TORANG_ROOM_KEY = KEY;
  process.env.TORANG_MANIFEST = path.join(dir, "manifest.json");
  process.env.TORANG_RUNDOWN = path.join(dir, "rundown.json");
  process.env.TORANG_COHORT = path.join(dir, "cohort.json");
  process.env.TORANG_LOG_DIR = path.join(dir, "logs");
  mod = await import("../src/index.js");
  await mod.start();
});

afterAll(async () => {
  await mod.stop();
});

const teacher = new FakeClient("teacher-1", "teacher", ["tv1", "tv2", "tv3", "tv4", "teacher"]);
const student = new FakeClient("komp3", "student", ["komp3"]);

describe("jalur cue teacher", () => {
  it("hello dengan kunci benar → hello_ok", async () => {
    const m = await teacher.connect();
    expect(m.kind).toBe("hello_ok");
  });

  it("PLAY_MODULE → cue valid terjadwal ~T+1.5s + ACK masuk state", async () => {
    const before = Date.now();
    const r = await intent({ intent: "PLAY_MODULE", alias: "tes", target: "tv1" });
    expect(r.status).toBe(200);
    const m = await teacher.next((x) => x.kind === "cue");
    const cue = CueSchema.parse(m.cue);
    expect(cue.asset).toBe("m99_materi_tes");
    const dt = Date.parse(cue.start_at) - before;
    expect(dt).toBeGreaterThan(1000);
    expect(dt).toBeLessThan(2500);

    teacher.ack(cue.cue_id, "scheduled");
    await new Promise((r2) => setTimeout(r2, 100));
    const s = await stateNow();
    expect(s.show.screen).toBe("tv1");
    expect(
      s.recent_cues.find((c) => c.cue_id === cue.cue_id)!.acks.some((a) => a.status === "scheduled")
    ).toBe(true);
  });

  it("MOVE tv1→tv3 → exit_r lalu enter_l (HUKUM arah)", async () => {
    await intent({ intent: "MOVE", to: "tv3" });
    const exit = CueSchema.parse((await teacher.next((x) => x.kind === "cue")).cue);
    const enter = CueSchema.parse((await teacher.next((x) => x.kind === "cue")).cue);
    expect(exit.asset).toBe("m99_exit_r_tes");
    expect(enter.asset).toBe("m99_enter_l_tes");
    expect(Date.parse(enter.start_at)).toBeGreaterThan(Date.parse(exit.start_at));
  });

  it("STOP → sampai, show-state kosong", async () => {
    await intent({ intent: "STOP" });
    const cue = CueSchema.parse((await teacher.next((x) => x.kind === "cue")).cue);
    expect(cue.type).toBe("STOP");
    expect((await stateNow()).show.screen).toBeNull();
  });
});

describe("auth & whitelist", () => {
  it("room_key salah → 401; intent asing → 400; alias asing → 422", async () => {
    expect((await intent({ intent: "STOP" }, "salah")).status).toBe(401);
    expect((await intent({ intent: "EXEC_SHELL" })).status).toBe(400);
    expect((await intent({ intent: "PLAY_MODULE", alias: "ngawur", target: "tv1" })).status).toBe(422);
  });

  it("hello kunci salah → error + ditutup", async () => {
    const nakal = new FakeClient("nakal", "teacher", ["tv1"]);
    const m = await nakal.connect("salah");
    expect(m.kind).toBe("error");
    await new Promise<void>((res) => nakal.ws.once("close", () => res()));
  });
});

describe("login murid (§8 subset)", () => {
  it("options tanpa kunci → 401; dengan kunci → daftar cohort", async () => {
    expect((await fetch(`${BASE}/api/login/options`)).status).toBe(401);
    const r = await fetch(`${BASE}/api/login/options`, { headers: { "x-room-key": KEY } });
    const j = (await r.json()) as { students: unknown[]; seats: unknown[] };
    expect(j.students).toHaveLength(2);
    expect(j.seats).toHaveLength(20);
  });

  it("login KETIK NAMA → komp3 terikat; ketik ulang = ganti nama (+note)", async () => {
    const ok = await fetch(`${BASE}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room_key: KEY, nama: "Cinta", seat_id: "komp3" }),
    });
    expect(ok.status).toBe(200);

    const ganti = await fetch(`${BASE}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room_key: KEY, nama: "Citra", seat_id: "komp3" }),
    });
    expect(ganti.status).toBe(200);
    const j = (await ganti.json()) as { note?: string };
    expect(j.note).toMatch(/menggantikan "Cinta"/);

    const s = await stateNow();
    expect(s.bindings).toEqual([
      expect.objectContaining({ seat_id: "komp3", nama: "Citra" }),
    ]);
  });

  it("nama tidak valid → 409; tanpa nama & student_id → 409", async () => {
    const buruk = await fetch(`${BASE}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room_key: KEY, nama: "<b>x</b>", seat_id: "komp3" }),
    });
    expect(buruk.status).toBe(409);
    const kosong = await fetch(`${BASE}/api/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room_key: KEY, seat_id: "komp3" }),
    });
    expect(kosong.status).toBe(409);
  });
});

describe("jalur cue student (komp3 = Citra)", () => {
  it("student connect", async () => {
    const m = await student.connect();
    expect(m.kind).toBe("hello_ok");
  });

  it("SAPA komp3 → student menerima OVERLAY_GREET bernama; teacher TIDAK", async () => {
    await intent({ intent: "SAPA", target: "komp3" });
    const cue = CueSchema.parse((await student.next((x) => x.kind === "cue")).cue);
    expect(cue.type).toBe("OVERLAY_GREET");
    expect(cue.payload.title).toBe("Halo, Citra!");
    await new Promise((r) => setTimeout(r, 150));
    expect(teacher.inbox.filter((m) => m.kind === "cue")).toHaveLength(0);
  });

  it("GLOW all_student → student menerima preset", async () => {
    await intent({ intent: "GLOW", target: "all_student", preset: "wave", duration_ms: 3000 });
    const cue = CueSchema.parse((await student.next((x) => x.kind === "cue")).cue);
    expect(cue.type).toBe("GLOW");
    expect(cue.payload).toEqual({ preset: "wave", duration_ms: 3000 });
  });

  it("PLAY di komp3 → student menerima materi; posisi Torang TIDAK berubah", async () => {
    await intent({ intent: "PLAY_MODULE", alias: "tes", target: "komp3" });
    const cue = CueSchema.parse((await student.next((x) => x.kind === "cue")).cue);
    expect(cue.type).toBe("PLAY_VIDEO");
    expect(cue.asset).toBe("m99_materi_tes");
    expect((await stateNow()).show.screen).toBeNull(); // bukan "nyelem" (fase 2)
  });

  it("STOP → teacher DAN student menerima", async () => {
    await intent({ intent: "STOP" });
    const t = CueSchema.parse((await teacher.next((x) => x.kind === "cue")).cue);
    const s = CueSchema.parse((await student.next((x) => x.kind === "cue")).cue);
    expect(t.type).toBe("STOP");
    expect(s.type).toBe("STOP");
  });
});

describe("reset roster (kelas baru)", () => {
  it("reset kunci salah → 401; kunci benar → semua binding lepas", async () => {
    const tolak = await fetch(`${BASE}/api/roster/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room_key: "salah" }),
    });
    expect(tolak.status).toBe(401);
    expect((await stateNow()).bindings.length).toBeGreaterThan(0);

    const ok = await fetch(`${BASE}/api/roster/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ room_key: KEY }),
    });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { removed: number }).removed).toBeGreaterThan(0);
    expect((await stateNow()).bindings).toHaveLength(0);
  });
});
