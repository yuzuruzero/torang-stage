/**
 * Protokol Panggung Torang — kontrak pesan antara cloud (stage.torang.ai),
 * app teacher, app student, dan panel.
 *
 * Sumber kebenaran: panggung-torang-MASTER-programmer.md §4 (protokol cue),
 * §5 (grammar → intent), §6 (manifest).
 *
 * PRINSIP KEAMANAN (jangan dilanggar):
 * - Validasi DUA SISI: cloud memvalidasi semua input; klien MEMVALIDASI ULANG
 *   setiap cue yang datang (whitelist type + target) dan MENOLAK yang tidak
 *   dikenal. Klien tidak pernah mengeksekusi perintah mentah.
 * - Tidak ada cue yang membaca/mengendalikan isi komputer murid. Cue hanya
 *   memutar konten/efek di dalam app.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Konstanta panggung
// ---------------------------------------------------------------------------

/** Cue selalu dijadwalkan ~1.5 dtk di depan supaya endpoint sempat pre-load. */
export const LEAD_MS = 1500;

/** Jeda default antara akhir klip exit dan awal klip enter saat MOVE_CHARACTER. */
export const MOVE_OVERLAP_MS = 300;

/** Deviasi jam komp murid di atas ambang ini → tanda merah di panel (master §7). */
export const CLOCK_WARN_MS = 250;

// ---------------------------------------------------------------------------
// Target & arah
// ---------------------------------------------------------------------------

export const TV_TARGETS = ["tv1", "tv2", "tv3", "tv4"] as const;
export const KOMP_TARGETS = Array.from({ length: 20 }, (_, i) => `komp${i + 1}`);

/** Target konkret = satu endpoint/window; target grup = all_tv / all_student. */
export const TargetSchema = z
  .string()
  .regex(
    /^(tv[1-4]|komp([1-9]|1[0-9]|20)|teacher|all_tv|all_student)$/,
    "target tidak dikenal"
  );
export type Target = z.infer<typeof TargetSchema>;

export const DirectionSchema = z.enum(["left", "right"]);
export type Direction = z.infer<typeof DirectionSchema>;

export function oppositeDirection(d: Direction): Direction {
  return d === "left" ? "right" : "left";
}

/** Ekspansi target grup → daftar target konkret (urutan stabil). */
export function expandTargets(targets: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of targets) {
    if (t === "all_tv") out.push(...TV_TARGETS);
    else if (t === "all_student") out.push(...KOMP_TARGETS);
    else out.push(t);
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// Cue (master §4)
// ---------------------------------------------------------------------------

export const CueTypeSchema = z.enum([
  "PLAY_VIDEO",
  "MOVE_CHARACTER", // di wire, cloud MENGURAI move jadi cue exit+enter (PLAY_VIDEO); tipe ini disediakan untuk kompatibilitas & panel
  "SWITCH_SCENE",
  "OVERLAY_KNOCK",
  "OVERLAY_GREET",
  "SFX",
  "GLOW",
  "STOP",
  "GO",
]);
export type CueType = z.infer<typeof CueTypeSchema>;

export const SessionRefSchema = z.object({
  branch: z.string().min(1),
  room: z.string().min(1),
  cohort: z.string().optional(),
});
export type SessionRef = z.infer<typeof SessionRefSchema>;

const IsoDate = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "start_at bukan tanggal ISO valid");

export const CueSchema = z.object({
  cue_id: z.string().min(1),
  type: CueTypeSchema,
  targets: z.array(TargetSchema).min(1),
  asset: z.string().optional(),
  enter_from: DirectionSchema.nullish(),
  exit_to: DirectionSchema.nullish(),
  /** Waktu mulai absolut (ISO, jam server). Endpoint pre-load lalu mulai serentak. */
  start_at: IsoDate,
  audio: z
    .object({
      /** Semua audio diputar mesin guru → PA (keputusan #5). */
      play_on: z.literal("teacher"),
      asset: z.string().min(1),
    })
    .optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  session: SessionRefSchema,
});
export type Cue = z.infer<typeof CueSchema>;

