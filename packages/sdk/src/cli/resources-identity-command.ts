import { requireProcessIdentity } from './resources-process-identity';

export function resourceIdentityCommand(args: string[]) {
  let pid = process.pid;
  let selected = false;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const option = args[i];
    if (option === '--no-update-check') continue;
    if (option === '--json' && !json) {
      json = true;
      continue;
    }
    if (option !== '--pid' || selected)
      throw new Error('Use ttr resources identity [--pid PID] [--json].');
    const value = args[++i];
    if (
      !value ||
      !/^[1-9][0-9]*$/u.test(value) ||
      Number(value) > 2_147_483_647
    )
      throw new Error('--pid must be a positive system PID.');
    pid = Number(value);
    selected = true;
  }
  return {
    json,
    receipt: {
      pid,
      ownershipVersion: 1 as const,
      pidStart: requireProcessIdentity(pid),
    },
  };
}
