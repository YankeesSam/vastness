// Deterministic JSON for the build-time data files (VN-GEN-010): keys sorted at every level, LF, a final newline,
// and each element of a top-level array on its own line, so a refresh diffs by record and the file stays compact.

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .filter((k) => o[k] !== undefined)
        .map((k) => [k, sortKeys(o[k])]),
    );
  }
  return v;
}

export function recordsJson(value: Record<string, unknown>): string {
  const o = sortKeys(value) as Record<string, unknown>;
  const lines = Object.entries(o).map(([k, v]) => {
    if (Array.isArray(v) && v.length > 0)
      return `${JSON.stringify(k)}:[\n${v.map((x) => JSON.stringify(x)).join(",\n")}\n]`;
    return `${JSON.stringify(k)}:${JSON.stringify(v)}`;
  });
  return `{\n${lines.join(",\n")}\n}\n`;
}
