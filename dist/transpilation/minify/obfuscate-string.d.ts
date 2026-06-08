import { LuaTarget } from "../../CompilerOptions";
/**
 * Produces an obfuscated, but semantically identical, single-quoted Lua string literal for `value`.
 *
 * The byte VALUE of the string is always preserved (so event names, exports, require paths, etc. keep
 * working) — only the textual representation is scrambled by randomly picking a different escape form
 * per byte and occasionally injecting `\z` line continuations. The result is raw Lua and must be emitted
 * as-is (do not run it through the regular string escaper, or it would be double-escaped).
 */
export declare function obfuscateLuaString(value: string, luaTarget: LuaTarget): string;
