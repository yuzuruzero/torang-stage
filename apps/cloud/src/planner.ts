/**
 * Planner: menerjemahkan INTENT (dari hotkey/panel/voice) menjadi bundle CUE
 * konkret + show-state baru. Fungsi murni — mudah diuji.
 *
 * MOVE_CHARACTER diurai di sini menjadi cue exit di layar asal + cue enter di
 * layar tujuan dengan offset dari durasi klip exit (master §3.3: "MOVE_CHARACTER
 * = kombinasi otomatis exit di window asal + enter+materi di window tujuan").
 */
import {
  assetName,
  findAsset,
  findAudioFor,
  findModuleByAlias,
  oppositeDirection,
  type AssetJenis,
  type Cue,
  type Manifest,
  type ManifestModule,
  type SessionRef,
} from "@torang/shared";
import {
  resolveDirection,
  type RoomGeometry,
  type ShowState,
} from "./show-state.js";

export interface PlanContext {
  manifest: Manifest;
  geometry: RoomGeometry;
  state: ShowState;
  session: SessionRef;
  /** epoch ms "sekarang" menurut jam server (disuntik supaya bisa diuji). */
  now: number;
  leadMs: number;
  overlapMs: number;
  /** Generator cue_id berurutan. */
  seq: () => string;
}

export interface Plan {
  cues: Cue[];
  state: ShowState;
  /** Catatan manusiawi untuk log/panel (mis. fallback yang dipakai). */
  note?: string;
}

export class PlanError extends Error {}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function requireAsset(mod: ManifestModule, jenis: AssetJenis) {
  const a = findAsset(mod, jenis);
  if (!a) {
    throw new PlanError(
      `modul ${mod.id} (${mod.alias}) tidak punya klip '${jenis}' di manifest`
    );
  }
  return a;
}

function activeOrFallbackModule(ctx: PlanContext): {
  mod: ManifestModule;
  note?: string;
} {
  if (ctx.state.activeModule) {
    const mod = findModuleByAlias(ctx.manifest, ctx.state.activeModule);
    if (mod) return { mod };
  }
  const mod = ctx.manifest.modules[0];
  if (!mod) throw new PlanError("manifest kosong — tidak ada modul");
  return {
    mod,
    note: `tidak ada modul aktif; memakai klip modul ${mod.id} (${mod.alias})`,
  };
}

/** "Torang, puter video {alias} di {target}" */
export function planPlayModule(
  ctx: PlanContext,
  alias: string,
  target: string
): Plan {
  const mod = findModuleByAlias(ctx.manifest, alias);
  if (!mod) {
    throw new PlanError(
      `alias modul tidak dikenal: "${alias}" (kosakata dari manifest)`
    );
  }
  const materi = requireAsset(mod, "materi");
  const audio = findAudioFor(mod, "materi");
  const startAt = ctx.now + ctx.leadMs;

  const cue: Cue = {
    cue_id: ctx.seq(),
    type: "PLAY_VIDEO",
    targets: [target],
    asset: assetName(mod, "materi"),
    enter_from: null,
    exit_to: null,
    start_at: iso(startAt),
    ...(audio
      ? { audio: { play_on: "teacher" as const, asset: audio.file } }
      : {}),
    payload: { role: "materi", duration_ms: materi.duration_ms },
    session: ctx.session,
  };

  // Hanya target TV yang memindahkan "posisi Torang" di show-state.
  // Materi ke komp murid = konten dikirim (jendela sopan), BUKAN pindah
  // karakter — pindah karakter ke komp (W11 "nyelem") datang di fase 2.
  const movesCharacter = target.startsWith("tv");
  return {
    cues: [cue],
    state: movesCharacter
      ? { screen: target, lastDir: null, activeModule: mod.id }
      : { ...ctx.state, activeModule: mod.id },
  };
}

