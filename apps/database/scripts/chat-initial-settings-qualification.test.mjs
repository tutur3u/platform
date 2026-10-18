import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { assertPacketTap, foundationPackets, schemaReceipt, selectSchemaPackets } from './employee-schema-tap.mjs';
import { assertChatBinding, assertPhaseResult, assertSqlEnvelope, assertVitestReport,
  chatCaseNames, chatControlFiles, chatFiles, chatMigration, chatQualificationReceipt,
  dartCaseNames, selectChatInitialSettings, sha256, webCaseNames,
} from './chat-initial-settings-qualification.mjs';
import { fixtureCleanupSql, runChatInitialSettingsBridge, sqlJson } from './chat-initial-settings-runner.mjs';

// These synthetic ports test orchestration failures, never actual SQL qualification.
const fixture = 'begin; commit; select 1;';
const binding = () => ({ version: 1, sourceSha: 'a'.repeat(40), controlSha: 'b'.repeat(40),
  runId: '123', migration: { path: chatMigration, sha256: 'c'.repeat(64) },
  fixtureHashes: chatFiles.map((file, i) => ({ path: file, sha256: i === 2 ? sha256(fixture) : 'c'.repeat(64) })),
  controlHashes: chatControlFiles.map((file) => ({ path: file, sha256: 'd'.repeat(64) })),
});
const sqlEnvelope = (personalWsId = 'a6277131-0000-4000-8000-000000000002') => {
  const actorId = 'b6277131-0000-4000-8000-000000000002';
  const creatorId = 'b6277131-0000-4000-8000-000000000001';
  const wsId = 'b6277131-0000-4000-8000-000000000011';
  return { version: 1, committedReadback: true, migrationVersion: '20261018020000', createAllowed: true,
    manageAllowed: false, deniedSqlstate: '42501', deniedCreatedRows: 0,
    fixtureWorkspaces: [{id: wsId, creatorId, personal: false, creatorMember: false},
      {id: 'a6277131-0000-4000-8000-000000000001', creatorId, personal: true, creatorMember: true},
      {id: personalWsId, creatorId: actorId, personal: true, creatorMember: true}],
    cases: chatCaseNames.map((name) => ({name, actorId, wsId, personalWsId,
      input: name === 'personal' ? {initialAiSettings: {creditWsId: personalWsId}} : {},
      receipt: {id: name}, readback: {id: name}})),
  };
};
const webReport = () => ({ success: true, numTotalTests: 9, numPassedTests: 9,
  numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
  testResults: [{ status: 'passed', assertionResults: webCaseNames.map((title) => ({ title, status: 'passed' })) }],
});
const complete = () => ({ binding: binding(), envelopeSha256: 'e'.repeat(64),
  webResultSha256: 'f'.repeat(64), webTestReportSha256: '2'.repeat(64), dartResultSha256: '1'.repeat(64), webPassed: true,
  dartPassed: true, processesStopped: true, fixtureCleanup: true, databaseCleanup: true, lifecycleCode: 0,
  completed: true, webProcess: {status:0,signal:null,timedOut:false,processGroupStopped:true},
  dartProcess: {status:0,signal:null,timedOut:false,processGroupStopped:true} });

test('default/historical selections are unchanged; chat is standalone 172+25 only', () => {
  assert.equal(selectChatInitialSettings(undefined), false);
  assert.equal(selectChatInitialSettings('false', { HTTP: 'true' }), false);
  assert.equal(selectChatInitialSettings('true'), true);
  for (const value of ['', 'TRUE', true, 1, null]) assert.throws(() => selectChatInitialSettings(value));
  for (const flag of ['JOURNAL', 'PERSONAL_JOURNAL', 'HTTP', 'WEB_SESSION', 'RESTORE',
    'FEEDBACK', 'FEEDBACK_CAUSAL', 'ADDRESS_MIGRATION', 'STRUCTURED_PROVENANCE'])
    assert.throws(() => selectChatInitialSettings('true', { [flag]: 'true' }), /standalone/);
  for (const [flags, count] of [[[false,false,false,false],172], [[true,false,false,false],301],
    [[false,true,false,false],196], [[false,false,true,false],182], [[false,false,false,true],278],
    [[true,false,true,false],311]]) {
    assert.deepEqual(selectSchemaPackets(...flags), selectSchemaPackets(...flags, false));
    assert.equal(selectSchemaPackets(...flags).reduce((n,[,v]) => n+v,0), count);
  }
  assert.deepEqual(selectSchemaPackets(false,false,false,false,true), [...foundationPackets, ['chat-initial-ai-settings.sql',25]]);
  for (let i=0;i<4;i++) {
    const flags=[false,false,false,false]; flags[i]=true;
    assert.throws(() => selectSchemaPackets(...flags,true));
  }
});

