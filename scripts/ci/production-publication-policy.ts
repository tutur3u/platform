import { appendFileSync } from 'node:fs';
import { productionPublicationHolds } from '../../tuturuuu.ci.ts';

export function productionPublicationHold(workflowName: string) {
  const app = workflowName
    .replace(/^vercel-production-/, '')
    .replace(/-cloudflare\.yaml$|\.yaml$/g, '');
  return productionPublicationHolds[app];
}

if (import.meta.main) {
  const workflowName = process.argv[2];
  if (!workflowName) throw new Error('Expected production workflow name');
  const reason = productionPublicationHold(workflowName);
  const message = `${workflowName}: ${reason ?? 'publication admitted by source policy'}`;
  console.log(message);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `allowed=${!reason}\n`);
  }
  const summaryPath = process.argv[3];
  if (summaryPath) {
    appendFileSync(
      summaryPath,
      `## Production publication policy\n\n${message}\n`
    );
  }
}
