import { Fragment, useEffect, useRef } from "react";
import styles from "../about/About.module.css";
import { SHORTCUTS } from "./keymap";

// VN-ACC-001: the shortcut help dialog. Escape is caught in the capture phase and marked handled, so it closes the
// dialog without also releasing the camera's follow.
export function HelpDialog({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close.current();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (before instanceof HTMLElement) before.focus(); // focus returns where it was
    };
  }, []);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keys-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="keys-title">Keyboard shortcuts</h2>
        <dl className={styles.facts}>
          {SHORTCUTS.map((s) => (
            <Fragment key={s.does}>
              <dt>
                {s.keys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && " "}
                    <kbd>{k}</kbd>
                  </span>
                ))}
              </dt>
              <dd>{s.does}</dd>
            </Fragment>
          ))}
        </dl>
        <button ref={closeRef} type="button" className={styles.close} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
