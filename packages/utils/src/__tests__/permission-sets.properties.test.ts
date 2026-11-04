import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ROOT_WORKSPACE_ID } from '../constants';
import {
  CREATOR_GRANT_PERMISSIONS,
  isAdminImpliedPermission,
  isCreatorGrantPermission,
  withoutCreatorGrantPermissions,
} from '../creator-grant-permissions';
import {
  applyExplicitGrants,
  createPermissionCheck,
  EXPLICIT_GRANT_PERMISSIONS,
  isExplicitGrantPermission,
} from '../explicit-grant-permissions';

const properties = { seed: 20261031, numRuns: 300 };

const permissionId = fc.oneof(
  fc.constantFrom(
    'admin',
    'manage_subscription',
    'manage_mastermind',
    'manage_workspace_roles',
    'manage_workspace_members',
    'view_users_private_info',
    'manage_calendar'
  ),
  fc.string({ minLength: 1, maxLength: 12 })
);
const permissionList = fc.array(permissionId, { maxLength: 12 });
const nonRootWorkspaceId = fc.uuid().filter((id) => id !== ROOT_WORKSPACE_ID);

describe('permission classification properties', () => {
  it('creator-grant permissions are never implied by admin', () => {
    fc.assert(
      fc.property(permissionId, (permission) => {
        if (isCreatorGrantPermission(permission)) {
          expect(isAdminImpliedPermission(permission)).toBe(false);
        }
      }),
      properties
    );
  });

  it('admin implies every permission except itself and creator-grant permissions', () => {
    fc.assert(
      fc.property(permissionId, (permission) => {
        expect(isAdminImpliedPermission(permission)).toBe(
          permission !== 'admin' && !isCreatorGrantPermission(permission)
        );
      }),
      properties
    );
  });

  it('classification of creator-grant and explicit-grant permissions matches the exported catalogues', () => {
    fc.assert(
      fc.property(permissionId, (permission) => {
        expect(isCreatorGrantPermission(permission)).toBe(
          (CREATOR_GRANT_PERMISSIONS as readonly string[]).includes(permission)
        );
        expect(isExplicitGrantPermission(permission)).toBe(
          (EXPLICIT_GRANT_PERMISSIONS as readonly string[]).includes(permission)
        );
      }),
      properties
    );
  });
});

describe('permission check properties', () => {
  it('a workspace creator holds every permission except an explicit grant they were not given', () => {
    fc.assert(
      fc.property(
        permissionList,
        permissionList,
        permissionId,
        (permissions, explicitGrants, permission) => {
          const check = createPermissionCheck({
            explicitGrants,
            isCreator: true,
            permissions,
          });
          expect(check(permission)).toBe(
            isExplicitGrantPermission(permission)
              ? explicitGrants.includes(permission)
              : true
          );
        }
      ),
      properties
    );
  });

  it('a non-creator without admin holds exactly the permissions listed for them', () => {
    fc.assert(
      fc.property(
        permissionList.map((list) => list.filter((id) => id !== 'admin')),
        permissionList,
        permissionId,
        (permissions, explicitGrants, permission) => {
          const check = createPermissionCheck({
            explicitGrants,
            isCreator: false,
            permissions,
          });
          expect(check(permission)).toBe(
            isExplicitGrantPermission(permission)
              ? explicitGrants.includes(permission)
              : permissions.includes(permission)
          );
        }
      ),
      properties
    );
  });

  it('an admin non-creator holds every permission except creator-grant and ungranted explicit-grant ones', () => {
    fc.assert(
      fc.property(
        permissionList,
        permissionList,
        permissionId,
        (others, explicitGrants, permission) => {
          const permissions = [...others, 'admin'];
          const check = createPermissionCheck({
            explicitGrants,
            isCreator: false,
            permissions,
          });
          if (isExplicitGrantPermission(permission)) {
            expect(check(permission)).toBe(explicitGrants.includes(permission));
          } else if (isCreatorGrantPermission(permission)) {
            expect(check(permission)).toBe(permissions.includes(permission));
          } else {
            expect(check(permission)).toBe(true);
          }
        }
      ),
      properties
    );
  });

  it('granting more permissions never revokes a permission already held', () => {
    fc.assert(
      fc.property(
        permissionList,
        permissionList,
        permissionList,
        permissionList,
        fc.boolean(),
        permissionId,
        (base, extra, grants, moreGrants, isCreator, permission) => {
          const before = createPermissionCheck({
            explicitGrants: grants,
            isCreator,
            permissions: base,
          });
          const after = createPermissionCheck({
            explicitGrants: [...grants, ...moreGrants],
            isCreator,
            permissions: [...base, ...extra],
          });
          if (before(permission)) {
            expect(after(permission)).toBe(true);
          }
        }
      ),
      properties
    );
  });

  it('createPermissionCheck does not depend on the order or duplication of its permission lists', () => {
    fc.assert(
      fc.property(
        permissionList,
        permissionList,
        fc.boolean(),
        permissionId,
        (permissions, explicitGrants, isCreator, permission) => {
          const canonical = createPermissionCheck({
            explicitGrants,
            isCreator,
            permissions,
          });
          const shuffled = createPermissionCheck({
            explicitGrants: [...explicitGrants, ...explicitGrants].reverse(),
            isCreator,
            permissions: [...permissions].reverse().concat(permissions),
          });
          expect(shuffled(permission)).toBe(canonical(permission));
        }
      ),
      properties
    );
  });
});

