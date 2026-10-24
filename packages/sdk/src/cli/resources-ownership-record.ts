import type { z } from 'zod';
import type { ProcessOwner } from './resources-ownership';

export function validateOwnershipRecord(
  owner: ProcessOwner & { ownershipVersion?: 1 },
  context: z.RefinementCtx
) {
  if (owner.ownershipVersion !== 1) return;
  if (!owner.pidStart)
    context.addIssue({
      code: 'custom',
      path: ['pidStart'],
      message: 'Version 1 ownership requires the broker start identity',
    });
  if (owner.childPid !== undefined && !owner.childStart)
    context.addIssue({
      code: 'custom',
      path: ['childStart'],
      message: 'Version 1 ownership requires the child start identity',
    });
  if (owner.childStart && owner.childPid === undefined)
    context.addIssue({
      code: 'custom',
      path: ['childPid'],
      message: 'A child start identity requires its child PID',
    });
}
