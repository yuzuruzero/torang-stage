import { describe, expect, it } from "vitest";
import { CueSchema, ManifestSchema, type Manifest } from "@torang/shared";
import {
  PlanError,
  planGlow,
  planMove,
  planPlayModule,
  planSapa,
  planStop,
  planOpenScene,
  planCloseScene,
  planReopenWindow,
  rencanakanMajemuk,
  rencanakanTahap,
  intentDariTata,
  type PerencanaSatu,
  type PlanContext,
} from "../src/planner.js";
import { DEFAULT_GEOMETRY, initialShowState, type ShowState } from "../src/show-state.js";

const manifest: Manifest = ManifestSchema.parse({
  manifest_version: 1,
  release: "test",
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
      audio: [
        { file: "m99_materi_tes_audio.m4a", for_jenis: "materi", duration_ms: 4000 },
      ],
    },
  ],
});

const NOW = 1_800_000_000_000;

function ctx(state: ShowState = initialShowState()): PlanContext {
  let n = 0;
  return {
    manifest,
    geometry: DEFAULT_GEOMETRY,
    state,
    session: { branch: "dev", room: "r1" },
    now: NOW,
    leadMs: 1500,
    overlapMs: 300,
    seq: () => `t-${++n}`,
  };
}

describe("planPlayModule", () => {
  it("Torang sudah di layar itu → 1 cue materi + audio, langsung", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    const plan = planPlayModule(ctx(state), "tes", "tv1");
    expect(plan.cues).toHaveLength(1);
    const cue = CueSchema.parse(plan.cues[0]);
    expect(cue.type).toBe("PLAY_VIDEO");
    expect(cue.targets).toEqual(["tv1"]);
    expect(cue.asset).toBe("m99_materi_tes");
    expect(cue.audio).toEqual({ play_on: "teacher", asset: "m99_materi_tes_audio.m4a" });
    expect(Date.parse(cue.start_at)).toBe(NOW + 1500);
    expect(plan.state).toEqual({ screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} });
  });

  it("Torang belum muncul → enter dulu, materi SESUDAHNYA (bukan bersamaan)", () => {
    const plan = planPlayModule(ctx(), "tes", "tv1");
    expect(plan.cues).toHaveLength(2);
    const enter = CueSchema.parse(plan.cues[0]);
    const suara = CueSchema.parse(plan.cues[1]);
    expect(enter.targets).toEqual(["tv1"]);
    expect(enter.asset).toBe("m99_enter_l_tes");
    expect(enter.audio).toBeUndefined(); // suara materi TIDAK boleh ikut mulai saat enter
    expect(enter.payload).toMatchObject({
      role: "enter", then_asset: "m99_materi_tes", then_loop: false, then_duration_ms: 4000,
    });
    expect(Date.parse(enter.start_at)).toBe(NOW + 1500);
    expect(suara.targets).toEqual(["teacher"]);
    expect(suara.audio).toEqual({ play_on: "teacher", asset: "m99_materi_tes_audio.m4a" });
    expect(Date.parse(suara.start_at)).toBe(NOW + 1500 + 2000); // tepat saat enter selesai
    expect(plan.state.screen).toBe("tv1");
    expect(plan.tayang).toEqual([
      { tv: "tv1", alias: "tes", mulai: NOW + 3500, sampai: NOW + 7500, torang: true },
    ]);
  });

  it("tanpa sasaran → diputar di layar tempat Torang berada", () => {
    const state: ShowState = { screen: "tv3", lastDir: null, activeModule: "m99", scenes: {} };
    const plan = planPlayModule(ctx(state), "tes");
    expect(plan.cues).toHaveLength(1);
    expect(plan.cues[0]!.targets).toEqual(["tv3"]);
    expect(plan.note).toMatch(/tempat Torang berada/);
  });

  it("tanpa sasaran & Torang belum muncul → TV1, lewat enter", () => {
    const plan = planPlayModule(ctx(), "tes");
    expect(plan.cues[0]!.targets).toEqual(["tv1"]);
    expect(plan.cues[0]!.payload).toMatchObject({ role: "enter" });
  });

  it("alias tak dikenal → PlanError (kosakata dari manifest)", () => {
    expect(() => planPlayModule(ctx(), "ngawur", "tv1")).toThrow(PlanError);
  });

  it("puter di komp murid TIDAK memindahkan posisi Torang (bukan 'nyelem')", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    const plan = planPlayModule(ctx(state), "tes", "komp3");
    expect(plan.cues[0]!.targets).toEqual(["komp3"]);
    expect(plan.state.screen).toBe("tv1"); // Torang tetap di TV1
  });
});

