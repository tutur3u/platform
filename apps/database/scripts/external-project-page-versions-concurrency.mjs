import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

// Only the disposable real-stack contract runner supplies this container.
export async function verifyPagePublishConcurrency(container, fixture) {
  assert.match(container, /^supabase_db_[a-zA-Z0-9_-]+$/);
  const args = [
    'exec',
    '-i',
    container,
    'psql',
    '-X',
    '-A',
    '-t',
    '-q',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'supabase_admin',
    '--dbname',
    'postgres',
  ];
  const sql = (input) =>
    execFileSync('docker', args, { input, encoding: 'utf8', timeout: 15000 });
  const ws = '7a9e0000-0000-4000-8000-00000000000a';
  const v2 = '7a9e0000-0000-4000-8000-0000000003a2';
  const v3 = '7a9e0000-0000-4000-8000-0000000003a3';
  const claims = `set role authenticated; set request.jwt.claims = '{"role":"authenticated","sub":"7a9e0000-0000-4000-8000-0000000000c1"}';`;
  const publish = (version) =>
    `select (public.publish_workspace_external_project_page_version('${ws}', '${version}')).replaced_page_version_id;`;
  const marker = fixture.indexOf('-- Deleting an entry');
  assert.ok(marker > 0, 'fixture seed boundary exists');
  sql(`${fixture.slice(0, marker)}\nreset role; commit;`);
  const clients = [];
  function client() {
    const process = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    clients.push(process);
    let output = '',
      errors = '';
    process.stdout.on('data', (chunk) => {
      output += chunk;
    });
    process.stderr.on('data', (chunk) => {
      errors += chunk;
    });
    const done = new Promise((resolve, reject) => {
      process.on('error', reject);
      process.on('close', (code) =>
        code === 0 ? resolve(output) : reject(new Error(errors))
      );
    });
    // Every rejection is consumed even if the other client fails first.
    done.catch(() => {});
    return { process, done, output: () => output };
  }
  try {
    const a = client();
    a.process.stdin.write(
      `begin;\n${claims}\n${publish(v2)}\n\\echo CMS_LOCK_HELD\n`
    );
    for (let n = 0; !a.output().includes('CMS_LOCK_HELD') && n < 200; n++)
      await setTimeout(25);
    assert.ok(
      a.output().includes('CMS_LOCK_HELD'),
      'first publication holds its transaction'
    );
    const b = client();
    b.process.stdin.end(
      `${claims}\nset application_name = 'cms_l1_publish_b';\n${publish(v3)}\n`
    );
    let blocked = false;
    for (let n = 0; n < 100; n++) {
      blocked =
        sql(
          "select exists(select 1 from pg_stat_activity where application_name='cms_l1_publish_b' and wait_event_type='Lock');"
        ).trim() === 't';
      if (blocked) break;
      await setTimeout(25);
    }
    assert.ok(
      blocked,
      'second publication waits while the first owns the entry'
    );
    a.process.stdin.end('commit;\n');
    await a.done;
    const result = (await b.done).trim();
    assert.equal(
      result,
      v2,
      'second publication returns the immediately replaced committed pointer'
    );
    assert.equal(
      sql(
        `select published_page_version_id from public.workspace_external_project_entries where ws_id='${ws}' and id='7a9e0000-0000-4000-8000-0000000002aa';`
      ).trim(),
      v3
    );
    console.log('Real PostgreSQL concurrent page publication: PASS');
  } finally {
    for (const client of clients)
      if (client.exitCode === null) client.kill('SIGTERM');
  }
}
