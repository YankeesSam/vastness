import { buildSpaceWeather, type CdawFile, type SpaceWeather } from "../../core/spaceweather/model";
import type { DonkiFile, SolarWindFile } from "../../core/spaceweather/types";
import { loadAsset } from "./loader";

// T-101, T-102 (VN-EXT-005..007): the space weather files, fetched from our own origin the first time the layer is
// turned on (never at start). DONKI is required; CDAW and SWPC are added when present.

let pending: Promise<SpaceWeather> | null = null;

const json = async <T>(path: string): Promise<T> => JSON.parse(new TextDecoder().decode(await loadAsset(path))) as T;
const optional = <T>(path: string): Promise<T | null> => json<T>(path).catch(() => null);

export function loadSpaceWeather(): Promise<SpaceWeather> {
  pending ??= Promise.all([
    json<DonkiFile>("spaceweather/donki.json"),
    optional<CdawFile>("spaceweather/cdaw.json"),
    optional<SolarWindFile>("spaceweather/swpc.json"),
  ]).then(([d, c, s]) => buildSpaceWeather(d, c, s));
  pending.catch(() => {
    pending = null; // a later toggle tries again
  });
  return pending;
}

/** The loaded data, for code that must not wait (the frame loop): null until loadSpaceWeather has resolved. */
export const spaceWeatherCache: { current: SpaceWeather | null } = { current: null };
export function ensureSpaceWeather(): Promise<SpaceWeather> {
  return loadSpaceWeather().then((sw) => (spaceWeatherCache.current = sw));
}