describe("planSapa (§5 'sapa' — W3)", () => {
  it("dengan nama dari binding → OVERLAY_GREET berisi nama, tanpa audio komp", () => {
    const plan = planSapa(ctx(), "komp5", "Citra");
    const cue = CueSchema.parse(plan.cues[0]);
    expect(cue.type).toBe("OVERLAY_GREET");
    expect(cue.targets).toEqual(["komp5"]);
    expect(cue.payload.title).toBe("Halo, Citra!");
    expect(cue.audio).toBeUndefined(); // keputusan #17: teks saja di komp
  });

  it("kursi belum login → sapaan generik + note", () => {
    const plan = planSapa(ctx(), "komp5", null);
    expect(plan.cues[0]!.payload.title).toBe("Halo!");
    expect(plan.note).toMatch(/belum login/);
  });

  it("sapa ke TV → PlanError", () => {
    expect(() => planSapa(ctx(), "tv1", "Citra")).toThrow(PlanError);
  });
});

describe("planGlow", () => {
  it("glow all_student valid + preset & durasi di payload", () => {
    const plan = planGlow(ctx(), "all_student", "wave", 5000);
    const cue = CueSchema.parse(plan.cues[0]);
    expect(cue.type).toBe("GLOW");
    expect(cue.payload).toEqual({ preset: "wave", duration_ms: 5000 });
  });

  it("glow ke TV/teacher → PlanError", () => {
    expect(() => planGlow(ctx(), "tv2", "pulse", 4000)).toThrow(PlanError);
    expect(() => planGlow(ctx(), "teacher", "pulse", 4000)).toThrow(PlanError);
  });
});

describe("planMove", () => {
  it("dari kosong → satu cue enter dari kiri + idle loop", () => {
    const plan = planMove(ctx(), "tv2");
    expect(plan.cues).toHaveLength(1);
    const cue = plan.cues[0]!;
    expect(cue.asset).toBe("m99_enter_l_tes");
    expect(cue.enter_from).toBe("left");
    expect(cue.payload.then_asset).toBe("m99_idle_tes");
    expect(cue.payload.then_loop).toBe(true);
    expect(plan.state.screen).toBe("tv2");
  });

  it("tv1 → tv3: exit_r di tv1, enter_l di tv3, offset = durasi exit − overlap", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    const plan = planMove(ctx(state), "tv3");
    expect(plan.cues).toHaveLength(2);
    const [exit, enter] = plan.cues as [
      (typeof plan.cues)[number],
      (typeof plan.cues)[number],
    ];
    expect(exit.targets).toEqual(["tv1"]);
    expect(exit.asset).toBe("m99_exit_r_tes");
    expect(exit.exit_to).toBe("right");
    expect(enter.targets).toEqual(["tv3"]);
    expect(enter.asset).toBe("m99_enter_l_tes"); // HUKUM: exit-kanan ↔ enter-kiri
    expect(enter.enter_from).toBe("left");
    const tExit = Date.parse(exit.start_at);
    const tEnter = Date.parse(enter.start_at);
    expect(tExit).toBe(NOW + 1500);
    expect(tEnter - tExit).toBe(2000 - 300);
    expect(plan.state).toMatchObject({ screen: "tv3", lastDir: "right" });
  });

  it("tv2 → tv1 (lawan arah): exit_l ↔ enter_r", () => {
    const state: ShowState = { screen: "tv2", lastDir: null, activeModule: "m99", scenes: {} };
    const plan = planMove(ctx(state), "tv1");
    const [exit, enter] = plan.cues as [
      (typeof plan.cues)[number],
      (typeof plan.cues)[number],
    ];
    expect(exit.asset).toBe("m99_exit_l_tes");
    expect(enter.asset).toBe("m99_enter_r_tes");
  });

  it("tujuan = posisi sekarang → tidak ada cue (bukan error)", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    const plan = planMove(ctx(state), "tv1");
    expect(plan.cues).toHaveLength(0);
    expect(plan.note).toMatch(/sudah di/);
  });

  it("semua cue hasil planner lolos CueSchema (kontrak dijaga)", () => {
    const state: ShowState = { screen: "tv4", lastDir: null, activeModule: "m99", scenes: {} };
    for (const cue of planMove(ctx(state), "tv2").cues) {
      expect(CueSchema.safeParse(cue).success).toBe(true);
    }
  });
});

