import { useEffect, useState, type ReactNode } from "react";
import { CATALOG_BY_ID } from "../catalog";
import { useView, viewStore } from "../store/view";
import { createAnnouncer, describeView, followMessage, selectionMessage, utcDate } from "./announce";

// VN-ACC-002: the polite live region (selection changes and arrivals, throttled) and the 3D view's text alternative.

const nameOf = (id: number): string => CATALOG_BY_ID.get(id)?.name ?? `object ${id}`;

export function Announcements() {
  const [text, setText] = useState("");
  useEffect(() => {
    const a = createAnnouncer(setText);
    const unsubscribe = viewStore.subscribe((s, prev) => {
      if (s.selection !== prev.selection) a.say(selectionMessage(s.selection, nameOf));
      // a fly-to to another object also drops the follow on its way: only its arrival is said
      const flyingAway = s.following === null && prev.following !== null && s.target !== prev.following;
      if (s.following !== prev.following && !flyingAway) {
        const m = followMessage(s.following, prev.following, nameOf);
        if (m) a.say(m);
      }
    });
    return () => {
      unsubscribe();
      a.dispose();
    };
  }, []);
  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-label="Announcements">
      {text}
    </div>
  );
}

/** Wraps the 3D canvas as an image whose name describes the view (date to the day, so it changes rarely). */
export function DescribedView({ className, children }: { className?: string | undefined; children: ReactNode }) {
  const dateUtc = useView((s) => utcDate(s.t));
  const following = useView((s) => s.following);
  const selection = useView((s) => s.selection);
  const scale = useView((s) => s.scale);
  const rate = useView((s) => s.rate);
  const paused = useView((s) => s.paused);
  const label = describeView({ dateUtc, following, selection, scale, rate, paused }, nameOf);
  return (
    <div className={className} role="img" aria-label={label}>
      {children}
    </div>
  );
}
