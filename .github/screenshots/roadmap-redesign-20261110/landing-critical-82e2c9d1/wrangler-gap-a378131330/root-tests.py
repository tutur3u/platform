from pathlib import Path
import os,subprocess,sys
r=Path.cwd();out=Path('/tmp/landing-wrangler-fix');label=sys.argv[1]
env=os.environ.copy();env['NODE_PATH']=str(r/'apps/web/node_modules')
for k in ['GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN']:env.pop(k,None)
script="""const { discoverScriptTests } = require('./scripts/run-script-tests.js');
const { spawnSync } = require('node:child_process');
const files = discoverScriptTests();
console.log(`Discovered ${files.length} script test files.`);
const result = spawnSync(process.execPath, ['--experimental-strip-types', '--test', '--test-concurrency=2', '--test-reporter=tap', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;"""
with (out/f'root-{label}.log').open('w') as f:result=subprocess.run(['node'],input=script,text=True,env=env,stdout=f,stderr=subprocess.STDOUT)
(out/f'root-{label}.exit').write_text(str(result.returncode));print(label,'exit',result.returncode,flush=True)