describe("planStop", () => {
  it("STOP ke semua TV + teacher + semua murid, show-state kembali kosong", () => {
    const state: ShowState = { screen: "tv3", lastDir: "right", activeModule: "m99", scenes: {} };
    const plan = planStop(ctx(state));
    expect(plan.cues[0]!.type).toBe("STOP");
    expect(plan.cues[0]!.targets).toEqual(["all_tv", "teacher", "all_student"]);
    expect(plan.state.screen).toBeNull();
  });
});

describe("scene non-video (buka / tutup)", () => {
  it("buka scene → cue SWITCH_SCENE yang membawa NAMA, bukan URL", () => {
    const plan = planOpenScene(ctx(), "office", "tv3");
    expect(plan.cues).toHaveLength(1);
    const cue = CueSchema.parse(plan.cues[0]);
    expect(cue.type).toBe("SWITCH_SCENE");
    expect(cue.targets).toEqual(["tv3"]);
    expect(cue.payload).toEqual({ scene: "office" });
    // Alamat tidak boleh pernah ikut di cue — dipetakan lokal di mesin endpoint.
    expect(JSON.stringify(cue)).not.toContain("http");
    expect(plan.state.scenes).toEqual({ tv3: "office" });
  });

  it("TV ber-scene keluar dari cincin: pindah & puter ke situ ditolak", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: { tv3: "office" } };
    expect(() => planMove(ctx(state), "tv3")).toThrow(PlanError);
    expect(() => planPlayModule(ctx(state), "tes", "tv3")).toThrow(PlanError);
    // layar lain tidak terpengaruh
    expect(planMove(ctx(state), "tv2").state.screen).toBe("tv2");
  });

  it("scene hanya untuk TV, dan bukan di layar tempat Torang berada", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    expect(() => planOpenScene(ctx(state), "office", "komp5")).toThrow(PlanError);
    expect(() => planOpenScene(ctx(state), "office", "tv1")).toThrow(PlanError);
  });

  it("tutup mengembalikan layar ke cincin", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: { tv3: "office" } };
    const setelah = planCloseScene(ctx(state), "tv3").state;
    expect(setelah.scenes).toEqual({});
    expect(planMove(ctx(setelah), "tv3").state.screen).toBe("tv3");
  });

  it("tutup layar yang memang tidak ber-scene = tanpa cue, bukan error", () => {
    const plan = planCloseScene(ctx(), "tv4");
    expect(plan.cues).toHaveLength(0);
    expect(plan.note).toContain("tidak sedang menampilkan");
  });

  it("STOP menutup scene juga (master §5: semua kembali idle)", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: { tv3: "office" } };
    expect(planStop(ctx(state)).state.scenes).toEqual({});
  });
});

