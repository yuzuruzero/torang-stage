/**
 * Cloud minimal Panggung Torang (fase 1 §14 langkah 1):
 * registry endpoint + WS cue router (start_at terjadwal + ACK) + show-state
 * + panel guru web sederhana.
 *
 * Jalankan: npm run dev:cloud   (default http://127.0.0.1:8787/panel)
 */
import Fastify from "fastify";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { createHash, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ClientMsgSchema,
  CueSchema,
  expandTargets,
  IntentSchema,
  ManifestSchema,
  type Ack,
  type Cue,
  type Intent,
  type SessionRef,
} from "@torang/shared";
import { loadConfig } from "./config.js";
import { DEFAULT_GEOMETRY, initialShowState, type ShowState } from "./show-state.js";
import {
  PlanError,
  planMove,
  planPlayModule,
  planStop,
  type Plan,
  type PlanContext,
} from "./planner.js";
import { Registry } from "./registry.js";
import { z } from "zod";

const cfg = loadConfig();
const session: SessionRef = { branch: cfg.branch, room: cfg.room };

if (cfg.roomKey === "dev-room-key") {
  console.warn(
    "[cloud] PERINGATAN: ROOM_KEY masih default dev. Set TORANG_ROOM_KEY untuk kelas sungguhan."
  );
}

// --------------------------------------------------------------------------
// Muat manifest & rundown
// --------------------------------------------------------------------------
function loadManifest() {
  const raw = fs.readFileSync(cfg.manifestPath, "utf8");
  return ManifestSchema.parse(JSON.parse(raw));
}

const RundownSchema = z.object({
  name: z.string(),
  steps: z
    .array(z.object({ label: z.string(), intent: IntentSchema }))
    .min(1),
});

function loadRundown() {
  const raw = fs.readFileSync(cfg.rundownPath, "utf8");
  return RundownSchema.parse(JSON.parse(raw));
}

let manifest = loadManifest();
const rundown = loadRundown();
let rundownPointer = 0;

// --------------------------------------------------------------------------
// State inti
// --------------------------------------------------------------------------
const registry = new Registry();
let show: ShowState = initialShowState();
let cueSeq = 0;
const bootId = Date.now().toString(36);
const nextCueId = () => `c-${bootId}-${(++cueSeq).toString().padStart(4, "0")}`;

interface CueRecord {
  cue: Cue;
  expected: string[]; // endpoint_id yang diharapkan ACK
  acks: Ack[];
  sent_at: number;
}
const recentCues: CueRecord[] = [];
let lastReplayable: Cue | null = null;

const cueLogPath = path.join(cfg.logDir, "cue-log.jsonl");
function logLine(obj: unknown) {
  fs.appendFile(cueLogPath, JSON.stringify(obj) + "\n", () => {});
}

// --------------------------------------------------------------------------
// Dispatcher: kirim cue ke endpoint yang melayani target
// --------------------------------------------------------------------------
function dispatchPlan(plan: Plan): CueRecord[] {
  const records: CueRecord[] = [];
  for (const cue of plan.cues) {
    // Validasi diri (kontrak dijaga dua sisi).
    const parsed = CueSchema.parse(cue);
    const concrete = expandTargets(parsed.targets);
    const conns = registry.forTargets(concrete);
    const rec: CueRecord = {
      cue: parsed,
      expected: conns.map((c) => c.id),
      acks: [],
      sent_at: Date.now(),
    };
    if (conns.length === 0) {
      rec.acks.push({
        kind: "ack",
        cue_id: parsed.cue_id,
        endpoint_id: "-",
        status: "error",
        detail: `tidak ada endpoint online untuk target [${parsed.targets.join(", ")}]`,
      });
    }
    for (const conn of conns) {
      try {
        conn.ws.send(
          JSON.stringify({ kind: "cue", cue: parsed, server_now: Date.now() })
        );
      } catch (err) {
        rec.acks.push({
          kind: "ack",
          cue_id: parsed.cue_id,
          endpoint_id: conn.id,
          status: "error",
          detail: `gagal kirim: ${(err as Error).message}`,
        });
      }
    }
    recentCues.push(rec);
    if (recentCues.length > 30) recentCues.shift();
    logLine({ t: Date.now(), event: "cue_sent", cue: parsed, expected: rec.expected });

    // Timeout ACK → tandai jelas di panel (gagal harus terlihat, bukan diam).
    setTimeout(() => {
      const missing = rec.expected.filter(
        (id) => !rec.acks.some((a) => a.endpoint_id === id)
      );
      for (const id of missing) {
        rec.acks.push({
          kind: "ack",
          cue_id: rec.cue.cue_id,
          endpoint_id: id,
          status: "error",
          detail: `tanpa ACK ${cfg.ackTimeoutMs} ms`,
        });
        logLine({ t: Date.now(), event: "ack_timeout", cue_id: rec.cue.cue_id, endpoint_id: id });
      }
    }, cfg.ackTimeoutMs).unref?.();

    const role = (parsed.payload as Record<string, unknown>)?.role;
    if (role === "materi" || role === "enter") lastReplayable = parsed;
    records.push(rec);
  }
  show = plan.state;
  if (plan.note) logLine({ t: Date.now(), event: "note", note: plan.note });
  return records;
}

