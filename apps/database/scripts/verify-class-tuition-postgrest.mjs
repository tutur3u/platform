import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { listClassTuition } from '../../web/src/lib/finance/class-tuition.ts';
import { ensureSupabaseBinary, runCommand } from './run-supabase.js';
import {
  chooseAvailablePortBlock,
  deriveIsolatedIdentity,
  hasProjectCollision,
  listDockerContainerNames,
  runIsolatedLifecycle,
  stageDisposableProject,
} from './run-supabase-isolated.js';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
const repositorySha = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim();
const identity = deriveIsolatedIdentity({
  headSha: repositorySha,
  repositoryPath: repositoryRoot,
});
if (hasProjectCollision(identity.projectId, listDockerContainerNames())) {
  throw new Error('Isolated Supabase project already exists');
}
const { basePort } = await chooseAvailablePortBlock(identity);
const binaryPath = await ensureSupabaseBinary(
  fileURLToPath(new URL('../', import.meta.url))
);
const metadata = await stageDisposableProject({
  basePort,
  headSha: repositorySha,
  projectId: identity.projectId,
  repositoryRoot,
});
const { createClient } = createRequire(
  new URL('../../web/package.json', import.meta.url)
)('@supabase/supabase-js');

const id = (number) =>
  `c7310000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const wsId = id(1);
const classA = id(2);
const classB = id(3);
const instructor = id(4);
const learner = id(5);
const classmate = id(6);
const teacherScope = { kind: 'teacher', contactId: instructor };
const studentScope = { kind: 'student', contactId: learner };

const fixture = `
insert into public.users (id) values ('${id(7)}');
insert into public.workspaces (id, name, personal, creator_id)
values ('${wsId}', 'Class tuition fixture', false, '${id(7)}');
insert into public.workspace_user_groups (id, ws_id, name, is_guest, is_course_published)
values
  ('${classA}', '${wsId}', 'Class A', false, true),
  ('${classB}', '${wsId}', 'Class B', false, true);
insert into public.workspace_users (id, ws_id, display_name)
values
  ('${instructor}', '${wsId}', 'Teacher'),
  ('${learner}', '${wsId}', 'Learner'),
  ('${classmate}', '${wsId}', 'Classmate');
insert into public.workspace_user_groups_users (group_id, user_id, role, created_at)
values
  ('${classA}', '${instructor}', 'TEACHER', '2026-10-01'),
  ('${classA}', '${learner}', 'STUDENT', '2026-10-01'),
  ('${classA}', '${classmate}', 'STUDENT', '2026-10-01'),
  ('${classB}', '${classmate}', 'STUDENT', '2026-10-01');
insert into private.workspace_wallets (id, ws_id, name, currency)
values ('${id(8)}', '${wsId}', 'Tuition wallet', 'VND');
insert into public.transaction_categories (id, ws_id, name, is_expense)
values ('${id(9)}', '${wsId}', 'Tuition', false);
insert into public.finance_invoices
  (id, ws_id, wallet_id, category_id, customer_id, price, paid_amount, completed_at, subscription_months)
values
  ('${id(10)}', '${wsId}', '${id(8)}', '${id(9)}', '${learner}', 100, 100, '2026-11-01', array['2026-11-01']::date[]),
  ('${id(11)}', '${wsId}', '${id(8)}', '${id(9)}', '${classmate}', 100, 100, '2026-11-01', array['2026-11-01']::date[]);
insert into public.finance_invoice_user_groups (invoice_id, user_group_id)
values ('${id(10)}', '${classA}'), ('${id(11)}', '${classB}');`;

process.exitCode = await runIsolatedLifecycle({
  binaryPath,
  metadata,
  runner: async (binary, args, cwd) => {
    if (!args.includes('test')) {
      return runCommand(binary, args, cwd, { stdio: 'ignore' });
    }
    execFileSync(
      'docker',
      [
        'exec',
        '-i',
        `supabase_db_${identity.projectId}`,
        'psql',
        '-Xq',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { input: fixture }
    );
    const status = JSON.parse(
      execFileSync(binary, ['--workdir', cwd, 'status', '-o', 'json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
    );
    const db = createClient(
      `http://127.0.0.1:${basePort + 1}`,
      status.SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
    const query = { classId: classA, db, month: '2026-11', limit: 20, wsId };
    const paid = (contact_id) => ({ contact_id, status: 'paid' });

    assert.deepEqual(
      await listClassTuition({ ...query, scope: teacherScope }),
      {
        data: [
          paid(learner),
          { contact_id: classmate, status: 'no_billable_activity' },
        ],
        nextCursor: null,
      }
    );
    assert.equal(
      await listClassTuition({
        ...query,
        classId: classB,
        scope: teacherScope,
      }),
      null
    );
    assert.deepEqual(
      await listClassTuition({ ...query, scope: studentScope }),
      {
        data: [paid(learner)],
        nextCursor: null,
      }
    );
    assert.equal(
      await listClassTuition({
        ...query,
        classId: classB,
        scope: studentScope,
      }),
      null
    );
    assert.deepEqual(
      await listClassTuition({
        ...query,
        classId: classB,
        scope: { kind: 'student', contactId: classmate },
      }),
      { data: [paid(classmate)], nextCursor: null }
    );

    console.log('Class tuition PostgREST access: 5 assertions passed.');
    return { code: 0 };
  },
});