describe("klip transisi dipinjam dari modul default", () => {
  it("modul cuma berklip materi → pindah TETAP jalan, memakai klip modul default", () => {
    const manifestCampur = ManifestSchema.parse({
      ...manifest,
      transisi_default: "tes",
      modules: [
        ...manifest.modules,
        {
          id: "m01", alias: "videoplayback", slug: "videoplayback", presenter: "torang",
          assets: [{ file: "m01_materi_videoplayback.mp4", jenis: "materi", duration_ms: 5000 }],
          audio: [],
        },
      ],
    });
    const c: PlanContext = {
      ...ctx({ screen: "tv1", lastDir: null, activeModule: "m01", scenes: {} }),
      manifest: manifestCampur,
    };
    const plan = planMove(c, "tv3");
    expect(plan.cues).toHaveLength(2);
    // Nama aset yang dikirim = milik modul PEMBERI, karena berkas itu yang ada
    // di cache lokal tiap mesin.
    expect(CueSchema.parse(plan.cues[0]).asset).toBe("m99_exit_r_tes");
    expect(CueSchema.parse(plan.cues[1]).asset).toBe("m99_enter_l_tes");
    expect(CueSchema.parse(plan.cues[1]).payload).toMatchObject({
      then_asset: "m99_idle_tes",
      then_loop: true,
    });
    expect(plan.state.screen).toBe("tv3");
  });

  it("modul yang PUNYA klip sendiri tetap memakai miliknya, bukan pinjaman", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    const plan = planMove(ctx(state), "tv3");
    expect(CueSchema.parse(plan.cues[0]).asset).toBe("m99_exit_r_tes");
  });

  it("tidak ada klip transisi di manifest mana pun → baru menyerah, dengan pesan jelas", () => {
    const manifestPendek = ManifestSchema.parse({
      manifest_version: 1,
      release: "test",
      modules: [
        {
          id: "m01", alias: "videoplayback", slug: "videoplayback", presenter: "torang",
          assets: [{ file: "m01_materi_videoplayback.mp4", jenis: "materi", duration_ms: 5000 }],
          audio: [],
        },
      ],
    });
    const c: PlanContext = { ...ctx({ screen: "tv1", lastDir: null, activeModule: "m01", scenes: {} }), manifest: manifestPendek };
    try {
      planMove(c, "tv2");
      throw new Error("seharusnya ditolak");
    } catch (e) {
      expect(e).toBeInstanceOf(PlanError);
      const pesan = (e as Error).message;
      expect(pesan).toContain("videoplayback");
      expect(pesan).toContain("transisi_default");
    }
  });
});

