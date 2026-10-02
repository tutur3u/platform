const fs = require('node:fs');
const path = require('node:path');

const sensitiveName =
  /(token|secret|key|password|cookie|credential|authorization|session)/i;
const sensitiveKeyValue =
  /(["']?[A-Z0-9_-]*(?:TOKEN|SECRET|KEY|PASSWORD|COOKIE|CREDENTIAL|AUTHORIZATION|SESSION)[A-Z0-9_-]*["']?\s*[:=]\s*)("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/gi;
const sensitiveQuery =
  /([?&](?:access[_-]?token|api[_-]?key|authorization|code|cookie|key|password|refresh[_-]?token|secret|session|token)=)[^&\s]+/gi;
const jwt = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function redactText(value, env = process.env) {
  // Unstructured log formats cannot safely preserve credential-valued arrays
  // or header records. Omit that file rather than publishing partial redaction.
  const structuredHeader =
    /["']?name["']?\s*:\s*["'][^"']*(?:token|secret|key|password|cookie|credential|authorization|session)[^"']*["']/i;
  const sensitiveCollection =
    /["']?[A-Z0-9_-]*(?:TOKEN|SECRET|KEY|PASSWORD|COOKIE|CREDENTIAL|AUTHORIZATION|SESSION)[A-Z0-9_-]*["']?\s*[:=]\s*[[{]/i;
  if (structuredHeader.test(value) || sensitiveCollection.test(value))
    return '<redacted: structured credential diagnostics omitted>\n';
  let result = value;
  for (const [name, secret] of Object.entries(env)) {
    if (sensitiveName.test(name) && secret?.length >= 8)
      result = result.split(secret).join('<redacted>');
  }
  return result
    .replace(
      /\b((?:set-cookie|cookie|authorization|proxy-authorization)\s*:\s*)[^\r\n]*/gi,
      '$1<redacted>'
    )
    .replace(sensitiveQuery, '$1<redacted>')
    .replace(sensitiveKeyValue, (_match, prefix, content) => {
      const quote = ['"', "'"].includes(content[0]) ? content[0] : '';
      return `${prefix}${quote}<redacted>${quote}`;
    })
    .replace(jwt, '<redacted-jwt>');
}

function redactJson(value, env) {
  if (Array.isArray(value)) return value.map((item) => redactJson(item, env));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        sensitiveName.test(key) ||
        (key === 'value' &&
          typeof value.name === 'string' &&
          sensitiveName.test(value.name))
          ? '<redacted>'
          : redactJson(item, env),
      ])
    );
  return typeof value === 'string' ? redactText(value, env) : value;
}

function sanitize(content, env = process.env) {
  try {
    return `${JSON.stringify(redactJson(JSON.parse(content), env), null, 2)}\n`;
  } catch {
    return redactText(content, env);
  }
}

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink())
      throw new Error('Unsupported diagnostic symlink');
    if (entry.isFile() && !/\.(txt|log|json)$/u.test(file))
      throw new Error('Unsupported diagnostic format');
    return entry.isDirectory() ? walkFiles(file) : entry.isFile() ? [file] : [];
  });
}

function assertLocalPath(file) {
  const relative = path.relative(process.cwd(), path.resolve(file));
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Diagnostics path must be local');
  let current = process.cwd();
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink())
      throw new Error('Unsupported diagnostic symlink');
  }
}

function main(args = process.argv.slice(2)) {
  const diagnosticsDir = path.join('tmp', 'e2e-diagnostics');
  assertLocalPath(diagnosticsDir);
  if (args.length) {
    if (args.length !== 4 || args[0] !== '--report' || args[2] !== '--output')
      throw new Error('Invalid diagnostics arguments');
    assertLocalPath(args[1]);
    assertLocalPath(args[3]);
    if (
      !path
        .resolve(args[3])
        .startsWith(`${path.resolve(diagnosticsDir)}${path.sep}`)
    )
      throw new Error('Output must be in diagnostics directory');
    const content = fs.existsSync(args[1])
      ? fs.readFileSync(args[1], 'utf8')
      : 'No completed Playwright report was produced.\n';
    fs.mkdirSync(path.dirname(args[3]), { recursive: true });
    fs.writeFileSync(args[3], sanitize(content));
  }
  for (const file of walkFiles(diagnosticsDir))
    fs.writeFileSync(file, sanitize(fs.readFileSync(file, 'utf8')));
}

if (require.main === module) {
  try {
    main();
  } catch {
    console.error(
      'Unable to sanitize E2E diagnostics; artifact publication is blocked.'
    );
    process.exitCode = 1;
  }
}
module.exports = { redactText, sanitize, main };
