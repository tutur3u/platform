const { readFileSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { parse, parseExpression } = require('@babel/parser');

// SR-919: lifting containment requires a reviewed change to this single flag.
const CONTAINMENT_IN_FORCE = true;

function configFiles() {
  return ['apps/meet', 'apps/meet-realtime'].flatMap((directory) =>
    readdirSync(directory)
      .filter((name) =>
        /^(?:wrangler.*\.jsonc?|void.*\.config\.ts)$/.test(name)
      )
      .map((name) => join(directory, name))
  );
}

function containmentErrors(source, file) {
  if (!CONTAINMENT_IN_FORCE) return [];
  const errors = [];
  const check = (vars, required) => {
    if (vars?.MEET_AI_DISABLED !== 'true')
      errors.push('MEET_AI_DISABLED must be "true"');
    if (vars?.MEET_AI_ENABLED_WORKSPACE_IDS !== '')
      errors.push('MEET_AI_ENABLED_WORKSPACE_IDS must be empty');
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
  const checkNode = (node) =>
    check(
      literalObject(property(node, 'vars')),
      property(property(node, 'secrets'), 'required')?.elements?.map(
        (e) => e.value
      )
    );
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
  } else console.log('SR-919 Meet containment pins verified');
}
module.exports = { containmentErrors, configFiles };
