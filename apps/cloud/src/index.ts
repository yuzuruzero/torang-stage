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
  PresetTataSchema,
  NamaTataSchema,
  type IntentTunggal,
  type PresetTata,
  type Ack,
  type Cue,
  type Intent,
  type SessionRef,
} from "@torang/shared";
import { loadConfig } from "./config.js";
import { DEFAULT_GEOMETRY, initialShowState, type ShowState } from "./show-state.js";
import {
  PlanError,
  planGlow,
  planMove,
  planPlayModule,
  planSapa,
  planStop,
  type Plan,
  type PlanContext,
  planOpenScene,
  planCloseScene,
  planReopenWindow,
  rencanakanMajemuk,
  rencanakanTahap,
  intentDariTata,
  ringkasIntent,
  type TahapRencana,
} from "./planner.js";
import { Registry } from "./registry.js";
import { Roster } from "./roster.js";
import { z } from "zod";

const cfg = loadConfig();
const session: SessionRef = { branch: cfg.branch, room: cfg.room };

/** Versi cloud (package.json apps/cloud). Panel guru membandingkannya dengan
 *  versi app - cloud lama yang masih jalan setelah update = tanda bahaya. */
const VERSI: string = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
})();

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

// --------------------------------------------------------------------------
// Preset tata layar (berkas JSON; disunting dari panel guru)
// --------------------------------------------------------------------------
const BerkasTataSchema = z.object({ presets: z.array(PresetTataSchema) });