describe('explicit grant application properties', () => {
  it('applyExplicitGrants returns permissions without duplicates', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(ROOT_WORKSPACE_ID), fc.uuid()),
        permissionList,
        permissionList,
        (wsId, roleGranted, implied) => {
          const { permissions } = applyExplicitGrants(
            wsId,
            roleGranted,
            implied
          );
          expect(new Set(permissions).size).toBe(permissions.length);
        }
      ),
      properties
    );
  });

  it('applyExplicitGrants grants nothing explicit outside the root workspace', () => {
    fc.assert(
      fc.property(
        nonRootWorkspaceId,
        permissionList,
        permissionList,
        (wsId, roleGranted, implied) => {
          const { explicitGrants, permissions } = applyExplicitGrants(
            wsId,
            roleGranted,
            implied
          );
          expect(explicitGrants).toEqual([]);
          expect(permissions.some(isExplicitGrantPermission)).toBe(false);
        }
      ),
      properties
    );
  });

  it('applyExplicitGrants never lets implied permissions introduce an explicit grant in the root workspace', () => {
    fc.assert(
      fc.property(permissionList, permissionList, (roleGranted, implied) => {
        const { explicitGrants, permissions } = applyExplicitGrants(
          ROOT_WORKSPACE_ID,
          roleGranted,
          implied
        );
        const explicitInPermissions = permissions.filter(
          isExplicitGrantPermission
        );
        expect(new Set(explicitInPermissions)).toEqual(new Set(explicitGrants));
        expect(explicitGrants.every((id) => roleGranted.includes(id))).toBe(
          true
        );
      }),
      properties
    );
  });

  it('applyExplicitGrants keeps every implied non-explicit permission and adds nothing else', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(ROOT_WORKSPACE_ID), fc.uuid()),
        permissionList,
        permissionList,
        (wsId, roleGranted, implied) => {
          const { explicitGrants, permissions } = applyExplicitGrants(
            wsId,
            roleGranted,
            implied
          );
          const expected = new Set([
            ...implied.filter((id) => !isExplicitGrantPermission(id)),
            ...explicitGrants,
          ]);
          expect(new Set(permissions)).toEqual(expected);
        }
      ),
      properties
    );
  });

  it('applyExplicitGrants is idempotent when its output is fed back as the implied set', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(ROOT_WORKSPACE_ID), fc.uuid()),
        permissionList,
        permissionList,
        (wsId, roleGranted, implied) => {
          const first = applyExplicitGrants(wsId, roleGranted, implied);
          const second = applyExplicitGrants(
            wsId,
            roleGranted,
            first.permissions
          );
          expect(new Set(second.permissions)).toEqual(
            new Set(first.permissions)
          );
          expect(second.explicitGrants).toEqual(first.explicitGrants);
        }
      ),
      properties
    );
  });

  it('applyExplicitGrants permissions yield a check that agrees with the explicit grants it returned', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(ROOT_WORKSPACE_ID), fc.uuid()),
        permissionList,
        permissionList,
        fc.boolean(),
        permissionId,
        (wsId, roleGranted, implied, isCreator, permission) => {
          const { explicitGrants, permissions } = applyExplicitGrants(
            wsId,
            roleGranted,
            implied
          );
          const check = createPermissionCheck({
            explicitGrants,
            isCreator,
            permissions,
          });
          if (isExplicitGrantPermission(permission)) {
            expect(check(permission)).toBe(
              wsId === ROOT_WORKSPACE_ID && roleGranted.includes(permission)
            );
          }
        }
      ),
      properties
    );
  });
});

describe('creator-grant payload filtering properties', () => {
  const entries = fc.array(
    fc.record({ id: permissionId, enabled: fc.boolean() }),
    { maxLength: 15 }
  );

  it('withoutCreatorGrantPermissions returns an equal copy, not the same array, for a creator', () => {
    fc.assert(
      fc.property(entries, (payload) => {
        const result = withoutCreatorGrantPermissions(payload, true);
        expect(result).toEqual(payload);
        expect(result).not.toBe(payload);
      }),
      properties
    );
  });

  it('withoutCreatorGrantPermissions removes exactly the creator-grant entries for a non-creator', () => {
    fc.assert(
      fc.property(entries, (payload) => {
        const result = withoutCreatorGrantPermissions(payload, false);
        expect(result.some((entry) => isCreatorGrantPermission(entry.id))).toBe(
          false
        );
        expect(result).toEqual(
          payload.filter((entry) => !isCreatorGrantPermission(entry.id))
        );
      }),
      properties
    );
  });

  it('withoutCreatorGrantPermissions is idempotent and never mutates its input', () => {
    fc.assert(
      fc.property(entries, fc.boolean(), (payload, callerIsCreator) => {
        const snapshot = structuredClone(payload);
        const once = withoutCreatorGrantPermissions(payload, callerIsCreator);
        expect(payload).toEqual(snapshot);
        expect(withoutCreatorGrantPermissions(once, callerIsCreator)).toEqual(
          once
        );
      }),
      properties
    );
  });

  it('withoutCreatorGrantPermissions keeps the relative order of surviving entries', () => {
    fc.assert(
      fc.property(entries, (payload) => {
        const result = withoutCreatorGrantPermissions(payload, false);
        let cursor = 0;
        for (const entry of result) {
          cursor = payload.indexOf(entry, cursor) + 1;
          expect(cursor).toBeGreaterThan(0);
        }
      }),
      properties
    );
  });
});
