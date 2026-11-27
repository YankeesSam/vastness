import raw from "../../data/catalog.json";
import { byId, validateCatalog, type CatalogObject } from "../core/catalog/schema";

// VN-CAT-001: the catalog, bundled with the app and checked once at start-up.

export const CATALOG = validateCatalog(raw);
export const CATALOG_BY_ID: ReadonlyMap<number, CatalogObject> = byId(CATALOG);

/** Launch instant as TDB seconds (0h UTC of the launch date), or null. */
export function launchTdb(o: CatalogObject | undefined, parse: (iso: string) => number): number | null {
  return o?.launch ? parse(o.launch) : null;
}
