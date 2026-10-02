const fs = require('node:fs');
const path = require('node:path');

const diagnosticsDir = path.join('tmp', 'e2e-diagnostics');
const sensitiveEnvNamePattern =
  /(token|secret|key|password|cookie|credential|authorization|session)/i;
const sensitiveKeyValuePattern =
  /\b([A-Z0-9_]*(?:TOKEN|SECRET|KEY|PASSWORD|COOKIE|CREDENTIAL|AUTHORIZATION|SESSION)[A-Z0-9_]*)\s*[:=]\s*("[^"\n]*"|'[^'\n]*'|[^\s,;}\]]+)/gi;
const sensitiveQueryPattern =
  /([?&](?:access[_-]?token|api[_-]?key|authorization|code|cookie|key|password|refresh[_-]?token|secret|session|token)=)[^&\s]+/gi;
const bearerPattern = /\b(Authorization:\s*Bearer\s+)[^\s'"]+/gi;
const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return walkFiles(entryPath);
    return entry.isFile() ? [entryPath] : [];
  });
}

const literalSecrets = Object.entries(process.env)
  .filter(([name, value]) => sensitiveEnvNamePattern.test(name) && value)
  .map(([, value]) => value)
  .filter((value) => value.length >= 8);

function redact(value) {
  let redacted = value;

  for (const secret of literalSecrets) {
    redacted = redacted.split(secret).join('<redacted>');
  }

  return redacted
    .replace(bearerPattern, '$1<redacted>')
    .replace(sensitiveQueryPattern, '$1<redacted>')
    .replace(sensitiveKeyValuePattern, '$1=<redacted>')
    .replace(jwtPattern, '<redacted-jwt>');
}

for (const filePath of walkFiles(diagnosticsDir)) {
  const original = fs.readFileSync(filePath, 'utf8');
  const redacted = redact(original);
  if (redacted !== original) {
    fs.writeFileSync(filePath, redacted);
  }
}
