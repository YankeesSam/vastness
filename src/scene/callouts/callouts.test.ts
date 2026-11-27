import { describe, expect, it } from "vitest";
import { AU_KM } from "../../core/constants";
import {
  calloutTargets,
  calloutText,
  distanceKm,
  LABEL_GAP_PX,
  LABEL_LINE_PX,
  placeLabel,
  towardPoint,
} from "./callouts";

describe("distance callouts", () => {
  it("VN-SCL-005: lines to the Sun and Earth from the selection, none to itself and none without a selection", () => {
    expect(calloutTargets(-31)).toEqual([true, true]);
    expect(calloutTargets(499)).toEqual([true, true]);
    expect(calloutTargets(399)).toEqual([true, false]);
    expect(calloutTargets(10)).toEqual([false, true]);
    expect(calloutTargets(null)).toEqual([false, false]);
  });

  it("VN-SCL-005: each label gives the distance and the light-time", () => {
    expect(calloutText("Sun", AU_KM)).toBe("Sun: 150 million km · 8.32 light-minutes");
    // Voyager 1 at about 170 AU: light takes about 23.6 hours
    expect(calloutText("Earth", 170 * AU_KM)).toBe("Earth: 25.4 billion km · 23.6 light-hours");
    expect(calloutText("Earth", 384_400)).toBe("Earth: 384,000 km · 1.28 light-seconds");
  });

  it("VN-SCL-005: the distance is the straight line between the two positions", () => {
    const pos = new Float64Array([0, 0, 0, 3e8, 4e8, 0]);
    expect(distanceKm(pos, 0, 1)).toBe(5e8);
  });

  it("VN-SCL-005: the direction point is one camera distance along the line, or the target if nearer", () => {
    const pos = new Float64Array([1000, 0, 0, 1000 + AU_KM, 0, 0]);
    const out = new Float64Array(3);
    towardPoint(pos, 0, 1, 1e6, out);
    expect([...out]).toEqual([1000 + 1e6, 0, 0]);
    towardPoint(pos, 0, 1, 1e12, out);
    expect(out[0]).toBeCloseTo(1000 + AU_KM, 3);
    towardPoint(new Float64Array([5, 5, 5, 5, 5, 5]), 0, 1, 1e6, out);
    expect([...out]).toEqual([5, 5, 5]);
  });

  it("VN-SCL-005: labels sit just outside the disc in their line's direction, and do not overlap", () => {
    const out = { x: 0, y: 0, right: false };
    // line leaving up and to the right, disc of 100 px
    placeLabel(500, 400, 800, 0, 100, null, out);
    expect(out.x).toBeCloseTo(500 + 0.6 * (100 + LABEL_GAP_PX), 9);
    expect(out.y).toBeCloseTo(400 - 0.8 * (100 + LABEL_GAP_PX), 9);
    expect(out.right).toBe(false);
    // to the left: the label ends at the point
    expect(placeLabel(500, 400, 100, 400, 0, null, out)).toEqual({ x: 500 - LABEL_GAP_PX, y: 400, right: true });
    // a line straight at the camera: to the right
    expect(placeLabel(500, 400, 500, 400, 3, null, out)).toEqual({ x: 500 + 3 + LABEL_GAP_PX, y: 400, right: false });
    // a second label in nearly the same place moves down a line
    const first = { ...placeLabel(500, 400, 900, 402, 10, null, out) };
    const second = placeLabel(500, 400, 900, 398, 10, first, out);
    expect(second.y).toBeCloseTo(first.y + LABEL_LINE_PX, 9);
  });
});
