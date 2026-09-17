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
  type Direction,
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

const ARTI_JENIS: Record<string, string> = {
  materi: "klip materi",
  enter_l: "klip masuk-dari-kiri",
  enter_r: "klip masuk-dari-kanan",
  exit_l: "klip keluar-ke-kiri",
  exit_r: "klip keluar-ke-kanan",
  idle: "klip diam",
  knock: "klip ketukan",
};

/**
 * Modul yang klip transisinya boleh dipinjam: `transisi_default` di manifest,
 * atau modul pertama yang kebetulan punya klip itu.
 */
function modulTransisiDefault(
  ctx: PlanContext,
  jenis: AssetJenis
): ManifestModule | undefined {
  const nama = ctx.manifest.transisi_default;
  if (nama) {
    const m = findModuleByAlias(ctx.manifest, nama);
    if (m && findAsset(m, jenis)) return m;
  }
  return ctx.manifest.modules.find((m) => findAsset(m, jenis));
}

/**
 * Klip transisi (enter/exit/idle) untuk sebuah modul: punya sendiri kalau ada,
 * kalau tidak PINJAM dari modul transisi default.
 *
 * Kenapa: video materi baru yang didaftarkan guru cuma punya satu klip. Tanpa
 * peminjaman ini, memutarnya membuat Torang terkunci di satu layar — "sudah
 * tidak ada animasinya, ya sudah, tidak bisa diapa-apakan" (permintaan Hadi,
 * 16 Sep 2026). Nama aset yang dikirim adalah nama aset milik modul PEMBERI,
 * karena berkas itulah yang ada di cache lokal tiap mesin.
 */
function klipTransisi(
  ctx: PlanContext,
  mod: ManifestModule,
  jenis: AssetJenis
): { pemilik: ManifestModule; klip: { duration_ms: number } } | null {
  const sendiri = findAsset(mod, jenis);
  if (sendiri) return { pemilik: mod, klip: sendiri };
  const cadangan = modulTransisiDefault(ctx, jenis);
  if (!cadangan) return null;
  const klip = findAsset(cadangan, jenis);
  return klip ? { pemilik: cadangan, klip } : null;
}

/** Sama dengan klipTransisi tapi melempar kalau tidak ada di mana pun. */
function wajibKlipTransisi(ctx: PlanContext, mod: ManifestModule, jenis: AssetJenis) {
  const hasil = klipTransisi(ctx, mod, jenis);
  if (!hasil) {
    throw new PlanError(
      `tidak ada klip ${ARTI_JENIS[jenis] ?? jenis} di mana pun — modul "${mod.alias}" ` +
        `tidak punya, dan manifest tidak punya modul transisi default. ` +
        `Daftarkan klip standarnya dulu, atau set "transisi_default" di manifest.`
    );
  }
  return hasil;
}

/**
 * Klip yang WAJIB milik modul sendiri — hanya `materi`. Klip transisi tidak
 * lewat sini; itu boleh dipinjam (lihat klipTransisi).
 */
