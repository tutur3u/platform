const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  exactSha,
  appName,
  identity,
  sha256,
  command,
  save,
} = require('./public-ci');

const publicInputs = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://public-compiler.supabase.invalid',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    'sb_publishable_public_compiler_fixture',
  NEXT_PUBLIC_APP_URL: 'https://meet.example.invalid',
  NEXT_PUBLIC_WEB_APP_URL: 'https://web.example.invalid',
  PLATFORM_BUILD_ENVIRONMENT: 'public-compiler',
  PLATFORM_BUILD_REF_NAME: 'public-compiler',
};
function collect(root, prefix) {
  if (
    !/^apps\/meet(?:-realtime)?\/(?:dist|\.wrangler\/deploy\/config\.json|\.void\/preview-deploy-config\.json)(?:\/|$)/.test(
      prefix
    ) ||
    prefix.split('/').includes('..')
  )
    throw new Error('Unapproved artifact root');
  const records = [];
  function visit(name) {
    if (/[\x00-\x1f\x7f]/.test(name)) throw new Error('Unsafe artifact name');
    const file = path.join(root, name);
    const st = fs.lstatSync(file);
    if (st.isSymbolicLink() || (!st.isFile() && !st.isDirectory()))
      throw new Error('Unsafe artifact entry');
    if (
      name
        .split('/')
        .some((p) => /^(?:\.env(?:\.|$)|node_modules$|\.git$)/.test(p))
    )
      throw new Error('Private or dependency artifact entry');
    if (st.isDirectory())
      for (const child of fs.readdirSync(file).sort())
        visit(name + '/' + child);
    else {
      let fd;
      try {
        fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      } catch (error) {
        if (error?.code === 'ELOOP' || error?.code === 'EINVAL')
          throw new Error('Unsafe artifact entry');
        throw error;
      }
      try {
        const openSt = fs.fstatSync(fd);
        if (!openSt.isFile() || openSt.isSymbolicLink())
          throw new Error('Unsafe artifact entry');
        records.push({
          path: name,
          bytes: openSt.size,
          sha256: sha256(fs.readFileSync(fd)),
        });
      } finally {
        fs.closeSync(fd);
      }
    }
  }
  visit(prefix);
  return records;
}
function emittedWorker(root, directory) {
  const config = JSON.parse(
    fs.readFileSync(path.join(root, directory, 'wrangler.json'))
  );
  if (
    typeof config.main !== 'string' ||
    !/\.[cm]?js$/.test(config.main) ||
    path.isAbsolute(config.main)
  )
    throw new Error('Missing emitted Worker entry');
  const main = path.resolve(root, directory, config.main);
  const rel = path.relative(path.resolve(root, directory), main);
  if (
    !rel ||
    rel.startsWith('..') ||
    path.isAbsolute(rel) ||
    !fs.lstatSync(main).isFile() ||
    fs.lstatSync(main).isSymbolicLink()
  )
    throw new Error('Worker entry escapes artifact');
  return path.relative(root, main).split(path.sep).join('/');
}
function contract(app) {
  appName(app);
  if (app !== 'meet')
    throw new Error(
      `${app}: missing committed public Vercel project/Build Output adapter configuration; canonical vercel-production-${app === 'web' ? 'platform' : app}.yaml uses authenticated vercel pull/build. Cloudflare Start and raw .next outputs are not substitutes.`
    );
  return {
    adapter: 'cloudflare-start+cloudflare-vite',
    artifactKind: 'public-compiler-meet-pair',
    deployAcceptance: false,
  };
}
function main() {
  const [app, output] = process.argv.slice(2);
  appName(app);
  const receipt = {
    ...identity(),
    app,
    requestedAdapter:
      app === 'meet' ? 'cloudflare-start+cloudflare-vite' : 'vercel-next',
    kind: 'public-build',
    commands: [],
    status: 'FAIL',
  };
  try {
    receipt.adapterInputDigests = Object.fromEntries(
      [
        `apps/${app}/package.json`,
        `apps/${app}/${app === 'meet' ? 'vite.config.ts' : 'vercel.json'}`,
      ].map((p) => [p, sha256(fs.readFileSync(p))])
    );
    Object.assign(receipt, contract(app));
    receipt.publicInputSHA256 = sha256(JSON.stringify(publicInputs));
    receipt.inputDigests = Object.fromEntries(
      [
        'bun.lock',
        'apps/meet/package.json',
        'apps/meet/vite.config.ts',
        'apps/meet/void.config.ts',
        'apps/meet-realtime/package.json',
        'apps/meet-realtime/vite.config.ts',
        'apps/meet-realtime/wrangler.jsonc',
      ].map((p) => [p, sha256(fs.readFileSync(p))])
    );
    receipt.publicInputs = publicInputs;
    Object.assign(process.env, publicInputs, {
      GITHUB_SHA: exactSha(process.env.SOURCE_SHA),
    });
    receipt.bun = execFileSync('bun', ['--version'], {
      encoding: 'utf8',
    }).trim();
    command(['bun', 'install', '--frozen-lockfile'], receipt);
    command(
      ['bun', 'run', '--silent', 'scripts/ci/generate-build-metadata.ts'],
      receipt
    );
    command(
      [
        'bun',
        'turbo:local',
        'run',
        'build',
        '--concurrency=2',
        '--filter=@tuturuuu/meet^...',
      ],
      receipt
    );
    command(['bun', 'run', '--cwd', 'apps/meet', 'build:cloudflare'], receipt);
    command(
      [
        'bun',
        'turbo:local',
        'run',
        'build',
        '--filter=@tuturuuu/meet-realtime',
        '--concurrency=2',
      ],
      receipt
    );
    const roots = ['apps/meet/dist', 'apps/meet-realtime/dist'];
    // Deployment pointers are hidden but are part of the emitted artifact.
    for (const appDir of ['apps/meet', 'apps/meet-realtime'])
      for (const pointer of [
        '.wrangler/deploy/config.json',
        '.void/preview-deploy-config.json',
      ]) {
        if (fs.existsSync(`${appDir}/${pointer}`))
          roots.push(`${appDir}/${pointer}`);
      }
    receipt.entries = [
      emittedWorker(process.cwd(), 'apps/meet/dist/ssr'),
      emittedWorker(process.cwd(), 'apps/meet-realtime/dist/worker'),
    ];
    const files = roots.flatMap((p) => collect(process.cwd(), p));
    if (
      !files.some(
        (f) =>
          f.path.startsWith('apps/meet/dist/client/') &&
          /\.(?:js|css|html|wasm)$/.test(f.path) &&
          f.bytes > 0
      )
    )
      throw new Error('Missing frontend assets');
    for (const entry of receipt.entries)
      if (!files.some((f) => f.path === entry && f.bytes > 0))
        throw new Error('Missing emitted pair member');
    fs.mkdirSync(output, { recursive: true });
    const archive = path.resolve(output, 'public-compiler.tar.gz');
    const list = path.resolve(output, 'archive-members.txt');
    fs.writeFileSync(list, files.map((f) => f.path).join('\n') + '\n');
    command(
      [
        'tar',
        '--create',
        '--gzip',
        '--file',
        archive,
        '--verbatim-files-from',
        '--no-recursion',
        '--files-from',
        list,
      ],
      receipt
    );
    receipt.files = files;
    receipt.fileCount = files.length;
    receipt.byteCount = files.reduce((n, f) => n + f.bytes, 0);
    receipt.archiveSHA256 = sha256(fs.readFileSync(archive));
    receipt.archiveBytes = fs.statSync(archive).size;
    receipt.status = 'PASS';
  } catch (error) {
    receipt.blocker = error.message;
    throw error;
  } finally {
    save(output, receipt);
    const receiptBytes = fs.readFileSync(path.join(output, 'receipt.json'));
    const sums =
      `${sha256(receiptBytes)}  receipt.json\n` +
      (receipt.archiveSHA256
        ? `${receipt.archiveSHA256}  public-compiler.tar.gz\n`
        : '');
    fs.writeFileSync(path.join(output, 'SHA256SUMS'), sums);
  }
}
if (require.main === module) main();
module.exports = { collect, contract, emittedWorker, publicInputs };
