const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { parse, parseExpression } = require('@babel/parser');

// SR-919: whether source configs must keep the Meet AI kill switch on.
// Changing it is a reviewed change. When off, source configs carry
// MEET_AI_DISABLED "false" and a `contained` MEET_AI_RELEASE in
// meet-cloudflare.yaml overrides the deployed Worker var back to "true".
// The pins below that do not depend on it always apply.
const CONTAINMENT_IN_FORCE = false;

function configFiles() {
  return ['apps/meet', 'apps/meet-realtime'].flatMap((directory) =>
    readdirSync(directory)
      .filter((name) =>
        /^(?:wrangler.*\.jsonc?|void.*\.config\.ts)$/.test(name)
      )
      .map((name) => join(directory, name))
  );
}

function containmentErrors(source, file, inForce = CONTAINMENT_IN_FORCE) {
  const errors = [];
  const check = (vars, required, shape = { keys: [], opaque: false }) => {
    // Every var must be a plain key so a spread or computed key cannot carry
    // a control past this check.
    if (shape.opaque)
      errors.push('vars must list every key literally, with no spread');
    if (inForce && vars?.MEET_AI_DISABLED !== 'true')
      errors.push('MEET_AI_DISABLED must be "true"');
    // An exact string either way: a typo must never read as "enabled".
    if (!inForce && !['true', 'false'].includes(vars?.MEET_AI_DISABLED))
      errors.push('MEET_AI_DISABLED must be "true" or "false"');
    if (vars?.MEET_AI_ENABLED_WORKSPACE_IDS !== '')
      errors.push('MEET_AI_ENABLED_WORKSPACE_IDS must be empty');
    // The reviewed allow-all opt-in is a release-time override, never source.
    // Whatever its value, including a variable or call in void.config.ts.
    if (
      (vars && Object.hasOwn(vars, 'MEET_AI_ALL_WORKSPACES')) ||
      shape.keys.includes('MEET_AI_ALL_WORKSPACES')
    )
      errors.push('MEET_AI_ALL_WORKSPACES must not be set in source config');
    for (const name of [
      'MEET_AI_DISABLED_WORKSPACE_IDS',
      'MEET_AI_PROTECTED_WORKSPACE_IDS',
    ]) {
      if (!Array.isArray(required) || !required.includes(name))
        errors.push(`secrets.required must include ${name}`);
    }
  };
  const property = (node, name) =>
    node?.properties?.find(
      (p) => p.type === 'ObjectProperty' && (p.key.name ?? p.key.value) === name
    )?.value;
  const literalObject = (node) =>
    Object.fromEntries(
      (node?.properties ?? [])
        .filter(
          (p) => p.type === 'ObjectProperty' && p.value.type === 'StringLiteral'
        )
        .map((p) => [p.key.name ?? p.key.value, p.value.value])
    );
  const varsShape = (node) => {
    const properties = node?.properties ?? [];
    return {
      keys: properties
        .filter((p) => p.type === 'ObjectProperty')
        .map((p) => p.key.name ?? p.key.value),
      opaque: properties.some(
        (p) =>
          p.type !== 'ObjectProperty' ||
          p.computed ||
          (p.key.name ?? p.key.value) === undefined
      ),
    };
  };
  const checkNode = (node) => {
    const vars = property(node, 'vars');
    check(
      literalObject(vars),
      property(property(node, 'secrets'), 'required')?.elements?.map(
        (e) => e.value
      ),
      varsShape(vars)
    );
  };
  try {
    if (/\.jsonc?$/.test(file)) {
      const node = parseExpression(source);
      checkNode(node);
      for (const profile of property(node, 'env')?.properties ?? [])
        checkNode(profile.value);
    } else {
      let found = false;
      const visit = (node) => {
        if (!node || typeof node !== 'object') return;
        if (
          node.type === 'ObjectExpression' &&
          property(node, 'name')?.value?.startsWith('tuturuuu-meet')
        ) {
          found = true;
          checkNode(node);
        }
        for (const value of Object.values(node)) {
          if (Array.isArray(value)) value.forEach(visit);
          else if (value && typeof value === 'object') visit(value);
        }
      };
      visit(parse(source, { sourceType: 'module', plugins: ['typescript'] }));
      if (!found) errors.push('no literal Meet Worker config found');
    }
  } catch {
    errors.push('invalid config syntax');
  }
  return errors;
}

if (require.main === module) {
  const errors = configFiles().flatMap((file) =>
    containmentErrors(readFileSync(file, 'utf8'), file).map(
      (error) => `${file}: ${error}`
    )
  );
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exitCode = 1;
  } else
    console.log(
      CONTAINMENT_IN_FORCE
        ? 'SR-919 Meet containment pins verified'
        : 'SR-919 Meet AI source pins verified (kill switch lifted)'
    );
}
module.exports = { containmentErrors, configFiles };
