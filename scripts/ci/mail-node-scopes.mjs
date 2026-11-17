// Bind references to declarations before inspecting calls: declaration order does
// not change lexical identity, including hoisted var and temporal-dead-zone names.
export function mailNodeScopes(ast) {
  const scopes = new WeakMap();
  const root = { parent: null, bindings: new Map() };
  const child = (parent) => ({ parent, bindings: new Map() });
  const bind = (node, scope) => {
    if (!node) return;
    if (node.type === 'Identifier') {
      if (!scope.bindings.has(node.name)) scope.bindings.set(node.name, node);
    } else if (node.type === 'RestElement') bind(node.argument, scope);
    else if (node.type === 'AssignmentPattern') bind(node.left, scope);
    else if (node.type === 'ArrayPattern')
      node.elements.forEach((element) => bind(element, scope));
    else if (node.type === 'ObjectPattern')
      node.properties.forEach((property) =>
        bind(
          property.type === 'RestElement' ? property.argument : property.value,
          scope
        )
      );
  };
  function visit(node, scope, varScope) {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'FunctionDeclaration') bind(node.id, scope);
    if (node.type === 'ClassDeclaration') bind(node.id, scope);
    if (
      /^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/u.test(
        node.type
      )
    ) {
      const params = child(scope);
      if (node.type === 'FunctionExpression') bind(node.id, params);
      node.params.forEach((param) => bind(param, params));
      scopes.set(node, params);
      node.params.forEach((param) => visit(param, params, params));
      const body = child(params);
      visit(node.body, body, body);
      return;
    }
    if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      const inside = child(scope);
      bind(node.id, inside);
      scopes.set(node, inside);
      visit(node.superClass, inside, varScope);
      visit(node.body, inside, varScope);
      return;
    }
    if (node.type === 'StaticBlock') {
      scope = child(scope);
      varScope = scope;
    } else if (node.type === 'SwitchStatement') {
      scopes.set(node, scope);
      visit(node.discriminant, scope, varScope);
      const cases = child(scope);
      node.cases.forEach((branch) => visit(branch, cases, varScope));
      return;
    } else if (
      [
        'BlockStatement',
        'CatchClause',
        'ForStatement',
        'ForInStatement',
        'ForOfStatement',
      ].includes(node.type)
    ) {
      scope = child(scope);
    }
    scopes.set(node, scope);
    if (node.type === 'CatchClause') bind(node.param, scope);
    if (node.type === 'VariableDeclaration')
      node.declarations.forEach((declaration) =>
        bind(declaration.id, node.kind === 'var' ? varScope : scope)
      );
    if (node.type === 'ImportDeclaration')
      node.specifiers.forEach((specifier) => bind(specifier.local, scope));
    for (const value of Object.values(node)) {
      if (Array.isArray(value))
        value.forEach((item) => visit(item, scope, varScope));
      else if (value && typeof value === 'object')
        visit(value, scope, varScope);
    }
  }
  visit(ast, root, root);
  return {
    root: (name) => root.bindings.get(name),
    resolve(node) {
      let scope = scopes.get(node);
      if (!scope)
        throw new Error('Mail Worker scope resolution is unavailable');
      while (scope) {
        if (scope.bindings.has(node.name)) return scope.bindings.get(node.name);
        scope = scope.parent;
      }
    },
  };
}
