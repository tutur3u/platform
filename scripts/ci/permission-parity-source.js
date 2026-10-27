const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');

const METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);
const excluded =
  /(?:^|\/)(?:node_modules|\.git|\.next|dist|generated|__tests__|__fixtures__)(?:\/|$)|\.(?:test|spec)\.|\.gen\./;

function filesUnder(root, directory) {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => {
      const file = `${directory}/${entry.name}`;
      if (excluded.test(file) || entry.isSymbolicLink()) return [];
      return entry.isDirectory() ? filesUnder(root, file) : [file];
    })
    .sort();
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (
      [
        'loc',
        'comments',
        'tokens',
        'leadingComments',
        'trailingComments',
      ].includes(key)
    )
      continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else if (value && typeof value === 'object') walk(value, visit);
  }
}

function strings(node) {
  const values = [];
  walk(node, (child) => {
    if (child.type === 'StringLiteral') values.push(child.value);
    if (child.type === 'TemplateLiteral') {
      values.push(
        child.quasis
          .map(
            (part, i) =>
              part.value.raw + (i < child.expressions.length ? '*' : '')
          )
          .join('')
      );
    }
  });
  return values;
}

function callName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (
    node?.type === 'MemberExpression' ||
    node?.type === 'OptionalMemberExpression'
  )
    return callName(node.property);
  return '';
}

