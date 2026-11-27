import type { CatalogObject } from "../../core/catalog/schema";
import { formatUtc } from "../../core/time/scales";

// VN-EPH-007: a spacecraft is drawn only inside its trajectory coverage (launch, or Horizons' first epoch, to the
// end of Horizons' predictions). Outside it nothing is drawn and the info panel says why. Pure.

export type CoverageReason = "before-launch" | "no-data-yet" | "mission-ended" | "beyond-predictions" | "no-trajectory";

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
  entry: Pick<CatalogObject, "status"> | undefined,
  launchT: number | null,
): CoverageState {
  if (!coverage) return { drawn: false, reason: "no-trajectory" };
  if (t >= coverage.start && t <= coverage.end) return { drawn: true, reason: null };
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
  }
}