function requireAsset(mod: ManifestModule, jenis: AssetJenis) {
  const a = findAsset(mod, jenis);
  if (!a) {
    throw new PlanError(
      `modul "${mod.alias}" tidak punya ${ARTI_JENIS[jenis] ?? jenis} — ` +
        `daftarkan dulu: torang-modul daftar "<video>" --ke=${mod.alias} --jenis=${jenis}`
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

/**
 * Cue "Torang meninggalkan layar ini". Dipakai saat sebuah perintah memindahkan
 * Torang tanpa lewat `pindah` — kalau tidak, layar lama terus mengulang klip
 * idle dan Torang seolah ada di dua tempat (melanggar HUKUM ilusi kontinu §6).
 *
 * Kalau modul yang aktif punya klip exit, Torang terlihat PERGI (sesuai
 * disiplin arah). Kalau tidak punya (modul yang cuma berklip materi), layar
 * lama sekadar dikembalikan ke idle kosong — lebih baik hilang rapi daripada
 * menggandakan Torang.
 */
function cueTinggalkanLayar(ctx: PlanContext, dari: string, ke: string): Cue {
  const mod = ctx.state.activeModule
    ? findModuleByAlias(ctx.manifest, ctx.state.activeModule)
    : undefined;
  let dir: Direction | null = null;
  try {
    dir = resolveDirection(ctx.geometry, dari, ke);
  } catch {
    dir = null; // tujuan di luar ring (mis. komp murid) — pergi tanpa arah
  }
  const jenisExit: AssetJenis | null = dir === "right" ? "exit_r" : dir === "left" ? "exit_l" : null;
  const pinjam = mod && jenisExit ? klipTransisi(ctx, mod, jenisExit) : null;

  if (jenisExit && pinjam) {
    return {
      cue_id: ctx.seq(),
      type: "PLAY_VIDEO",
      targets: [dari],
      asset: assetName(pinjam.pemilik, jenisExit),
      enter_from: null,
      exit_to: dir,
      start_at: iso(ctx.now + ctx.leadMs),
      payload: { role: "exit", duration_ms: pinjam.klip.duration_ms },
      session: ctx.session,
    };
  }
  // Tanpa klip exit: bersihkan layar itu ke idle kosong (payload scene null =
  // "kembali idle", jalur yang sama dengan `tutup`).
  return {
    cue_id: ctx.seq(),
    type: "SWITCH_SCENE",
    targets: [dari],
    start_at: iso(ctx.now + ctx.leadMs),
    payload: { scene: null },
    session: ctx.session,
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
  if (ctx.state.scenes[target]) {
    throw new PlanError(
      `${target} sedang menampilkan "${ctx.state.scenes[target]}" — tutup dulu ("Torang, tutup ${target}")`
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

  // Torang pindah layar tanpa lewat `pindah`? Layar lama harus ditinggalkan,
  // kalau tidak ia terus mengulang idle dan Torang tampak ada di dua tempat.
  const cues: Cue[] = [];
  if (target.startsWith("tv") && ctx.state.screen && ctx.state.screen !== target) {
    cues.push(cueTinggalkanLayar(ctx, ctx.state.screen, target));
  }
  cues.push(cue);

  // Hanya target TV yang memindahkan "posisi Torang" di show-state.
  // Materi ke komp murid = konten dikirim (jendela sopan), BUKAN pindah
  // karakter — pindah karakter ke komp (W11 "nyelem") datang di fase 2.
  const movesCharacter = target.startsWith("tv");
  return {
    cues,
    state: movesCharacter
      ? { screen: target, lastDir: null, activeModule: mod.id, scenes: ctx.state.scenes }
      : { ...ctx.state, activeModule: mod.id },
  };
}

/** "Torang, pindah ke {to}" — arah dihitung otomatis dari show-state. */
export function planMove(ctx: PlanContext, to: string): Plan {
  const { mod, note } = activeOrFallbackModule(ctx);
  // Idle juga boleh dipinjam — modul materi baru tetap "bernapas" di layar.
  const idle = klipTransisi(ctx, mod, "idle");
  const thenPayload = idle
    ? { then_asset: assetName(idle.pemilik, "idle"), then_loop: true }
    : {};

  // Belum ada di layar mana pun → langsung enter (konvensi: masuk dari kiri).
  if (ctx.state.screen === null) {
    if (ctx.state.scenes[to]) {
      throw new PlanError(
        `${to} sedang menampilkan "${ctx.state.scenes[to]}" — tutup dulu ("Torang, tutup ${to}")`
      );
    }
    const enter = wajibKlipTransisi(ctx, mod, "enter_l");
    const startAt = ctx.now + ctx.leadMs;
    const cue: Cue = {
      cue_id: ctx.seq(),
      type: "PLAY_VIDEO",
      targets: [to],
      asset: assetName(enter.pemilik, "enter_l"),
      enter_from: "left",
      exit_to: null,
      start_at: iso(startAt),
      payload: { role: "enter", duration_ms: enter.klip.duration_ms, ...thenPayload },
      session: ctx.session,
    };
    return {
      cues: [cue],
      state: { screen: to, lastDir: "left", activeModule: mod.id, scenes: ctx.state.scenes },
      note,
    };
  }

  if (ctx.state.screen === to) {
    return { cues: [], state: ctx.state, note: `Torang sudah di ${to}` };
  }

  // TV yang sedang menampilkan scene keluar dari cincin — jangan pernah
  // menimpanya dengan video (keputusan 16 Sep 2026).
  if (ctx.state.scenes[to]) {
    throw new PlanError(
      `${to} sedang menampilkan "${ctx.state.scenes[to]}" — tutup dulu ` +
        `("Torang, tutup ${to}") atau pindahkan Torang ke layar lain`
    );
  }

  const from = ctx.state.screen;
  const dir = resolveDirection(ctx.geometry, from, to);
  const enterFrom = oppositeDirection(dir); // HUKUM: exit-kanan ↔ enter-kiri
  const exitJenis: AssetJenis = dir === "right" ? "exit_r" : "exit_l";
  const enterJenis: AssetJenis = enterFrom === "left" ? "enter_l" : "enter_r";

  const exitAsset = wajibKlipTransisi(ctx, mod, exitJenis);
  const enterAsset = wajibKlipTransisi(ctx, mod, enterJenis);

  const tExit = ctx.now + ctx.leadMs;
  const tEnter = tExit + Math.max(0, exitAsset.klip.duration_ms - ctx.overlapMs);

  const exitCue: Cue = {
    cue_id: ctx.seq(),
    type: "PLAY_VIDEO",
    targets: [from],
    asset: assetName(exitAsset.pemilik, exitJenis),
    enter_from: null,
    exit_to: dir,
    start_at: iso(tExit),
    payload: { role: "exit", duration_ms: exitAsset.klip.duration_ms },
    session: ctx.session,
  };
  const enterCue: Cue = {
    cue_id: ctx.seq(),
    type: "PLAY_VIDEO",
    targets: [to],
    asset: assetName(enterAsset.pemilik, enterJenis),
    enter_from: enterFrom,
    exit_to: null,
    start_at: iso(tEnter),
    payload: { role: "enter", duration_ms: enterAsset.klip.duration_ms, ...thenPayload },
    session: ctx.session,
  };

  return {
    cues: [exitCue, enterCue],
    state: { screen: to, lastDir: dir, activeModule: mod.id, scenes: ctx.state.scenes },
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

/**
 * "Torang, buka office di TV tiga" — SWITCH_SCENE (master §5).
 * Cue hanya membawa NAMA scene; endpoint yang memetakannya ke URL dari config
 * lokalnya. Cloud tidak pernah mengirim alamat.
 */
export function planOpenScene(ctx: PlanContext, scene: string, target: string): Plan {
  const layar =
    target === "all_tv" ? ctx.geometry.ring.slice() : target.startsWith("tv") ? [target] : null;
  if (!layar) {
    throw new PlanError(`scene hanya untuk TV (tv1..tv4 atau semua TV), bukan ${target}`);
  }
  if (ctx.state.screen && layar.includes(ctx.state.screen)) {
    throw new PlanError(
      `Torang sedang di ${ctx.state.screen} — pindahkan dulu sebelum layar itu dipakai scene`
    );
  }
  const cue: Cue = {
    cue_id: ctx.seq(),
    type: "SWITCH_SCENE",
    targets: [target],
    start_at: iso(ctx.now + ctx.leadMs),
    payload: { scene },
    session: ctx.session,
  };
  const scenes = { ...ctx.state.scenes };
  for (const tv of layar) scenes[tv] = scene;
  return {
    cues: [cue],
    state: { ...ctx.state, scenes },
    note: `${layar.join(", ")} keluar dari cincin arah selama scene "${scene}" terbuka`,
  };
}

/** "Torang, tutup TV tiga" — kembalikan layar itu ke idle & masuk cincin lagi. */
export function planCloseScene(ctx: PlanContext, target: string): Plan {
  const layar =
    target === "all_tv" ? ctx.geometry.ring.slice() : target.startsWith("tv") ? [target] : null;
  if (!layar) throw new PlanError(`tutup hanya untuk TV, bukan ${target}`);
  const scenes = { ...ctx.state.scenes };
  const ditutup = layar.filter((tv) => scenes[tv]);
  if (ditutup.length === 0) {
    return { cues: [], state: ctx.state, note: `${target} memang tidak sedang menampilkan scene` };
  }
  for (const tv of ditutup) delete scenes[tv];
  const cue: Cue = {
    cue_id: ctx.seq(),
    type: "SWITCH_SCENE",
    targets: [target],
    start_at: iso(ctx.now + ctx.leadMs),
    payload: { scene: null },
    session: ctx.session,
  };
  return {
    cues: [cue],
    state: { ...ctx.state, scenes },
    note: `${ditutup.join(", ")} kembali ke idle dan masuk cincin arah lagi`,
  };
}

/**
 * "Torang, buka lagi window TV empat" — pemulihan window yang tertutup.
 * Tidak mengubah show-state sama sekali: ini bukan aksi panggung, cuma
 * menyuruh mesin guru membuka kembali jendela yang hilang.
 */
export function planReopenWindow(ctx: PlanContext, target: string): Plan {
  if (!target.startsWith("tv") && target !== "all_tv") {
    throw new PlanError(`buka ulang window hanya untuk TV, bukan ${target}`);
  }
  const cue: Cue = {
    cue_id: ctx.seq(),
    type: "REOPEN_WINDOW",
    targets: [target],
    start_at: iso(ctx.now),
    payload: {},
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
  // STOP = saklar darurat: master §5 menulis "STOP semua, kembali idle", jadi
  // scene ikut ditutup. Kalau nanti layar monitoring dimaui BERTAHAN melewati
  // STOP, ubah baris `scenes: {}` di bawah jadi `scenes: ctx.state.scenes` —
  // itu satu-satunya tempat yang perlu disentuh.
  return {
    cues: [cue],
    state: {
      screen: null,
      lastDir: null,
      activeModule: ctx.state.activeModule,
      scenes: {},
    },
  };
}
