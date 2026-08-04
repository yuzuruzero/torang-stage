/**
 * E2E jalur cue TANPA Electron: server cloud sungguhan + klien WS sungguhan.
 * Menguji: hello+auth → intent REST → cue terkirim tepat sasaran & terjadwal
 * → ACK masuk state → MOVE menghasilkan exit/enter berarah benar → auth salah
 * ditolak.
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

type Received = { kind: string; [k: string]: unknown };

class FakeTeacher {
  ws!: WebSocket;
  inbox: Received[] = [];
  waiters: Array<{ pred: (m: Received) => boolean; res: (m: Received) => void }> = [];

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
        role: "teacher",
        endpoint_id: "teacher-1",
        branch: "dev",
        room: "r1",
        room_key: key,
        version: "e2e",
        targets: ["tv1", "tv2", "tv3", "tv4", "teacher"],
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
      const t = setTimeout(() => rej(new Error("timeout menunggu pesan")), timeoutMs);
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
    this.ws.send(
      JSON.stringify({ kind: "ack", cue_id, endpoint_id: "teacher-1", status })
    );
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

beforeAll(async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "torang-e2e-"));
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  writeFileSync(path.join(dir, "rundown.json"), JSON.stringify(rundown));
  process.env.TORANG_NO_AUTOSTART = "1";
  process.env.TORANG_PORT = String(PORT);
  process.env.TORANG_ROOM_KEY = KEY;
  process.env.TORANG_MANIFEST = path.join(dir, "manifest.json");
  process.env.TORANG_RUNDOWN = path.join(dir, "rundown.json");
  process.env.TORANG_LOG_DIR = path.join(dir, "logs");
  mod = await import("../src/index.js");
  await mod.start();
});

afterAll(async () => {
  await mod.stop();
});

describe("jalur cue end-to-end (tanpa Electron)", () => {
  const teacher = new FakeTeacher();

  it("hello dengan kunci benar → hello_ok", async () => {
    const m = await teacher.connect();
    expect(m.kind).toBe("hello_ok");
    expect(typeof m.server_now).toBe("number");
  });

  it("PLAY_MODULE → teacher menerima cue valid, terjadwal ~T+1.5s", async () => {
    const before = Date.now();
    const r = await intent({ intent: "PLAY_MODULE", alias: "tes", target: "tv1" });
    expect(r.status).toBe(200);
    const m = await teacher.next((x) => x.kind === "cue");
    const cue = CueSchema.parse(m.cue);
    expect(cue.type).toBe("PLAY_VIDEO");
    expect(cue.targets).toEqual(["tv1"]);
    expect(cue.asset).toBe("m99_materi_tes");
    const dt = Date.parse(cue.start_at) - before;
    expect(dt).toBeGreaterThan(1000);
    expect(dt).toBeLessThan(2500);

    teacher.ack(cue.cue_id, "scheduled");
    await new Promise((r2) => setTimeout(r2, 100));
    const state = (await (await fetch(`${BASE}/api/state`)).json()) as {
      show: { screen: string };
      recent_cues: Array<{ cue_id: string; acks: Array<{ status: string }> }>;
    };
    expect(state.show.screen).toBe("tv1");
    const rec = state.recent_cues.find((c) => c.cue_id === cue.cue_id)!;
    expect(rec.acks.some((a) => a.status === "scheduled")).toBe(true);
  });

  it("MOVE tv1→tv3 → dua cue: exit_r di tv1 lalu enter_l di tv3", async () => {
    const r = await intent({ intent: "MOVE", to: "tv3" });
    expect(r.status).toBe(200);
    const m1 = await teacher.next((x) => x.kind === "cue");
    const m2 = await teacher.next((x) => x.kind === "cue");
    const exit = CueSchema.parse(m1.cue);
    const enter = CueSchema.parse(m2.cue);
    expect(exit.asset).toBe("m99_exit_r_tes");
    expect(exit.exit_to).toBe("right");
    expect(enter.asset).toBe("m99_enter_l_tes");
    expect(enter.enter_from).toBe("left");
    expect(Date.parse(enter.start_at)).toBeGreaterThan(Date.parse(exit.start_at));
  });

  it("STOP → cue STOP sampai, show-state kosong", async () => {
    await intent({ intent: "STOP" });
    const m = await teacher.next((x) => x.kind === "cue");
    const cue = CueSchema.parse(m.cue);
    expect(cue.type).toBe("STOP");
    const state = (await (await fetch(`${BASE}/api/state`)).json()) as {
      show: { screen: string | null };
    };
    expect(state.show.screen).toBeNull();
  });

  it("intent dengan room_key salah → 401, tidak ada cue terkirim", async () => {
    const r = await intent({ intent: "STOP" }, "kunci-salah");
    expect(r.status).toBe(401);
  });

  it("intent di luar whitelist → 400", async () => {
    const r = await intent({ intent: "EXEC_SHELL", cmd: "format c:" });
    expect(r.status).toBe(400);
  });

  it("alias tak dikenal → 422 + pesan jelas", async () => {
    const r = await intent({ intent: "PLAY_MODULE", alias: "ngawur", target: "tv1" });
    expect(r.status).toBe(422);
    expect(String(r.json.error)).toMatch(/alias/);
  });

  it("hello dengan kunci salah → ditolak & koneksi ditutup", async () => {
    const nakal = new FakeTeacher();
    const m = await nakal.connect("kunci-salah");
    expect(m.kind).toBe("error");
    await new Promise<void>((res) => nakal.ws.once("close", () => res()));
  });
});
