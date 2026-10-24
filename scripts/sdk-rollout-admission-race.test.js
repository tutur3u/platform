const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('two reclaimers cannot displace the removal fence or delete replacement admission', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-reclaim-race-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const admission = path.join(home, 'admission');
  fs.mkdirSync(admission);
  fs.writeFileSync(
    path.join(admission, 'owner.json'),
    JSON.stringify({
      scheduler: 2,
      pid: 2147483647,
      token: 'dead-preparation',
      tool: 'rollout',
      cwd: home,
      queuedAt: new Date().toISOString(),
    })
  );
  const source = path.resolve(
    __dirname,
    '../packages/sdk/src/cli/resources-slots.ts'
  );
  const script = `
const assert=require('node:assert/strict'), fs=require('node:fs'), p=require('node:fs/promises');
const admission=${JSON.stringify(admission)}, home=${JSON.stringify(home)};
const rm=p.rm, open=p.open;
let allowRemoval, removalPaused, observeSecond, releaseA, enteredA, releaseSecond;
const removalBarrier=new Promise(r=>removalPaused=r), resumeRemoval=new Promise(r=>allowRemoval=r), secondAttempt=new Promise(r=>observeSecond=r);
const secondReturn=new Promise(r=>releaseSecond=r);
const aReady=new Promise(r=>enteredA=r), finishA=new Promise(r=>releaseA=r);
let removals=0, opens=0;
p.rm=async(target,options)=>{if(target===admission&&options?.recursive){removals++;if(removals===1){removalPaused();await resumeRemoval;}}return rm(target,options);};
p.open=async(target,flags,...rest)=>{const ordinal=target===admission+'/reclaim'&&flags==='wx'?++opens:0;try{const result=await open(target,flags,...rest);if(ordinal===2)observeSecond('acquired');return result;}catch(e){if(ordinal===2){observeSecond(e.code);await secondReturn;}throw e;}};
const {withAdmission}=require(${JSON.stringify(source)});
(async()=>{
 const a=withAdmission(home,async()=>{enteredA();await finishA;return 'A';});
 await removalBarrier;
 let bEntered=false;const b=withAdmission(home,async()=>{bEntered=true;return 'B';});
 // Pause A after its inode/token validation, before deletion. B must be unable
 // to replace A's exclusive removal fence, even though both saw a dead owner.
 assert.equal(await secondAttempt,'EEXIST');
 assert.equal(removals,1);
 allowRemoval();await aReady;releaseSecond();
 const replacement=JSON.parse(fs.readFileSync(admission+'/owner.json'));
 assert.notEqual(replacement.token,'dead-preparation');assert.equal(bEntered,false);
 await new Promise(r=>setTimeout(r,40));
 assert.equal(JSON.parse(fs.readFileSync(admission+'/owner.json')).token,replacement.token);
 assert.equal(bEntered,false);
 releaseA();assert.equal(await a,'A');assert.equal(await b,'B');
 console.log('exclusive reclaim preserved replacement');
})().catch(e=>{console.error(e);process.exit(1);});`;
  const result = spawnSync('bun', ['-e', script], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'exclusive reclaim preserved replacement');
});