function sourceRepository(root) {
  const cache = new Map();
  const packages = new Map();
  for (const directory of fs.existsSync(path.join(root, 'packages'))
    ? fs.readdirSync(path.join(root, 'packages'))
    : []) {
    const file = `packages/${directory}/package.json`;
    if (!fs.existsSync(path.join(root, file))) continue;
    const manifest = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    packages.set(manifest.name, { directory: path.dirname(file), manifest });
  }
  function resolve(from, specifier) {
    let base;
    if (specifier.startsWith('.'))
      base = path.posix.join(path.dirname(from), specifier);
    else if (specifier.startsWith('@/'))
      base = `${from.split('/').slice(0, 2).join('/')}/src/${specifier.slice(2)}`;
    else if (specifier.startsWith('@tuturuuu/')) {
      const [scope, name, ...rest] = specifier.split('/');
      const pkg = packages.get(`${scope}/${name}`);
      if (!pkg) return null;
      const subpath = rest.length ? `./${rest.join('/')}` : '.';
      let target = pkg.manifest.exports?.[subpath];
      if (!target) {
        for (const [pattern, value] of Object.entries(
          pkg.manifest.exports ?? {}
        )) {
          const [prefix, suffix = ''] = pattern.split('*');
          if (
            pattern.includes('*') &&
            subpath.startsWith(prefix) &&
            subpath.endsWith(suffix)
          ) {
            target =
              typeof value === 'string'
                ? value.replace(
                    '*',
                    subpath.slice(
                      prefix.length,
                      suffix ? -suffix.length : undefined
                    )
                  )
                : value;
            break;
          }
        }
      }
      if (typeof target === 'object')
        target = target.import ?? target.default ?? target.types;
      base = path.posix.join(
        pkg.directory,
        typeof target === 'string'
          ? target
          : rest.length
            ? `src/${rest.join('/')}`
            : (pkg.manifest.main ?? 'src/index.ts')
      );
    } else return null;
    for (const candidate of [
      base,
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.js`,
      `${base}/index.ts`,
      `${base}/index.tsx`,
    ]) {
      if (
        fs.existsSync(path.join(root, candidate)) &&
        fs.statSync(path.join(root, candidate)).isFile()
      )
        return candidate;
    }
    return null;
  }
  function load(file) {
    if (cache.has(file)) return cache.get(file);
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const ast = parse(text, {
      sourceType: 'unambiguous',
      plugins: ['typescript', 'jsx'],
    });
    const declarations = new Map();
    const imports = new Map();
    const exports = new Map();
    const dependencies = [];
    for (const statement of ast.program.body) {
      const declaration =
        statement.type === 'ExportNamedDeclaration' ||
        statement.type === 'ExportDefaultDeclaration'
          ? statement.declaration
          : statement;
      if (declaration?.type === 'FunctionDeclaration' && declaration.id)
        declarations.set(declaration.id.name, declaration);
      if (declaration?.type === 'VariableDeclaration') {
        for (const variable of declaration.declarations) {
          if (variable.id.type === 'Identifier')
            declarations.set(variable.id.name, variable.init);
        }
      }
      if (statement.type === 'ImportDeclaration') {
        const target = resolve(file, statement.source.value);
        if (target && statement.importKind !== 'type')
          dependencies.push(target);
        for (const specifier of statement.specifiers) {
          if (specifier.importKind === 'type') continue;
          imports.set(specifier.local.name, {
            file: target,
            name: specifier.imported?.name ?? 'default',
          });
        }
      }
      if (statement.type === 'ExportDefaultDeclaration' && declaration)
        exports.set('default', declaration.id?.name ?? declaration);
      if (
        ['ExportNamedDeclaration', 'ExportAllDeclaration'].includes(
          statement.type
        ) &&
        statement.source
      ) {
        const target = resolve(file, statement.source.value);
        if (target) dependencies.push(target);
      }
      if (statement.type === 'ExportNamedDeclaration') {
        if (declaration?.id)
          exports.set(declaration.id.name, declaration.id.name);
        if (declaration?.declarations)
          for (const variable of declaration.declarations) {
            if (variable.id.type === 'Identifier')
              exports.set(variable.id.name, variable.id.name);
          }
        for (const specifier of statement.specifiers) {
          if (specifier.type !== 'ExportSpecifier') continue;
          const name = specifier.exported.name;
          if (statement.source) {
            const target = resolve(file, statement.source.value);
            imports.set(`export:${name}`, {
              file: target,
              name: specifier.local.name,
            });
            exports.set(name, `export:${name}`);
          } else exports.set(name, specifier.local.name);
        }
      }
    }
    walk(ast, (node) => {
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'Import' &&
        node.arguments[0]?.type === 'StringLiteral'
      ) {
        const target = resolve(file, node.arguments[0].value);
        if (target) dependencies.push(target);
      }
    });
    const result = {
      ast,
      declarations,
      dependencies,
      exports,
      file,
      imports,
      text,
    };
    cache.set(file, result);
    return result;
  }
  function reachable(file, name, seen = new Set()) {
    const key = `${file}:${name}`;
    if (seen.has(key) || seen.size > 200) return [];
    seen.add(key);
    const module = load(file);
    const local = module.exports.get(name) ?? name;
    const imported = typeof local === 'string' && module.imports.get(local);
    if (imported?.file) return reachable(imported.file, imported.name, seen);
    const node =
      typeof local === 'string' ? module.declarations.get(local) : local;
    if (!node) return [];
    const result = [{ file, node }];
    const statements =
      node.body?.type === 'BlockStatement' ? node.body.body : [];
    const unwrap = (value) =>
      value?.type === 'AwaitExpression' ? value.argument : value;
    const calls = [];
    for (const statement of statements) {
      if (statement.type === 'ReturnStatement')
        calls.push(unwrap(statement.argument));
      if (statement.type === 'VariableDeclaration') {
        for (const variable of statement.declarations) {
          if (variable.id.type !== 'Identifier') continue;
          const guarded = statements.some(
            (candidate) =>
              candidate.type === 'IfStatement' &&
              candidate.start > statement.start &&
              hasExit(candidate.consequent) &&
              identifiers(candidate.test).includes(variable.id.name)
          );
          if (guarded) calls.push(unwrap(variable.init));
        }
      }
    }
    for (const child of calls) {
      if (
        child?.type !== 'CallExpression' ||
        child.callee.type !== 'Identifier'
      )
        continue;
      const called = child.callee.name;
      if (module.declarations.has(called))
        result.push(...reachable(file, called, seen));
      else {
        const dependency = module.imports.get(called);
        if (dependency?.file)
          result.push(...reachable(dependency.file, dependency.name, seen));
      }
    }
    return result;
  }
  return { load, reachable, resolve };
}

function identifiers(node) {
  const names = [];
  walk(node, (child) => {
    if (child.type === 'Identifier') names.push(child.name);
  });
  return names;
}

function hasExit(node) {
  if (['ReturnStatement', 'ThrowStatement'].includes(node?.type)) return true;
  return (
    node?.type === 'BlockStatement' &&
    node.body.some((statement) =>
      ['ReturnStatement', 'ThrowStatement'].includes(statement.type)
    )
  );
}

function permissionRule(node) {
  if (
    node?.type === 'CallExpression' &&
    callName(node.callee) === 'withoutPermission' &&
    node.arguments.length === 1 &&
    node.arguments[0].type === 'StringLiteral'
  )
    return node.arguments[0].value;
  if (node?.type === 'LogicalExpression') {
    const left = permissionRule(node.left);
    const right = permissionRule(node.right);
    if (left && right)
      return {
        [node.operator]: [left, right].sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b))
        ),
      };
  }
  return null;
}

function gateEvidence(nodes) {
  const auth = [];
  const authCalls = [];
  const observedPermissions = new Set();
  const permissions = new Set();
  const rules = new Map();
  for (const { file, node } of nodes) {
    walk(node, (child) => {
      if (
        child.type === 'CallExpression' &&
        /Auth|Permission|Membership|Access/.test(callName(child.callee))
      ) {
        authCalls.push({
          helper: callName(child.callee),
          file,
          line: child.loc.start.line,
        });
        for (const value of strings(child.arguments)) {
          if (
            /^(?:view|create|update|delete|manage|export|approve|check|send|bypass|adjust|publish|set|change|moderate)_[a-z_]+$/.test(
              value
            )
          )
            observedPermissions.add(value);
        }
      }
    });
    const functions = [];
    if (node.type === 'File') {
      walk(node, (child) => {
        if (
          ['FunctionDeclaration', 'ArrowFunctionExpression'].includes(
            child.type
          )
        )
          functions.push(child);
      });
    } else functions.push(node);
    for (const fn of functions) {
      const statements = fn.body?.type === 'BlockStatement' ? fn.body.body : [];
      const membershipVariables = new Map();
      for (const statement of statements) {
        if (statement.type === 'VariableDeclaration')
          for (const variable of statement.declarations) {
            const init =
              variable.init?.type === 'AwaitExpression'
                ? variable.init.argument
                : variable.init;
            if (
              variable.init?.type === 'AwaitExpression' &&
              variable.id.type === 'Identifier' &&
              init?.type === 'CallExpression' &&
              callName(init.callee) === 'getPermissions'
            )
              membershipVariables.set(variable.id.name, statement.start);
          }
        if (statement.type !== 'IfStatement' || !hasExit(statement.consequent))
          continue;
        if (
          statement.test.type === 'UnaryExpression' &&
          statement.test.operator === '!' &&
          statement.test.argument.type === 'Identifier' &&
          membershipVariables.has(statement.test.argument.name)
        ) {
          auth.push({
            helper: 'getPermissions',
            file,
            line: statement.loc.start.line,
          });
        }
        const rule = permissionRule(statement.test);
        if (rule) {
          rules.set(JSON.stringify(rule), rule);
          walk(statement.test, (part) => {
            if (
              part.type === 'CallExpression' &&
              callName(part.callee) === 'withoutPermission'
            ) {
              for (const permission of strings(part.arguments))
                permissions.add(permission);
            }
          });
        }
      }
    }
  }
  return {
    authCalls: [...new Set(authCalls.map((entry) => entry.helper))].sort(),
    observedPermissions: [...observedPermissions].sort(),
    authHelpers: auth.sort((a, b) =>
      `${a.file}:${a.line}`.localeCompare(`${b.file}:${b.line}`)
    ),
    permissions: [...permissions].sort(),
    permissionRules: [...rules.values()].sort((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b))
    ),
  };
}

module.exports = {
  METHODS,
  callName,
  filesUnder,
  gateEvidence,
  sourceRepository,
  strings,
  walk,
};
