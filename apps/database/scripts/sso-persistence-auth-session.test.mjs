import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertAuthUsersUseAuthAdmin } from './auth-admin-session.mjs';

const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');

test('auth user bootstrap uses the GoTrue role the platform-role guard admits', () => {
  assertAuthUsersUseAuthAdmin(
    read('../supabase/tests/sso-persistence.sql'),
    'SSO fixture'
  );
  assertAuthUsersUseAuthAdmin(
    read('./sso-persistence-concurrency.mjs'),
    'SSO concurrency'
  );
});
