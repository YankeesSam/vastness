import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Architecture guards (T-002). Each guard is a pure function over source text so it can be proved on synthetic
// violations below, then run over the real tree. Comments are stripped first so prose may name a banned API.

const root = fileURLToPath(new URL("../", import.meta.url));

/** Source files under `dir` (repo-relative, forward slashes), tests excluded. */
function sources(dir: string): string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mts|js|mjs)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) {
        out.push(relative(root, p).split(sep).join("/"));
      }
    }
  };
  walk(abs);
  return out;
}

/** Removes block and line comments; keeps `://` inside strings. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

interface Rule {
  name: string;
  re: RegExp;
}

function violations(src: string, rules: Rule[]): string[] {
  const code = stripComments(src);
  return rules.filter((r) => r.re.test(code)).map((r) => r.name);
}

const NODE_BUILTINS =
  "fs|path|url|os|crypto|child_process|http|https|net|stream|util|events|buffer|worker_threads|zlib|module";

// VN-GEN-004: the core imports no DOM, React, three.js or Node API and touches no host globals.
const CORE_RULES: Rule[] = [
  { name: "import react", re: /(from|import|require\()\s*\(?\s*["'](react|react-dom)(\/[^"']*)?["']/ },
  { name: "import three", re: /(from|import|require\()\s*\(?\s*["'](three|@react-three\/[^"']+)(\/[^"']*)?["']/ },
  { name: "import node:*", re: /(from|import|require\()\s*\(?\s*["']node:[^"']+["']/ },
  { name: "import node builtin", re: new RegExp(`(from|import|require\\()\\s*\\(?\\s*["'](${NODE_BUILTINS})["']`) },
  { name: "global window", re: /\bwindow\b/ },
  { name: "global document", re: /\bdocument\b/ },
  { name: "global process", re: /\bprocess\b/ },
  { name: "global navigator", re: /\bnavigator\b/ },
  { name: "global localStorage", re: /\b(localStorage|sessionStorage)\b/ },
];

// VN-GEN-002: no network outside the asset loader and the service worker.
const NETWORK_RULES: Rule[] = [
  { name: "fetch", re: /\bfetch\s*\(/ },
  { name: "XMLHttpRequest", re: /\bXMLHttpRequest\b/ },
  { name: "WebSocket", re: /\bWebSocket\b/ },
  { name: "EventSource", re: /\bEventSource\b/ },
  { name: "sendBeacon", re: /\bsendBeacon\b/ },
];
const NETWORK_ALLOWED = new Set(["src/app/assets/loader.ts", "src/sw.ts"]);

// VN-GEN-003: no dynamic code.
const DYNAMIC_RULES: Rule[] = [
  { name: "eval", re: /\beval\s*\(/ },
  { name: "new Function", re: /\bnew\s+Function\b/ },
  { name: "Function()", re: /(^|[^.\w])Function\s*\(/m },
  { name: "string timer", re: /\bset(Timeout|Interval)\s*\(\s*["'`]/ },
  { name: "computed import()", re: /\bimport\s*\(\s*(?!["'][^"'`$]*["']\s*\))/ },
];

// src may not reach into the Node pipeline.
const SRC_RULES: Rule[] = [{ name: "import tools/", re: /(from|import\s*\()\s*["'](\.\.?\/)+(\.\.\/)*tools\// }];

describe("guards detect what they claim (synthetic sources)", () => {
  it("VN-GEN-004: core rules flag DOM, React, three and Node", () => {
    expect(violations(`import { useState } from "react";`, CORE_RULES)).toContain("import react");
    expect(violations(`import { createRoot } from "react-dom/client";`, CORE_RULES)).toContain("import react");
    expect(violations(`import * as THREE from "three";`, CORE_RULES)).toContain("import three");
    expect(violations(`import { useFrame } from "@react-three/fiber";`, CORE_RULES)).toContain("import three");
    expect(violations(`import { readFileSync } from "node:fs";`, CORE_RULES)).toContain("import node:*");
    expect(violations(`import path from "path";`, CORE_RULES)).toContain("import node builtin");
    expect(violations(`const w = window.innerWidth;`, CORE_RULES)).toContain("global window");
    expect(violations(`document.title = "x";`, CORE_RULES)).toContain("global document");
    expect(violations(`const e = process.env.X;`, CORE_RULES)).toContain("global process");
    expect(violations(`localStorage.setItem("a", "b");`, CORE_RULES)).toContain("global localStorage");
  });

  it("VN-GEN-004: core rules pass plain math and comments that name banned APIs", () => {
    const ok = `// unlike window or process, this is pure\n/* document */\nexport const tdb = (s: number) => s * 2;\nimport { J2000 } from "./constants";`;
    expect(violations(ok, CORE_RULES)).toEqual([]);
  });

  it("VN-GEN-002: network rules flag every transport", () => {
    expect(violations(`await fetch("/x")`, NETWORK_RULES)).toEqual(["fetch"]);
    expect(violations(`new XMLHttpRequest()`, NETWORK_RULES)).toEqual(["XMLHttpRequest"]);
    expect(violations(`new WebSocket("wss://a")`, NETWORK_RULES)).toEqual(["WebSocket"]);
    expect(violations(`new EventSource("/s")`, NETWORK_RULES)).toEqual(["EventSource"]);
    expect(violations(`navigator.sendBeacon("/b", d)`, NETWORK_RULES)).toEqual(["sendBeacon"]);
    expect(violations(`const prefetchCount = 3; // fetch later`, NETWORK_RULES)).toEqual([]);
  });

  it("VN-GEN-003: dynamic-code rules flag eval, Function, string timers and computed import()", () => {
    expect(violations(`eval("1+1")`, DYNAMIC_RULES)).toContain("eval");
    expect(violations(`const f = new Function("a", "return a")`, DYNAMIC_RULES)).toContain("new Function");
    expect(violations(`const f = Function("return 1")`, DYNAMIC_RULES)).toContain("Function()");
    expect(violations(`setTimeout("tick()", 10)`, DYNAMIC_RULES)).toContain("string timer");
    expect(violations("setInterval(`tick()`, 10)", DYNAMIC_RULES)).toContain("string timer");
    expect(violations(`await import(url)`, DYNAMIC_RULES)).toContain("computed import()");
    expect(violations("await import(`./chunks/${name}.ts`)", DYNAMIC_RULES)).toContain("computed import()");
    expect(violations(`await import("./" + name)`, DYNAMIC_RULES)).toContain("computed import()");
  });

  it("VN-GEN-003: dynamic-code rules allow literal import(), function timers and method names", () => {
    const ok = `const m = await import("./panel");\nsetTimeout(() => tick(), 10);\nconst x = obj.Function(1);\nfunction evaluate() {}`;
    expect(violations(ok, DYNAMIC_RULES)).toEqual([]);
  });

  it("src may not import tools/", () => {
    expect(violations(`import { fit } from "../../tools/ephem/fit";`, SRC_RULES)).toEqual(["import tools/"]);
    expect(violations(`import { fit } from "./ephem/fit";`, SRC_RULES)).toEqual([]);
  });
});

function report(files: string[], rules: Rule[], skip: Set<string> = new Set()): string[] {
  return files
    .filter((f) => !skip.has(f))
    .flatMap((f) => violations(readFileSync(join(root, f), "utf8"), rules).map((v) => `${f}: ${v}`));
}

describe("guards over the source tree", () => {
  const src = sources("src");

  it("the walker sees the app entry", () => {
    expect(src).toContain("src/main.tsx");
  });

  it("VN-GEN-004: src/core imports no DOM, React, three or Node and uses no host globals", () => {
    expect(report(sources("src/core"), CORE_RULES)).toEqual([]);
  });

  it("VN-GEN-002: no network call outside src/app/assets/loader.ts and src/sw.ts", () => {
    expect(report(src, NETWORK_RULES, NETWORK_ALLOWED)).toEqual([]);
  });

  it("VN-GEN-003: no eval, new Function, string timers or computed import() in src or tools", () => {
    expect(report([...src, ...sources("tools")], DYNAMIC_RULES)).toEqual([]);
  });

  it("src does not import the Node pipeline in tools/", () => {
    expect(report(src, SRC_RULES)).toEqual([]);
  });
});
