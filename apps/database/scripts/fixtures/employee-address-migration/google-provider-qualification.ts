import assert from 'node:assert/strict';
import type { createClient } from '@supabase/supabase-js';
import { createEmployeeAddressMigrationProvider } from '../../../../../packages/utils/src/internal-accounts/employee-address-migration-provider';
import {
  assertGooglePreservationNegativeControls,
  assertGooglePreserved,
  googlePreservationBaseline,
} from './google-preservation';

/** Disposable SQL-seeded Google claims, real GoTrue admin mutation. This does
 * not qualify an external Google login or the full application SQL journal. */
export async function qualifyGoogleDestination(options: {
  client: Pick<ReturnType<typeof createClient>, 'auth'>;
  sql(statement: string): Promise<string>;
  userId: string;
  password: string;
  fixtureId: string;
  sourceAddress: string;
  destinationAddress: string;
  puts(): number;
}) {
  const { client, sql, userId, sourceAddress, destinationAddress } = options;
  assert.match(userId, /^[a-f0-9-]{36}$/);
  assert.equal(sourceAddress, 'qualification@staff.tuturuuu.com');
  assert.equal(destinationAddress, 'qualification@tuturuuu.com');
  const signedIn = await client.auth.signInWithPassword({
    email: sourceAddress,
    password: options.password,
  });
  assert.equal(signedIn.error, null);
  assert.equal(signedIn.data.user?.id, userId);
  assert.ok(signedIn.data.session?.access_token);
  assert.ok(signedIn.data.session?.refresh_token);
  const authenticated = await client.auth.getUser(
    signedIn.data.session.access_token
  );
  assert.equal(authenticated.error, null);
  assert.equal(authenticated.data.user?.id, userId);
  await sql(`update auth.identities set provider='google',provider_id='fixture-google-subject',
    identity_data='{"sub":"fixture-google-subject","email":"qualification@tuturuuu.com","email_verified":true,"name":"preserved"}'
    where user_id='${userId}';`);
  const protectedState = () =>
    sql(`select json_build_object(
    'user',to_jsonb(u)-'email'-'email_confirmed_at'-'confirmed_at'-'updated_at',
    'google',(select to_jsonb(i) from auth.identities i where user_id=u.id and provider='google'),
    'sessions',(select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb) from auth.sessions s where s.user_id=u.id),
    'tokens',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from auth.refresh_tokens t where t.user_id=u.id::text),
    'mail',(select jsonb_agg(to_jsonb(m) order by m.id) from qualification_mail_data m where m.user_id=u.id))
    from auth.users u where id='${userId}';`);
  const beforeState = googlePreservationBaseline(
    JSON.parse(await protectedState())
  );
  assert.ok(beforeState.tokens.some((row) => row.revoked === false));
  const provider = createEmployeeAddressMigrationProvider({
    binding: { userId, sourceAddress, destinationAddress },
    authorize: async () => true,
    admin: {
      getUserById: (id) => client.auth.admin.getUserById(id),
      async updateUserById(id, attributes) {
        assert.deepEqual(attributes, {
          email: destinationAddress,
          email_confirm: true,
        });
        const result = await client.auth.admin.updateUserById(id, attributes);
        assert.equal(result.error, null);
        throw new Error('lost_fixture_acknowledgement');
      },
    },
  });
  const before = await provider.read(userId);
  assert.equal(before.emailVerified, true);
  assert.equal(before.active, true);
  assert.equal(options.puts(), 0);
  await assert.rejects(
    provider.changeEmail(userId, destinationAddress),
    /lost_fixture_acknowledgement/
  );
  const after = await provider.read(userId);
  assert.equal(after.emailVerified, true);
  assert.equal(after.email, destinationAddress);
  assert.equal(after.userId, userId);
  assert.notEqual(
    after.providerIdentityFingerprint,
    before.providerIdentityFingerprint
  );
  const afterState = JSON.parse(await protectedState());
  assertGooglePreserved(beforeState, afterState);
  const preservationNegativeControls = assertGooglePreservationNegativeControls(
    beforeState,
    afterState
  );
  const readback = await client.auth.admin.getUserById(userId);
  assert.equal(readback.error, null);
  const identities = readback.data.user?.identities;
  assert.equal(identities?.length, 2);
  const email = identities?.find((identity) => identity.provider === 'email');
  assert.equal(email?.id, userId);
  assert.equal(email?.identity_data?.email, destinationAddress);
  assert.equal(email?.identity_data?.email_verified, true);
  await assert.rejects(provider.changeEmail(userId, destinationAddress));
  assert.equal(options.puts(), 1);
  console.log(
    JSON.stringify({
      stage: 'google_destination_provider',
      fixtureId: options.fixtureId,
      qualification: 'PASS',
      migrationPuts: 1,
      preservationNegativeControls,
      preservedSessionRows: beforeState.sessions.length,
      preservedRefreshRows: beforeState.tokens.length,
      googleClaims: 'SQL_SEEDED_FIXTURE',
      actualGoTrue: true,
      identityTransition: 'ONE_VERIFIED_EMAIL_ADDITION',
      fullSchemaQualified: false,
      lostAcknowledgement: 'INSPECT_NO_REPLAY',
    })
  );
}
