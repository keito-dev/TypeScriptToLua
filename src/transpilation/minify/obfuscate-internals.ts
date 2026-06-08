// Final, text-level pass over a fully-assembled bundle that hides two remaining "fingerprints" that
// the AST/printer passes intentionally leave readable (because tstl re-scans them as text earlier):
//
//   1. Module names — the `require("path")` arguments and `____modules["path"]` keys.
//   2. tstl runtime symbols — every `__TS__Foo` and `____foo` identifier (lualib functions, `____exports`,
//      `____modules`, `____lualib`, the require-shim internals, ...). Renaming these removes the obvious
//      "this is TypeScriptToLua output" signature.
//
// IMPORTANT — this must run as the very LAST step, after:
//   - findLuaRequires (dependency resolution) has read the require paths, and
//   - findUsedLualibFeatures has read the `local X = ____lualib.X` import lines,
// otherwise it breaks the build (see MINIFY_OBFUSCATE.md, "Invariantes críticas").
//
// It is only safe when `obfuscate` is also enabled: with string literals already escape-encoded, no
// readable `__TS__`/`____`/module-path token can appear inside a user string, so the regex replacements
// can't corrupt string contents. Bundle-only (module names have no meaning across separate files).

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// `__TS__Foo`, `____foo`, and the bare `____` anonymous identifier (4+ underscores, optional suffix).
// These are always bundle-internal identifiers.
const tstlSymbolRegex = /\b(?:__TS__\w+|_{4,}\w*)\b/g;

/** Renames module names and tstl runtime symbols in a fully-assembled bundle, consistently. */
export function obfuscateBundleInternals(code: string): string {
    let counter = 0;
    const map = new Map<string, string>();
    const nameFor = (key: string): string => {
        let name = map.get(key);
        if (name === undefined) {
            // Leading "_" so the result is always a valid Lua identifier (can't start with a digit).
            name = "_" + (counter++).toString(36);
            map.set(key, name);
        }
        return name;
    };

    // Phase 1 — module names. Collect every path from `require("...")` and `____modules["..."]`, then
    // replace each quoted occurrence. Done before phase 2 so a path containing `____`/`__TS__` (e.g. a
    // folder name) is handled here and not double-processed.
    const modulePaths = new Set<string>();
    const collect = (regex: RegExp) => {
        for (let m = regex.exec(code); m; m = regex.exec(code)) modulePaths.add(m[2]);
    };
    collect(/require\(\s*(["'])([^"'\n]+?)\1\s*\)/g);
    collect(/____modules\s*\[\s*(["'])([^"'\n]+?)\1\s*\]/g);

    for (const modulePath of modulePaths) {
        const replacement = nameFor("module:" + modulePath);
        const quoted = new RegExp(`(["'])${escapeRegExp(modulePath)}\\1`, "g");
        code = code.replace(quoted, `"${replacement}"`);
    }

    // Phase 1.5 — the bundle's `require` shim. Rename its definition and every call site, but NOT the
    // bare `____originalRequire = require` capture (that one references the real global `require`, which
    // the shim falls back to for non-bundled modules). The lookahead `(?=\s*\()` matches `require` only
    // when it is being called / defined (`require(` / `function require(`), never the bare capture.
    const requireShim = nameFor("require-shim");
    code = code.replace(/\brequire\b(?=\s*\()/g, requireShim);

    // Phase 2 — tstl runtime symbols (identifiers). Safe because findUsedLualibFeatures already ran.
    code = code.replace(tstlSymbolRegex, symbol => nameFor("symbol:" + symbol));

    // Phase 3 — drop the "Generated with TypeScriptToLua" header comment (the most obvious fingerprint).
    code = code.replace(/--\[\[ Generated with [\s\S]*?\]\]\n?/g, "");

    return code;
}
