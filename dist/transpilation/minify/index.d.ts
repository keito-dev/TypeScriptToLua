import { CompilerOptions } from "../../CompilerOptions";
import * as lua from "../../LuaAST";
import { EmitHost } from "../utils";
export { obfuscateLuaString } from "./obfuscate-string";
/**
 * Applies the structural AST-level obfuscation to a generated Lua AST, in place: rewriting global/native
 * accesses to `_G["..."]`. String/hex/key obfuscation is done by the MinifyingLuaPrinter; minification
 * (whitespace + local renaming + single line) is done later by luamin in the emit step.
 */
export declare function applyLuaMinifyPasses(file: lua.File, options: CompilerOptions, emitHost: EmitHost): void;