describe("puter ke TV lain: layar lama ditinggalkan (HUKUM ilusi kontinu §6)", () => {
  it("Torang di tv1, puter di tv2 → exit tv1, LALU enter tv2, LALU materi (bug 24 Sep)", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    const plan = planPlayModule(ctx(state), "tes", "tv2");
    expect(plan.cues).toHaveLength(3);
    const [keluar, masuk, suara] = plan.cues.map((c) => CueSchema.parse(c));
    expect(keluar!.targets).toEqual(["tv1"]);
    expect(keluar!.asset).toBe("m99_exit_r_tes");
    expect(Date.parse(keluar!.start_at)).toBe(NOW + 1500);
    expect(masuk!.targets).toEqual(["tv2"]);
    expect(masuk!.asset).toBe("m99_enter_l_tes"); // HUKUM: exit kanan disambut enter kiri
    // enter mulai saat exit hampir selesai (overlap 300 ms), BUKAN bersamaan
    expect(Date.parse(masuk!.start_at)).toBe(NOW + 1500 + 2000 - 300);
    expect(masuk!.payload).toMatchObject({ then_asset: "m99_materi_tes", then_loop: false });
    // materi (dan suaranya) mulai setelah enter selesai
    expect(Date.parse(suara!.start_at)).toBe(NOW + 1500 + 1700 + 2000);
    expect(plan.state.screen).toBe("tv2");
    expect(plan.state.lastDir).toBe("right");
  });

  it("Torang di tv2, puter di tv4 → layar lama tetap ditinggalkan dengan klip exit", () => {
    const state: ShowState = { screen: "tv2", lastDir: null, activeModule: "m99", scenes: {} };
    const plan = planPlayModule(ctx(state), "tes", "tv4");
    const keluar = CueSchema.parse(plan.cues[0]);
    expect(keluar.targets).toEqual(["tv2"]);
    expect(keluar.payload).toMatchObject({ role: "exit" });
    expect(plan.cues[1]!.targets).toEqual(["tv4"]);
    expect(plan.state.screen).toBe("tv4");
  });

  it("puter di layar yang SAMA → tetap satu cue (tidak ada yang ditinggalkan)", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    expect(planPlayModule(ctx(state), "tes", "tv1").cues).toHaveLength(1);
  });

  it("puter ke komp murid tidak memindahkan Torang, jadi TV lama tidak ditinggalkan", () => {
    const state: ShowState = { screen: "tv2", lastDir: null, activeModule: "m99", scenes: {} };
    const plan = planPlayModule(ctx(state), "tes", "komp3");
    expect(plan.cues).toHaveLength(1);
    expect(plan.state.screen).toBe("tv2");
  });

  it("modul aktif tanpa klip exit → layar lama dibersihkan ke idle, bukan dibiarkan", () => {
    const manifestPendek = ManifestSchema.parse({
      manifest_version: 1,
      release: "test",
      modules: [
        {
          id: "m01", alias: "cuma-materi", slug: "cuma-materi", presenter: "torang",
          assets: [{ file: "m01_materi_cuma-materi.mp4", jenis: "materi", duration_ms: 5000 }],
          audio: [],
        },
      ],
    });
    const c: PlanContext = {
      ...ctx({ screen: "tv2", lastDir: null, activeModule: "m01", scenes: {} }),
      manifest: manifestPendek,
    };
    const plan = planPlayModule(c, "cuma-materi", "tv4");
    expect(plan.cues).toHaveLength(2);
    const bersih = CueSchema.parse(plan.cues[0]);
    expect(bersih.type).toBe("SWITCH_SCENE");
    expect(bersih.targets).toEqual(["tv2"]);
    expect(bersih.payload).toEqual({ scene: null });
  });
});

describe("buka ulang window TV (pemulihan, bukan aksi panggung)", () => {
  it("menghasilkan cue REOPEN_WINDOW tanpa mengubah show-state", () => {
    const state: ShowState = { screen: "tv1", lastDir: "right", activeModule: "m99", scenes: {} };
    const plan = planReopenWindow(ctx(state), "tv4");
    expect(plan.cues).toHaveLength(1);
    const cue = CueSchema.parse(plan.cues[0]);
    expect(cue.type).toBe("REOPEN_WINDOW");
    expect(cue.targets).toEqual(["tv4"]);
    // Posisi Torang TIDAK boleh bergeser gara-gara pemulihan jendela.
    expect(plan.state).toEqual(state);
  });

  it("semua TV sekaligus boleh", () => {
    expect(planReopenWindow(ctx(), "all_tv").cues).toHaveLength(1);
  });

  it("bukan untuk komp murid", () => {
    expect(() => planReopenWindow(ctx(), "komp3")).toThrow(PlanError);
  });
});

// ===========================================================================
// Kalimat majemuk & tata layar (24 Sep 2026)
// ===========================================================================
const satu: PerencanaSatu = (c, i) => {
  switch (i.intent) {
    case "PLAY_MODULE": return planPlayModule(c, i.alias, i.target);
    case "MOVE": return planMove(c, i.to);
    case "OPEN_SCENE": return planOpenScene(c, i.scene, i.target);
    case "CLOSE_SCENE": return planCloseScene(c, i.target);
    case "SAPA": return planSapa(c, i.target, null);
    case "GLOW": return planGlow(c, i.target, i.preset, i.duration_ms);
    default: throw new PlanError("tidak didukung");
  }
};