test('selected schema receipt cannot qualify with missing bridge evidence', () => {
  const options={sourceSha:'a'.repeat(40), packets:selectSchemaPackets(false,false,false,false,true).map(([file,assertions])=>({file,assertions})), lifecycleCode:0, cleanupSucceeded:true, chatInitialSettings:true};
  assert.equal(schemaReceipt(options).assertions,197);
  assert.equal(schemaReceipt(options).schemaQualified,false);
  assert.equal(schemaReceipt({...options,chatInitialSettingsQualified:true}).schemaQualified,true);
  assert.equal(schemaReceipt({...options,packets:options.packets.slice(0,5),chatInitialSettingsQualified:true}).schemaQualified,false);
});

test('strict chat TAP rejects skipped, duplicated, missing and unexpected plans', () => {
  const tap=['BEGIN','1..25',...Array.from({length:25},(_,i)=>`ok ${i+1} - synthetic`),'ROLLBACK',''].join('\n');
  assert.equal(assertPacketTap(tap,25),25);
  for (const broken of [tap.replace('ok 2 -','ok 1 -'),tap.replace('1..25','1..24'),
    tap.replace('ok 1 - synthetic','ok 1 - synthetic # SKIP unavailable'),
    tap.replace('ok 1 - synthetic','ok 1 - synthetic # TODO later'),tap+'1..25\n',tap+'Bail out!\n'])
    assert.throws(()=>assertPacketTap(broken,25));
});

test('binding rejects wrong source/control/run/migration and missing or reordered hashes', () => {
  assertChatBinding(binding());
  for (const change of [{sourceSha:'0'.repeat(40)},{controlSha:'bad'},{runId:'0'},
    {fixtureHashes:binding().fixtureHashes.slice(1)}, {controlHashes:binding().controlHashes.toReversed()},
    {migration:{path:chatMigration,sha256:'f'.repeat(64)}}]) assert.throws(()=>assertChatBinding({...binding(),...change}));
  for (const key of ['sourceSha', 'controlSha'])
    assert.throws(() => assertChatBinding({ ...binding(), [key]: 'f'.repeat(40) }, binding()));
  assert.throws(() => assertChatBinding({ ...binding(), runId: '124' }, binding()));
});

test('actual process reports, original SQL readback and all phase hashes are mandatory', () => {
  assertSqlEnvelope(sqlEnvelope()); assertVitestReport(webReport());
  for (const change of [{committedReadback:false},{deniedCreatedRows:1},{manageAllowed:true},
    {cases:sqlEnvelope().cases.slice(1)}]) assert.throws(()=>assertSqlEnvelope({...sqlEnvelope(),...change}));
  const altered=sqlEnvelope();altered.cases[0].readback.id='other';assert.throws(()=>assertSqlEnvelope(altered));
  for (const change of [{success:false},{numPassedTests:8},{numPendingTests:1},{numTotalTests:0}]) assert.throws(()=>assertVitestReport({...webReport(),...change}));
  const result={binding:binding(),envelopeSha256:'e'.repeat(64),passed:webCaseNames,providerCalls:0};
  assertPhaseResult(result,binding(),webCaseNames,'e'.repeat(64));
  assert.throws(()=>assertPhaseResult({...result,passed:webCaseNames.slice(1)},binding(),webCaseNames,'e'.repeat(64)));
  assert.throws(()=>assertPhaseResult(result,binding(),webCaseNames,'f'.repeat(64)));
  assert.equal(chatQualificationReceipt(complete()).qualified,true);
  for (const key of ['webPassed','dartPassed','processesStopped','fixtureCleanup','databaseCleanup','completed'])
    assert.equal(chatQualificationReceipt({...complete(),[key]:false}).qualified,false);
  for (const key of ['envelopeSha256','webResultSha256','webTestReportSha256','dartResultSha256'])
    assert.equal(chatQualificationReceipt({...complete(),[key]:null}).qualified,false);
  assert.equal(chatQualificationReceipt({...complete(),lifecycleCode:1}).qualified,false);
  for(const key of ['webProcess','dartProcess']) {
    assert.equal(chatQualificationReceipt({...complete(),[key]:null}).qualified,false);
    assert.equal(chatQualificationReceipt({...complete(),[key]:{...complete()[key],status:1}}).qualified,false);
    assert.equal(chatQualificationReceipt({...complete(),[key]:{...complete()[key],timedOut:true}}).qualified,false);
  }
  assert.equal(chatQualificationReceipt(complete()).messagesQualified,false);
});