function muatTata(): Map<string, PresetTata> {
  try {
    const mentah = fs.readFileSync(cfg.tataPath, "utf8").replace(/^\uFEFF/, "");
    const b = BerkasTataSchema.parse(JSON.parse(mentah));
    return new Map(b.presets.map((p) => [p.nama, p]));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[cloud] ${cfg.tataPath} tidak terbaca (${(e as Error).message}) — tata layar kosong`);
    }
    return new Map();
  }
}

function simpanTata() {
  const isi = JSON.stringify({ presets: [...tata.values()] }, null, 2) + "\n";
  const sementara = `${cfg.tataPath}.menulis`;
  fs.writeFileSync(sementara, isi, "utf8");
  fs.renameSync(sementara, cfg.tataPath); // tidak pernah meninggalkan berkas setengah jadi
}

/**
 * Periksa preset terhadap manifest & scene SEKARANG. Pesan ditulis untuk guru.
 * Preset tetap boleh disimpan dengan modul yang belum terdaftar? Tidak - lebih
 * baik ketahuan saat menyunting daripada saat menyebut namanya di depan kelas.
 */
function periksaTata(p: PresetTata): string | null {
  let torang = 0;
  for (const [tv, isi] of Object.entries(p.layar)) {
    if (isi.startsWith("modul:")) {
      const mod = manifest.modules.find((m) => m.alias === isi.slice(6));
      if (!mod) return `${tv}: modul "${isi.slice(6)}" tidak ada di manifest`;
      if ((mod.presenter ?? "torang") === "torang") torang++;
    }
    if (isi.startsWith("scene:") && !cfg.scenes.includes(isi.slice(6))) {
      return `${tv}: scene "${isi.slice(6)}" tidak dikenal (yang ada: ${cfg.scenes.join(", ")})`;
    }
  }
  if (torang > 1) return "Torang hanya bisa di satu layar — paling banyak satu modul ber-presenter Torang per tata";
  return null;
}

const tata = muatTata();

/** Kata yang tidak boleh jadi nama tata: akan membuat kalimat ambigu. */
const KATA_TERLARANG_TATA = new Set([
  "dan", "lalu", "habis", "itu", "kemudian", "terus", "setelah",
  "di", "ke", "stop", "lanjut", "ulang", "semua", "layar", "tv", "komp",
]);

let manifest = loadManifest();
const rundown = loadRundown();
let rundownPointer = 0;
const roster = new Roster(cfg.cohortPath, cfg.logDir);

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

/** Materi yang sedang/terakhir tayang per TV - bahan kotak TV di panel. */
const tayangLayar = new Map<string, { alias: string; mulai: number; sampai: number; torang: boolean }>();

/**
 * Antrean kalimat majemuk: tahap yang MENUNGGU tayangan sebelumnya selesai.
 * Hanya satu antrean pada satu waktu - kalimat majemuk / tata baru
 * menggantikannya, STOP & BATAL_ANTREAN mengosongkannya. Perintah tunggal biasa
 * TIDAK mengosongkan antrean (guru boleh menyapa murid sambil menunggu).
 */
interface Antrean {
  kalimat: string;
  sisa: Array<{ intents: IntentTunggal[]; perkiraan: number }>;
  selesaiTerakhir: number;
  timer: NodeJS.Timeout | null;
}
let antrean: Antrean | null = null;
let antreanGalat: { t: number; pesan: string } | null = null;

function kosongkanAntrean(alasan: string) {
  if (!antrean) return;
  if (antrean.timer) clearTimeout(antrean.timer);
  logLine({ t: Date.now(), event: "antrean_dibatalkan", alasan, sisa: antrean.sisa.length });
  antrean = null;
}

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
  for (const rec of records) {
    const c = rec.cue;
    const role = (c.payload as Record<string, unknown>)?.role;
    if (c.type === "STOP") tayangLayar.clear();
    else if (c.type === "SWITCH_SCENE" || role === "exit") {
      for (const t of expandTargets(c.targets)) tayangLayar.delete(t);
    }
  }
  for (const t of plan.tayang ?? []) tayangLayar.set(t.tv, t);
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

/** Perencana satu intent tunggal - dipakai tiap tahap kalimat majemuk. */
function perencanaSatu(ctx: PlanContext, i: IntentTunggal): Plan {
  switch (i.intent) {
    case "PLAY_MODULE": return planPlayModule(ctx, i.alias, i.target);
    case "MOVE": return planMove(ctx, i.to);
    case "OPEN_SCENE": return planOpenScene(ctx, i.scene, i.target);
    case "CLOSE_SCENE": return planCloseScene(ctx, i.target);
    case "SAPA": {
      const b = roster.bindingBySeat(i.target);
      return planSapa(ctx, i.target, b?.nama ?? null);
    }
    case "GLOW": return planGlow(ctx, i.target, i.preset, i.duration_ms);
    default:
      throw new PlanError(`"${i.intent}" tidak bisa dijalankan sebagai bagian kalimat majemuk`);
  }
}

/**
 * Jalankan kalimat majemuk: seluruh tahap disimulasikan dulu (semua-atau-tidak),
 * tahap pertama dikembalikan untuk langsung dikirim, sisanya masuk antrean.
 */
function mulaiMajemuk(tahap: IntentTunggal[][], kalimat: string): { plan: Plan; note?: string } {
  const rencana: TahapRencana[] = rencanakanMajemuk(planContext(), tahap, perencanaSatu);
  kosongkanAntrean("diganti kalimat majemuk baru");
  antreanGalat = null;
  const [pertama, ...sisa] = rencana;
  if (sisa.length > 0) {
    antrean = {
      kalimat,
      sisa: sisa.map((r) => ({ intents: r.intents, perkiraan: r.mulai })),
      selesaiTerakhir: pertama!.selesai,
      timer: null,
    };
    // Dijadwalkan SETELAH tahap pertama benar-benar dikirim (lihat /api/intent).
    setImmediate(jadwalkanTahapBerikut);
  }
  const note = rencana.length > 1
    ? `${kalimat} — langkah 1 dari ${rencana.length} jalan, sisanya menunggu video selesai`
    : kalimat;
  return { plan: pertama!.plan, note: [note, pertama!.plan.note].filter(Boolean).join("; ") };
}

/** Kirim tahap berikutnya tepat saat tayangan sebelumnya selesai. Direncanakan
 *  ULANG dengan keadaan panggung saat itu; gagal = antrean berhenti + pesan jelas. */
function jadwalkanTahapBerikut() {
  const a = antrean;
  if (!a || a.timer) return;
  const berikut = a.sisa[0];
  if (!berikut) { antrean = null; return; }
  const tunda = Math.max(0, a.selesaiTerakhir - cfg.leadMs - Date.now());
  a.timer = setTimeout(() => {
    if (antrean !== a) return; // sudah diganti / dibatalkan
    a.timer = null;
    a.sisa.shift();
    try {
      const r = rencanakanTahap(planContext(), berikut.intents, perencanaSatu);
      dispatchPlan(r.plan);
      logLine({ t: Date.now(), event: "antrean_tahap", intents: r.intents });
      a.selesaiTerakhir = r.selesai;
      if (a.sisa.length === 0) antrean = null;
      else jadwalkanTahapBerikut();
    } catch (e) {
      const pesan = e instanceof PlanError ? e.message : "kesalahan internal";
      antreanGalat = { t: Date.now(), pesan: `langkah "${berikut.intents.map(ringkasIntent).join(" + ")}" batal: ${pesan}` };
      logLine({ t: Date.now(), event: "antrean_gagal", pesan });
      antrean = null;
    }
  }, tunda);
  a.timer.unref?.();
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
      kosongkanAntrean("STOP");
      const plan = planStop(planContext());
      return { plan };
    }
    case "MAJEMUK": {
      const kalimat = intent.tahap.map((g) => g.map(ringkasIntent).join(" + ")).join(" → lalu ");
      return mulaiMajemuk(intent.tahap, kalimat);
    }
    case "TATA": {
      const preset = tata.get(intent.nama);
      if (!preset) {
        throw new PlanError(
          `tata "${intent.nama}" tidak ada. Tersedia: ${[...tata.keys()].join(", ") || "(belum ada)"}`
        );
      }
      const intents = intentDariTata(preset);
      if (intents.length === 0) {
        return { plan: { cues: [], state: show }, note: `tata "${intent.nama}": semua layar "biarkan"` };
      }
      return mulaiMajemuk([intents], `tata ${intent.nama}`);
    }
    case "BATAL_ANTREAN": {
      const ada = antrean !== null;
      kosongkanAntrean("dibatalkan guru");
      return { plan: { cues: [], state: show }, note: ada ? "antrean dibatalkan" : "tidak ada antrean" };
    }
    case "OPEN_SCENE": {
      const plan = planOpenScene(planContext(), intent.scene, intent.target);
      return { plan };
    }
    case "CLOSE_SCENE": {
      const plan = planCloseScene(planContext(), intent.target);
      return { plan };
    }
    case "REOPEN_WINDOW": {
      const plan = planReopenWindow(planContext(), intent.target);
      return { plan };
    }
    case "SAPA": {
      const binding = roster.bindingBySeat(intent.target);
      const plan = planSapa(planContext(), intent.target, binding?.nama ?? null);
      return { plan };
    }
    case "GLOW": {
      const plan = planGlow(
        planContext(),
        intent.target,
        intent.preset,
        intent.duration_ms
      );
      return { plan };
    }
    case "LOMPAT_RUNDOWN": {
      if (intent.ke >= rundown.steps.length) {
        throw new PlanError(`rundown cuma punya ${rundown.steps.length} langkah`);
      }
      rundownPointer = intent.ke;
      const inner = executeIntent({ intent: "GO" });
      return { plan: inner.plan, note: `lompat ${inner.note ?? ""}`.trim() };
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
      let audioUlang: Cue["audio"] = src.audio;
      if (payload.role === "enter" && typeof payload.then_asset === "string") {
        // CUT transisi: langsung tampil di keadaan akhir (idle di layar tujuan).
        asset = payload.then_asset;
        payload.role = "materi";
        // Enter yang membawa MATERI (puter ke layar lain, 24 Sep): suaranya
        // tadinya dijadwalkan terpisah, jadi pasangkan lagi di sini.
        if (typeof payload.materi_audio === "string") {
          audioUlang = { play_on: "teacher" as const, asset: payload.materi_audio };
          if (typeof payload.then_duration_ms === "number") payload.duration_ms = payload.then_duration_ms;
        }
        delete payload.then_asset;
        delete payload.then_loop;
        delete payload.then_duration_ms;
        delete payload.materi_audio;
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
        ...(audioUlang ? { audio: audioUlang } : {}),
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
  show: {
    screen: show.screen,
    last_dir: show.lastDir,
    active_module: show.activeModule,
    scenes: show.scenes,
  },
  bindings: roster.list().map((b) => ({
    seat_id: b.seat_id,
    nama: b.nama,
    student_id: b.student_id,
    ts: b.ts,
  })),
  endpoints: registry.info(),
  layar: DEFAULT_GEOMETRY.ring.map((tv) => {
    const t = tayangLayar.get(tv);
    const now = Date.now();
    return {
      tv,
      torang: show.screen === tv,
      scene: show.scenes[tv] ?? null,
      materi: t && t.sampai > now ? { alias: t.alias, mulai: t.mulai, sampai: t.sampai, torang: t.torang } : null,
    };
  }),
  antrean: antrean
    ? {
        kalimat: antrean.kalimat,
        langkah: antrean.sisa.map((x) => ({ ringkas: x.intents.map(ringkasIntent).join(" + "), perkiraan: x.perkiraan })),
        mulai_berikut: antrean.selesaiTerakhir,
      }
    : null,
  antrean_galat: antreanGalat,
  modul: manifest.modules.map((m) => ({ alias: m.alias, presenter: m.presenter ?? "torang" })),
  scenes_dikenal: cfg.scenes,
  tata: [...tata.values()],
  versi: VERSI,
  batch: roster.cohort.cohort,
  konten: manifest.release,
  rundown: {
    name: rundown.name,
    steps: rundown.steps.map((s) => s.label),
    pointer: rundownPointer,
    // Untuk kolom rundown di panel guru: ringkasan intent + presenter tiap langkah.
    langkah: rundown.steps.map((s) => {
      const i = s.intent as Record<string, unknown>;
      const mod = typeof i.alias === "string" ? manifest.modules.find((m) => m.alias === i.alias) : undefined;
      return {
        label: s.label,
        ringkas: i.intent === "MAJEMUK" || i.intent === "TATA" || i.intent === "LOMPAT_RUNDOWN"
          ? String(i.intent === "TATA" ? `tata ${i.nama}` : String(i.intent).toLowerCase())
          : ringkasIntent(s.intent as IntentTunggal),
        presenter: mod ? (mod.presenter ?? "torang") : null,
      };
    }),
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

/** Kosakata parser (§5-§6: manifest = sumber kosakata). GET terbuka seperti
 *  /api/state — dipakai jembatan OpenClaw & panel untuk validasi lokal. */
app.get("/api/vocab", async () => ({
  ok: true,
  actions: ["puter", "tampilkan", "pindah", "lanjut", "ulang", "stop", "sapa", "glow", "buka", "tutup", "buka-window", "tata"],
  aliases: manifest.modules.map((m) => ({ alias: m.alias, module_id: m.id, presenter: m.presenter ?? "torang" })),
  scenes: cfg.scenes,
  tata: [...tata.keys()],
  targets: {
    tv: ["tv1", "tv2", "tv3", "tv4"],
    komp: Array.from({ length: 20 }, (_, i) => `komp${i + 1}`),
    groups: ["all_tv", "all_student"],
  },
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

// --------------------------------------------------------------------------
// Tata layar: baca / simpan / hapus preset (dari panel guru)
// --------------------------------------------------------------------------
app.get("/api/tata", async () => ({ ok: true, presets: [...tata.values()], scenes: cfg.scenes }));

app.post("/api/tata", async (req, reply) => {
  const body = z.object({ room_key: z.string(), preset: PresetTataSchema }).safeParse(req.body);
  if (!body.success) {
    return reply.code(400).send({ ok: false, error: body.error.issues.map((i) => i.message).join("; ") });
  }
  if (!keyOk(body.data.room_key)) return reply.code(401).send({ ok: false, error: "room_key salah" });
  const salah = periksaTata(body.data.preset);
  if (salah) return reply.code(422).send({ ok: false, error: salah });
  if (body.data.preset.nama.split(" ").some((k) => KATA_TERLARANG_TATA.has(k))) {
    return reply.code(422).send({ ok: false, error: `nama tata tidak boleh memakai kata perintah/penghubung (${[...KATA_TERLARANG_TATA].join(", ")})` });
  }
  tata.set(body.data.preset.nama, body.data.preset);
  simpanTata();
  logLine({ t: Date.now(), event: "tata_disimpan", preset: body.data.preset });
  return { ok: true, presets: [...tata.values()] };
});

app.post("/api/tata/hapus", async (req, reply) => {
  const body = z.object({ room_key: z.string(), nama: NamaTataSchema }).safeParse(req.body);
  if (!body.success) return reply.code(400).send({ ok: false, error: "body tidak valid" });
  if (!keyOk(body.data.room_key)) return reply.code(401).send({ ok: false, error: "room_key salah" });
  const ada = tata.delete(body.data.nama);
  if (ada) {
    simpanTata();
    logLine({ t: Date.now(), event: "tata_dihapus", nama: body.data.nama });
  }
  return { ok: true, dihapus: ada, presets: [...tata.values()] };
});

// --------------------------------------------------------------------------
// Login sederhana (§8 subset): daftar cohort + klaim kursi
// --------------------------------------------------------------------------
app.get("/api/login/options", async (req, reply) => {
  if (!keyOk(req.headers["x-room-key"])) {
    return reply.code(401).send({ ok: false, error: "room_key salah" });
  }
  return { ok: true, ...roster.loginOptions() };
});

const LoginBody = z.object({
  room_key: z.string(),
  seat_id: z.string().min(1),
  /** Jalur utama: murid MENGETIK nama sendiri (keputusan #14). */
  nama: z.string().min(1).optional(),
  /** Jalur daftar cohort (slot e-learning kelak). */
  student_id: z.string().min(1).optional(),
});

app.post("/api/login", async (req, reply) => {
  const body = LoginBody.safeParse(req.body);
  if (!body.success) {
    return reply.code(400).send({ ok: false, error: "body tidak valid" });
  }
  if (!keyOk(body.data.room_key)) {
    return reply.code(401).send({ ok: false, error: "room_key salah" });
  }
  const res = body.data.nama
    ? roster.loginByName(body.data.nama, body.data.seat_id)
    : body.data.student_id
      ? roster.login(body.data.student_id, body.data.seat_id)
      : ({ ok: false, error: "isi nama (atau student_id)" } as const);
  if (!res.ok) return reply.code(409).send({ ok: false, error: res.error });
  logLine({ t: Date.now(), event: "login", binding: res.binding });
  return {
    ok: true,
    binding: res.binding,
    session,
    ...("note" in res && res.note ? { note: res.note } : {}),
  };
});

app.post("/api/roster/reset", async (req, reply) => {
  const body = z.object({ room_key: z.string() }).safeParse(req.body);
  if (!body.success || !keyOk(body.data.room_key)) {
    return reply.code(401).send({ ok: false, error: "room_key salah" });
  }
  const n = roster.resetAll();
  logLine({ t: Date.now(), event: "roster_reset", removed: n });
  return { ok: true, removed: n };
});

app.post("/api/unbind", async (req, reply) => {
  const body = z
    .object({ room_key: z.string(), seat_id: z.string().min(1) })
    .safeParse(req.body);
  if (!body.success || !keyOk(body.data.room_key)) {
    return reply.code(401).send({ ok: false, error: "room_key salah" });
  }
  const had = roster.unbind(body.data.seat_id);
  logLine({ t: Date.now(), event: "unbind", seat: body.data.seat_id });
  return { ok: true, removed: had };
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
  console.log(`[cloud] Panggung Torang cloud v${VERSI} — panel: ${addr}/panel  ws: ws://${cfg.host}:${cfg.port}/ws`);
  console.log(`[cloud] manifest: ${manifest.release} (${manifest.modules.length} modul) · rundown: ${rundown.name}`);
  return addr;
}

export async function stop(): Promise<void> {
  kosongkanAntrean("cloud berhenti");
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
