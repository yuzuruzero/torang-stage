import { describe, expect, it } from "vitest";
import { DEFAULT_GEOMETRY, resolveDirection } from "../src/show-state.js";

/**
 * Ring searah jarum jam: tv1 → tv2 → tv3 → tv4 → tv1.
 * "right" = searah jarum jam (exit_r), "left" = lawan arah (exit_l).
 */
describe("resolveDirection (disiplin arah = HUKUM)", () => {
  const g = DEFAULT_GEOMETRY;

  it("tetangga searah jarum jam → right", () => {
    expect(resolveDirection(g, "tv1", "tv2")).toBe("right");
    expect(resolveDirection(g, "tv2", "tv3")).toBe("right");
    expect(resolveDirection(g, "tv3", "tv4")).toBe("right");
    expect(resolveDirection(g, "tv4", "tv1")).toBe("right"); // wrap
  });

  it("tetangga lawan arah → left", () => {
    expect(resolveDirection(g, "tv2", "tv1")).toBe("left");
    expect(resolveDirection(g, "tv1", "tv4")).toBe("left"); // wrap mundur
  });

  it("layar berseberangan (seri) → default searah jarum jam (right)", () => {
    expect(resolveDirection(g, "tv1", "tv3")).toBe("right");
    expect(resolveDirection(g, "tv2", "tv4")).toBe("right");
  });

  it("layar di luar ring → error jelas", () => {
    expect(() => resolveDirection(g, "tv1", "tv9" as string)).toThrow(/di luar geometri/);
  });

  it("asal = tujuan → error", () => {
    expect(() => resolveDirection(g, "tv1", "tv1")).toThrow(/sama/);
  });
});
