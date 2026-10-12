import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

it('persists and reopens source fixtures using the selected Bun runtime', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ttr-peer-bun-')));
  try {
    const scope = {
      principalId: randomUUID(),
      workspaceId: randomUUID(),
      projectId: randomUUID(),
      programId: 'synthetic-program',
    };
    const binding = {
      scope,
      identity: {
        machineId: randomUUID(),
        agentId: randomUUID(),
        sourceStoreId: randomUUID(),
        replicaId: randomUUID(),
      },
      grantId: randomUUID(),
      grantRevision: 1,
    };
    const fixture = {
      binding,
      serverStoreId: randomUUID(),
      operationId: randomUUID(),
      outcomeId: randomUUID(),
    };
    const script = join(dir, 'probe.ts');
    writeFileSync(
      script,
      `
import {SourceCoordinator,SourceReplica} from ${JSON.stringify(resolve(import.meta.dirname, 'replica.ts'))};
const f=${JSON.stringify(fixture)};
const authority={...f.binding,decision:'allowed',expiresAt:10000,capabilities:['outcomes:read','planning:write','ownership:claim']};
const server=${JSON.stringify(join(dir, 'server.sqlite'))};
const replica=${JSON.stringify(join(dir, 'replica.sqlite'))};
SourceCoordinator.initialize(server,f.binding.scope,f.serverStoreId);
SourceReplica.initialize(replica,f.binding,f.serverStoreId);
const c=new SourceCoordinator(server); const r=new SourceReplica(replica);
c.propose(r.propose(f.outcomeId,{kind:'create',title:'Synthetic'},f.operationId),()=>authority,()=>1000);
r.applyPage(c.pull(f.binding,0,()=>authority,1000),()=>authority,1000); r.close();c.close();
const reopened=new SourceReplica(replica);
process.stdout.write(JSON.stringify({cursor:reopened.snapshot().events.length,title:reopened.snapshot().outcomes[0].title,liveAuthenticationPerformed:false}));
reopened.close();
`,
      { mode: 0o600 }
    );
    const output = execFileSync(process.env.TTR_SYNC_BUN ?? 'bun', [script], {
      encoding: 'utf8',
    });
    expect(JSON.parse(output)).toEqual({
      cursor: 1,
      title: 'Synthetic',
      liveAuthenticationPerformed: false,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
