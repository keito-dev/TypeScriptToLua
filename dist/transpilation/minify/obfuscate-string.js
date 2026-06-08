"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.obfuscateLuaString = obfuscateLuaString;
const CompilerOptions_1 = require("../../CompilerOptions");
function getEscapeCapabilities(luaTarget) {
    switch (luaTarget) {
        case CompilerOptions_1.LuaTarget.Lua52:
            return { hex: true, unicode: false, zSkip: true };
        case CompilerOptions_1.LuaTarget.Lua53:
        case CompilerOptions_1.LuaTarget.Lua54:
        case CompilerOptions_1.LuaTarget.Lua55:
        case CompilerOptions_1.LuaTarget.Luau:
            return { hex: true, unicode: true, zSkip: true };
        case CompilerOptions_1.LuaTarget.LuaJIT:
            return { hex: true, unicode: false, zSkip: false };
        // Lua 5.0/5.1 and Universal (might run anywhere): only the universally-safe escapes.
        default:
            return { hex: false, unicode: false, zSkip: false };
    }
}
/**
 * Produces an obfuscated, but semantically identical, single-quoted Lua string literal for `value`.
 *
 * The byte VALUE of the string is always preserved (so event names, exports, require paths, etc. keep
 * working) — only the textual representation is scrambled by randomly picking a different escape form
 * per byte and occasionally injecting `\z` line continuations. The result is raw Lua and must be emitted
 * as-is (do not run it through the regular string escaper, or it would be double-escaped).
 */
function obfuscateLuaString(value, luaTarget) {
    const caps = getEscapeCapabilities(luaTarget);
    const bytes = Buffer.from(value, "utf8");
    const escapeByte = (b) => {
        const modes = [() => `\\${b.toString().padStart(3, "0")}`];
        if (caps.hex) {
            modes.push(() => `\\x${b.toString(16).padStart(2, "0")}`);
        }
        // `\u{xx}` re-encodes as UTF-8, so it only reproduces the same byte for ASCII (< 0x80).
        if (caps.unicode && b < 0x80) {
            modes.push(() => `\\u{${b.toString(16)}}`);
        }
        // Printable ASCII can stay literal, except the quote and backslash which would need escaping.
        if (b >= 0x20 && b <= 0x7e && b !== 0x27 && b !== 0x5c) {
            modes.push(() => String.fromCharCode(b));
        }
        return modes[Math.floor(Math.random() * modes.length)]();
    };
    let out = "";
    for (const b of bytes) {
        out += escapeByte(b);
        if (caps.zSkip && Math.random() < 0.15) {
            out += "\\z ";
        }
    }
    return `'${out}'`;
}
//# sourceMappingURL=obfuscate-string.js.map