/** "Torang, pindah ke {to}" — arah dihitung otomatis dari show-state. */
export function planMove(ctx: PlanContext, to: string): Plan {
  const { mod, note } = activeOrFallbackModule(ctx);
  const idle = findAsset(mod, "idle");
  const thenPayload = idle
    ? { then_asset: assetName(mod, "idle"), then_loop: true }
    : {};

  // Belum ada di layar mana pun → langsung enter (konvensi: masuk dari kiri).
  if (ctx.state.screen === null) {
    const enter = requireAsset(mod, "enter_l");
    const startAt = ctx.now + ctx.leadMs;
    const cue: Cue = {
      cue_id: ctx.seq(),
      type: "PLAY_VIDEO",
      targets: [to],
      asset: assetName(mod, "enter_l"),
      enter_from: "left",
      exit_to: null,
      start_at: iso(startAt),
      payload: { role: "enter", duration_ms: enter.duration_ms, ...thenPayload },
      session: ctx.session,
    };
    return {
      cues: [cue],
      state: { screen: to, lastDir: "left", activeModule: mod.id },
      note,
    };
  }

  if (ctx.state.screen === to) {
    return { cues: [], state: ctx.state, note: `Torang sudah di ${to}` };
  }

  const from = ctx.state.screen;
  const dir = resolveDirection(ctx.geometry, from, to);
  const enterFrom = oppositeDirection(dir); // HUKUM: exit-kanan ↔ enter-kiri
  const exitJenis: AssetJenis = dir === "right" ? "exit_r" : "exit_l";
  const enterJenis: AssetJenis = enterFrom === "left" ? "enter_l" : "enter_r";

  const exitAsset = requireAsset(mod, exitJenis);
  const enterAsset = requireAsset(mod, enterJenis);

  const tExit = ctx.now + ctx.leadMs;
  const tEnter = tExit + Math.max(0, exitAsset.duration_ms - ctx.overlapMs);

  const exitCue: Cue = {
    cue_id: ctx.seq(),
    type: "PLAY_VIDEO",
    targets: [from],
    asset: assetName(mod, exitJenis),
    enter_from: null,
    exit_to: dir,
    start_at: iso(tExit),
    payload: { role: "exit", duration_ms: exitAsset.duration_ms },
    session: ctx.session,
  };
  const enterCue: Cue = {
    cue_id: ctx.seq(),
    type: "PLAY_VIDEO",
    targets: [to],
    asset: assetName(mod, enterJenis),
    enter_from: enterFrom,
    exit_to: null,
    start_at: iso(tEnter),
    payload: { role: "enter", duration_ms: enterAsset.duration_ms, ...thenPayload },
    session: ctx.session,
  };

  return {
    cues: [exitCue, enterCue],
    state: { screen: to, lastDir: dir, activeModule: mod.id },
    note,
  };
}

/**
 * "Torang, sapa komp lima" — OVERLAY_GREET teks di layar murid.
 * Keputusan #17: TEKS SAJA di komp (tanpa audio komp); nama dari login.
 * `nama` di-resolve pemanggil dari binding kursi (null = belum terikat).
 */
export function planSapa(ctx: PlanContext, target: string, nama: string | null): Plan {
  if (!target.startsWith("komp")) {
    throw new PlanError(`sapa hanya untuk komp murid, bukan ${target}`);
  }
  const cue: Cue = {
    cue_id: ctx.seq(),
    type: "OVERLAY_GREET",
    targets: [target],
    start_at: iso(ctx.now + ctx.leadMs),
    payload: {
      style: "greet",
      title: nama ? `Halo, ${nama}!` : "Halo!",
      subtitle: nama
        ? "Torang menyapa kamu dari panggung"
        : "kursi ini belum terikat nama (login dulu)",
      duration_ms: 6000,
    },
    session: ctx.session,
  };
  return {
    cues: [cue],
    state: ctx.state,
    ...(nama ? {} : { note: `${target} belum login — sapaan generik` }),
  };
}

/** GLOW bingkai layar murid (preset whitelist; W1 memakai ini per kursi). */
export function planGlow(
  ctx: PlanContext,
  target: string,
  preset: string,
  durationMs: number
): Plan {
  if (target.startsWith("tv") || target === "all_tv" || target === "teacher") {
    throw new PlanError(`glow hanya untuk layar murid, bukan ${target}`);
  }
  const cue: Cue = {
    cue_id: ctx.seq(),
    type: "GLOW",
    targets: [target],
    start_at: iso(ctx.now + ctx.leadMs),
    payload: { preset, duration_ms: durationMs },
    session: ctx.session,
  };
  return { cues: [cue], state: ctx.state };
}

/** "Torang, stop" — semua kembali idle. */
export function planStop(ctx: PlanContext): Plan {
  const cue: Cue = {
    cue_id: ctx.seq(),
    type: "STOP",
    targets: ["all_tv", "teacher", "all_student"],
    start_at: iso(ctx.now), // STOP tidak menunggu lead — langsung
    payload: {},
    session: ctx.session,
  };
  return {
    cues: [cue],
    state: { screen: null, lastDir: null, activeModule: ctx.state.activeModule },
  };
}
