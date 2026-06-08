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
exports.analyzeScopes = analyzeScopes;
const lua = __importStar(require("../../LuaAST"));
/**
 * Resolves lexical scopes over a generated Lua AST, classifying every identifier as either a local
 * binding occurrence or a free (global) reference. This mirrors Lua's scoping rules, including the
 * `local x = x` ordering, `local function` self-recursion and `repeat ... until` seeing body locals.
 */
function analyzeScopes(file) {
    const bindings = [];
    const globals = new Map();
    const scopes = [];
    const pushScope = () => scopes.push(new Map());
    const popScope = () => scopes.pop();
    const declare = (node) => {
        const binding = { name: node.text, nodes: [node] };
        bindings.push(binding);
        scopes[scopes.length - 1].set(node.text, binding);
    };
    const resolve = (name) => {
        for (let i = scopes.length - 1; i >= 0; i--) {
            const binding = scopes[i].get(name);
            if (binding)
                return binding;
        }
        return undefined;
    };
    const reference = (node, isAssignment = false) => {
        const binding = resolve(node.text);
        if (binding) {
            binding.nodes.push(node);
            return;
        }
        let usage = globals.get(node.text);
        if (!usage) {
            usage = { name: node.text, nodes: [], assigned: false };
            globals.set(node.text, usage);
        }
        usage.nodes.push(node);
        if (isAssignment)
            usage.assigned = true;
    };
    function visitBlock(statements, newScope = true) {
        if (newScope)
            pushScope();
        for (const statement of statements)
            visitStatement(statement);
        if (newScope)
            popScope();
    }
    function visitFunction(expression) {
        var _a;
        pushScope();
        for (const param of (_a = expression.params) !== null && _a !== void 0 ? _a : [])
            declare(param);
        visitBlock(expression.body.statements, false);
        popScope();
    }
    function visitStatement(statement) {
        var _a;
        switch (statement.kind) {
            case lua.SyntaxKind.DoStatement:
                visitBlock(statement.statements);
                break;
            case lua.SyntaxKind.VariableDeclarationStatement: {
                const declaration = statement;
                if (lua.isFunctionDefinition(declaration)) {
                    // `local function f` — the name is visible inside its own body (recursion).
                    declare(declaration.left[0]);
                    visitExpression(declaration.right[0]);
                }
                else {
                    (_a = declaration.right) === null || _a === void 0 ? void 0 : _a.forEach(visitExpression);
                    declaration.left.forEach(declare);
                }
                break;
            }
            case lua.SyntaxKind.AssignmentStatement: {
                const assignment = statement;
                assignment.right.forEach(visitExpression);
                for (const target of assignment.left) {
                    if (lua.isIdentifier(target)) {
                        reference(target, true);
                    }
                    else {
                        visitExpression(target);
                    }
                }
                break;
            }
            case lua.SyntaxKind.IfStatement: {
                let current = statement;
                while (current && lua.isIfStatement(current)) {
                    visitExpression(current.condition);
                    visitBlock(current.ifBlock.statements);
                    current = current.elseBlock;
                }
                if (current)
                    visitBlock(current.statements);
                break;
            }
            case lua.SyntaxKind.WhileStatement: {
                const whileStatement = statement;
                visitExpression(whileStatement.condition);
                visitBlock(whileStatement.body.statements);
                break;
            }
            case lua.SyntaxKind.RepeatStatement: {
                // The `until` condition can see locals declared in the body, so share the scope.
                const repeatStatement = statement;
                pushScope();
                for (const bodyStatement of repeatStatement.body.statements)
                    visitStatement(bodyStatement);
                visitExpression(repeatStatement.condition);
                popScope();
                break;
            }
            case lua.SyntaxKind.ForStatement: {
                const forStatement = statement;
                visitExpression(forStatement.controlVariableInitializer);
                visitExpression(forStatement.limitExpression);
                if (forStatement.stepExpression)
                    visitExpression(forStatement.stepExpression);
                pushScope();
                declare(forStatement.controlVariable);
                visitBlock(forStatement.body.statements, false);
                popScope();
                break;
            }
            case lua.SyntaxKind.ForInStatement: {
                const forInStatement = statement;
                forInStatement.expressions.forEach(visitExpression);
                pushScope();
                forInStatement.names.forEach(declare);
                visitBlock(forInStatement.body.statements, false);
                popScope();
                break;
            }
            case lua.SyntaxKind.ReturnStatement:
                statement.expressions.forEach(visitExpression);
                break;
            case lua.SyntaxKind.ExpressionStatement:
                visitExpression(statement.expression);
                break;
            // Goto/Label/Break/Continue carry no variable references.
        }
    }
    function visitExpression(expression) {
        switch (expression.kind) {
            case lua.SyntaxKind.Identifier:
                reference(expression);
                break;
            case lua.SyntaxKind.FunctionExpression:
                visitFunction(expression);
                break;
            case lua.SyntaxKind.TableFieldExpression: {
                const field = expression;
                if (field.key)
                    visitExpression(field.key);
                visitExpression(field.value);
                break;
            }
            case lua.SyntaxKind.TableExpression:
                expression.fields.forEach(visitExpression);
                break;
            case lua.SyntaxKind.UnaryExpression:
                visitExpression(expression.operand);
                break;
            case lua.SyntaxKind.BinaryExpression: {
                const binary = expression;
                visitExpression(binary.left);
                visitExpression(binary.right);
                break;
            }
            case lua.SyntaxKind.CallExpression: {
                const call = expression;
                visitExpression(call.expression);
                call.params.forEach(visitExpression);
                break;
            }
            case lua.SyntaxKind.MethodCallExpression: {
                // `name` is a method identifier, not a variable reference — do not resolve it.
                const call = expression;
                visitExpression(call.prefixExpression);
                call.params.forEach(visitExpression);
                break;
            }
            case lua.SyntaxKind.TableIndexExpression: {
                const index = expression;
                visitExpression(index.table);
                visitExpression(index.index);
                break;
            }
            case lua.SyntaxKind.ParenthesizedExpression:
                visitExpression(expression.expression);
                break;
            case lua.SyntaxKind.ConditionalExpression: {
                const conditional = expression;
                visitExpression(conditional.condition);
                visitExpression(conditional.whenTrue);
                visitExpression(conditional.whenFalse);
                break;
            }
            // Literals (string/number/nil/dots/arg/boolean) carry no references.
        }
    }
    visitBlock(file.statements);
    return { bindings, globals };
}
//# sourceMappingURL=scope.js.map