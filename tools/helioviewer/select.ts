// T-104 (VN-EXT-009): which Sun images to fetch from Helioviewer, and the manifest that lists them. Pure; the fetch
// is tools/helioviewer/build.ts. Dates: the eruption (first linked CME) of every DONKI storm that reached Kp 8, and a
// sparse regular series, the first day of each quarter from SDO's first science months on. Each image is the
// SDO/AIA 171 Angstrom view nearest the date, as Helioviewer renders it (solar north up), 256 px square.

import { createHash } from "node:crypto";
import type { DonkiFile } from "../../src/core/spaceweather/types.ts";

export const SIZE_PX = 256;
/** arcsec per pixel: the disk (about 960 arcsec in radius) fills about 0.78 of the half-width. */
export const IMAGE_SCALE = 9.6;
export const LAYER = "[SDO,AIA,AIA,171,1,100]";
/** Helioviewer's source ID for SDO AIA 171 (getClosestImage). */
export const SOURCE_ID = 10;
export const SERIES_FROM = "2010-07-01";
export const STORM_KP = 8;
/** Download budget: per image and for all of them (one loads at a time, only when the Sun is drawn large). */
export const MAX_IMAGE_BYTES = 120_000;
export const MAX_TOTAL_BYTES = 9_000_000;

export interface SunImage {
  file: string;
  /** The date asked for, "2024-05-08T05:36Z". */
  requested: string;
  /** The image's own time (Helioviewer's nearest AIA frame), UTC ISO to the second. */
  imageDate: string;
  why: string;
  /** Solar radius as a fraction of the image half-width (to fit the image to the drawn Sun). */
  diskFraction: number;
  sha256: string;
  bytes: number;
}

export interface SunManifest {
  source: string;
  credit: string;
  retrieved: string;
  layer: string;
  sizePx: number;
  imageScale: number;
  images: SunImage[];
}

export interface Wanted {
  date: string;
  why: string;
}

/** The storm eruptions and the quarterly series up to `end` (YYYY-MM-DD), sorted, without two on the same day. */
export function selectDates(donki: Pick<DonkiFile, "storms" | "cmes">, end: string): Wanted[] {
  const starts = new Map(donki.cmes.map((c) => [c.id, c.start]));
  const out: Wanted[] = [];
  for (const g of donki.storms) {
    if (g.kpMax < STORM_KP) continue;
    const eruption = g.cmes
      .map((id) => starts.get(id) ?? `${id.slice(0, 16)}Z`)
      .sort()
      .at(-1);
    out.push({ date: eruption ?? g.start, why: `eruption before the Kp ${g.kpMax} storm of ${g.start.slice(0, 10)}` });
  }
  for (let y = Number(SERIES_FROM.slice(0, 4)); ; y++) {
    let done = false;
    for (const m of ["01", "04", "07", "10"]) {
      const d = `${y}-${m}-01`;
      if (d < SERIES_FROM) continue;
      if (d > end) {
        done = true;
        break;
      }
      out.push({ date: `${d}T00:00Z`, why: "quarterly series" });
    }
    if (done) break;
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  // storms first when both fall on one day
  const byDay = new Map<string, Wanted>();
  for (const w of out) {
    const k = w.date.slice(0, 10);
    const had = byDay.get(k);
    if (!had || (had.why === "quarterly series" && w.why !== "quarterly series")) byDay.set(k, w);
  }
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function fileName(date: string): string {
  return `${date.slice(0, 16).replace(/[-:]/g, "").replace("T", "-")}.png`;
}

export function screenshotUrl(date: string): string {
  const q = new URLSearchParams({
    date: `${date.slice(0, 16)}:00Z`,
    imageScale: String(IMAGE_SCALE),
    layers: LAYER,
    x0: "0",
    y0: "0",
    width: String(SIZE_PX),
    height: String(SIZE_PX),
    display: "true",
    watermark: "false",
  });
  return `https://api.helioviewer.org/v2/takeScreenshot/?${q}`;
}

export function closestUrl(date: string): string {
  return `https://api.helioviewer.org/v2/getClosestImage/?date=${date.slice(0, 16)}:00Z&sourceId=${SOURCE_ID}`;
}

/** The image date and disk fraction from a getClosestImage answer. */
export function readClosest(body: string): { imageDate: string; diskFraction: number } {
  const j = JSON.parse(body) as { date?: string; rsun?: number; scale?: number };
  if (!j.date || !j.rsun || !j.scale) throw new Error(`no image in Helioviewer answer: ${body.slice(0, 200)}`);
  const rsunArcsec = j.rsun * j.scale;
  return {
    imageDate: `${j.date.replace(" ", "T")}Z`,
    diskFraction: Number((rsunArcsec / IMAGE_SCALE / (SIZE_PX / 2)).toFixed(4)),
  };
}

/** The width and height in a PNG's IHDR chunk, or null. */
export function pngSize(b: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (b.length < 24 || sig.some((v, i) => b[i] !== v)) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

/** Problems with one image's bytes against its entry; empty when it matches. */
export function verifyImage(e: SunImage, b: Uint8Array): string[] {
  const out: string[] = [];
  const sha = createHash("sha256").update(b).digest("hex");
  if (sha !== e.sha256) out.push(`${e.file}: sha256 ${sha}, expected ${e.sha256}`);
  if (b.length !== e.bytes) out.push(`${e.file}: ${b.length} bytes, expected ${e.bytes}`);
  const s = pngSize(b);
  if (!s || s.width !== SIZE_PX || s.height !== SIZE_PX)
    out.push(`${e.file}: ${s ? `${s.width}x${s.height}` : "not a PNG"}, expected ${SIZE_PX}x${SIZE_PX}`);
  return out;
}
