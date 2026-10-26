import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { validateRetainedCoverage } from '../src/route-safety';
import { endpoints } from '../src/routes';
import { retainedInventory } from './inventory';
import { clients } from './render-clients';

const check = process.argv.includes('--check');
const app = resolve(import.meta.dirname, '..');
const paths: Record<string, Record<string, unknown>> = {};
for (const endpoint of endpoints) {
  const input = z.toJSONSchema(endpoint.input, { io: 'input' });
  const output = z.toJSONSchema(endpoint.output, { io: 'output' });
  const query = input.properties?.query;
  const operation = {
    operationId: endpoint.operationId,
    security: endpoint.policy.kind === 'public' ? [] : [{ principal: [] }],
    parameters:
      query &&
      typeof query === 'object' &&
      'properties' in query &&
      query.properties
        ? Object.entries(query.properties).map(([name, schema]) => ({
            name,
            in: 'query',
            required: true,
            schema,
          }))
        : [],
    responses: {
      [endpoint.status]: {
        description: 'Validated response',
        content: { 'application/json': { schema: output } },
      },
      default: {
        description: 'Request failure; writes are never automatically retried',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['error'],
              properties: {
                error: {
                  type: 'object',
                  required: ['code', 'message', 'requestId'],
                  properties: {
                    code: { type: 'string' },
                    message: { type: 'string' },
                    requestId: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    'x-policy': endpoint.policy,
    'x-runtime': endpoint.runtime,
    'x-limits': endpoint.limits,
    'x-guard': endpoint.guard,
  };
  const methods = paths[endpoint.path] ?? {};
  methods[endpoint.method.toLowerCase()] = operation;
  paths[endpoint.path] = methods;
}
const spec = {
  openapi: '3.1.0',
  info: { title: 'Tuturuuu API', version: '1.0.0' },
  paths,
};
const retained = await retainedInventory();
validateRetainedCoverage(endpoints, retained);
const manifest = endpoints.map(
  ({ execute: _execute, input: _input, output: _output, ...endpoint }) =>
    endpoint
);
const generatedClients = clients(spec);
const outputs = {
  'openapi.json': `${JSON.stringify(spec, null, 2)}\n`,
  'manifest.json': `${JSON.stringify(manifest, null, 2)}\n`,
  'retained-routes.json': `${JSON.stringify(retained, null, 2)}\n`,
  'client.ts': generatedClients.typescript,
  'client.dart': generatedClients.dart,
};
for (const [name, contents] of Object.entries(outputs)) {
  const file = resolve(app, 'generated', name);
  if (check) {
    if ((await readFile(file, 'utf8').catch(() => '')) !== contents)
      throw new Error(
        `Stale API artifact: ${name}; run bun run --cwd apps/api generate`
      );
  } else await writeFile(file, contents);
}
// Every authored operation must be reachable from the one serving registry.
const { Glob } = await import('bun');
for await (const file of new Glob('src/domains/**/*.ts').scan({ cwd: app })) {
  if (file.endsWith('.test.ts')) continue;
  const source = await readFile(resolve(app, file), 'utf8');
  for (const match of source.matchAll(/operationId:\s*['"]([^'"]+)['"]/g)) {
    if (!endpoints.some((endpoint) => endpoint.operationId === match[1]))
      throw new Error(`Unregistered operation in ${file}`);
  }
}
console.info(
  `API registry ${check ? 'checked' : 'generated'}: ${endpoints.length} Worker operations, ${retained.length} retained routes`
);
