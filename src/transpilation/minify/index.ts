import { CompilerOptions, LuaTarget } from "../../CompilerOptions";
import * as lua from "../../LuaAST";
import { getLuaLibExportToFeatureMap } from "../../LuaLib";
import { EmitHost } from "../utils";
import { obfuscateGlobals } from "./obfuscate-globals";
import { analyzeScopes } from "./scope";

export { obfuscateLuaString } from "./obfuscate-string";

/**
 * Applies the structural AST-level obfuscation to a generated Lua AST, in place: rewriting global/native
 * accesses to `_G["..."]`. String/hex/key obfuscation is done by the MinifyingLuaPrinter; minification
 * (whitespace + local renaming + single line) is done later by luamin in the emit step.
 */
export function applyLuaMinifyPasses(file: lua.File, options: CompilerOptions, emitHost: EmitHost): void {
    if (options.obfuscate) {
        // lualib exports (Set, Map, Promise, ...) are injected as locals at print time, so they must not
        // be rewritten to _G[...] even though they look free in this AST.
        const luaTarget = options.luaTarget ?? LuaTarget.Universal;
        const lualibExports = new Set(getLuaLibExportToFeatureMap(luaTarget, emitHost).keys());
        obfuscateGlobals(analyzeScopes(file), lualibExports);
    }
}