// --------------------------------------------------------------------------
// Eksekusi intent (dipakai REST panel/hotkey; kelak juga jalur voice OpenClaw)
// --------------------------------------------------------------------------
function planContext(): PlanContext {
  return {
    manifest,
    geometry: DEFAULT_GEOMETRY,
    state: show,
    session,
    now: Date.now(),
    leadMs: cfg.leadMs,
    overlapMs: cfg.overlapMs,
    seq: nextCueId,
  };
}

function executeIntent(intent: Intent): { plan: Plan; note?: string } {
  switch (intent.intent) {
    case "PLAY_MODULE": {
      const plan = planPlayModule(planContext(), intent.alias, intent.target);
      return { plan };
    }
    case "MOVE": {
      const plan = planMove(planContext(), intent.to);
      return { plan };
    }
    case "STOP": {
      const plan = planStop(planContext());
      return { plan };
    }
    case "GO": {
      if (rundownPointer >= rundown.steps.length) {
        return {
          plan: { cues: [], state: show },
          note: "rundown selesai — reset dulu dari panel",
        };
      }
      const step = rundown.steps[rundownPointer]!;
      rundownPointer += 1;
      const inner = executeIntent(step.intent);
      return { plan: inner.plan, note: `GO → ${step.label}` };
    }
    case "REPLAY": {
      if (!lastReplayable) {
        return { plan: { cues: [], state: show }, note: "belum ada cue untuk diulang" };
      }
      // Grammar "ulang": REPLAY cue terakhir, transisi di-CUT.
      const src = lastReplayable;
      const payload = { ...(src.payload as Record<string, unknown>) };
      let asset = src.asset;
      if (payload.role === "enter" && typeof payload.then_asset === "string") {
        // CUT transisi: langsung tampil di keadaan akhir (idle di layar tujuan).
        asset = payload.then_asset;
        payload.role = "materi";
        delete payload.then_asset;
      }
      payload.cut = true;
      const cue: Cue = {
        ...src,
        cue_id: nextCueId(),
        asset,
        enter_from: null,
        exit_to: null,
        start_at: new Date(Date.now() + cfg.leadMs).toISOString(),
        payload,
      };
      const target = src.targets[0] ?? show.screen ?? "tv1";
      return {
        plan: {
          cues: [cue],
          state: { ...show, screen: target },
        },
        note: "REPLAY (transisi di-CUT)",
      };
    }
  }
}

// --------------------------------------------------------------------------
// Auth sederhana fase 1 (kunci ruangan). Kebijakan join_key = open item tim.
// --------------------------------------------------------------------------
function keyOk(given: unknown): boolean {
  if (typeof given !== "string" || given.length === 0) return false;
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(cfg.roomKey).digest();
  return timingSafeEqual(a, b);
}

// --------------------------------------------------------------------------
// HTTP (panel + API)
// --------------------------------------------------------------------------
const app = Fastify({ logger: false });

app.get("/", async (_req, reply) => reply.redirect("/panel"));

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));

app.get("/panel", async (_req, reply) => {
  const html = fs.readFileSync(
    path.join(SRC_DIR, "..", "public", "panel.html"),
    "utf8"
  );
  return reply.type("text/html; charset=utf-8").send(html);
});

app.get("/api/state", async () => ({
  server_now: Date.now(),
  session,
  show: { screen: show.screen, last_dir: show.lastDir, active_module: show.activeModule },
  endpoints: registry.info(),
  rundown: {
    name: rundown.name,
    steps: rundown.steps.map((s) => s.label),
    pointer: rundownPointer,
  },
  recent_cues: [...recentCues]
    .reverse()
    .slice(0, 12)
    .map((r) => ({
      cue_id: r.cue.cue_id,
      type: r.cue.type,
      targets: r.cue.targets,
      asset: r.cue.asset ?? null,
      start_at: r.cue.start_at,
      expected: r.expected,
      acks: r.acks.map((a) => ({
        endpoint_id: a.endpoint_id,
        status: a.status,
        ...(a.detail ? { detail: a.detail } : {}),
      })),
    })),
}));

const IntentBody = z.object({ room_key: z.string(), intent: IntentSchema });

app.post("/api/intent", async (req, reply) => {
  const parsed = IntentBody.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({ ok: false, error: "body tidak valid", detail: parsed.error.issues });
  }
  if (!keyOk(parsed.data.room_key)) {
    return reply.code(401).send({ ok: false, error: "room_key salah" });
  }
  try {
    const { plan, note } = executeIntent(parsed.data.intent);
    const records = dispatchPlan(plan);
    return {
      ok: true,
      note: note ?? plan.note,
      cues: records.map((r) => ({
        cue_id: r.cue.cue_id,
        type: r.cue.type,
        targets: r.cue.targets,
        asset: r.cue.asset,
        start_at: r.cue.start_at,
      })),
    };
  } catch (err) {
    if (err instanceof PlanError) {
      return reply.code(422).send({ ok: false, error: err.message });
    }
    console.error("[cloud] intent gagal:", err);
    return reply.code(500).send({ ok: false, error: "kesalahan internal" });
  }
});

