import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function createLoopbackTlsFixture(scratch) {
  const httpsKeyPath = join(scratch, 'loopback-key.pem');
  const httpsCertPath = join(scratch, 'loopback-cert.pem');
  await run(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-addext',
      'basicConstraints=critical,CA:FALSE',
      '-addext',
      'extendedKeyUsage=serverAuth',
      '-keyout',
      httpsKeyPath,
      '-out',
      httpsCertPath,
    ],
    { timeout: 15_000 }
  );
  return { httpsKeyPath, httpsCertPath, ca: await readFile(httpsCertPath) };
}
