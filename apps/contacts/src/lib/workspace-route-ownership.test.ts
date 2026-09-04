import { describe, expect, it } from 'vitest';
import { isContactsOwnedWorkspaceRoute } from './workspace-route-ownership';

describe('Contacts workspace route ownership', () => {
  it.each([
    [],
    ['users'],
    ['reports'],
    ['reports', 'monthly'],
    ['workforce'],
    ['users', 'approvals'],
    ['users', 'attendance'],
    ['users', 'database'],
    ['users', 'database', 'user-id'],
    ['users', 'feedbacks'],
    ['users', 'group-tags'],
    ['users', 'groups'],
    ['users', 'groups', 'group-id', 'schedule'],
    ['users', 'guest-leads'],
    ['users', 'reports', 'report-id'],
    ['users', 'structure'],
    ['users', 'topic-announcements', 'templates'],
    ['users', 'tutoring'],
    ['users', 'user-id', 'follow-up'],
  ])('keeps the owned route /%s in Contacts', (...segments) => {
    expect(isContactsOwnedWorkspaceRoute(segments)).toBe(true);
  });

  it.each([
    ['settings'],
    ['tasks'],
    ['users', 'user-id'],
    ['users', 'user-id', 'settings'],
    ['finance'],
  ])('delegates the non-owned route /%s to Platform', (...segments) => {
    expect(isContactsOwnedWorkspaceRoute(segments)).toBe(false);
  });
});
