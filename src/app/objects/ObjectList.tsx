import { useMemo } from "react";
import type { CatalogObject } from "../../core/catalog/schema";
import { firstMatch, searchObjects } from "./search";
import styles from "./ObjectList.module.css";

// VN-CAT-003: the searchable object list, grouped by type (Sun and planets, moons, spacecraft). The search box (in
// the top bar) filters by any name, aliases too; Enter selects the best match and flies to it; a click on a list
// entry does the same.

/** The objects shown, the display order of the Sun, planets and moons (Horizons IDs), and what choosing does. */
interface Common {
  objects: readonly CatalogObject[];
  order: readonly number[];
  /** Select and fly to. */
  onChoose(id: number): void;
}

export const OBJECT_LIST_ID = "object-list";

export function ObjectSearch({
  objects,
  order,
  query,
  onQuery,
  onChoose,
  className,
}: Common & { query: string; onQuery(q: string): void; className?: string | undefined }) {
  return (
    <input
      className={className}
      type="search"
      placeholder="Search objects"
      aria-label="Search objects"
      aria-controls={OBJECT_LIST_ID}
      value={query}
      onChange={(e) => onQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const o = firstMatch(objects, query, order);
          if (o) onChoose(o.id);
        } else if (e.key === "Escape" && query !== "") {
          e.stopPropagation();
          onQuery("");
        }
      }}
    />
  );
}

export function ObjectList({
  objects,
  order,
  query,
  selection,
  onChoose,
}: Common & { query: string; selection: number | null }) {
  const groups = useMemo(() => searchObjects(objects, query, order), [objects, query, order]);
  return (
    <div id={OBJECT_LIST_ID}>
      {groups.length === 0 && <p className={styles.none}>No object matches “{query}”.</p>}
      {groups.map((g) => (
        <section key={g.group} aria-label={g.group}>
          <h3 className={styles.group}>{g.group}</h3>
          <ul className={styles.list}>
            {g.objects.map((o) => (
              <li key={o.id}>
                <button type="button" aria-current={selection === o.id} onClick={() => onChoose(o.id)}>
                  {o.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
