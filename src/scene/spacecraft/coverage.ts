import type { CatalogObject } from "../../core/catalog/schema";
import { formatUtc } from "../../core/time/scales";

// VN-EPH-007: a spacecraft is drawn only inside its trajectory coverage (launch, or Horizons' first epoch, to the
// end of Horizons' predictions). Outside it nothing is drawn and the info panel says why. Pure.

export type CoverageReason =
  "before-launch" | "no-data-yet" | "mission-ended" | "beyond-predictions" | "no-trajectory" | "elements-stale";

/** VN-CAT-007: GP elements are drawn exactly this many days either side of their epoch (ADR-0007). */
const SATELLITE_VALID_S = 14 * 86400;

export interface CoverageState {
  drawn: boolean;
  reason: CoverageReason | null;
}

const date = (t: number): string => formatUtc(t, 0).slice(0, 10);

/**
 * Whether the object is drawn at TDB time t, and why not. `coverage` is the ephemeris coverage (null when the
 * ephemeris has none for it); `launchT` the launch instant (TDB seconds) when the catalog has one.
 */
export function coverageState(
  t: number,
  coverage: { start: number; end: number } | null,
  entry: (Pick<CatalogObject, "status"> & Partial<Pick<CatalogObject, "type">>) | undefined,
  launchT: number | null,
): CoverageState {
  if (!coverage) return { drawn: false, reason: "no-trajectory" };
  if (t >= coverage.start && t <= coverage.end) return { drawn: true, reason: null };
  // VN-CAT-007: a satellite's coverage is the 14 days either side of its element epoch.
  if (entry?.type === "satellite" && (launchT === null || t >= launchT))
    return { drawn: false, reason: "elements-stale" };
  if (t < coverage.start) {
    return { drawn: false, reason: launchT === null || t < launchT ? "before-launch" : "no-data-yet" };
  }
  return { drawn: false, reason: entry?.status?.state === "ended" ? "mission-ended" : "beyond-predictions" };
}

/** The panel's sentence for a reason (VN-EPH-007), with the dates that bound the coverage. */
export function reasonText(
  reason: CoverageReason,
  name: string,
  coverage: { start: number; end: number } | null,
  launch?: string,
): string {
  switch (reason) {
    case "before-launch":
      return `${name} has not launched yet at this time${launch ? ` (launch ${launch})` : ""}.`;
    case "no-data-yet":
      return `Horizons has no trajectory for ${name} before ${date(coverage!.start)}.`;
    case "mission-ended":
      return `${name}'s mission has ended; Horizons has no trajectory after ${date(coverage!.end)}.`;
    case "beyond-predictions":
      return `This is beyond Horizons' predictions for ${name}, which end on ${date(coverage!.end)}.`;
    case "no-trajectory":
      return `No trajectory for ${name} is loaded yet.`;
    case "elements-stale":
      return (
        `This is more than 14 days from ${name}'s orbital elements (epoch ${date(coverage!.end - SATELLITE_VALID_S)}), ` +
        "too far for SGP4 to give its true position."
      );
  }
}
