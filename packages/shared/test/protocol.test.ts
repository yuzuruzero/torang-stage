import { describe, expect, it } from "vitest";
import {
  AckSchema,
  ClientMsgSchema,
  CueSchema,
  expandTargets,
  findModuleByAlias,
  HelloSchema,
  IntentSchema,
  ManifestSchema,
  oppositeDirection,
  TargetSchema,
} from "../src/index.js";

const sesi = { branch: "dev", room: "r1" };

describe("TargetSchema", () => {
  it("menerima target sah", () => {
    for (const t of ["tv1", "tv4", "komp1", "komp20", "teacher", "all_tv", "all_student"]) {
      expect(TargetSchema.safeParse(t).success).toBe(true);
    }
  });
  it("menolak target tidak dikenal (whitelist)", () => {
    for (const t of ["tv5", "komp0", "komp21", "server", "", "tv1; rm -rf"]) {
      expect(TargetSchema.safeParse(t).success).toBe(false);
    }
  });
});

describe("expandTargets", () => {
  it("all_tv → 4 TV", () => {
    expect(expandTargets(["all_tv"])).toEqual(["tv1", "tv2", "tv3", "tv4"]);
  });
  it("all_student → 20 komp", () => {
    expect(expandTargets(["all_student"])).toHaveLength(20);
  });
  it("dedup dan mempertahankan target konkret", () => {
    expect(expandTargets(["tv1", "all_tv"])).toEqual(["tv1", "tv2", "tv3", "tv4"]);
  });
});

describe("CueSchema", () => {
  const dasar = {
    cue_id: "m99-c01",
    type: "PLAY_VIDEO",
    targets: ["tv1"],
    asset: "m99_materi_tes",
    start_at: new Date().toISOString(),
    session: sesi,
  };

  it("menerima cue sah", () => {
    expect(CueSchema.safeParse(dasar).success).toBe(true);
  });

  it("menolak type di luar whitelist", () => {
    expect(CueSchema.safeParse({ ...dasar, type: "EXEC_SHELL" }).success).toBe(false);
    expect(CueSchema.safeParse({ ...dasar, type: "READ_FILE" }).success).toBe(false);
  });

  it("menolak start_at bukan tanggal", () => {
    expect(CueSchema.safeParse({ ...dasar, start_at: "besok" }).success).toBe(false);
  });

  it("audio hanya boleh play_on teacher (satu PA)", () => {
    const ok = { ...dasar, audio: { play_on: "teacher", asset: "a" } };
    const salah = { ...dasar, audio: { play_on: "komp3", asset: "a" } };
    expect(CueSchema.safeParse(ok).success).toBe(true);
    expect(CueSchema.safeParse(salah).success).toBe(false);
  });
});

describe("Intent & pesan klien", () => {
  it("intent PLAY_MODULE valid", () => {
    expect(
      IntentSchema.safeParse({ intent: "PLAY_MODULE", alias: "tes", target: "tv1" }).success
    ).toBe(true);
  });
  it("intent asing ditolak", () => {
    expect(IntentSchema.safeParse({ intent: "FORMAT_DISK" }).success).toBe(false);
  });
  it("hello & ack tervalidasi lewat discriminated union", () => {
    const hello = {
      kind: "hello",
      role: "teacher",
      endpoint_id: "teacher-1",
      branch: "dev",
      room: "r1",
      room_key: "kunci",
      version: "0.1.0",
      targets: ["tv1", "tv2", "tv3", "tv4", "teacher"],
    };
    expect(HelloSchema.safeParse(hello).success).toBe(true);
    expect(ClientMsgSchema.safeParse(hello).success).toBe(true);
    expect(
      AckSchema.safeParse({
        kind: "ack",
        cue_id: "c1",
        endpoint_id: "teacher-1",
        status: "scheduled",
      }).success
    ).toBe(true);
  });
});

describe("Manifest", () => {
  const manifest = {
    manifest_version: 1,
    release: "dev-dummy",
    modules: [
      {
        id: "m99",
        alias: "tes",
        slug: "tes",
        presenter: "torang",
        assets: [
          { file: "m99_materi_tes.mp4", jenis: "materi", duration_ms: 4000 },
          { file: "m99_exit_r_tes.mp4", jenis: "exit_r", duration_ms: 2000 },
        ],
        audio: [],
      },
    ],
  };

  it("parse manifest sah", () => {
    expect(ManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("alias lookup case-insensitive + via id", () => {
    const m = ManifestSchema.parse(manifest);
    expect(findModuleByAlias(m, "TES")?.id).toBe("m99");
    expect(findModuleByAlias(m, "m99")?.alias).toBe("tes");
    expect(findModuleByAlias(m, "tidak-ada")).toBeUndefined();
  });
});

describe("arah", () => {
  it("opposite", () => {
    expect(oppositeDirection("left")).toBe("right");
    expect(oppositeDirection("right")).toBe("left");
  });
});
