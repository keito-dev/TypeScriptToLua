import * as lua from "../../LuaAST";
import { luaKeywords } from "../../transformation/utils/safe-names";
import { ScopeAnalysis } from "./scope";

// Free identifiers that must NOT be rewritten to `_G[...]`:
//  - `_G`/`require`/`self`/`arg` are special (and `require` is a *local* shim under luaBundle).
//  - `__TS__*` / `____*` are tstl/lualib helpers that are injected as locals at print time, so they
//    look free in the AST here but are not real globals — rewriting them would break the output.
const excludedExactNames: ReadonlySet<string> = new Set(["_G", "require", "self", "arg"]);

function isExcludedGlobal(name: string): boolean {
    return (
        excludedExactNames.has(name) || name.startsWith("__TS__") || name.startsWith("____") || luaKeywords.has(name)
    );
}

/** Turns an existing identifier node into a `_G["name"]` table-index expression, in place. */
function morphToGlobalAccess(node: lua.Identifier, name: string): void {
    const target = node as unknown as lua.TableIndexExpression;
    target.kind = lua.SyntaxKind.TableIndexExpression;
    target.table = lua.createIdentifier("_G");
    target.index = lua.createStringLiteral(name);
    delete (node as Partial<lua.Identifier>).text;
    delete (node as Partial<lua.Identifier>).originalName;
    delete (node as Partial<lua.Identifier>).symbolId;
}

/**
 * Routes every global/native access through `_G["name"]` (the index string is later scrambled by the
 * printer). Reads and assignment-targets alike are rewritten in place, so `Foo()` becomes `_G["Foo"]()`
 * and `Foo = x` becomes `_G["Foo"] = x`.
 *
 * Access is rewritten *inline at the use site* (never hoisted into a chunk-local). This keeps the exact
 * lazy timing of the original: a global is only read when it is actually used, so globals defined later
 * at runtime — e.g. a class defined in another bundled module that loads after this one — still resolve
 * correctly. Hoisting would eagerly capture the value at module-load time and read `nil`. The cost is a
 * single extra table lookup per access, which is negligible (a `_G` hash lookup, same shape FiveM
 * already does for a bare native call).
 *
 * `lualibExports` are names like `Set`, `Map`, `Promise`, `Error` that the printer later injects as
 * `local X = ____lualib.X`. They look free in this AST (the import is added at print time), so they must
 * be excluded — otherwise `new Set()` would become `_G["Set"]()`, and `_G["Set"]` is nil (it is a local).
 */
export function obfuscateGlobals(analysis: ScopeAnalysis, lualibExports: ReadonlySet<string>): void {
    for (const [name, usage] of analysis.globals) {
        if (isExcludedGlobal(name) || lualibExports.has(name)) continue;
        for (const node of usage.nodes) morphToGlobalAccess(node, name);
    }
}
