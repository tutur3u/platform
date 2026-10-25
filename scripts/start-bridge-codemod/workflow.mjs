// Renders the bridge's per-app Cloudflare qualification workflow from the
// template shipped by @tuturuuu/start-bridge. Returns null while the bridge
// has no template, so the codemod plans no workflow rather than inventing one.

import fs from 'node:fs';
import path from 'node:path';
import { BRIDGE_DIR, GENERATED_MARKER } from './contract.mjs';
import { pascal } from './templates.mjs';

export const WORKFLOW_TEMPLATE = `${BRIDGE_DIR}/templates/cloudflare-workflow.yaml`;

export function renderWorkflow(template, resolved) {
  const values = {
    app: resolved.app,
    App: pascal(resolved.app),
    APP: resolved.app.toUpperCase().replace(/-/gu, '_'),
    workerName: resolved.workerName,
  };
  const body = template.replace(/\{\{\s*(\w+)\s*\}\}/gu, (match, key) => {
    if (!(key in values))
      throw new Error(`Unknown workflow placeholder ${match}`);
    return values[key];
  });
  return `# ${GENERATED_MARKER} for ${resolved.app}; re-run it instead of editing.\n${body}`;
}

export function createWorkflowRenderer(repoRoot) {
  const file = path.join(repoRoot, WORKFLOW_TEMPLATE);
  if (!fs.existsSync(file)) return null;
  const template = fs.readFileSync(file, 'utf8');
  return (resolved) => renderWorkflow(template, resolved);
}
