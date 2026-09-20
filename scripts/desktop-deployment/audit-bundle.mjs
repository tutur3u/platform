import { createReadStream } from 'node:fs';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const forbiddenFile =
  /(?:^|\/)(?:\.env(?:\..*)?|\.git|firebase\.json|key\.properties|.*\.(?:p12|pfx|p8|pem|key|jks|keystore|mobileprovision|provisionprofile))$/i;
const privateMarker =
  /-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----|\b(?:sb_secret_|ghp_|github_pat_|ttr_mobile_ci_)[A-Za-z0-9_-]{12,}/;

export function containsCredential(text) {
  if (privateMarker.test(text)) return true;
  for (const match of text.matchAll(
    /eyJ[A-Za-z0-9_-]{8,4096}\.([A-Za-z0-9_-]{8,4096})\.[A-Za-z0-9_-]{8,4096}/g
  )) {
    try {
      if (
        JSON.parse(Buffer.from(match[1], 'base64url')).role === 'service_role'
      )
        return true;
    } catch {
      // Unrelated binary text is not a JWT.
    }
  }
  return false;
}

export async function auditBundle(directory) {
  const root = await realpath(directory);
  const seen = new Set();
  let files = 0;
  async function visit(path) {
    const canonical = await realpath(path);
    const name = relative(root, canonical).replaceAll('\\', '/');
    if (isAbsolute(name) || name === '..' || name.startsWith('../')) {
      throw new Error('Bundle contains a link outside its root');
    }
    if (forbiddenFile.test(relative(root, path).replaceAll('\\', '/'))) {
      throw new Error(
        'Bundle contains a forbidden credential or configuration file'
      );
    }
    if (seen.has(canonical)) return;
    seen.add(canonical);
    const stat = await lstat(canonical);
    if (stat.isDirectory()) {
      for (const entry of await readdir(canonical))
        await visit(join(canonical, entry));
    } else if (stat.isFile()) {
      files++;
      let overlap = '';
      for await (const chunk of createReadStream(canonical)) {
        const text = overlap + chunk.toString('latin1');
        if (containsCredential(text))
          throw new Error('Credential material detected in release bundle');
        overlap = text.slice(-16384);
      }
    } else {
      throw new Error('Unsupported file type in release bundle');
    }
  }
  await visit(root);
  if (!files) throw new Error('Release bundle is empty');
  return files;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    if (!process.argv[2]) throw new Error('Missing bundle path');
    const files = await auditBundle(process.argv[2]);
    process.stdout.write(`Audited ${files} release bundle files.\n`);
  } catch {
    // Avoid printing secret fragments, filenames or parser diagnostics.
    process.stderr.write('Release bundle security audit failed.\n');
    process.exitCode = 1;
  }
}
