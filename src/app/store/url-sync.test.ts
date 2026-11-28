import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeFragment } from "../../core/share/fragment";
import { parseUtc } from "../../core/time/scales";
import { applyFragment, currentFragment, setCameraSource, startUrlSync, type UrlWindow } from "./url-sync";
import { createViewStore } from "./view";

const T0 = parseUtc("2026-01-01T00:00:00Z");
const cam = { target: 499, distanceKm: 5e4, azimuth: 0.5, elevation: 0.25 };

function fakeWindow(hash = ""): UrlWindow & { fire(): void; writes: string[] } {
  const listeners: (() => void)[] = [];
  const w = {
    location: { hash },
    writes: [] as string[],
    history: {
      replaceState: (_d: unknown, _u: string, url: string) => {
        w.location.hash = url;
        w.writes.push(url);
      },
    },
    addEventListener: (_n: "hashchange", f: () => void) => listeners.push(f),
    removeEventListener: () => listeners.splice(0),
    fire: () => listeners.forEach((f) => f()),
  };
  return w;
}

afterEach(() => {
  vi.useRealTimers();
  setCameraSource(null);
});

describe("url sync", () => {
  it("VN-UI-002: the store's view and the scene's camera make the fragment", () => {
    const store = createViewStore({ t: T0 });
    store.getState().select(-31);
    store.getState().setLayer("labels", false);
    setCameraSource(() => cam);
    expect(currentFragment(store)).toBe(
      encodeFragment({
        t: T0,
        rate: 1,
        paused: false,
        selection: -31,
        cam,
        layers: {
          bodies: true,
          textures: true,
          labels: false,
          markers: true,
          orbits: true,
          trails: true,
          callouts: true,
          stars: true,
          spaceweather: false,
          comets: false,
          dwarfs: false,
        },
      }),
    );
  });

  it("VN-UI-002: a fragment sets time, rate, pause, selection, layers and asks for the camera", () => {
    const store = createViewStore({ t: 0 });
    applyFragment("#v=1&t=1989-08-25T04:00:00Z&r=-3600&p=1&s=-32&c=899,1e6,10,20&l=bo", store);
    const s = store.getState();
    expect(s.t).toBe(parseUtc("1989-08-25T04:00:00Z"));
    expect(s.rate).toBe(-3600);
    expect(s.paused).toBe(true);
    expect(s.selection).toBe(-32);
    expect(s.layers).toEqual({
      bodies: true,
      textures: false,
      labels: false,
      markers: false,
      orbits: true,
      trails: false,
      callouts: false,
      stars: false,
      spaceweather: false,
      comets: false,
      dwarfs: false,
    });
    expect(s.cameraSeq).toBe(1);
    expect(s.cameraRequest!.target).toBe(899);
    expect(s.target).toBe(899);
    applyFragment("#v=1&s=12345678", store); // unknown object: nothing changes
    expect(store.getState().selection).toBe(-32);
  });

  it("VN-UI-002: start applies the link, then mirrors the view to the fragment without adding history", () => {
    vi.useFakeTimers();
    const store = createViewStore({ t: 0 });
    const w = fakeWindow("#v=1&t=2026-01-01T00:00:00Z&r=60&p=1&s=499&l=bmot");
    const stop = startUrlSync(store, w, 500);
    expect(store.getState().selection).toBe(499);
    expect(store.getState().paused).toBe(true);
    vi.advanceTimersByTime(500);
    const first = w.writes.length;
    vi.advanceTimersByTime(1500); // nothing changed: nothing written
    expect(w.writes.length).toBe(first);
    store.getState().setRate(3600);
    vi.advanceTimersByTime(500);
    expect(w.location.hash).toContain("r=3600");

    // a link pasted into the same tab is applied
    w.location.hash = "#v=1&t=2000-01-01T12:00:00Z&r=1&p=0&s=&l=b";
    w.fire();
    expect(store.getState().selection).toBeNull();
    expect(store.getState().t).toBe(parseUtc("2000-01-01T12:00:00Z"));
    stop();
    store.getState().setRate(60);
    vi.advanceTimersByTime(2000);
    expect(w.location.hash).not.toContain("r=60");
  });
});
