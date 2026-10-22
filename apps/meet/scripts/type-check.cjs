const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const projects = [
  { output: '.turbo/types/app', info: '.turbo/tsconfig.tsbuildinfo' },
  { output: '.turbo/types/worker', info: 'dist/tsconfig.tsbuildinfo' },
];
const manifest = '.turbo/types/outputs.json';

function ownedPath(cwd, relative) {
  const absolute = path.resolve(cwd, relative);
  if (!absolute.startsWith(`${path.resolve(cwd)}${path.sep}`))
    throw new Error('Type cache path escapes project');
  let current = path.resolve(cwd);
  for (const segment of path.relative(current, absolute).split(path.sep)) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (stat?.isSymbolicLink())
      throw new Error('Type cache paths must not contain symlinks');
  }
  return absolute;
}

function outputs(cwd, directory) {
  const absolute = ownedPath(cwd, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.join(directory, entry.name);
      ownedPath(cwd, relative);
      if (entry.isDirectory()) return outputs(cwd, relative);
      return entry.isFile() && /\.d\.(?:ts|mts|cts)(?:\.map)?$/.test(entry.name)
        ? [relative]
        : [];
    })
    .sort();
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const producerFormat = 'meet-declaration-producer-v1';

function sameFiles(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readProducer(cwd, project, entry) {
  if (
    !entry ||
    entry.output !== project.output ||
    entry.info !== project.info ||
    typeof entry.buildInfo !== 'string' ||
    !Array.isArray(entry.files) ||
    entry.files.length === 0
  )
    return null;
  const raw = Buffer.from(entry.buildInfo, 'base64');
  if (raw.length === 0 || raw.toString('base64') !== entry.buildInfo)
    return null;
  const file = ownedPath(cwd, project.info);
  if (!fs.existsSync(file) || !raw.equals(fs.readFileSync(file))) return null;
  return { files: entry.files, seal: digest(JSON.stringify(entry)) };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError || error.code === 'ENOENT') return null;
    throw error;
  }
}

function atomicWrite(file, value) {
  const pending = `${file}.${process.pid}.${randomUUID()}.pending`;
  try {
    fs.writeFileSync(pending, `${JSON.stringify(value)}\n`, { flag: 'wx' });
    fs.renameSync(pending, file);
  } finally {
    fs.rmSync(pending, { force: true });
  }
}

function runWithDeclarationCache({
  cwd,
  compile,
  projects: owned = projects,
  manifest: record = manifest,
}) {
  // Validate every deletion target before changing any metadata.
  const recordPath = ownedPath(cwd, record);
  const producerPath = ownedPath(
    cwd,
    path.join(path.dirname(record), 'producers.json')
  );
  for (const project of owned) {
    ownedPath(cwd, project.info);
    outputs(cwd, project.output);
  }
  const previous = readJson(recordPath);
  const state = readJson(producerPath);
  const valid = Array.isArray(previous) && previous.length === owned.length;
  const validProducer =
    state?.format === producerFormat &&
    Array.isArray(state.projects) &&
    state.projects.length === owned.length;
  const producers = owned.map((project, index) =>
    validProducer ? readProducer(cwd, project, state.projects[index]) : null
  );
  const invalidated = [];
  let dependencyMissing = !valid;
  for (const [index, project] of owned.entries()) {
    const producer = producers[index];
    const entry = valid ? previous[index] : null;
    // The inventory authority is the independently persisted successful producer,
    // not a count/checksum supplied by the mutable output receipt itself.
    const matchesProducer =
      producer &&
      entry?.output === project.output &&
      entry.producer === producer.seal &&
      sameFiles(entry.files, producer.files);
    dependencyMissing ||=
      !matchesProducer ||
      producer.files.some(
        (file) =>
          typeof file !== 'string' ||
          !file.startsWith(`${project.output}/`) ||
          !/\.d\.(?:ts|mts|cts)(?:\.map)?$/.test(file) ||
          file.split(/[\\/]/).includes('..') ||
          !fs.existsSync(ownedPath(cwd, file)) ||
          !fs.statSync(ownedPath(cwd, file)).isFile()
      );
    if (dependencyMissing) invalidated.push(ownedPath(cwd, project.info));
  }
  for (const file of invalidated) fs.rmSync(file, { force: true });
  // Remove qualification before invoking tsc; a failed/interrupted producer
  // cannot leave a successful receipt or independently trusted inventory.
  fs.rmSync(recordPath, { force: true });
  fs.rmSync(producerPath, { force: true });
  const status = compile();
  if (status !== 0) return status;
  const nextProducers = owned.map((project) => {
    const raw = fs.readFileSync(ownedPath(cwd, project.info));
    const files = outputs(cwd, project.output);
    if (raw.length === 0 || files.length === 0)
      throw new Error(
        'Successful type check did not produce owned declarations'
      );
    return {
      output: project.output,
      info: project.info,
      buildInfo: raw.toString('base64'),
      files,
    };
  });
  const next = nextProducers.map((producer) => ({
    output: producer.output,
    files: producer.files,
    producer: digest(JSON.stringify(producer)),
  }));
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  // Publication can stop between renames: mismatching/missing paired state
  // then invalidates metadata on the next invocation rather than qualifying it.
  atomicWrite(producerPath, {
    format: producerFormat,
    projects: nextProducers,
  });
  atomicWrite(recordPath, next);

  return status;
}

if (require.main === module) {
  const { runTsc } = require('../../../scripts/run-tsc-build.js');
  process.exitCode = runWithDeclarationCache({
    cwd: path.resolve(__dirname, '..'),
    compile: () => runTsc(['--build'], path.resolve(__dirname, '..')),
  });
}

module.exports = { projects, manifest, runWithDeclarationCache };