/** Isi payload yang dipahami renderer scene (subset — field lain diabaikan). */
export type ScenePayload = {
  /** Peran klip dalam koreografi: exit meninggalkan layar, enter memasuki. */
  role?: "exit" | "enter" | "materi";
  /** Setelah klip ini selesai, putar aset ini (mis. enter → idle loop). */
  then_asset?: string;
  /** Loop aset then_asset? (idle = ya) */
  then_loop?: boolean;
  /** REPLAY: transisi di-CUT — langsung materi tanpa enter/exit (grammar "ulang"). */
  cut?: boolean;
};

// ---------------------------------------------------------------------------
// Intent (panel/hotkey/voice → cloud). Grammar §5 memetakan ke sini.
// ---------------------------------------------------------------------------

export const IntentSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("PLAY_MODULE"),
    /** Alias pendek resmi dari manifest (kosakata parser). */
    alias: z.string().min(1),
    target: TargetSchema,
  }),
  z.object({ intent: z.literal("MOVE"), to: TargetSchema }),
  z.object({ intent: z.literal("STOP") }),
  z.object({ intent: z.literal("GO") }),
  z.object({ intent: z.literal("REPLAY") }),
]);
export type Intent = z.infer<typeof IntentSchema>;

// ---------------------------------------------------------------------------
// Pesan WS klien → server
// ---------------------------------------------------------------------------

export const RoleSchema = z.enum(["teacher", "student", "panel"]);
export type Role = z.infer<typeof RoleSchema>;

export const HelloSchema = z.object({
  kind: z.literal("hello"),
  role: RoleSchema,
  /** ID endpoint stabil, mis. "teacher-1" / "komp3". */
  endpoint_id: z.string().min(1),
  branch: z.string().min(1),
  room: z.string().min(1),
  /** Kunci ruangan (auth sederhana fase 1; kebijakan join_key per-batch = open item tim). */
  room_key: z.string().min(1),
  version: z.string().min(1),
  /** Target yang DILAYANI endpoint ini (teacher: tv1..tv4 + teacher). */
  targets: z.array(TargetSchema).min(1),
});
export type Hello = z.infer<typeof HelloSchema>;

export const AckStatusSchema = z.enum([
  "received",
  "scheduled",
  "played",
  "rejected", // gagal validasi whitelist di klien
  "error",
]);

export const AckSchema = z.object({
  kind: z.literal("ack"),
  cue_id: z.string().min(1),
  endpoint_id: z.string().min(1),
  status: AckStatusSchema,
  detail: z.string().optional(),
  will_play_at: z.number().optional(),
});
export type Ack = z.infer<typeof AckSchema>;

export const PingSchema = z.object({
  kind: z.literal("ping"),
  /** epoch ms klien saat kirim — untuk taksiran offset jam. */
  t0: z.number(),
  /** Taksiran offset jam klien vs server (ms) dari pengukuran sebelumnya. */
  offset_ms: z.number().optional(),
});

