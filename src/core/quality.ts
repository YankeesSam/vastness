// VN-PRF-003: quality tiers (low, medium, high) chosen from the device, changeable in settings (VN-UI-003). A tier
// sets the pixel ratio cap, the texture size (used by the textures, T-062), the trail point budget and how faint the
// stars go. The high tier is what the app drew before tiers existed. Pure: the app gathers DeviceInfo.

export type QualityTier = "low" | "medium" | "high";
/** A setting: a tier, or auto (from the device). */
export type QualitySetting = QualityTier | "auto";

export const QUALITY_TIERS: readonly QualityTier[] = ["low", "medium", "high"];
export const QUALITY_SETTINGS: readonly QualitySetting[] = ["auto", ...QUALITY_TIERS];

export interface QualitySettings {
  /** The canvas pixel ratio is at most this. */
  maxPixelRatio: number;
  /** Largest texture edge to load, px. */
  textureSize: number;
  /** Points per spacecraft trail (both sides). */
  trailPoints: number;
  /** Stars to this visual magnitude are drawn. */
  starMagLimit: number;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  low: { maxPixelRatio: 1, textureSize: 1024, trailPoints: 513, starMagLimit: 5 },
  medium: { maxPixelRatio: 1.5, textureSize: 2048, trailPoints: 1025, starMagLimit: 6 },
  high: { maxPixelRatio: 2, textureSize: 4096, trailPoints: 2049, starMagLimit: 6.5 },
};

export interface DeviceInfo {
  pixelRatio: number;
  /** navigator.hardwareConcurrency */
  cores: number;
  /** navigator.deviceMemory (Chromium only, capped at 8); undefined elsewhere. */
  memoryGb: number | undefined;
  /** gl.MAX_TEXTURE_SIZE of a WebGL 2 context. */
  maxTextureSize: number;
  /** A touch screen is the main pointer (phones, tablets). */
  coarsePointer: boolean;
}

/** VN-PRF-003: the tier for a device. */
export function chooseTier(d: DeviceInfo): QualityTier {
  const memory = d.memoryGb ?? 8; // unknown (Firefox, Safari): not held against the device
  if (d.maxTextureSize < 4096 || d.cores <= 2) return "low";
  if (d.coarsePointer && (memory <= 4 || d.cores <= 4)) return "low";
  if (!d.coarsePointer && d.cores >= 4 && memory >= 8 && d.maxTextureSize >= 8192) return "high";
  return "medium";
}

/** The setting if it names a tier, else the device's tier. */
export function resolveTier(setting: QualitySetting, d: DeviceInfo): QualityTier {
  return setting === "auto" ? chooseTier(d) : setting;
}
