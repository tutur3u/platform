import { describe, expect, it } from 'vitest';
import { CURRENT_USER_APP_SESSION_AUTH } from '../legacy-api-routes/v1/users/me/session-auth';

describe('notification app-session auth', () => {
  it('allows Tasks as a current-user satellite target', () => {
    expect(CURRENT_USER_APP_SESSION_AUTH.targetApp).toContain('tasks');
  });
});
