// VN-CAT-001: the catalog (data/catalog.json) and its checker. One entry per object: Horizons ID, names, type,
// parent, launch date, mission status with an "as of" date, agency, a one-paragraph summary in our own words,
// science goals, source links, colour and marker priority. `validateCatalog` collects every problem it finds and
// throws them together, so a bad edit shows all its faults at once. Pure: no I/O.

export const OBJECT_TYPES = ["star", "planet", "moon", "spacecraft", "satellite"] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

/** Mission state. "unclear" when public sources disagree; the note says why. */
export const MISSION_STATES = ["operating", "ended", "unclear"] as const;
export type MissionState = (typeof MISSION_STATES)[number];

export interface MissionStatus {
  state: MissionState;
  /** UTC date (YYYY-MM-DD) the status was last checked. */
  as_of: string;
  note?: string;
}

export interface Source {
  title: string;
  /** https only (VN-INF-003 safe links). */
  url: string;
}

/**
 * VN-CAT-007, ADR-0007: an Earth satellite's catalog ID from its NORAD catalogue number, -(100000 + NORAD), the
 * convention Horizons uses for the few satellites it has (the ISS, NORAD 25544, is -125544). Satellites are
 * propagated from GP elements, not taken from Horizons, so the ID only has to be unique and stable; this form cannot
 * collide with a Horizons spacecraft ID (-1..-99999) or a body.
 */
export function satelliteId(norad: number): number {
  return -(100000 + norad);
}