async function drive(fault) {
  const root=mkdtempSync(path.join(tmpdir(),'chat-bridge-unit-')); const state={}; const sql=sqlEnvelope(); let sqlCalls=0, children=0;
  const fixturePath=path.join(root,chatFiles[2]);mkdirSync(path.dirname(fixturePath),{recursive:true});writeFileSync(fixturePath,fixture);
  const runSQL=async()=>({status:0,stdout:'BEGIN\nCOMMIT\n'+JSON.stringify(++sqlCalls===1?sql:{fixtureClean:fault!=='cleanup'})+'\n'});
  const runProcess=async(command,args,{env})=>{
    children++;
    const envelope=JSON.parse(readFileSync(env.CHAT_INITIAL_SETTINGS_ENVELOPE,'utf8'));
    const common={binding:envelope.binding,envelopeSha256:sha256(readFileSync(env.CHAT_INITIAL_SETTINGS_ENVELOPE)),providerCalls:0};
    if(command==='bun') {
      writeFileSync(args.at(-1),JSON.stringify(webReport()));
      if(fault!=='missing')writeFileSync(env.CHAT_INITIAL_SETTINGS_WEB_RESULT,JSON.stringify({...common,passed:webCaseNames,
        cases:sql.cases.map(item=>({...item,response:{conversation:item.receipt}}))}));
    } else writeFileSync(env.CHAT_INITIAL_SETTINGS_DART_RESULT,JSON.stringify({...common,passed:dartCaseNames}));
    return {status:0,processGroupStopped:fault!=='group',timedOut:false,signal:null};
  };
  try {
    await runChatInitialSettingsBridge({root,receiptDirectory:root,binding:binding(),runSQL,state,runProcess});
    return {state,sqlCalls,children};
  } catch(error) { return {state,sqlCalls,children,error}; }
  finally {rmSync(root,{recursive:true,force:true});}
}
test('runner requires phase artifacts and drains before same-owner finally cleanup',async()=>{
  const ok=await drive();assert.equal(ok.error,undefined);assert.equal(ok.state.webPassed,true);assert.equal(ok.state.dartPassed,true);assert.equal(ok.sqlCalls,2);
  for(const fault of ['missing','group','cleanup']) {
    const result=await drive(fault);assert.ok(result.error);assert.equal(result.sqlCalls,2);
    if(fault==='group')assert.equal(result.state.processesStopped,false);
    if(fault==='cleanup')assert.equal(result.state.fixtureCleanup,false);
  }
});
test('SQL stdout is bounded, uniquely committed and cleanup is exact-marker guarded',()=>{
  assert.deepEqual(sqlJson({status:0,stdout:'BEGIN\nCOMMIT\n{"ok":true}\n'},true),{ok:true});
  for(const stdout of ['{"ok":true}','COMMIT\n{}\n{}','COMMIT\nNOTICE private\n{}'])assert.throws(()=>sqlJson({status:0,stdout},true));
  assert.throws(()=>fixtureCleanupSql("'; drop schema public;--"));
  assert.match(fixtureCleanupSql('1'.repeat(36)),/and name='chat-bridge-/);
});
test('workflow opt-in is default false and ordinary suite discovery does not select bridge',()=>{
  const root=new URL('../../../',import.meta.url);
  const workflow=readFileSync(new URL('.github/workflows/employee-schema-contract.yaml',root),'utf8');
  assert.match(workflow,/include_chat_initial_settings:\n[\s\S]*?default: false\n        type: boolean/);
  assert.match(workflow,/EMPLOYEE_SCHEMA_INCLUDE_CHAT_INITIAL_SETTINGS: \$\{\{ inputs.include_chat_initial_settings \}\}/);
  assert.match(workflow,/flutter pub get --enforce-lockfile/);
  assert.match(workflow,/chat-\*\.json/);
  assert.match(readFileSync(new URL('apps/web/vitest.config.mts',root),'utf8'),/\*\*\/e2e\/\*\*/);
  assert.ok(!chatFiles.find(file=>file.startsWith('apps/mobile/test/')));
});


test('trigger-created personal UUIDs bind consumers and cleanup without replacing bootstrap', () => {
  for (const id of ['a6277131-0000-4000-8000-000000000002', 'c6277131-0000-4000-8000-000000000099'])
    assertSqlEnvelope(sqlEnvelope(id));
  for (const mutate of [
    (value) => value.fixtureWorkspaces.pop(),
    (value) => { value.fixtureWorkspaces[2].creatorMember = false; },
    (value) => { value.fixtureWorkspaces[2].creatorId = value.fixtureWorkspaces[0].creatorId; },
    (value) => { value.cases[1].personalWsId = value.cases[0].wsId; },
    (value) => { value.cases[1].input.initialAiSettings.creditWsId = value.cases[0].wsId; },
  ]) {const value = sqlEnvelope(); mutate(value); assert.throws(() => assertSqlEnvelope(value));}
  const cleanup = fixtureCleanupSql('1'.repeat(36));
  assert.match(cleanup, /owned=3/);
  assert.match(cleanup, /count\(distinct creator_id\).*where personal/);
  assert.match(cleanup, /ws_id in\(select id from bridge_cleanup_workspaces\)/);
  assert.ok(!cleanup.includes('b6277131-0000-4000-8000-000000000012'));
  const root = new URL('../../../', import.meta.url);
  for (const file of [chatFiles[1], chatFiles[2]]) {
    const sql = readFileSync(new URL(file, root), 'utf8');
    assert.match(sql, /workspace_default_permissions\(ws_id,permission,member_type,enabled\)/);
    assert.match(sql, /on conflict\(ws_id,permission,member_type\)/);
    assert.match(sql, /'admin','MEMBER',false/);
    assert.match(sql, /permission='create_chat' and member_type='MEMBER'/);
    assert.ok(!sql.includes('000000000012'));
    assert.ok(!/disable trigger/i.test(sql));
  }
});