export const ClientMsgSchema = z.discriminatedUnion("kind", [
  HelloSchema,
  AckSchema,
  PingSchema,
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

// ---------------------------------------------------------------------------
// Pesan WS server → klien
// ---------------------------------------------------------------------------

export const HelloOkSchema = z.object({
  kind: z.literal("hello_ok"),
  server_now: z.number(),
  lead_ms: z.number(),
  session: SessionRefSchema,
});

export const CueMsgSchema = z.object({
  kind: z.literal("cue"),
  cue: CueSchema,
  server_now: z.number(),
});

export const PongSchema = z.object({
  kind: z.literal("pong"),
  t0: z.number(),
  server_now: z.number(),
});

export const ServerErrorSchema = z.object({
  kind: z.literal("error"),
  message: z.string(),
});

/** Snapshot status untuk panel (guru & web). */
export const EndpointInfoSchema = z.object({
  endpoint_id: z.string(),
  role: RoleSchema,
  targets: z.array(z.string()),
  online: z.boolean(),
  last_seen: z.number(),
  clock_offset_ms: z.number().nullable(),
  version: z.string(),
});

export const StateMsgSchema = z.object({
  kind: z.literal("state"),
  server_now: z.number(),
  show: z.object({
    screen: z.string().nullable(),
    last_dir: DirectionSchema.nullable(),
  }),
  endpoints: z.array(EndpointInfoSchema),
  rundown: z.object({
    steps: z.array(z.string()),
    pointer: z.number(),
  }),
  recent_cues: z.array(
    z.object({
      cue_id: z.string(),
      type: z.string(),
      targets: z.array(z.string()),
      asset: z.string().nullable(),
      start_at: z.string(),
      acks: z.array(
        z.object({
          endpoint_id: z.string(),
          status: AckStatusSchema,
          detail: z.string().optional(),
        })
      ),
    })
  ),
});
export type StateMsg = z.infer<typeof StateMsgSchema>;

export const ServerMsgSchema = z.discriminatedUnion("kind", [
  HelloOkSchema,
  CueMsgSchema,
  PongSchema,
  ServerErrorSchema,
  StateMsgSchema,
]);
export type ServerMsg = z.infer<typeof ServerMsgSchema>;

// ---------------------------------------------------------------------------
// Manifest konten (master §6) — sumber kosakata parser & metadata aset
// ---------------------------------------------------------------------------

export const AssetJenisSchema = z.enum([
  "materi",
  "enter_l",
  "enter_r",
  "exit_l",
  "exit_r",
  "idle",
  "knock",
]);
export type AssetJenis = z.infer<typeof AssetJenisSchema>;

export const ManifestAssetSchema = z.object({
  /** Nama file sesuai kontrak: m{modul}_{jenis}_{slug}.mp4 */
  file: z.string().min(1),
  jenis: AssetJenisSchema,
  duration_ms: z.number().positive(),
  sha256: z.string().optional(),
});

export const ManifestAudioSchema = z.object({
  /** {asset}_audio.m4a — diputar mesin guru → PA */
  file: z.string().min(1),
  for_jenis: AssetJenisSchema,
  duration_ms: z.number().positive(),
  sha256: z.string().optional(),
});

export const ManifestModuleSchema = z.object({
  id: z.string().regex(/^m\d+$/, "id modul: m<angka>"),
  /** Alias pendek resmi — kosakata voice/hotkey, tercetak di rundown guru. */
  alias: z.string().min(1),
  slug: z.string().min(1),
  presenter: z.string().min(1), // "torang" | "ahli-{nama}"
  energy: z.string().optional(),
  assets: z.array(ManifestAssetSchema).min(1),
  audio: z.array(ManifestAudioSchema).default([]),
});

export const ManifestSchema = z.object({
  manifest_version: z.number(),
  release: z.string(),
  modules: z.array(ManifestModuleSchema).min(1),
});
export type Manifest = z.infer<typeof ManifestSchema>;
export type ManifestModule = z.infer<typeof ManifestModuleSchema>;

/** Nama aset kanonik (tanpa ekstensi) — dipakai di field `asset` cue. */
export function assetName(mod: ManifestModule, jenis: AssetJenis): string {
  return `${mod.id}_${jenis}_${mod.slug}`;
}

export function findModuleByAlias(
  manifest: Manifest,
  alias: string
): ManifestModule | undefined {
  const a = alias.trim().toLowerCase();
  return manifest.modules.find(
    (m) => m.alias.toLowerCase() === a || m.id === a
  );
}

export function findAsset(mod: ManifestModule, jenis: AssetJenis) {
  return mod.assets.find((x) => x.jenis === jenis);
}

export function findAudioFor(mod: ManifestModule, jenis: AssetJenis) {
  return mod.audio.find((x) => x.for_jenis === jenis);
}
