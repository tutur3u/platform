const fs = require('node:fs');
const { readRegularFileSync } = require('./safe-fs');
const path = require('node:path');

// Resolve local path items for the source contract checks. This is not a
// general OpenAPI bundler, and unknown reference shapes fail closed.
function readOpenApiSource(openApiPath) {
  const root = path.dirname(fs.realpathSync(openApiPath));
  const rootName = path.basename(openApiPath);
  const lines = fs.readFileSync(openApiPath, 'utf8').split('\n');
  const output = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    output.push(line);
    if (!/^ {2}\/[^:]+:\s*$/u.test(line)) continue;
    const next = lines[index + 1] ?? '';
    if (!/^ {4}\$ref:/u.test(next)) continue;
    const reference = next.match(
      /^ {4}\$ref: "\.\/paths\/([a-z0-9-]+\.yaml)#\/([A-Za-z][A-Za-z0-9]*)"\s*$/u
    );
    if (!reference) throw new Error('Unsupported OpenAPI path-item reference');
    const file = path.join(root, 'paths', reference[1]);
    if (
      fs.lstatSync(file).isSymbolicLink() ||
      fs.realpathSync(file) !== file ||
      !fs.statSync(file).isFile()
    ) {
      throw new Error('OpenAPI path-item module must be a local regular file');
    }
    const moduleLines = readRegularFileSync(file, { encoding: 'utf8' }).split(
      '\n'
    );
    const keys = moduleLines.flatMap((value, position) => {
      const match = value.match(/^([A-Za-z][A-Za-z0-9]*):\s*$/u);
      return match ? [{ name: match[1], position }] : [];
    });
    if (new Set(keys.map((key) => key.name)).size !== keys.length) {
      throw new Error('Duplicate OpenAPI path-item key');
    }
    const selected = keys.findIndex((key) => key.name === reference[2]);
    if (selected === -1) throw new Error('Missing OpenAPI path-item key');
    const body = moduleLines.slice(
      keys[selected].position + 1,
      keys[selected + 1]?.position ?? moduleLines.length
    );
    if (
      body.some((value) => value && !/^ {2}|^#/u.test(value)) ||
      body.some((value) => /^ {2}\$ref:/u.test(value)) ||
      !body.some((value) =>
        /^ {2}(delete|get|head|options|patch|post|put):\s*$/u.test(value)
      )
    ) {
      throw new Error('Unsupported OpenAPI path-item body');
    }
    for (const value of body) {
      // External component refs in the real module address the main document.
      // Normalize that exact target for the existing response-ref assertions.
      const normalized = value.replaceAll(
        `"../${rootName}#/components/`,
        '"#/components/'
      );
      output.push(normalized ? `  ${normalized}` : '');
    }
    index += 1;
  }
  return output.join('\n');
}

module.exports = { readOpenApiSource };
