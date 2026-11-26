import { readFileSync } from "node:fs";
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
