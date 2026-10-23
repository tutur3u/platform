import { readFileSync } from 'node:fs';
import { auditCalendarGatewayFirewall } from '../apps/infrastructure/src/lib/mobile-calendar/firewall-policy';

// Read-only: consume a privately saved Vercel firewall config, never print credentials.
try {
  const path = process.argv[2];
  if (!path || process.argv.length !== 3) throw new Error();
  const input: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const result = auditCalendarGatewayFirewall(input);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.coverage.every((path) => path.current) ? 0 : 1;
} catch {
  console.error(
    'Cannot audit firewall policy. Supply a private config JSON file; no changes were made.'
  );
  process.exitCode = 2;
}
