import type { DeviceInfo } from "../core/quality";

// VN-PRF-003, VN-GEN-011: what the device offers, read once per page load: WebGL 2 (without it the app shows the
// fallback view, VN-ACC-004) and the facts the quality tier is chosen from.

export interface Device {
  webgl2: boolean;
  info: DeviceInfo;
}

/** Opens a throwaway WebGL 2 context for its limits, then releases it. */
export function probeDevice(win: Window = window): Device {
  const nav = win.navigator as Navigator & { deviceMemory?: number };
  let webgl2 = false;
  let maxTextureSize = 0;
  try {
    const gl = win.document.createElement("canvas").getContext("webgl2");
    if (gl) {
      webgl2 = true;
      maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    }
  } catch {
    // no WebGL 2
  }
  return {
    webgl2,
    info: {
      pixelRatio: win.devicePixelRatio || 1,
      cores: nav.hardwareConcurrency || 4,
      memoryGb: typeof nav.deviceMemory === "number" ? nav.deviceMemory : undefined,
      maxTextureSize,
      coarsePointer: win.matchMedia?.("(pointer: coarse)").matches ?? false,
    },
  };
}

let probed: Device | null = null;

/** This page load's device, probed on first use. */
export function getDevice(): Device {
  probed ??= probeDevice();
  return probed;
}
