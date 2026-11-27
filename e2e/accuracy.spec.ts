import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { formatUtc } from "../src/core/time/scales";

// T-045 (VN-INF-005): the panel's values agree with Horizons for the same epoch within each object's fit tolerance
// (VN-EPH-003). Three objects at fixed epochs taken from F2 (testdata/reference, held-out Horizons samples that the
// fit never saw): a planet, a deep-space probe and a spacecraft at L2. The panel's distance from the Sun is the
// length of the heliocentric position, so it may differ from Horizons' by at most the position tolerance, plus
// half a kilometre for the panel's rounding to whole km.

interface Ref {
  samples: { jd: string; t: number; x: number; y: number; z: number }[];
}
interface Manifest {
  objects: { id: number; tolerance_km: number }[];
}

const root = new URL("../", import.meta.url);
const read = <T>(p: string): T => JSON.parse(readFileSync(new URL(p, root), "utf8")) as T;
const manifest = read<Manifest>("public/ephem/manifest.json");

const CASES = [
  { id: 499, name: "Mars" },
  { id: -31, name: "Voyager 1" },
  { id: -170, name: "James Webb Space Telescope" },
];

for (const { id, name } of CASES) {
  test(`VN-INF-005: ${name}'s distance from the Sun matches Horizons at a fixed epoch`, async ({ page }) => {
    const ref = read<Ref>(`testdata/reference/${id}.json`);
    const s = ref.samples[Math.floor(ref.samples.length / 2)]!; // a fixed sample, mid-coverage
    const tol = manifest.objects.find((o) => o.id === id)!.tolerance_km;
    const expected = Math.hypot(s.x, s.y, s.z);

    await page.goto(`./?t=${formatUtc(s.t, 6)}&still=1`);
    await expect(page.locator("canvas")).toHaveAttribute("data-scene-ready", "1", { timeout: 20_000 });
    await page.getByRole("button", { name, exact: true }).click();
    const info = page.getByRole("region", { name: "Info" });
    await expect(info.getByRole("heading", { name })).toBeVisible();
    const readouts = info.getByLabel("Read-outs");
    await expect(readouts).toBeVisible({ timeout: 15_000 });
    await info.getByRole("combobox", { name: "Distance units" }).selectOption("km");
    const sun = readouts.locator("dt", { hasText: "Distance from the Sun" }).locator("xpath=following-sibling::dd[1]");
    await expect(sun).toHaveText(/^[\d,]+ km$/);
    const shown = Number((await sun.textContent())!.replace(/[^\d]/g, ""));
    expect(
      Math.abs(shown - expected),
      `${name} at JD ${s.jd} TDB: panel ${shown} km, Horizons ${expected} km`,
    ).toBeLessThanOrEqual(tol + 0.5);
  });
}
