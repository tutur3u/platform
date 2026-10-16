import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgtap } from '@electric-sql/pglite-pgtap';

const root = new URL('../', import.meta.url);
const sql = (path) => readFile(new URL(path, root), 'utf8');
const db = new PGlite({ extensions: { pgtap } });
try {
  await db.exec(
    await sql('scripts/fixtures/mail-inbound-notification-schema.sql')
  );
  await db.exec('create extension pgtap with schema extensions;');
  const eventSource = await sql(
    'supabase/migrations/20251202060000_add_immediate_notification_delivery.sql'
  );
  const start = eventSource.indexOf(
    'CREATE OR REPLACE FUNCTION public.trigger_immediate_notification_send()'
  );
  const end = eventSource.indexOf(
    '$$ LANGUAGE plpgsql SECURITY DEFINER;',
    start
  );
  if (start < 0 || end < 0)
    throw new Error('Canonical event trigger not found');
  await db.exec(
    eventSource.slice(
      start,
      end + '$$ LANGUAGE plpgsql SECURITY DEFINER;'.length
    )
  );
  await db.exec(`create trigger fixture_immediate after insert on private.notification_batches
    for each row when (new.delivery_mode='immediate') execute function public.trigger_immediate_notification_send();
    set app.service_role_key = 'synthetic-fixture-only';`);
  for (const migration of [
    '20260923100000_mail_received_push.sql',
    '20260923110000_mail_thread_snooze_mute.sql',
  ]) {
    await db.exec(await sql(`supabase/migrations/${migration}`));
  }
  await db.exec(await sql('scripts/fixtures/mail-inbound-legacy-receipts.sql'));
  if (!process.argv.includes('--baseline')) {
    await db.exec(
      await sql(
        'supabase/migrations/20261012140000_mail_inbound_notification_admission.sql'
      )
    );
  }
  const results = await db.exec(
    await sql('supabase/tests/mail-inbound-notification-admission.sql')
  );
  const lines = results
    .flatMap((result) => result.rows.flatMap((row) => Object.values(row)))
    .filter((value) => typeof value === 'string')
    .flatMap((value) => value.split('\n'));
  for (const line of lines) console.log(line);
  const failures = lines.filter((line) =>
    /^not ok|^# (Looks like|No tests)/.test(line)
  );
  const assertions = lines.filter((line) => /^(not )?ok \d+/.test(line));
  if (assertions.length === 0 || failures.length > 0) process.exitCode = 1;
  console.log(
    JSON.stringify({
      assertions: assertions.length,
      failures: assertions.filter((line) => /^not ok/u.test(line)).length,
      migrationApplied: !process.argv.includes('--baseline'),
      postgres: 'PGlite',
      boundaries: {
        schema: 'synthetic',
        admissionTrigger: 'real migrations',
        transport: 'stub pg_net',
        provider: 'not contacted',
      },
    })
  );
} finally {
  await db.close();
}