/** VN-TIM-005: what kind of event a timeline mark is. Launch comes from `launch`. */
export const EVENT_KINDS = ["flyby", "arrival", "milestone"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export interface CatalogEvent {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  kind: EventKind;
  label: string;
}

export interface CatalogObject {
  id: number;
  /** Satellites only: NORAD catalogue number; `id` is satelliteId(norad). */
  norad?: number;
  name: string;
  /** Horizons' name where it differs from ours (check-ids, VN-DAT-008). */
  horizons_name?: string;
  /** Other names searched by type-ahead (VN-CAT-003). */
  aliases: string[];
  type: ObjectType;
  /** Horizons ID of the body it moves around; absent only for the Sun. */
  parent?: number;
  /** Spacecraft and satellites: UTC launch date. */
  launch?: string;
  /** Spacecraft only. */
  status?: MissionStatus;
  /** Spacecraft only: past flybys, arrivals and milestones in date order (VN-TIM-005). */
  events?: CatalogEvent[];
  agency?: string;
  summary: string;
  goals: string[];
  sources: Source[];
  /** #rrggbb */
  colour: string;
  /** Marker and label priority: higher wins declutter and pick ties. */
  priority: number;
}

export interface Catalog {
  objects: CatalogObject[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COLOUR = /^#[0-9a-f]{6}$/;

function isDate(s: unknown): s is string {
  if (typeof s !== "string" || !DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

const isStr = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;

/** True for an absolute https URL with a host and no credentials. */
export function isSafeUrl(s: unknown): boolean {
  if (typeof s !== "string") return false;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && u.hostname.length > 0 && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}

const KEYS = new Set([
  "id",
  "norad",
  "name",
  "horizons_name",
  "aliases",
  "type",
  "parent",
  "launch",
  "status",
  "events",
  "agency",
  "summary",
  "goals",
  "sources",
  "colour",
  "priority",
]);

/** VN-TIM-005: dated, known kind, labelled, in order, between launch and the status check (no planned events). */
function checkEvents(o: Record<string, unknown>, bad: (m: string) => void): void {
  if (!Array.isArray(o.events)) return void bad("events must be a list");
  const asOf = (o.status as { as_of?: unknown } | undefined)?.as_of;
  let prev = "";
  (o.events as Record<string, unknown>[]).forEach((e, j) => {
    if (!isDate(e?.date)) return void bad(`events[${j}].date must be a YYYY-MM-DD date`);
    if (!EVENT_KINDS.includes(e.kind as EventKind)) bad(`events[${j}].kind must be one of ${EVENT_KINDS.join(", ")}`);
    if (!isStr(e.label)) bad(`events[${j}].label missing`);
    if (isDate(o.launch) && e.date < o.launch) bad(`events[${j}] is before launch`);
    if (isDate(asOf) && e.date > asOf) bad(`events[${j}] is after status.as_of`);
    if (e.date < prev) bad("events must be in date order");
    prev = e.date;
  });
}

/** Checks the parsed JSON; returns it typed or throws one error listing every problem. */
export function validateCatalog(json: unknown): Catalog {
  const errs: string[] = [];
  const root = json as { objects?: unknown };
  if (!root || typeof root !== "object" || !Array.isArray(root.objects)) {
    throw new Error("catalog: expected { objects: [...] }");
  }
  const objects = root.objects as Record<string, unknown>[];
  const ids = new Set<number>();
  const names = new Map<string, number>();
  objects.forEach((o, i) => {
    const at = `objects[${i}]${isStr(o?.name) ? ` (${o.name})` : ""}`;
    const bad = (m: string) => errs.push(`${at}: ${m}`);
    if (!o || typeof o !== "object") return void bad("not an object");
    for (const k of Object.keys(o)) if (!KEYS.has(k)) bad(`unknown key "${k}"`);
    if (!Number.isInteger(o.id) || o.id === 0) bad("id must be a non-zero integer");
    else if (ids.has(o.id as number)) bad(`duplicate id ${String(o.id)}`);
    else ids.add(o.id as number);
    if (!isStr(o.name)) bad("name missing");
    if (o.horizons_name !== undefined && !isStr(o.horizons_name)) bad("horizons_name must be a string");
    if (!Array.isArray(o.aliases) || !o.aliases.every(isStr)) bad("aliases must be a list of names");
    for (const n of [o.name, ...(Array.isArray(o.aliases) ? o.aliases : [])]) {
      if (!isStr(n)) continue;
      const key = n.toLowerCase();
      const prev = names.get(key);
      if (prev !== undefined && prev !== o.id) bad(`name "${n}" is also used by ${prev}`);
      names.set(key, o.id as number);
    }
    if (!OBJECT_TYPES.includes(o.type as ObjectType)) bad(`type must be one of ${OBJECT_TYPES.join(", ")}`);
    if (o.type === "star") {
      if (o.parent !== undefined) bad("the star has no parent");
    } else if (!Number.isInteger(o.parent)) bad("parent missing");
    const craft = o.type === "spacecraft" || o.type === "satellite";
    if (o.type === "satellite") {
      if (!Number.isInteger(o.norad) || (o.norad as number) <= 0 || (o.norad as number) > 99999) {
        bad("norad must be a NORAD catalogue number (1..99999)");
      } else if (o.id !== satelliteId(o.norad as number))
        bad(`a satellite's id must be ${satelliteId(o.norad as number)}`);
      if (o.parent !== 399) bad("a satellite's parent is Earth (399)");
    } else if (o.norad !== undefined) bad("only satellites have a NORAD number");
    if (craft) {
      if (!isDate(o.launch)) bad("launch must be a YYYY-MM-DD date");
      const s = o.status as Record<string, unknown> | undefined;
      if (!s || typeof s !== "object") bad("status missing");
      else {
        if (!MISSION_STATES.includes(s.state as MissionState)) bad(`status.state must be ${MISSION_STATES.join(", ")}`);
        if (!isDate(s.as_of)) bad("status.as_of must be a YYYY-MM-DD date");
        if (s.note !== undefined && !isStr(s.note)) bad("status.note must be text");
        if (s.state === "unclear" && !isStr(s.note)) bad("an unclear status needs a note");
        if (isDate(o.launch) && isDate(s.as_of) && s.as_of < o.launch) bad("status.as_of is before launch");
      }
      if (!isStr(o.agency)) bad("agency missing");
      if (o.events !== undefined) checkEvents(o, bad);
    } else {
      if (o.launch !== undefined) bad("only spacecraft and satellites have a launch date");
      if (o.status !== undefined) bad("only spacecraft and satellites have a mission status");
    }
    if (o.events !== undefined && o.type !== "spacecraft") {
      bad("only spacecraft have events");
    }
    if (!isStr(o.summary)) bad("summary missing");
    else if (o.summary.length < 80 || o.summary.length > 900) bad("summary should be one paragraph (80..900 chars)");
    else if (o.summary.includes("\n")) bad("summary must be one paragraph");
    if (!Array.isArray(o.goals) || !o.goals.every(isStr)) bad("goals must be a list of text");
    else if (o.type === "spacecraft" && o.goals.length === 0) bad("a spacecraft needs at least one goal");
    if (!Array.isArray(o.sources) || o.sources.length === 0) bad("at least one source");
    else
      o.sources.forEach((s: Record<string, unknown>, j: number) => {
        if (!isStr(s?.title)) bad(`sources[${j}].title missing`);
        if (!isSafeUrl(s?.url)) bad(`sources[${j}].url must be an https URL`);
      });
    if (typeof o.colour !== "string" || !COLOUR.test(o.colour)) bad("colour must be #rrggbb (lower case)");
    if (!Number.isInteger(o.priority) || (o.priority as number) < 0 || (o.priority as number) > 100) {
      bad("priority must be an integer 0..100");
    }
  });
  for (const [i, o] of objects.entries()) {
    if (o && Number.isInteger(o.parent) && !ids.has(o.parent as number)) {
      errs.push(`objects[${i}] (${String(o.name)}): parent ${String(o.parent)} is not in the catalog`);
    }
  }
  if (errs.length > 0) throw new Error(`catalog: ${errs.length} problem(s)\n  ${errs.join("\n  ")}`);
  return root as Catalog;
}

/** Index by ID. */
export function byId(c: Catalog): ReadonlyMap<number, CatalogObject> {
  return new Map(c.objects.map((o) => [o.id, o]));
}
