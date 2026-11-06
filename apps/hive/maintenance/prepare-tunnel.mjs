import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function prepareTunnelDraft(response, expectedVersion) {
  const result = response?.result;
  if (
    response?.success !== true ||
    result?.version !== expectedVersion ||
    result?.tunnel_id !== '774433a2-f284-4fdd-80d5-eaab0ab99fcd' ||
    result?.source !== 'cloudflare' ||
    !Array.isArray(result?.config?.ingress)
  ) {
    throw new Error(
      'Tunnel identity, source or approved version changed; refresh the draft'
    );
  }
  const ingress = result.config.ingress;
  const hive = ingress.filter((rule) => rule.hostname === 'hive.tuturuuu.com');
  const main = ingress.filter((rule) => rule.hostname === 'tuturuuu.com');
  if (
    hive.length !== 1 ||
    hive[0].service !== 'http://localhost:7814' ||
    main.length !== 1 ||
    main[0].service !== 'http://localhost:7803' ||
    ingress.length !== 3 ||
    JSON.stringify(ingress.at(-1)) !== '{"service":"http_status:404"}'
  ) {
    throw new Error('Ingress differs from the approved three-rule snapshot');
  }
  const before = { config: result.config };
  const after = {
    config: {
      ...result.config,
      ingress: ingress.filter((rule) => rule.hostname !== 'hive.tuturuuu.com'),
    },
  };
  return { before, after };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [input, outputDirectory, version] = process.argv.slice(2);
  if (!input || !outputDirectory || !/^\d+$/.test(version ?? '')) {
    throw new Error(
      'Usage: node prepare-tunnel.mjs GET-response.json existing-private-directory approved-version'
    );
  }
  const draft = prepareTunnelDraft(
    JSON.parse(readFileSync(input, 'utf8')),
    Number(version)
  );
  for (const name of ['before', 'after']) {
    writeFileSync(
      resolve(outputDirectory, `tunnel-${name}-body.json`),
      `${JSON.stringify(draft[name], null, 2)}\n`,
      { mode: 0o600, flag: 'wx' }
    );
  }
}
