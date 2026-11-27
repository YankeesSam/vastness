import type { CatalogObject } from "../../core/catalog/schema";

// VN-CAT-003: the object list's groups and its type-ahead. Pure.

export type Group = "Sun and planets" | "Moons" | "Spacecraft";
export const GROUPS: readonly Group[] = ["Sun and planets", "Moons", "Spacecraft"];

export function groupOf(o: Pick<CatalogObject, "type">): Group {
  return o.type === "spacecraft" ? "Spacecraft" : o.type === "moon" ? "Moons" : "Sun and planets";
}

/** Lower case, accents and punctuation dropped, spaces collapsed. */
export function fold(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * How well `query` matches any of the object's names: 0 a name starts with it, 1 a word in a name starts with it,
 * 2 a name contains it; -1 no match. An empty query matches everything at 0.
 */
export function matchRank(o: Pick<CatalogObject, "name" | "aliases">, query: string): number {
  const q = fold(query);
  if (q === "") return 0;
  let best = -1;
  for (const n of [o.name, ...o.aliases]) {
    const f = fold(n);
    const r = f.startsWith(q) ? 0 : ` ${f}`.includes(` ${q}`) ? 1 : f.includes(q) ? 2 : -1;
    if (r >= 0 && (best < 0 || r < best)) best = r;
  }
  return best;
}

export interface GroupedResult {
  group: Group;
  objects: CatalogObject[];
}

/**
 * The objects that match, grouped in GROUPS order. Within a group: by match rank, then the given order for the Sun,
 * planets and moons (from the Sun outwards) and by name for spacecraft. Empty groups are left out.
 */
export function searchObjects(
  objects: readonly CatalogObject[],
  query: string,
  order: readonly number[],
): GroupedResult[] {
  const pos = new Map(order.map((id, i) => [id, i]));
  const out: GroupedResult[] = [];
  for (const group of GROUPS) {
    const hits = objects
      .filter((o) => groupOf(o) === group)
      .map((o) => ({ o, r: matchRank(o, query) }))
      .filter((x) => x.r >= 0)
      .sort(
        (a, b) =>
          a.r - b.r ||
          (group === "Spacecraft"
            ? a.o.name.localeCompare(b.o.name)
            : (pos.get(a.o.id) ?? 1e9) - (pos.get(b.o.id) ?? 1e9)),
      )
      .map((x) => x.o);
    if (hits.length > 0) out.push({ group, objects: hits });
  }
  return out;
}

/** The object Enter picks: the best match across groups (lowest rank; ties to the earlier group). */
export function firstMatch(
  objects: readonly CatalogObject[],
  query: string,
  order: readonly number[],
): CatalogObject | null {
  let best: CatalogObject | null = null;
  let bestR = Infinity;
  for (const g of searchObjects(objects, query, order)) {
    const o = g.objects[0]!;
    const r = matchRank(o, query);
    if (r < bestR) {
      best = o;
      bestR = r;
    }
  }
  return best;
}
