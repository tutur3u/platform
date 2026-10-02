// Runs INSIDE the unprivileged container. Never resolves customer paths on the host.
export const PLAYGROUND_SYNC_SCRIPT = `
import json, os, stat, sys
root='/project'
payload=json.load(sys.stdin)
files=payload['files']
# The platform validates paths too; recheck after arbitrary user commands.
def safe_path(path):
    pieces=path.split('/')
    if any(p in ('', '.', '..') for p in pieces): raise ValueError('Invalid path')
    cursor=root
    for piece in pieces:
        cursor=os.path.join(cursor,piece)
        if os.path.islink(cursor): raise ValueError('Symlink forbidden')
    return cursor
previous=[]
try:
    with open('/tmp/.ttr-files.json') as handle: previous=json.load(handle)
except FileNotFoundError: pass
paths=[f['path'] for f in files]
for old in previous:
    path=safe_path(old)
    if old not in paths and os.path.isfile(path): os.unlink(path)
for entry in files:
    path=safe_path(entry['path'])
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w') as handle: handle.write(entry['content'])
with open('/tmp/.ttr-files.json','w') as handle: json.dump(paths,handle)
`;
export const PLAYGROUND_EXPORT_SCRIPT = `
import json, os, stat, sys
files=[]; total=0
excluded={'node_modules','.git','__pycache__','target','.venv'}
for directory, folders, names in os.walk('/project',followlinks=False):
    folders[:]=[f for f in folders if f not in excluded and not os.path.islink(os.path.join(directory,f))]
    for name in sorted(names):
        path=os.path.join(directory,name)
        info=os.lstat(path)
        if not stat.S_ISREG(info.st_mode): continue
        if info.st_size>262144: raise ValueError('File exceeds Drive save limit')
        fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        with os.fdopen(fd,'rb') as handle: data=handle.read(262145)
        if len(data)>262144: raise ValueError('File grew beyond limit')
        try: content=data.decode('utf-8')
        except UnicodeDecodeError: continue
        if chr(0) in content: continue
        total+=len(data)
        if total>2097152 or len(files)>=128: raise ValueError('Project exceeds Drive save limit')
        files.append({'path':os.path.relpath(path,'/project'),'content':content})
print(json.dumps(files,ensure_ascii=False))
`;

// Bound response bytes and never follow redirects outside this container's loopback app.
export const PLAYGROUND_PREVIEW_SCRIPT = `
import base64, json, sys, urllib.request, urllib.error
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
try: response=opener.open(sys.argv[1],timeout=5)
except urllib.error.HTTPError as error: response=error
with response:
    body=response.read(524289)
    if len(body)>524288: raise ValueError('Preview exceeds limit')
    print(json.dumps({'status':response.status,'contentType':response.headers.get('Content-Type','application/octet-stream'),'body':base64.b64encode(body).decode('ascii')}))
`;
