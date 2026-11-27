import { useEffect, useState } from "react";
import type { StoreApi } from "zustand/vanilla";
import { currentFragment } from "../store/url-sync";
import { viewStore, type ViewState } from "../store/view";
import styles from "./Share.module.css";

// VN-WEB-002: Share copies a link that reopens this view. The view is in the URL fragment, which browsers never send
// to a server; the query (F5 test parameters) is left out. Without clipboard access the link is shown to copy.

/** The page address without query or fragment, plus the view fragment. */
export function shareUrl(href: string, fragment: string): string {
  const u = new URL(href);
  return `${u.origin}${u.pathname}#${fragment}`;
}

export interface ShareProps {
  store?: StoreApi<ViewState>;
  copy?: (text: string) => Promise<void>;
  href?: () => string;
}

const clipboardCopy = (text: string) => navigator.clipboard.writeText(text);

export function Share({ store = viewStore, copy = clipboardCopy, href = () => location.href }: ShareProps) {
  const [state, setState] = useState<{ kind: "idle" } | { kind: "copied" } | { kind: "manual"; url: string }>({
    kind: "idle",
  });

  useEffect(() => {
    if (state.kind !== "copied") return;
    const timer = setTimeout(() => setState({ kind: "idle" }), 2500);
    return () => clearTimeout(timer);
  }, [state]);

  const share = async () => {
    const url = shareUrl(href(), currentFragment(store));
    try {
      await copy(url);
      setState({ kind: "copied" });
    } catch {
      setState({ kind: "manual", url });
    }
  };

  return (
    <div className={styles.share}>
      <button type="button" onClick={() => void share()}>
        Share
      </button>
      <span role="status" className={styles.status}>
        {state.kind === "copied" ? "Link copied" : ""}
      </span>
      {state.kind === "manual" && (
        <input
          className={styles.field}
          aria-label="Link to this view"
          readOnly
          value={state.url}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => setState({ kind: "idle" })}
        />
      )}
    </div>
  );
}
