const assert = require('node:assert/strict');
const test = require('node:test');
const { scanSql } = require('./sql-grant-guard');
const { scanSql: endState } = require('./sql-grant-end-state-guard');
const create =
  'create function public.f() returns void language sql security definer as $$select$$;';
const revoke = 'revoke all on function public.f() from public, anon;';
const scan = (sql) => scanSql(sql, { definerRule: true });
const end = (sql) => endState(sql, { definerRule: true });
test('gap 2: end-state rejects a revoke before creation', () => {
  assert.equal(end(revoke + create).length, 1);
  assert.deepEqual(end(create + revoke), []);
});
test('gap 3: end-state rejects delegation-only revokes', () => {
  assert.equal(
    end(
      create +
        'revoke grant option for execute on function public.f() from public, anon;'
    ).length,
    1
  );
  assert.deepEqual(end(create + revoke), []);
});
test('gap 5: end-state conservatively rejects embedded quotes in grantees', () => {
  assert.equal(end('grant select on t to "an""on";').length, 1);
  assert.deepEqual(end('grant select on t to "service_role";'), []);
});
test('gap 1: nested dollar bodies reject literal open grants', () => {
  for (const role of ['anon', 'public']) {
    const sql =
      'do $outer$ begin execute $middle$do $inner$grant select on t to ' +
      role +
      '$inner$$middle$; end $outer$;';
    assert.deepEqual(end(sql), []);
    const findings = scan(sql);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].rule, 'anon-grant');
  }
  assert.deepEqual(
    scan('do $$begin execute $i$grant select on t to service_role$i$;end$$;'),
    []
  );
  assert.deepEqual(scan('select $$grant select on t to anon$$;'), []);
  assert.deepEqual(scan('do $$begin -- grant select on t to anon\nend$$;'), []);
});
test('gap 4: ALTER ROUTINE SECURITY DEFINER needs a subsequent matching revoke', () => {
  const alter = 'alter routine public.f() security definer;';
  assert.deepEqual(end(alter), []);
  assert.equal(scan(alter).length, 1);
  assert.equal(scan(revoke + alter).length, 1);
  assert.deepEqual(scan(alter + revoke), []);
  assert.equal(
    scan(
      alter +
        'revoke grant option for execute on routine public.f() from public, anon;'
    ).length,
    1
  );
  assert.equal(
    scan(`${alter}revoke all on routine public.f(text) from public, anon;`)
      .length,
    1
  );
  assert.deepEqual(scan('alter routine public.f() security invoker;'), []);
});
