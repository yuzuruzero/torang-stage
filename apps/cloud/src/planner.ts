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
  type IntentTunggal,
  type PresetTata,
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
  /** Materi yang tayang di TV karena rencana ini — untuk kotak TV di panel. */
  tayang?: Array<{ tv: string; alias: string; mulai: number; sampai: number; torang: boolean }>;
}

/**
 * Kapan tayangan sebuah rencana SELESAI (epoch ms) - dasar "tunggu sampai video
 * selesai" pada kalimat berurutan. Dihitung dari cue ke TV & mesin guru saja:
 * cue ke komp murid menunggu klik murid (jendela sopan), jadi tidak bisa dan
 * tidak boleh ditunggu. Idle yang berulang tidak dihitung - ia tidak pernah
 * "selesai". Rencana tanpa video (scene, sapa, glow) selesai saat mulai.
 */
export function selesaiPlan(plan: Plan, cadangan: number): number {
  let akhir = cadangan;
  for (const c of plan.cues) {
    const mulai = Date.parse(c.start_at);
    akhir = Math.max(akhir, mulai);
    if (c.type !== "PLAY_VIDEO") continue;
    const kePanggung = c.targets.some((t) => t.startsWith("tv") || t === "all_tv" || t === "teacher");
    if (!kePanggung) continue;
    const p = c.payload as Record<string, unknown>;
    const dur = typeof p.duration_ms === "number" ? p.duration_ms : 0;
    const lanjut = typeof p.then_duration_ms === "number" ? p.then_duration_ms : 0;
    akhir = Math.max(akhir, mulai + dur + lanjut);
  }
  return akhir;
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

/**
 * "Torang, puter {alias} [di {target}]"
 *
 * Sasaran kosong = layar tempat Torang berada (tv1 kalau belum muncul).
 *
 * Kalau modulnya ber-presenter Torang dan sasarannya TV lain, Torang PINDAH
 * dulu: exit di layar lama -> enter di layar tujuan -> BARU materi. Bug yang
 * diperbaiki 24 Sep 2026: materi dulu mulai BERSAMAAN dengan klip exit, tanpa
 * klip enter sama sekali - Torang muncul di layar baru sebelum sempat pergi.
 *
 * Materi TIDAK dikirim sebagai cue kedua ke TV yang sama: renderer TV
 * membatalkan cue terjadwal begitu cue baru datang dan langsung memuat
 * berkasnya (tv.ts runCue), jadi klip enter akan terpotong. Materi menumpang
 * sebagai `then_asset` klip enter - jalur yang sudah dipakai untuk idle - dan
 * suaranya dijadwalkan lewat cue audio-saja ke mesin guru pada detik materi
 * mulai. Keterbatasannya dicatat di changelog 2026-09-24: materi dimuat saat
 * enter selesai (tanpa pre-load), jadi bisa telat puluhan ms dari suaranya.
 */
export function planPlayModule(
  ctx: PlanContext,
  alias: string,
  targetDiminta?: string
): Plan {
  const mod = findModuleByAlias(ctx.manifest, alias);
  if (!mod) {
    throw new PlanError(
      `alias modul tidak dikenal: "${alias}" (kosakata dari manifest)`
    );
  }
  const target = targetDiminta ?? ctx.state.screen ?? ctx.geometry.ring[0] ?? "tv1";
  const catatanSasaran = targetDiminta
    ? undefined
    : ctx.state.screen
      ? `tanpa sasaran: diputar di ${target}, tempat Torang berada`
      : `tanpa sasaran & Torang belum muncul: diputar di ${target}`;
  if (ctx.state.scenes[target]) {
    throw new PlanError(
      `${target} sedang menampilkan "${ctx.state.scenes[target]}" — tutup dulu ("Torang, tutup ${target}")`
    );
  }
  const materi = requireAsset(mod, "materi");
  const audio = findAudioFor(mod, "materi");
  const T = ctx.now + ctx.leadMs;
  const keTv = /^tv[1-4]$/.test(target);
  const torang = (mod.presenter ?? "torang") === "torang";

  const cueMateri = (mulai: number): Cue => ({
    cue_id: ctx.seq(),
    type: "PLAY_VIDEO",
    targets: [target],
    asset: assetName(mod, "materi"),
    enter_from: null,
    exit_to: null,
    start_at: iso(mulai),
    ...(audio ? { audio: { play_on: "teacher" as const, asset: audio.file } } : {}),
    payload: { role: "materi", duration_ms: materi.duration_ms },
    session: ctx.session,
  });
  const tayang = (mulai: number) =>
    keTv ? [{ tv: target, alias: mod.alias, mulai, sampai: mulai + materi.duration_ms, torang }] : [];

  // --- Modul tanpa Torang (slide, ahli): tayang di tempat, Torang tidak ke mana-mana.
  if (keTv && !torang) {
    if (ctx.state.screen === target) {
      throw new PlanError(
        `Torang sedang di ${target} — pindahkan dulu sebelum "${mod.alias}" diputar di layar itu`
      );
    }
    return { cues: [cueMateri(T)], state: ctx.state, tayang: tayang(T), note: catatanSasaran };
  }

  // --- Bukan satu TV (komp murid / semua layar): perilaku lama, tanpa koreografi.
  //     Materi ke komp = konten dikirim lewat jendela sopan, BUKAN pindah
  //     karakter (W11 "nyelem" = fase 2).
  if (!keTv) {
    return {
      cues: [cueMateri(T)],
      state: { ...ctx.state, activeModule: mod.id },
      note: catatanSasaran,
    };
  }

  const stateBaru: ShowState = {
    screen: target,
    lastDir: ctx.state.lastDir,
    activeModule: mod.id,
    scenes: ctx.state.scenes,
  };

  // --- Torang sudah di layar itu: langsung materi.
  if (ctx.state.screen === target) {
    return { cues: [cueMateri(T)], state: stateBaru, tayang: tayang(T), note: catatanSasaran };
  }

  // --- Torang harus datang dulu. Klip transisi milik modul yang SEDANG aktif
  //     untuk exit (Torang yang pergi adalah Torang modul lama), milik modul
  //     baru untuk enter - keduanya boleh dipinjam (D20).
  const dari = ctx.state.screen;
  const modLama = ctx.state.activeModule ? findModuleByAlias(ctx.manifest, ctx.state.activeModule) : undefined;
  let dir: Direction | null = null;
  let exit: ReturnType<typeof klipTransisi> = null;
  if (dari) {
    dir = resolveDirection(ctx.geometry, dari, target);
    exit = klipTransisi(ctx, modLama ?? mod, dir === "right" ? "exit_r" : "exit_l");
  }
  const enterFrom: Direction = dir ? oppositeDirection(dir) : "left";
  const enterJenis: AssetJenis = enterFrom === "left" ? "enter_l" : "enter_r";
  const enter = klipTransisi(ctx, mod, enterJenis);

  if (!enter || (dari && !exit)) {
    // Tidak ada klip transisi di mana pun: perilaku lama - layar lama dibersihkan
    // dan materi langsung tayang. Lebih baik lompat rapi daripada ditolak.
    const cues: Cue[] = [];
    if (dari) cues.push(cueTinggalkanLayar(ctx, dari, target));
    cues.push(cueMateri(T));
    return {
      cues,
      state: { ...stateBaru, lastDir: dir },
      tayang: tayang(T),
      note: [catatanSasaran, "tidak ada klip transisi — materi langsung tayang"].filter(Boolean).join("; "),
    };
  }

  const cues: Cue[] = [];
  let tEnter = T;
  if (dari && exit && dir) {
    const exitJenis: AssetJenis = dir === "right" ? "exit_r" : "exit_l";
    cues.push({
      cue_id: ctx.seq(),
      type: "PLAY_VIDEO",
      targets: [dari],
      asset: assetName(exit.pemilik, exitJenis),
      enter_from: null,
      exit_to: dir,
      start_at: iso(T),
      payload: { role: "exit", duration_ms: exit.klip.duration_ms },
      session: ctx.session,
    });
    tEnter = T + Math.max(0, exit.klip.duration_ms - ctx.overlapMs);
  }
  const tMateri = tEnter + enter.klip.duration_ms;
  cues.push({
    cue_id: ctx.seq(),
    type: "PLAY_VIDEO",
    targets: [target],
    asset: assetName(enter.pemilik, enterJenis),
    enter_from: enterFrom,
    exit_to: null,
    start_at: iso(tEnter),
    payload: {
      role: "enter",
      duration_ms: enter.klip.duration_ms,
      then_asset: assetName(mod, "materi"),
      then_loop: false,
      then_duration_ms: materi.duration_ms,
      ...(audio ? { materi_audio: audio.file } : {}),
    },
    session: ctx.session,
  });
  if (audio) {
    // Suara materi -> PA, tepat saat materi mulai (bukan saat enter mulai).
    cues.push({
      cue_id: ctx.seq(),
      type: "PLAY_VIDEO",
      targets: ["teacher"],
      enter_from: null,
      exit_to: null,
      start_at: iso(tMateri),
      audio: { play_on: "teacher", asset: audio.file },
      payload: { role: "audio", duration_ms: materi.duration_ms },
      session: ctx.session,
    });
  }
  return {
    cues,
    state: { ...stateBaru, lastDir: dir ?? "left" },
    tayang: tayang(tMateri),
    note: catatanSasaran,
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
  // Torang sedang di layar yang ditutup? Ia PERGI (klip exit, lalu layar idle).
  // Sejak 24 Sep 2026 - dibutuhkan preset tata layar ("kosong") dan masuk akal
  // diucapkan: "tutup layar satu" saat Torang di sana berarti Torang pamit.
  if (ctx.state.screen && layar.includes(ctx.state.screen)) {
    const dari = ctx.state.screen;
    const tujuan = ctx.geometry.ring.find((tv) => tv !== dari && !layar.includes(tv)) ?? dari;
    const pergi = cueTinggalkanLayar(ctx, dari, tujuan);
    for (const tv of ditutup) delete scenes[tv];
    const cues: Cue[] = [pergi];
    if (ditutup.length > 0) {
      cues.push({
        cue_id: ctx.seq(),
        type: "SWITCH_SCENE",
        targets: ditutup,
        start_at: iso(ctx.now + ctx.leadMs),
        payload: { scene: null },
        session: ctx.session,
      });
    }
    return {
      cues,
      state: { ...ctx.state, screen: null, scenes },
      note: `Torang meninggalkan ${dari}; layar itu kembali idle`,
    };
  }
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

// ===========================================================================
// Kalimat majemuk & tata layar (24 Sep 2026)
// ===========================================================================

/** Satu tahap yang sudah direncanakan: kapan mulai, intent apa (sasaran sudah
 *  diselesaikan), dan rencana cue-nya. */
export interface TahapRencana {
  mulai: number;
  selesai: number;
  intents: IntentTunggal[];
  plan: Plan;
}

/** Perencana SATU intent tunggal. Disuntik dari index.ts karena SAPA butuh
 *  nama dari roster - planner tetap murni. */
export type PerencanaSatu = (ctx: PlanContext, intent: IntentTunggal) => Plan;

const HARUS_SENDIRI = new Set(["STOP", "GO", "REPLAY", "REOPEN_WINDOW"]);
const ARTI_HARUS_SENDIRI: Record<string, string> = {
  STOP: "stop", GO: "lanjut", REPLAY: "ulang", REOPEN_WINDOW: "buka window",
};

/** Layar TV yang disentuh sebuah intent (untuk mendeteksi tabrakan). */
function layarDisentuh(ctx: PlanContext, i: IntentTunggal): string[] {
  const kembangkan = (t: string | undefined) =>
    !t ? [] : t === "all_tv" ? ctx.geometry.ring.slice() : /^tv[1-4]$/.test(t) ? [t] : [];
  switch (i.intent) {
    case "MOVE": return kembangkan(i.to);
    case "PLAY_MODULE": return kembangkan(i.target);
    case "OPEN_SCENE":
    case "CLOSE_SCENE": return kembangkan(i.target);
    default: return [];
  }
}

/** Apakah intent ini memindahkan Torang? (hanya satu per tahap - HUKUM §6) */
function memindahkanTorang(ctx: PlanContext, i: IntentTunggal): boolean {
  if (i.intent === "MOVE") return true;
  if (i.intent === "PLAY_MODULE" && i.target && /^tv[1-4]$/.test(i.target)) {
    const mod = findModuleByAlias(ctx.manifest, i.alias);
    return (mod?.presenter ?? "torang") === "torang";
  }
  return false;
}

function ringkasIntent(i: IntentTunggal): string {
  switch (i.intent) {
    case "PLAY_MODULE": return `puter ${i.alias}${i.target ? ` di ${i.target}` : ""}`;
    case "MOVE": return `pindah ke ${i.to}`;
    case "OPEN_SCENE": return `buka ${i.scene} di ${i.target}`;
    case "CLOSE_SCENE": return `tutup ${i.target}`;
    case "SAPA": return `sapa ${i.target}`;
    case "GLOW": return `glow ${i.target}`;
    default: return i.intent.toLowerCase();
  }
}
export { ringkasIntent };

/**
 * Rencanakan SATU tahap serentak mulai `ctx.now + lead`.
 *
 * Aturan (semua-atau-tidak - satu gagal, seluruh tahap PlanError):
 *  - stop/lanjut/ulang/buka window tidak boleh digabung;
 *  - satu layar hanya boleh disebut satu kali;
 *  - paling banyak satu perintah yang memindahkan Torang;
 *  - perintah pemindah Torang direncanakan DULUAN, supaya "buka office di
 *    layar 1 dan puter tes di layar 2" (Torang sedang di layar 1) sah: Torang
 *    pergi dulu, office menyusul;
 *  - perintah lain di layar yang sedang DITINGGALKAN Torang menunggu klip
 *    exit selesai - kalau tidak, scene memotong Torang di tengah langkah.
 */
export function rencanakanTahap(
  ctx: PlanContext,
  intents: IntentTunggal[],
  satu: PerencanaSatu
): TahapRencana {
  for (const i of intents) {
    if (HARUS_SENDIRI.has(i.intent)) {
      throw new PlanError(`"${ARTI_HARUS_SENDIRI[i.intent]}" harus diucapkan sendiri, tidak bisa digabung`);
    }
  }
  // Selesaikan sasaran kosong SEKARANG, dengan keadaan saat tahap ini mulai:
  // yang dikonfirmasi guru adalah sasaran ini, jadi yang dijalankan juga ini.
  const resolved: IntentTunggal[] = intents.map((i) =>
    i.intent === "PLAY_MODULE" && !i.target
      ? { ...i, target: ctx.state.screen ?? ctx.geometry.ring[0] ?? "tv1" }
      : i
  );

  const dipakai = new Map<string, string>();
  for (const i of resolved) {
    for (const tv of layarDisentuh(ctx, i)) {
      const sudah = dipakai.get(tv);
      if (sudah) throw new PlanError(`${tv} disebut dua kali ("${sudah}" dan "${ringkasIntent(i)}") — pilih salah satu`);
      dipakai.set(tv, ringkasIntent(i));
    }
  }
  const pemindah = resolved.filter((i) => memindahkanTorang(ctx, i));
  if (pemindah.length > 1) {
    throw new PlanError(
      `Torang hanya bisa di satu tempat — "${pemindah.map(ringkasIntent).join('" dan "')}" dua-duanya memindahkan Torang`
    );
  }
  const urut = [...pemindah, ...resolved.filter((i) => !memindahkanTorang(ctx, i))];

  let state = ctx.state;
  const cues: Cue[] = [];
  const tayang: NonNullable<Plan["tayang"]> = [];
  const catatan: string[] = [];
  const sibukSampai = new Map<string, number>();
  let selesai = ctx.now + ctx.leadMs;

  for (const i of urut) {
    let now = ctx.now;
    for (const tv of layarDisentuh(ctx, i)) {
      const s = sibukSampai.get(tv);
      if (s !== undefined) now = Math.max(now, s - ctx.leadMs);
    }
    const p = satu({ ...ctx, state, now }, i);
    for (const c of p.cues) {
      const r = (c.payload as Record<string, unknown>).role;
      if (r === "exit") {
        const d = (c.payload as Record<string, unknown>).duration_ms;
        const akhir = Date.parse(c.start_at) + (typeof d === "number" ? d : 0);
        for (const t of c.targets) sibukSampai.set(t, Math.max(sibukSampai.get(t) ?? 0, akhir));
      }
    }
    cues.push(...p.cues);
    tayang.push(...(p.tayang ?? []));
    if (p.note) catatan.push(p.note);
    state = p.state;
    selesai = Math.max(selesai, selesaiPlan(p, now + ctx.leadMs));
  }
  return {
    mulai: ctx.now + ctx.leadMs,
    selesai,
    intents: resolved,
    plan: { cues, state, tayang, ...(catatan.length ? { note: catatan.join("; ") } : {}) },
  };
}

/**
 * Rencanakan seluruh kalimat majemuk. Tahap ke-n+1 dimulai saat tayangan tahap
 * ke-n SELESAI. Semua tahap disimulasikan di depan, supaya kesalahan di tahap
 * terakhir ketahuan SEBELUM tahap pertama tayang - bukan setengah jalan di
 * depan murid.
 *
 * Hanya tahap pertama yang langsung dikirim. Tahap berikutnya direncanakan
 * ULANG saat waktunya tiba (index.ts), dengan keadaan panggung saat itu -
 * guru bisa saja memberi perintah lain di sela-selanya.
 */
export function rencanakanMajemuk(
  ctx: PlanContext,
  tahap: IntentTunggal[][],
  satu: PerencanaSatu
): TahapRencana[] {
  const hasil: TahapRencana[] = [];
  let state = ctx.state;
  let now = ctx.now;
  for (let k = 0; k < tahap.length; k++) {
    let r: TahapRencana;
    try {
      r = rencanakanTahap({ ...ctx, state, now }, tahap[k]!, satu);
    } catch (e) {
      if (e instanceof PlanError && tahap.length > 1) {
        throw new PlanError(`langkah ${k + 1}: ${e.message}`);
      }
      throw e;
    }
    hasil.push(r);
    state = r.plan.state;
    now = r.selesai - ctx.leadMs; // tahap berikutnya MULAI tepat saat ini selesai
  }
  return hasil;
}

/**
 * Preset tata layar -> satu tahap serentak.
 * "biarkan" tidak menghasilkan apa-apa; "kosong" = tutup (scene ditutup, atau
 * Torang pergi kalau ia di sana).
 */
export function intentDariTata(preset: PresetTata): IntentTunggal[] {
  const out: IntentTunggal[] = [];
  for (const tv of ["tv1", "tv2", "tv3", "tv4"] as const) {
    const isi = preset.layar[tv];
    if (isi === "biarkan") continue;
    if (isi === "kosong") out.push({ intent: "CLOSE_SCENE", target: tv });
    else if (isi.startsWith("modul:")) out.push({ intent: "PLAY_MODULE", alias: isi.slice(6), target: tv });
    else if (isi.startsWith("scene:")) out.push({ intent: "OPEN_SCENE", scene: isi.slice(6), target: tv });
  }
  return out;
}
