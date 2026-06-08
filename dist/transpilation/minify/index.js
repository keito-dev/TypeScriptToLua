"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.obfuscateLuaString = void 0;
exports.applyLuaMinifyPasses = applyLuaMinifyPasses;
const CompilerOptions_1 = require("../../CompilerOptions");
const LuaLib_1 = require("../../LuaLib");
const obfuscate_globals_1 = require("./obfuscate-globals");
const scope_1 = require("./scope");
var obfuscate_string_1 = require("./obfuscate-string");
Object.defineProperty(exports, "obfuscateLuaString", { enumerable: true, get: function () { return obfuscate_string_1.obfuscateLuaString; } });
/**
 * Applies the structural AST-level obfuscation to a generated Lua AST, in place: rewriting global/native
 * accesses to `_G["..."]`. String/hex/key obfuscation is done by the MinifyingLuaPrinter; minification
 * (whitespace + local renaming + single line) is done later by luamin in the emit step.
 */
function applyLuaMinifyPasses(file, options, emitHost) {
    var _a;
    if (options.obfuscate) {
        // lualib exports (Set, Map, Promise, ...) are injected as locals at print time, so they must not
        // be rewritten to _G[...] even though they look free in this AST.
        const luaTarget = (_a = options.luaTarget) !== null && _a !== void 0 ? _a : CompilerOptions_1.LuaTarget.Universal;
        const lualibExports = new Set((0, LuaLib_1.getLuaLibExportToFeatureMap)(luaTarget, emitHost).keys());
        (0, obfuscate_globals_1.obfuscateGlobals)((0, scope_1.analyzeScopes)(file), lualibExports);
    }
}
//# sourceMappingURL=index.js.map