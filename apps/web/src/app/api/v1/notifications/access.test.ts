import { describe, expect, it } from 'vitest';
import {
  buildNotificationAccessFilter,
  type NotificationAccessContext,
} from './access';

describe('buildNotificationAccessFilter', () => {
  it('includes user, email, and workspace-scoped ownership branches', () => {
    const context: NotificationAccessContext = {
      userId: '00000000-0000-0000-0000-000000000001',
      userEmail: 'local@tuturuuu.com',
      workspaceIds: [
        '00000000-0000-0000-0000-000000000000',
        '00000000-0000-0000-0000-000000000004',
      ],
    };

    expect(buildNotificationAccessFilter(context)).toBe(
      'and(scope.in.(user,system),user_id.eq.00000000-0000-0000-0000-000000000001),' +
        'and(scope.in.(user,system),user_id.is.null,email.eq."local@tuturuuu.com"),' +
        'and(scope.eq.workspace,user_id.eq.00000000-0000-0000-0000-000000000001,or(ws_id.is.null,ws_id.in.(00000000-0000-0000-0000-000000000000,00000000-0000-0000-0000-000000000004)))'
    );
  });

  it('keeps workspace-scoped access narrow when the user has no memberships', () => {
    const context: NotificationAccessContext = {
      userId: '00000000-0000-0000-0000-000000000001',
      userEmail: null,
      workspaceIds: [],
    };

    expect(buildNotificationAccessFilter(context)).toBe(
      'and(scope.in.(user,system),user_id.eq.00000000-0000-0000-0000-000000000001),' +
        'and(scope.eq.workspace,user_id.eq.00000000-0000-0000-0000-000000000001,ws_id.is.null)'
    );
  });
});
