import assert from 'node:assert/strict';
import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

// Wave-1 publication configs set `upload_source_maps: false`, so Wrangler never
// sends server maps. Production seals therefore drop them: the sealed inventory
// is exactly the uploaded module set, and a stray map cannot reach the 60 MiB
// encoded-map limit (Cloudflare error 10021) if the flag ever flips. The
// reference comments go too, because Wrangler resolves every sourceMappingURL
// and a reference to a removed map fails the dry run and the upload.
const moduleFile = /\.(?:m?js|cjs)$/u;
const reference = /^[ \t]*\/\/[#@][ \t]*sourceMappingURL=([^\s]+)[ \t]*$/gmu;

function workerFiles(root) {
  assert.equal(
    realpathSync(root),
    root,
    'Worker module root must be canonical'
  );
  const result = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      assert.ok(!stat.isSymbolicLink(), 'Worker module symlink forbidden');
      if (stat.isDirectory()) visit(path);
      else {
        assert.ok(stat.isFile(), 'Only regular Worker files supported');
        result.push({ name: relative(root, path), path, bytes: stat.size });
      }
    }
  }
  visit(root);
  return result;
}

function externalReferences(source) {
  return [...source.matchAll(reference)]
    .map((match) => match[1])
    .filter((target) => !target.startsWith('data:'));
}

/** Refuse a Worker module root that also holds the public asset directory. */
export function assertWorkerModuleRoot(dist, root, assets) {
  const inDist = relative(dist, root);
  assert.ok(
    inDist && !inDist.startsWith('..') && !isAbsolute(inDist),
    'Worker module root must be inside dist'
  );
  const toAssets = relative(root, assets);
  assert.ok(
    toAssets.startsWith('..') || isAbsolute(toAssets),
    'Worker module root must not contain the asset directory'
  );
}

/** Remove server source maps and their external references before sealing. */
export function stripServerSourceMaps(root) {
  let count = 0;
  let bytes = 0;
  let references = 0;
  for (const file of workerFiles(root)) {
    if (file.name.endsWith('.map')) {
      unlinkSync(file.path);
      count++;
      bytes += file.bytes;
    } else if (moduleFile.test(file.name)) {
      const source = readFileSync(file.path, 'utf8');
      const found = externalReferences(source).length;
      if (!found) continue;
      references += found;
      writeFileSync(
        file.path,
        source.replace(reference, (line, target) =>
          target.startsWith('data:') ? line : ''
        )
      );
    }
  }
  return assertNoServerSourceMaps(root, { count, bytes, references });
}

/** Fail closed when a sealed Worker still carries a map Wrangler could upload. */
export function assertNoServerSourceMaps(root, removed) {
  for (const file of workerFiles(root)) {
    assert.ok(
      !file.name.endsWith('.map'),
      `Server source map in sealed Worker: ${file.name}`
    );
    if (moduleFile.test(file.name))
      assert.equal(
        externalReferences(readFileSync(file.path, 'utf8')).length,
        0,
        `Server source map reference in sealed Worker: ${file.name}`
      );
  }
  return removed;
}
