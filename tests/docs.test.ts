import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** Body of a `## heading` section of a Markdown file (up to the next `## `). */
function section(md: string, heading: string): string {
  const start = md.indexOf(`\n## ${heading}\n`);
  if (start < 0) return "";
  const rest = md.slice(start + heading.length + 5);
  const end = rest.indexOf("\n## ");
  return end < 0 ? rest : rest.slice(0, end);
}

describe("licence and README (T-010)", () => {
  const license = read("LICENSE");
  const notice = read("NOTICE");
  const readme = read("README.md");
  const pkg = JSON.parse(read("package.json")) as { license?: string; repository?: { url?: string } };

  it("VN-GEN-007: LICENSE is the unmodified Apache License 2.0 and package.json agrees", () => {
    expect(license).toMatch(
      /^\s*Apache License\s+Version 2\.0, January 2004\s+http:\/\/www\.apache\.org\/licenses\/\s/,
    );
    expect(license).toContain("END OF TERMS AND CONDITIONS");
    // Section 4(b) and 4(d): changed files must say so, and NOTICE travels with every copy.
    expect(license).toContain("You must cause any modified files to carry prominent notices");
    expect(license).toMatch(/NOTICE"\s+text file/);
    // Section 6: no trademark grant.
    expect(license).toContain("does not grant permission to use the trade");
    expect(pkg.license).toBe("Apache-2.0");
    expect(pkg.repository?.url).toContain("github.com/YankeesSam/vastness");
  });

  it("VN-GEN-007: NOTICE names the work, credits the author and asks for the notice and change marks to travel", () => {
    expect(notice.split("\n")[0]).toBe("Vastness");
    expect(notice).toMatch(/^Copyright 2026 \S.*$/m);
    expect(notice).toContain("https://github.com/YankeesSam/vastness");
    expect(notice).toContain("Apache License, Version 2.0");
    expect(notice).toMatch(/name "Vastness"/);
    expect(notice).toContain("THIRD_PARTY_NOTICES.txt");
    expect(notice).not.toMatch(/@[\w.-]+\.\w+/); // no e-mail addresses
  });

  it("VN-GEN-007: the build ships LICENSE, NOTICE and the third-party notices", () => {
    const config = read("vite.config.ts");
    for (const f of ["LICENSE", "NOTICE", "THIRD_PARTY_NOTICES.txt"]) expect(config).toContain(`"${f}"`);
  });

  it("VN-DOC-001: README says what Vastness is, how to run it, how data is made and its licence", () => {
    expect(readme).toMatch(/^# Vastness\n/);
    const run = section(readme, "Develop");
    for (const cmd of ["npm ci", "npm run dev", "npm test", "npm run build"]) expect(run).toContain(cmd);
    expect(section(readme, "Data")).toContain("Horizons");
    expect(section(readme, "Data")).toContain("docs/DATA_SOURCES.md");
    const licence = section(readme, "Licence");
    expect(licence).toContain("Apache License 2.0");
    expect(licence).toContain("(LICENSE)");
    expect(licence).toContain("(NOTICE)");
    expect(licence).not.toMatch(/\bMIT\b|OI-1/);
  });
});

describe("data sources (T-024)", () => {
  const sources = read("docs/DATA_SOURCES.md");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const files = (dir: string): string[] => {
    const abs = join(root, dir);
    if (!existsSync(abs)) return [];
    const out: string[] = [];
    const walk = (d: string): void => {
      for (const name of readdirSync(d).sort()) {
        const p = join(d, name);
        if (statSync(p).isDirectory()) walk(p);
        else out.push(relative(root, p).split(sep).join("/"));
      }
    };
    walk(abs);
    return out;
  };
  /** Paths the document names (in table cells or prose), e.g. public/ephem or data/bodies.json. */
  const named = new Set(
    [...sources.matchAll(/(?:^|[\s(`,;])((?:data|public|testdata|src)\/[\w./-]*\w)/g)].map((m) => m[1]!),
  );
  /** A file is listed when the document names it or one of its parent directories. */
  const listed = (file: string): boolean => {
    const parts = file.split("/");
    for (let k = parts.length; k >= 2; k--) if (named.has(parts.slice(0, k).join("/"))) return true;
    return false;
  };

  it("VN-DOC-002: every file under data/, testdata/, public/ephem/ and public/textures/ is listed", () => {
    const all = ["data", "testdata", "public/ephem", "public/textures"].flatMap(files);
    expect(all.length).toBeGreaterThan(0);
    expect(all.filter((f) => !listed(f))).toEqual([]);
  });

  it("VN-DOC-002: the listing test itself catches an unlisted file", () => {
    expect(listed("public/ephem/399/2020.bin")).toBe(true);
    expect(listed("data/catalog.json")).toBe(true);
    expect(listed("data/unlisted-example.json")).toBe(false);
    expect(listed("public/stars.bin")).toBe(true);
  });

  it("VN-DOC-002: every source row has source, provides, terms, use and a retrieval date or the task that adds it", () => {
    const rows = sources
      .split("\n")
      .filter((l) => l.startsWith("| ") && !l.startsWith("| Source ") && !l.startsWith("|---"));
    expect(rows.length).toBeGreaterThanOrEqual(6);
    for (const r of rows) {
      const cells = r
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      expect(cells, r).toHaveLength(5);
      for (const c of cells) expect(c.length, r).toBeGreaterThan(0);
      expect(cells[4], r).toMatch(/\d{4}-\d{2}-\d{2}|\(T-\d{3}\)/);
    }
  });

  it("VN-DOC-002: JPL Horizons is credited as the manifest credits it, with the manifest's retrieval dates", () => {
    const manifest = JSON.parse(read("public/ephem/manifest.json")) as {
      credit: string;
      objects: Array<{ retrieved?: string }>;
    };
    expect(sources).toContain(manifest.credit);
    const horizons = sources.split("\n").find((l) => l.startsWith("| NASA/JPL Horizons"))!;
    for (const o of manifest.objects) if (o.retrieved) expect(horizons).toContain(o.retrieved);
    // Horizons asks to be acknowledged as the source; README points readers here.
    expect(read("README.md")).toContain("docs/DATA_SOURCES.md");
  });

  it("VN-DOC-002: the code files the table names exist", () => {
    for (const p of named) {
      if (p.startsWith("src/")) expect(existsSync(join(root, p)), p).toBe(true);
    }
  });
});