const manifestDenganSlide: Manifest = ManifestSchema.parse({
  ...manifest,
  modules: [
    ...manifest.modules,
    {
      id: "m50", alias: "slide", slug: "slide", presenter: "ahli-slide",
      assets: [{ file: "m50_materi_slide.mp4", jenis: "materi", duration_ms: 10000 }],
      audio: [],
    },
  ],
});

describe("tutup layar tempat Torang berada", () => {
  it("Torang pergi dengan klip exit, layar kembali idle", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    const plan = planCloseScene(ctx(state), "tv1");
    expect(plan.cues).toHaveLength(1);
    expect(plan.cues[0]!.targets).toEqual(["tv1"]);
    expect(plan.cues[0]!.payload).toMatchObject({ role: "exit" });
    expect(plan.state.screen).toBeNull();
  });
});

describe("tahap serentak ('... dan ...')", () => {
  it("puter tes di layar 1 DAN buka office di layar 2 → keduanya mulai bersamaan", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    const r = rencanakanTahap(ctx(state), [
      { intent: "PLAY_MODULE", alias: "tes", target: "tv1" },
      { intent: "OPEN_SCENE", scene: "office", target: "tv2" },
    ], satu);
    expect(r.plan.cues).toHaveLength(2);
    expect(r.plan.cues.every((c) => Date.parse(c.start_at) === NOW + 1500)).toBe(true);
    expect(r.plan.state.scenes).toEqual({ tv2: "office" });
    expect(r.selesai).toBe(NOW + 1500 + 4000); // materi 4 dtk
  });

  it("layar yang disebut dua kali → seluruh kalimat ditolak", () => {
    expect(() => rencanakanTahap(ctx(), [
      { intent: "PLAY_MODULE", alias: "tes", target: "tv1" },
      { intent: "OPEN_SCENE", scene: "office", target: "tv1" },
    ], satu)).toThrow(/tv1 disebut dua kali/);
  });

  it("dua perintah yang sama-sama memindahkan Torang → ditolak (Torang cuma satu)", () => {
    expect(() => rencanakanTahap(ctx(), [
      { intent: "PLAY_MODULE", alias: "tes", target: "tv1" },
      { intent: "MOVE", to: "tv3" },
    ], satu)).toThrow(/satu tempat/);
  });

  it("stop tidak boleh digabung", () => {
    expect(() => rencanakanTahap(ctx(), [
      { intent: "STOP" }, { intent: "MOVE", to: "tv3" },
    ], satu)).toThrow(/harus diucapkan sendiri/);
  });

  it("buka office di layar yang sedang DITINGGALKAN Torang → menunggu exit selesai", () => {
    // Torang di tv1. Urutan ucapan: office dulu, baru puter - tetap sah,
    // karena pemindah Torang direncanakan duluan.
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    const r = rencanakanTahap(ctx(state), [
      { intent: "OPEN_SCENE", scene: "office", target: "tv1" },
      { intent: "PLAY_MODULE", alias: "tes", target: "tv2" },
    ], satu);
    const exit = r.plan.cues.find((c) => (c.payload as Record<string, unknown>).role === "exit")!;
    const scene = r.plan.cues.find((c) => c.type === "SWITCH_SCENE")!;
    expect(exit.targets).toEqual(["tv1"]);
    expect(Date.parse(scene.start_at)).toBe(Date.parse(exit.start_at) + 2000);
    expect(r.plan.state).toMatchObject({ screen: "tv2", scenes: { tv1: "office" } });
  });

  it("modul tanpa Torang (slide) boleh tayang serentak dengan modul Torang", () => {
    const c: PlanContext = { ...ctx(), manifest: manifestDenganSlide };
    const r = rencanakanTahap(c, [
      { intent: "PLAY_MODULE", alias: "tes", target: "tv1" },
      { intent: "PLAY_MODULE", alias: "slide", target: "tv3" },
    ], satu);
    expect(r.plan.state.screen).toBe("tv1"); // slide tidak menggeser Torang
    const slide = r.plan.cues.find((x) => x.targets[0] === "tv3")!;
    expect(slide.asset).toBe("m50_materi_slide");
    expect(slide.enter_from).toBeNull();
  });

  it("modul tanpa Torang di layar tempat Torang berada → ditolak dengan pesan untuk guru", () => {
    const c: PlanContext = {
      ...ctx({ screen: "tv3", lastDir: null, activeModule: "m99", scenes: {} }),
      manifest: manifestDenganSlide,
    };
    expect(() => planPlayModule(c, "slide", "tv3")).toThrow(/pindahkan dulu/);
  });
});

