from pathlib import Path
import re,json
out=Path('/tmp/landing-wrangler-fix')
def read(label):
 text=(out/f'root-{label}.log').read_text()
 failures={}
 for m in re.finditer(r'^not ok \d+ - ([^\n]+)\n(.*?)(?=^# Subtest:|^ok \d+|^not ok \d+|^1\.\.|\Z)',text,re.M|re.S):
  block=re.sub(r'^\s*duration_ms:.*\n','',m[2].split('\n  ...',1)[0],flags=re.M)
  block=re.sub(r'/var/folders/[^\s]+/T/mobile-profile-test-[^/\s]+','<mobile-profile-temp>',block)
  failures[m[1]]=block.strip()
 counts={key:int(value) for key,value in re.findall(r'^# (tests|suites|pass|fail|cancelled|skipped|todo) (\d+)$',text,re.M)}
 return {'exit':int((out/f'root-{label}.exit').read_text()),'files':int(re.search(r'Discovered (\d+)',text)[1]),'counts':counts,'failures':failures}
base=read('base');head=read('head')
result={'base':base,'head':head,'newFailures':sorted(set(head['failures'])-set(base['failures'])),'removedFailures':sorted(set(base['failures'])-set(head['failures'])),'sameSignature':{n:base['failures'][n]==v for n,v in head['failures'].items() if n in base['failures']}}
(out/'root-comparison.json').write_text(json.dumps(result,indent=2)+'\n')
for label,j in [('base',base),('head',head)]:print(label,'exit',j['exit'],'files',j['files'],'counts',j['counts'],'failures',list(j['failures']))
print('newFailures',result['newFailures'],'sameSignature',result['sameSignature'])
