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

type Scope = Map<string, LocalBinding>;

/**
 * Resolves lexical scopes over a generated Lua AST, classifying every identifier as either a local
 * binding occurrence or a free (global) reference. This mirrors Lua's scoping rules, including the
 * `local x = x` ordering, `local function` self-recursion and `repeat ... until` seeing body locals.
 */
export function analyzeScopes(file: lua.File): ScopeAnalysis {
    const bindings: LocalBinding[] = [];
    const globals = new Map<string, GlobalUsage>();
    const scopes: Scope[] = [];

    const pushScope = () => scopes.push(new Map());
    const popScope = () => scopes.pop();

    const declare = (node: lua.Identifier): void => {
        const binding: LocalBinding = { name: node.text, nodes: [node] };
        bindings.push(binding);
        scopes[scopes.length - 1].set(node.text, binding);
    };

    const resolve = (name: string): LocalBinding | undefined => {
        for (let i = scopes.length - 1; i >= 0; i--) {
            const binding = scopes[i].get(name);
            if (binding) return binding;
        }
        return undefined;
    };

    const reference = (node: lua.Identifier, isAssignment = false): void => {
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
        if (isAssignment) usage.assigned = true;
    };

    function visitBlock(statements: lua.Statement[], newScope = true): void {
        if (newScope) pushScope();
        for (const statement of statements) visitStatement(statement);
        if (newScope) popScope();
    }

    function visitFunction(expression: lua.FunctionExpression): void {
        pushScope();
        for (const param of expression.params ?? []) declare(param);
        visitBlock(expression.body.statements, false);
        popScope();
    }

    function visitStatement(statement: lua.Statement): void {
        switch (statement.kind) {
            case lua.SyntaxKind.DoStatement:
                visitBlock((statement as lua.DoStatement).statements);
                break;
            case lua.SyntaxKind.VariableDeclarationStatement: {
                const declaration = statement as lua.VariableDeclarationStatement;
                if (lua.isFunctionDefinition(declaration)) {
                    // `local function f` — the name is visible inside its own body (recursion).
                    declare(declaration.left[0]);
                    visitExpression(declaration.right[0]);
                } else {
                    declaration.right?.forEach(visitExpression);
                    declaration.left.forEach(declare);
                }
                break;
            }
            case lua.SyntaxKind.AssignmentStatement: {
                const assignment = statement as lua.AssignmentStatement;
                assignment.right.forEach(visitExpression);
                for (const target of assignment.left) {
                    if (lua.isIdentifier(target)) {
                        reference(target, true);
                    } else {
                        visitExpression(target);
                    }
                }
                break;
            }
            case lua.SyntaxKind.IfStatement: {
                let current: lua.IfStatement | lua.Block | undefined = statement as lua.IfStatement;
                while (current && lua.isIfStatement(current)) {
                    visitExpression(current.condition);
                    visitBlock(current.ifBlock.statements);
                    current = current.elseBlock;
                }
                if (current) visitBlock(current.statements);
                break;
            }
            case lua.SyntaxKind.WhileStatement: {
                const whileStatement = statement as lua.WhileStatement;
                visitExpression(whileStatement.condition);
                visitBlock(whileStatement.body.statements);
                break;
            }
            case lua.SyntaxKind.RepeatStatement: {
                // The `until` condition can see locals declared in the body, so share the scope.
                const repeatStatement = statement as lua.RepeatStatement;
                pushScope();
                for (const bodyStatement of repeatStatement.body.statements) visitStatement(bodyStatement);
                visitExpression(repeatStatement.condition);
                popScope();
                break;
            }
            case lua.SyntaxKind.ForStatement: {
                const forStatement = statement as lua.ForStatement;
                visitExpression(forStatement.controlVariableInitializer);
                visitExpression(forStatement.limitExpression);
                if (forStatement.stepExpression) visitExpression(forStatement.stepExpression);
                pushScope();
                declare(forStatement.controlVariable);
                visitBlock(forStatement.body.statements, false);
                popScope();
                break;
            }
            case lua.SyntaxKind.ForInStatement: {
                const forInStatement = statement as lua.ForInStatement;
                forInStatement.expressions.forEach(visitExpression);
                pushScope();
                forInStatement.names.forEach(declare);
                visitBlock(forInStatement.body.statements, false);
                popScope();
                break;
            }
            case lua.SyntaxKind.ReturnStatement:
                (statement as lua.ReturnStatement).expressions.forEach(visitExpression);
                break;
            case lua.SyntaxKind.ExpressionStatement:
                visitExpression((statement as lua.ExpressionStatement).expression);
                break;
            // Goto/Label/Break/Continue carry no variable references.
        }
    }

    function visitExpression(expression: lua.Expression): void {
        switch (expression.kind) {
            case lua.SyntaxKind.Identifier:
                reference(expression as lua.Identifier);
                break;
            case lua.SyntaxKind.FunctionExpression:
                visitFunction(expression as lua.FunctionExpression);
                break;
            case lua.SyntaxKind.TableFieldExpression: {
                const field = expression as lua.TableFieldExpression;
                if (field.key) visitExpression(field.key);
                visitExpression(field.value);
                break;
            }
            case lua.SyntaxKind.TableExpression:
                (expression as lua.TableExpression).fields.forEach(visitExpression);
                break;
            case lua.SyntaxKind.UnaryExpression:
                visitExpression((expression as lua.UnaryExpression).operand);
                break;
            case lua.SyntaxKind.BinaryExpression: {
                const binary = expression as lua.BinaryExpression;
                visitExpression(binary.left);
                visitExpression(binary.right);
                break;
            }
            case lua.SyntaxKind.CallExpression: {
                const call = expression as lua.CallExpression;
                visitExpression(call.expression);
                call.params.forEach(visitExpression);
                break;
            }
            case lua.SyntaxKind.MethodCallExpression: {
                // `name` is a method identifier, not a variable reference — do not resolve it.
                const call = expression as lua.MethodCallExpression;
                visitExpression(call.prefixExpression);
                call.params.forEach(visitExpression);
                break;
            }
            case lua.SyntaxKind.TableIndexExpression: {
                const index = expression as lua.TableIndexExpression;
                visitExpression(index.table);
                visitExpression(index.index);
                break;
            }
            case lua.SyntaxKind.ParenthesizedExpression:
                visitExpression((expression as lua.ParenthesizedExpression).expression);
                break;
            case lua.SyntaxKind.ConditionalExpression: {
                const conditional = expression as lua.ConditionalExpression;
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