describe("tahap berurutan ('... lalu ...')", () => {
  it("pindah ke layar 2 lalu ke layar 3 → langkah 2 mulai saat langkah 1 selesai", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    const r = rencanakanMajemuk(ctx(state), [
      [{ intent: "MOVE", to: "tv2" }],
      [{ intent: "MOVE", to: "tv3" }],
    ], satu);
    expect(r).toHaveLength(2);
    // langkah 1: exit tv1 (T..T+2000), enter tv2 (T+1700..T+3700)
    expect(r[0]!.selesai).toBe(NOW + 1500 + 1700 + 2000);
    expect(r[1]!.mulai).toBe(r[0]!.selesai);
    expect(r[1]!.plan.state.screen).toBe("tv3");
  });

  it("puter tes lalu pindah → pindah menunggu MATERI selesai, bukan cuma enter", () => {
    const r = rencanakanMajemuk(ctx(), [
      [{ intent: "PLAY_MODULE", alias: "tes", target: "tv1" }],
      [{ intent: "MOVE", to: "tv2" }],
    ], satu);
    // enter 2000 + materi 4000 setelah lead
    expect(r[1]!.mulai).toBe(NOW + 1500 + 2000 + 4000);
  });

  it("kesalahan di langkah terakhir ketahuan SEBELUM langkah pertama jalan", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    expect(() => rencanakanMajemuk(ctx(state), [
      [{ intent: "OPEN_SCENE", scene: "office", target: "tv3" }],
      [{ intent: "MOVE", to: "tv3" }],
    ], satu)).toThrow(/langkah 2: .*tutup dulu/);
  });

  it("puter tanpa sasaran di langkah 2 → layar Torang SETELAH langkah 1", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    const r = rencanakanMajemuk(ctx(state), [
      [{ intent: "MOVE", to: "tv4" }],
      [{ intent: "PLAY_MODULE", alias: "tes" }],
    ], satu);
    expect(r[1]!.intents[0]).toEqual({ intent: "PLAY_MODULE", alias: "tes", target: "tv4" });
  });
});

describe("tata layar", () => {
  it("preset → satu tahap serentak; 'biarkan' dilewati", () => {
    const intents = intentDariTata({
      nama: "pembukaan",
      layar: { tv1: "modul:tes", tv2: "scene:office", tv3: "biarkan", tv4: "kosong" },
    });
    expect(intents).toEqual([
      { intent: "PLAY_MODULE", alias: "tes", target: "tv1" },
      { intent: "OPEN_SCENE", scene: "office", target: "tv2" },
      { intent: "CLOSE_SCENE", target: "tv4" },
    ]);
    const r = rencanakanTahap(ctx(), intents, satu);
    expect(r.plan.state).toMatchObject({ screen: "tv1", scenes: { tv2: "office" } });
  });

  it("'kosong' di layar Torang sementara modul lain membawanya pergi → tidak bentrok", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99", scenes: {} };
    const intents = intentDariTata({
      nama: "geser",
      layar: { tv1: "kosong", tv2: "modul:tes", tv3: "biarkan", tv4: "biarkan" },
    });
    const r = rencanakanTahap(ctx(state), intents, satu);
    expect(r.plan.state.screen).toBe("tv2");
    // hanya satu exit (dari pemindah), bukan dua
    expect(r.plan.cues.filter((c) => (c.payload as Record<string, unknown>).role === "exit")).toHaveLength(1);
  });
});
