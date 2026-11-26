import { useEffect, useState } from "react";

/** "YYYY-MM-DD hh:mm:ss UTC" (UTC only at the UI edge, ADR-0003). */
export function formatUtc(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

// VN-UI-001: the bottom time bar. Shows the wall clock until the view store's simulation time (T-025) drives it.
export function TimeBar({ className }: { className?: string | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <footer className={className} aria-label="Time">
      <time dateTime={new Date(now).toISOString()}>{formatUtc(now)}</time>
      <span>Rate 1×</span>
    </footer>
  );
}
