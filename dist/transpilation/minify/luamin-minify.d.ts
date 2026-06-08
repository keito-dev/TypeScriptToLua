import { LuaTarget } from "../../CompilerOptions";
/** Minifies a chunk of Lua with luamin (whitespace + comments + scope-aware local rename + single line). */
export declare function minifyWithLuamin(code: string, luaTarget: LuaTarget | undefined): string;
