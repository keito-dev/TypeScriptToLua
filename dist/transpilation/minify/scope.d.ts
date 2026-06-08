import * as lua from "../../LuaAST";
/**
 * A single local binding (a `local`, function parameter, loop variable, etc.) together with every
 * identifier node that refers to it (the declaration plus all uses). Renaming a binding is just a
 * matter of stamping a new `text` on every node in `nodes`.
 */
export interface LocalBinding {
    name: string;
    nodes: lua.Identifier[];
}
/**
 * A free identifier (one not bound by any enclosing scope) — i.e. a global / native. Collects every
 * occurrence and whether the global is ever written to (used to decide if it is safe to hoist).
 */
export interface GlobalUsage {
    name: string;
    nodes: lua.Identifier[];
    assigned: boolean;
}
export interface ScopeAnalysis {
    bindings: LocalBinding[];
    globals: Map<string, GlobalUsage>;
}
/**
 * Resolves lexical scopes over a generated Lua AST, classifying every identifier as either a local
 * binding occurrence or a free (global) reference. This mirrors Lua's scoping rules, including the
 * `local x = x` ordering, `local function` self-recursion and `repeat ... until` seeing body locals.
 */
export declare function analyzeScopes(file: lua.File): ScopeAnalysis;
