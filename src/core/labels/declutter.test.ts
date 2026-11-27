import { describe, expect, it } from "vitest";
import {
  bodyPriority,
  createLabelSet,
  declutter,
  LABEL_GAP_PX,
  MAX_LABELS,
  MARKER_HIDE_RADIUS_PX,
  markerShown,
  project,
  type LabelSet,
} from "./declutter.ts";

function set(items: { x: number; y: number; w?: number; h?: number; p: number; ok?: boolean }[]): LabelSet {
  const s = createLabelSet(items.length);
  items.forEach((it, i) => {
    s.x[i] = it.x;
    s.y[i] = it.y;
    s.w[i] = it.w ?? 40;
    s.h[i] = it.h ?? 14;
    s.priority[i] = it.p;
    s.ok[i] = it.ok === false ? 0 : 1;
  });
  return s;
}

const shown = (s: LabelSet, n: number) => [...s.shown.subarray(0, n)].flatMap((v, i) => (v ? [i] : []));

describe("label declutter", () => {
  it("VN-SCN-003: labels that do not overlap are all shown", () => {
    const s = set([
      { x: 100, y: 100, p: 1 },
      { x: 300, y: 100, p: 2 },
      { x: 100, y: 300, p: 3 },
    ]);
    expect(declutter(s, 3, 800, 600)).toBe(3);
    expect(shown(s, 3)).toEqual([0, 1, 2]);
  });

  it("VN-SCN-003: of two overlapping labels the higher priority wins, whatever the input order", () => {
    const a = set([
      { x: 100, y: 100, p: 1 },
      { x: 110, y: 104, p: 5 },
    ]);
    declutter(a, 2, 800, 600);
    expect(shown(a, 2)).toEqual([1]);
    const b = set([
      { x: 110, y: 104, p: 5 },
      { x: 100, y: 100, p: 1 },
    ]);
    declutter(b, 2, 800, 600);
    expect(shown(b, 2)).toEqual([0]);
  });

  it("VN-SCN-003: equal priorities keep the lower index (deterministic)", () => {
    const s = set([
      { x: 100, y: 100, p: 3 },
      { x: 105, y: 100, p: 3 },
    ]);
    declutter(s, 2, 800, 600);
    expect(shown(s, 2)).toEqual([0]);
  });

  it("VN-SCN-003: a label is hidden only by a shown one (a chain A > B > C with A not touching C keeps A and C)", () => {
    // Each label is 40 px wide starting 8 px right of its marker; B overlaps both, A and C are 60 px apart.
    const s = set([
      { x: 100, y: 100, p: 3 },
      { x: 130, y: 100, p: 2 },
      { x: 160, y: 100, p: 1 },
    ]);
    declutter(s, 3, 800, 600);
    expect(shown(s, 3)).toEqual([0, 2]);
  });

  it("VN-SCN-003: labels gap apart do not count as overlapping, closer ones do", () => {
    const w = 40;
    const apart = set([
      { x: 100, y: 100, w, p: 2 },
      { x: 100 + w + LABEL_GAP_PX, y: 100, w, p: 1 },
    ]);
    declutter(apart, 2, 800, 600);
    expect(shown(apart, 2)).toEqual([0, 1]);
    const close = set([
      { x: 100, y: 100, w, p: 2 },
      { x: 100 + w + LABEL_GAP_PX - 1, y: 100, w, p: 1 },
    ]);
    declutter(close, 2, 800, 600);
    expect(shown(close, 2)).toEqual([0]);
  });

  it("VN-SCN-003: objects behind the camera or off screen get no label", () => {
    const s = set([
      { x: 100, y: 100, p: 1, ok: false },
      { x: -200, y: 100, p: 1 },
      { x: 400, y: 900, p: 1 },
      { x: 400, y: 300, p: 1 },
    ]);
    declutter(s, 4, 800, 600);
    expect(shown(s, 4)).toEqual([3]);
  });

  it(`VN-SCN-003: at most ${MAX_LABELS} labels are shown, the highest priorities first`, () => {
    const items = Array.from({ length: 200 }, (_, i) => ({
      x: (i % 10) * 70,
      y: Math.floor(i / 10) * 20,
      w: 30,
      h: 10,
      p: i,
    }));
    const s = set(items);
    expect(declutter(s, 200, 1000, 1000)).toBe(MAX_LABELS);
    const ids = shown(s, 200);
    expect(ids).toHaveLength(MAX_LABELS);
    expect(Math.min(...ids)).toBe(200 - MAX_LABELS);
  });

  it("VN-SCN-003: declutter allocates nothing it does not reuse (same arrays after a second call)", () => {
    const s = set([{ x: 1, y: 1, p: 1 }]);
    const order = s.order;
    declutter(s, 1, 10, 10);
    declutter(s, 1, 10, 10);
    expect(s.order).toBe(order);
  });
});

describe("screen projection", () => {
  // A camera at the origin looking down -z with a 90 degree vertical fov, aspect 1, near 1, far 100 (OpenGL style).
  const f = 1;
  const n = 1;
  const fa = 100;
  // Column-major projection matrix (three.js order); view is identity.
  const m = new Float64Array([f, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, (2 * fa * n) / (n - fa), 0]);

  it("VN-SCN-003: a point on the view axis lands in the centre, y grows downwards in pixels", () => {
    const out = { x: 0, y: 0, ok: false };
    project(m, 0, 0, -10, 800, 600, out);
    expect(out).toEqual({ x: 400, y: 300, ok: true });
    project(m, 10, 10, -10, 800, 600, out); // 45 degrees up and right: the top right corner
    expect(out.x).toBeCloseTo(800);
    expect(out.y).toBeCloseTo(0);
    expect(out.ok).toBe(true);
  });

  it("VN-SCN-003: a point behind the camera is not ok", () => {
    const out = { x: 0, y: 0, ok: true };
    project(m, 0, 0, 10, 800, 600, out);
    expect(out.ok).toBe(false);
  });
});

describe("markers", () => {
  it(`VN-SCN-003: a marker shows while the body's disc is under ${MARKER_HIDE_RADIUS_PX} px radius`, () => {
    expect(markerShown(0.01)).toBe(true);
    expect(markerShown(MARKER_HIDE_RADIUS_PX - 0.1)).toBe(true);
    expect(markerShown(MARKER_HIDE_RADIUS_PX)).toBe(false);
  });
});

describe("priorities", () => {
  it("VN-SCN-003: the Sun over planets over moons, the selected object over all", () => {
    expect(bodyPriority(10, false)).toBeGreaterThan(bodyPriority(399, false));
    expect(bodyPriority(399, false)).toBeGreaterThan(bodyPriority(301, false));
    expect(bodyPriority(301, true)).toBeGreaterThan(bodyPriority(10, false));
  });
});