app.post("/api/rundown/reset", async (req, reply) => {
  const body = z.object({ room_key: z.string() }).safeParse(req.body);
  if (!body.success || !keyOk(body.data.room_key)) {
    return reply.code(401).send({ ok: false, error: "room_key salah" });
  }
  rundownPointer = 0;
  return { ok: true };
});

app.post("/api/manifest/reload", async (req, reply) => {
  const body = z.object({ room_key: z.string() }).safeParse(req.body);
  if (!body.success || !keyOk(body.data.room_key)) {
    return reply.code(401).send({ ok: false, error: "room_key salah" });
  }
  manifest = loadManifest();
  return { ok: true, release: manifest.release, modules: manifest.modules.length };
});

// --------------------------------------------------------------------------
// WS: endpoint register (hello) + ACK + ping/pong offset jam
// --------------------------------------------------------------------------
const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws: WebSocket) => {
  let endpointId: string | null = null;
  const helloTimer = setTimeout(() => {
    if (!endpointId) ws.close(4001, "hello timeout");
  }, 5000);

  ws.on("message", (data: RawData) => {
    let msg: unknown;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ kind: "error", message: "bukan JSON" }));
      return;
    }
    const parsed = ClientMsgSchema.safeParse(msg);
    if (!parsed.success) {
      ws.send(JSON.stringify({ kind: "error", message: "pesan tidak dikenal/valid" }));
      return;
    }
    const m = parsed.data;

    if (m.kind === "hello") {
      if (!keyOk(m.room_key)) {
        ws.send(JSON.stringify({ kind: "error", message: "room_key salah" }));
        ws.close(4003, "room_key salah");
        return;
      }
      clearTimeout(helloTimer);
      endpointId = m.endpoint_id;
      registry.upsert(m, ws);
      ws.send(
        JSON.stringify({
          kind: "hello_ok",
          server_now: Date.now(),
          lead_ms: cfg.leadMs,
          session,
        })
      );
      console.log(
        `[cloud] endpoint masuk: ${m.endpoint_id} (${m.role}) melayani [${m.targets.join(", ")}]`
      );
      logLine({ t: Date.now(), event: "endpoint_join", endpoint: m.endpoint_id, role: m.role });
      return;
    }

    if (!endpointId) {
      ws.send(JSON.stringify({ kind: "error", message: "hello dulu" }));
      return;
    }
    registry.touch(endpointId);

    if (m.kind === "ping") {
      if (typeof m.offset_ms === "number") {
        registry.setClockOffset(endpointId, Math.round(m.offset_ms));
      }
      ws.send(JSON.stringify({ kind: "pong", t0: m.t0, server_now: Date.now() }));
      return;
    }

    if (m.kind === "ack") {
      const rec = recentCues.find((r) => r.cue.cue_id === m.cue_id);
      if (rec) {
        // ACK terbaru per endpoint menimpa status sebelumnya (received→scheduled→played)
        const idx = rec.acks.findIndex((a) => a.endpoint_id === m.endpoint_id);
        if (idx >= 0) rec.acks[idx] = m;
        else rec.acks.push(m);
      }
      logLine({ t: Date.now(), event: "ack", ack: m });
      return;
    }
  });

  ws.on("close", () => {
    clearTimeout(helloTimer);
    const gone = registry.removeBySocket(ws);
    if (gone) {
      console.log(`[cloud] endpoint keluar: ${gone.id}`);
      logLine({ t: Date.now(), event: "endpoint_leave", endpoint: gone.id });
    }
  });
});

// --------------------------------------------------------------------------
// Start
// --------------------------------------------------------------------------
export async function start(): Promise<string> {
  await app.listen({ host: cfg.host, port: cfg.port });
  app.server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    } else {
      socket.destroy();
    }
  });
  const addr = `http://${cfg.host}:${cfg.port}`;
  console.log(`[cloud] Panggung Torang cloud minimal — panel: ${addr}/panel  ws: ws://${cfg.host}:${cfg.port}/ws`);
  console.log(`[cloud] manifest: ${manifest.release} (${manifest.modules.length} modul) · rundown: ${rundown.name}`);
  return addr;
}

export async function stop(): Promise<void> {
  for (const c of wss.clients) {
    try {
      c.terminate();
    } catch {
      /* abaikan */
    }
  }
  wss.close();
  await app.close();
}

// Jalankan langsung (bukan saat diimpor test)
if (process.env.TORANG_NO_AUTOSTART !== "1") {
  start().catch((err) => {
    console.error("[cloud] gagal start:", err);
    process.exit(1);
  });
}
