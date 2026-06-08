import { LuaTarget } from "../../CompilerOptions";

// luamin (a proper, scope-aware Lua minifier) handles the minification: whitespace removal, comment
// removal (including the tstl header), scope-aware local renaming (covers every tstl internal that is a
// local — ____exports, ____lualib, ____modules, the lualib import locals, ...), and single-line output.
// It preserves the obfuscation the printer already applied (escaped strings, hex numbers, bracket keys),
// so it can run as the first post-Lua pass without undoing anything.
const luamin = require("@wolfe-labs/luamin");
const luaparse = require("luaparse");

// luaparse has no "5.4" mode; 5.4/5.5/universal output is parsed as 5.3 (close enough in practice).
function luaparseVersion(luaTarget: LuaTarget | undefined): string {
    switch (luaTarget) {
        case LuaTarget.Lua51:
            return "5.1";
        case LuaTarget.Lua52:
            return "5.2";
        case LuaTarget.LuaJIT:
            return "LuaJIT";
        default:
            return "5.3";
    }
}

// Local bindings that must keep their identity:
//  - `require`: the bundle require shim and its calls stay recognizable so obfuscateBundleInternals can
//    rename them and collect module names; the bare `____originalRequire = require` capture (the real
//    global) is left alone.
//  - `self`: avoid renaming method self-parameters.
const protectedNames = ["require", "self"];

/** Minifies a chunk of Lua with luamin (whitespace + comments + scope-aware local rename + single line). */
export function minifyWithLuamin(code: string, luaTarget: LuaTarget | undefined): string {
    const ast = luaparse.parse(code, {
        scope: true,
        comments: false,
        luaVersion: luaparseVersion(luaTarget),
        ranges: true,
    });
    ast.globals ??= [];
    for (const name of protectedNames) ast.globals.push({ name });
    return luamin.minify(ast) as string;
}
