import { SRGBColorSpace, Texture } from "three";
import textures from "../../../data/textures.json";
import { loadAsset } from "../../app/assets/loader";

// VN-SCN-006, VN-PRF-002: body surface textures (data/textures.json, public/textures). A body's map loads only
// while the body is drawn larger than LOAD_PX in radius and is released below RELEASE_PX, so the whole-system views
// hold no textures and close views hold one or two (a 2k map with mipmaps is about 11 MB of GPU memory against the
// 64 MB budget). The quality tier caps the edge (the low tier gets the 2k map scaled to 1k as it decodes). Until a
// map is in, and with the layer off, the body is a plain coloured sphere.

/** Load a body's map once its drawn radius reaches this many pixels... */
export const LOAD_PX = 6;
/** ...and release it once it falls below this many. */
export const RELEASE_PX = 2;

const FILES = new Map<number, string>(
  Object.entries((textures as { bodies: Record<string, { file: string }> }).bodies).map(([id, e]) => [
    Number(id),
    `textures/${e.file}`,
  ]),
);

/** Horizons IDs with a surface map. */
export const TEXTURED_BODIES: readonly number[] = [...FILES.keys()];

/** The drawn radius in pixels of a sphere of radius r at distance d, for a vertical field of view and height. */
export function radiusPx(r: number, d: number, fovDeg: number, heightPx: number): number {
  if (!(d > r)) return Infinity;
  return (Math.tan(Math.asin(r / d)) / Math.tan((fovDeg * Math.PI) / 360)) * (heightPx / 2);
}

/** Whether a body's map should be held, given its drawn radius and whether it is held now (hysteresis). */
export function wantTexture(px: number, held: boolean): boolean {
  return held ? px >= RELEASE_PX : px >= LOAD_PX;
}

/** Frees the GPU copy and the decoded bitmap. */
function release(t: Texture): void {
  t.dispose();
  (t.image as ImageBitmap | undefined)?.close?.();
}

interface Slot {
  texture: Texture | null;
  /** Load in flight; a release while loading drops the result. */
  loading: boolean;
  wanted: boolean;
  failed: boolean;
}

/** Loads and releases body maps on demand; `onChange` runs when one arrives or goes. */
export class BodyTextures {
  private readonly slots = new Map<number, Slot>();
  private maxEdge: number;

  constructor(
    maxEdge: number,
    private readonly onChange: () => void,
  ) {
    this.maxEdge = maxEdge;
  }

  /** The map for body `id` if it is in. */
  get(id: number): Texture | null {
    return this.slots.get(id)?.texture ?? null;
  }

  /** IDs whose maps are in, ascending (for e2e specs). */
  held(): number[] {
    return [...this.slots.entries()]
      .filter(([, s]) => s.texture)
      .map(([id]) => id)
      .sort((a, b) => a - b);
  }

  /** Asks for body `id`'s map to be held or not; loads or releases as needed. */
  want(id: number, on: boolean): void {
    const path = FILES.get(id);
    if (!path) return;
    let s = this.slots.get(id);
    if (!s) {
      if (!on) return;
      s = { texture: null, loading: false, wanted: false, failed: false };
      this.slots.set(id, s);
    }
    s.wanted = on;
    if (on && !s.texture && !s.loading && !s.failed) this.load(path, s);
    if (!on && s.texture) {
      release(s.texture);
      s.texture = null;
      this.onChange();
    }
  }

  private load(path: string, s: Slot): void {
    s.loading = true;
    const edge = this.maxEdge;
    loadAsset(path)
      .then((buf) => {
        const blob = new Blob([buf], { type: "image/jpeg" });
        // ImageBitmaps ignore Texture.flipY: flip while decoding (three.js maps v = 0 to the bottom row).
        return createImageBitmap(blob, {
          imageOrientation: "flipY",
          ...(edge < 2048 ? { resizeWidth: edge, resizeHeight: edge / 2, resizeQuality: "high" as const } : {}),
        });
      })
      .then((bitmap) => {
        s.loading = false;
        if (!s.wanted) {
          bitmap.close();
          return;
        }
        const t = new Texture(bitmap);
        t.flipY = false;
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 4;
        t.needsUpdate = true;
        s.texture = t;
        this.onChange();
      })
      .catch(() => {
        // Plain colour stays; not retried this session.
        s.loading = false;
        s.failed = true;
      });
  }

  dispose(): void {
    for (const s of this.slots.values()) {
      if (s.texture) release(s.texture);
      s.texture = null;
      s.wanted = false;
    }
    this.slots.clear();
  }
}
