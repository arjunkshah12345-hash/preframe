/**
 * Opt-in Vite transform for PreFrame.
 *
 * Safe by default: ONLY transforms files matching `include` globs AND
 * functions / blocks marked with `/** @preframe *\/` (or `// @preframe`).
 *
 * The transform wraps marked async function bodies so that `for` / `for-of`
 * / `while` loops automatically call shouldYield/yield between iterations.
 *
 * This is intentionally conservative — never blind-transform the whole app.
 */

import type { Plugin } from "vite";
import { createFilter } from "vite";

export interface PreframeViteOptions {
  /** Glob patterns to consider for transform. Required for safety. */
  include: string | string[];
  exclude?: string | string[];
  /** Import specifier injected into transformed files. */
  importSource?: string;
}

const MARKER = /(?:\/\*\*\s*@preframe\s*\*\/|\/\/\s*@preframe\b)/;

export function preframe(options: PreframeViteOptions): Plugin {
  if (!options?.include) {
    throw new Error(
      "@preframe/vite: `include` is required. Refusing to transform without an explicit opt-in glob.",
    );
  }

  const filter = createFilter(options.include, options.exclude ?? [/node_modules/]);
  const importSource = options.importSource ?? "@preframe/core";

  return {
    name: "preframe",
    enforce: "pre",
    transform(code, id) {
      if (!filter(id)) return null;
      if (!MARKER.test(code)) return null;
      if (!/\.(m?[jt]sx?)$/.test(id)) return null;

      const transformed = transformMarkedLoops(code, importSource);
      if (transformed === code) return null;
      return { code: transformed, map: null };
    },
  };
}

export default preframe;

/**
 * Lightweight source transform:
 * 1. Ensure a PreFrame runtime import exists.
 * 2. Inside @preframe-marked async functions, inject yield checks after loop bodies.
 *
 * Not a full Babel/SWC plugin — deliberately small and opt-in.
 * For production-grade AST transforms, prefer wrapping with `cooperative` / `run`.
 */
export function transformMarkedLoops(code: string, importSource: string): string {
  if (!MARKER.test(code)) return code;

  let out = code;
  const needsImport = !/from\s+['"]@preframe\/core['"]/.test(out) &&
    !/from\s+['"]preframe['"]/.test(out);

  // Inject after last yield/shouldYield check inside simple for-of patterns
  // Matching: for (... of ...) { ... } inside a @preframe region is hard with
  // regex; instead we rewrite a well-known helper call pattern and also
  // transform `for await`/`for` loops that follow a @preframe marker on the
  // preceding line.
  out = out.replace(
    /((?:\/\*\*\s*@preframe\s*\*\/|\/\/\s*@preframe\b)\s*\n)([\s\S]*?)(?=(?:\n\s*(?:\/\*\*|\/\/\s*@|export\s|async\s+function|function\s)|$))/g,
    (full, marker: string, body: string) => {
      const rewritten = injectYieldsInLoops(body);
      return marker + rewritten;
    },
  );

  if (needsImport && out !== code) {
    out =
      `import { PreframeScheduler } from "${importSource}";\n` +
      `const __preframe = new PreframeScheduler();\n` +
      out;
  }

  return out;
}

function injectYieldsInLoops(body: string): string {
  // Insert after the opening brace of for / for-of / while loops:
  //   if (__preframe.shouldYield()) await __preframe.yield();
  // Also note one iteration.
  return body.replace(
    /\b(for\s*\([^)]+\)\s*\{|while\s*\([^)]+\)\s*\{)/g,
    (open) =>
      `${open}\n  __preframe.noteIterations(1);\n  if (__preframe.shouldYield()) await __preframe.yield();\n`,
  );
}
