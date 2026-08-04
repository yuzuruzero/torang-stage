import { describe, expect, it } from "vitest";
import { CueSchema, ManifestSchema, type Manifest } from "@torang/shared";
import {
  PlanError,
  planMove,
  planPlayModule,
  planStop,
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
  it("menghasilkan 1 cue PLAY_VIDEO valid + audio ke teacher + state pindah", () => {
    const plan = planPlayModule(ctx(), "tes", "tv1");
    expect(plan.cues).toHaveLength(1);
    const cue = CueSchema.parse(plan.cues[0]);
    expect(cue.type).toBe("PLAY_VIDEO");
    expect(cue.targets).toEqual(["tv1"]);
    expect(cue.asset).toBe("m99_materi_tes");
    expect(cue.audio).toEqual({ play_on: "teacher", asset: "m99_materi_tes_audio.m4a" });
    expect(Date.parse(cue.start_at)).toBe(NOW + 1500);
    expect(plan.state).toEqual({ screen: "tv1", lastDir: null, activeModule: "m99" });
  });

  it("alias tak dikenal → PlanError (kosakata dari manifest)", () => {
    expect(() => planPlayModule(ctx(), "ngawur", "tv1")).toThrow(PlanError);
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
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99" };
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
    const state: ShowState = { screen: "tv2", lastDir: null, activeModule: "m99" };
    const plan = planMove(ctx(state), "tv1");
    const [exit, enter] = plan.cues as [
      (typeof plan.cues)[number],
      (typeof plan.cues)[number],
    ];
    expect(exit.asset).toBe("m99_exit_l_tes");
    expect(enter.asset).toBe("m99_enter_r_tes");
  });

  it("tujuan = posisi sekarang → tidak ada cue (bukan error)", () => {
    const state: ShowState = { screen: "tv1", lastDir: null, activeModule: "m99" };
    const plan = planMove(ctx(state), "tv1");
    expect(plan.cues).toHaveLength(0);
    expect(plan.note).toMatch(/sudah di/);
  });

  it("semua cue hasil planner lolos CueSchema (kontrak dijaga)", () => {
    const state: ShowState = { screen: "tv4", lastDir: null, activeModule: "m99" };
    for (const cue of planMove(ctx(state), "tv2").cues) {
      expect(CueSchema.safeParse(cue).success).toBe(true);
    }
  });
});

describe("planStop", () => {
  it("STOP ke semua TV + teacher, show-state kembali kosong", () => {
    const state: ShowState = { screen: "tv3", lastDir: "right", activeModule: "m99" };
    const plan = planStop(ctx(state));
    expect(plan.cues[0]!.type).toBe("STOP");
    expect(plan.cues[0]!.targets).toEqual(["all_tv", "teacher"]);
    expect(plan.state.screen).toBeNull();
  });
});
