import { describe, expect, it } from "vitest";
import { createLabelSet } from "../core/labels/declutter";
import { CLICK_SLOP_PX, isClick, pick } from "./pick";

function screen(items: { x: number; y: number; p?: number; ok?: boolean; r?: number }[]) {
  const set = createLabelSet(items.length);
  const radiusPx = new Float64Array(items.length);
  items.forEach((it, i) => {
    set.x[i] = it.x;
    set.y[i] = it.y;
    set.priority[i] = it.p ?? 1;
    set.ok[i] = it.ok === false ? 0 : 1;
    radiusPx[i] = it.r ?? 0.01;
  });
  return { set, radiusPx, n: items.length };
}

describe("picking", () => {
  it("VN-CAT-005: the nearest marker within 12 px is picked, even for a sub-pixel object", () => {
    const s = screen([
      { x: 100, y: 100 },
      { x: 108, y: 100 },
    ]);
    expect(pick(s.set, s.radiusPx, s.n, 106, 100)).toBe(1);
    expect(pick(s.set, s.radiusPx, s.n, 101, 101)).toBe(0);
  });

  it("VN-CAT-005: nothing within 12 px picks nothing", () => {
    const s = screen([{ x: 100, y: 100 }]);
    expect(pick(s.set, s.radiusPx, s.n, 100, 112)).toBe(0);
    expect(pick(s.set, s.radiusPx, s.n, 100, 112.5)).toBe(-1);
  });

  it("VN-CAT-005: equal distances go to the higher priority", () => {
    const s = screen([
      { x: 90, y: 100, p: 40 },
      { x: 110, y: 100, p: 80 },
    ]);
    expect(pick(s.set, s.radiusPx, s.n, 100, 100)).toBe(1);
  });

  it("VN-CAT-005: an object behind the camera cannot be picked", () => {
    const s = screen([{ x: 100, y: 100, ok: false }]);
    expect(pick(s.set, s.radiusPx, s.n, 100, 100)).toBe(-1);
  });

  it("VN-CAT-005: a body seen as a large disc is picked anywhere on its disc", () => {
    const s = screen([{ x: 400, y: 300, r: 150 }]);
    expect(pick(s.set, s.radiusPx, s.n, 500, 300)).toBe(0);
    expect(pick(s.set, s.radiusPx, s.n, 400, 465)).toBe(-1);
  });

  it(`a press and release within ${CLICK_SLOP_PX} px is a click, a drag is not`, () => {
    expect(isClick(10, 10, 12, 11)).toBe(true);
    expect(isClick(10, 10, 20, 10)).toBe(false);
  });
});
