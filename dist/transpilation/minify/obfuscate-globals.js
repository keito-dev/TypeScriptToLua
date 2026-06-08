"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.obfuscateGlobals = obfuscateGlobals;
const lua = __importStar(require("../../LuaAST"));
const safe_names_1 = require("../../transformation/utils/safe-names");
// Free identifiers that must NOT be rewritten to `_G[...]`:
//  - `_G`/`require`/`self`/`arg` are special (and `require` is a *local* shim under luaBundle).
//  - `__TS__*` / `____*` are tstl/lualib helpers that are injected as locals at print time, so they
//    look free in the AST here but are not real globals — rewriting them would break the output.
const excludedExactNames = new Set(["_G", "require", "self", "arg"]);
function isExcludedGlobal(name) {
    return (excludedExactNames.has(name) || name.startsWith("__TS__") || name.startsWith("____") || safe_names_1.luaKeywords.has(name));
}
/** Turns an existing identifier node into a `_G["name"]` table-index expression, in place. */
function morphToGlobalAccess(node, name) {
    const target = node;
    target.kind = lua.SyntaxKind.TableIndexExpression;
    target.table = lua.createIdentifier("_G");
    target.index = lua.createStringLiteral(name);
    delete node.text;
    delete node.originalName;
    delete node.symbolId;
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
function obfuscateGlobals(analysis, lualibExports) {
    for (const [name, usage] of analysis.globals) {
        if (isExcludedGlobal(name) || lualibExports.has(name))
            continue;
        for (const node of usage.nodes)
            morphToGlobalAccess(node, name);
    }
}
//# sourceMappingURL=obfuscate-globals.js.map