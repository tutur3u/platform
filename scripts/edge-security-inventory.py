#!/usr/bin/env python3
"""Read source only; emit a mechanical, explicitly non-authoritative edge census."""
import argparse
import collections
import datetime
import json
import pathlib
import re
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('--root', type=pathlib.Path, default=pathlib.Path.cwd())
parser.add_argument('--output', type=pathlib.Path, required=True)
parser.add_argument('--dns-snapshot', type=pathlib.Path, required=True)
args = parser.parse_args()
root = args.root.resolve()
dns_snapshot = json.loads(args.dns_snapshot.read_text())
host_security = {entry['host']: entry for entry in dns_snapshot['hosts']}
files = subprocess.check_output(['rg', '--files', 'apps', 'packages'], cwd=root, text=True).splitlines()
cache = {}

def read(path):
    if path not in cache:
        try:
            cache[path] = (root / path).read_text()
        except OSError:
            cache[path] = ''
    return cache[path]

def file_candidate(path):
    for candidate in [path, pathlib.Path(str(path)+'.ts'), pathlib.Path(str(path)+'.tsx'), path/'index.ts']:
        if candidate.is_file():
            try:
                return str(candidate.resolve().relative_to(root))
            except ValueError:
                return None
    return None

def export_value(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return export_value(value.get('import') or value.get('default') or value.get('types'))
    return None

def resolve(spec, path):
    if spec.startswith('@/'):
        return file_candidate(root/pathlib.Path(*pathlib.Path(path).parts[:2])/'src'/spec[2:])
    if spec.startswith('.'):
        return file_candidate((root/path).parent/spec)
    if not spec.startswith('@tuturuuu/'):
        return None
    bits = spec.removeprefix('@tuturuuu/').split('/', 1)
    package_root = 'packages/'+bits[0]
    subpath = './'+bits[1] if len(bits)>1 else '.'
    try:
        exports = json.loads(read(package_root+'/package.json')).get('exports', {})
        entry = export_value(exports.get(subpath))
        if not entry:
            for pattern, value in exports.items():
                if '*' not in pattern:
                    continue
                before, after = pattern.split('*', 1)
                if subpath.startswith(before) and subpath.endswith(after):
                    part = subpath[len(before):len(subpath)-len(after) if after else None]
                    template = export_value(value)
                    if template:
                        entry = template.replace('*', part)
                        break
        return file_candidate(root/package_root/entry) if entry else None
    except (ValueError, TypeError):
        return None

patterns = [
    ('cron bearer secret', r'CRON_SECRET|cronSecret'),
    ('webhook signature verifier signal', r'verify\w*Signature|verifySnsEnvelope|validateEvent\(|WebhookVerificationError|Webhooks\('),
    ('webhook shared secret', r'x-webhook-secret|isValidSepayWebhookAuthorization'),
    ('app session helper', r'getSatelliteAppSessionUser\(|verifyAppSessionRequest\(|getAppSessionUser\('),
    ('session wrapper', r'withSessionAuth(?:<[^;]+?>)?\s*\(|authorizeRequest\(|resolveSessionAuthContext\('),
    ('API-key verifier signal', r'validateApiKey|withApi(?:Key)?Auth\(|verifyApiKey\(|authenticateApiKey\('),
    ('auth-session user lookup', r'getCurrentUser\(|getCurrentWorkspaceUser\(|resolveAuthenticatedSessionUser\(|\.auth\.getUser\('),
    ('authorization helper (semantics require manual trace)', r'\b(?:authorize\w*|require\w*(?:Auth|Session|User|Actor|Access|Admin)|authenticate\w*|verify\w*(?:Token|Secret|Request)|resolve\w*(?:AuthContext|RouteUser|SessionUser|AccessContext))\('),
    ('auth bootstrap/token exchange', r'createPOST\(|createRefreshPOST\(|handle\w*(?:Login|Otp|AppToken|RefreshSession)\('),
]

def auth_signals(path):
    text = read(path)
    result = []
    for label, pattern in patterns:
        match = re.search(pattern, text)
        if match:
            result.append({'kind': label, 'evidence': path+':'+str(text[:match.start()].count('\n')+1)})
    return result

hosts = {}
registry = 'packages/utils/src/launchable-apps.ts'
for match in re.finditer(r"appRoot: 'apps/([^']+)'[\s\S]*?productionUrl: '(https://[^']+)'", read(registry)):
    hosts[match.group(1)] = {'host': match.group(2).split('//',1)[1], 'source': registry+':'+str(read(registry)[:match.start()].count('\n')+1)}
domain_registry = 'packages/utils/src/internal-domains.ts'
domain_source = read(domain_registry).split('export const PORTLESS_INTERNAL_APP_DOMAINS',1)[0]
registered_hosts = collections.defaultdict(list)
for match in re.finditer(r"name: '([^']+)'\s*,\s*url: 'https://([^']+)'",domain_source):
    name = {'platform':'web','infra':'infrastructure'}.get(match.group(1),match.group(1))
    registered_hosts[name].append({'host':match.group(2),'source':domain_registry+':'+str(domain_source[:match.start()].count('\n')+1)})
for name, values in registered_hosts.items():
    hosts[name] = values[0]
entries = []
for path in sorted(files):
    if not re.search(r'^apps/[^/]+/(?:src/app/api|src/legacy-api-routes)/.*route\.(?:ts|tsx)$', path):
        continue
    if '/tanstack-web/' in path:
        continue
    text = read(path)
    is_entry = '/src/app/api/' in path
    implementation = path
    imports = []
    for spec in re.findall(r'''(?:from\s*|import\s*)['"]([^'"]+)['"]''', text):
        target = resolve(spec, path)
        if target:
            imports.append(target)
    forwards = [p for p in imports if 'legacy-api-routes/' in p or '/routes/' in p or p.endswith('/route.ts')]
    if forwards and (len(text.splitlines())<45 or '@generated' in text):
        implementation = forwards[-1]
    signals = auth_signals(implementation)
    if not signals and implementation != path:
        signals = auth_signals(path)
    if signals:
        auth = '; '.join(x['kind'] for x in signals)
    elif '/build-info/' in path or '/health/' in path:
        auth = 'metadata route convention; direct auth unresolved unless manually traced'
    elif '/auth/' in path:
        auth = 'bootstrap/callback: handler-specific validation unresolved'
    elif '/public/' in path:
        auth = 'public by route convention; route-specific tokens/rate limits unresolved'
    else:
        auth = 'unknown: no recognized direct auth signal; transitive/manual review required'
    rel = path.split('/src/app/api/',1)[-1] if is_entry else path.split('/src/legacy-api-routes/',1)[-1]
    route = '/api/'+re.sub(r'/route\.(?:ts|tsx)$','',rel)
    app = path.split('/')[1]
    host = hosts.get(app, {'host': app+'.tuturuuu.com','source':'inferred naming convention; verify before deployment'})
    caller = 'browser/internal-api; exact caller unresolved'
    if '/cron/' in route: caller = 'scheduled/internal cron; monitoring CRUD may be browser/CLI'
    if re.search(r'/webhooks?/',route): caller = 'provider/internal webhook; manual traces in companion report'
    if '/build-info' in route or '/health' in route: caller = 'CI/release probes, monitors, browser'
    if '/auth/' in route: caller = 'browser/native/CLI bootstrap or token exchange as applicable'
    methods = re.findall(r'export\s+(?:async\s+)?(?:const|function)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b',text)
    for group in re.findall(r'export\s*\{([^}]+)\}',text,re.S):
        methods.extend(re.findall(r'\b(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b', group))
    entries.append({'app':app,'hostCandidate':host['host'],'hostEvidence':host['source'],'registeredAliases':[item['host'] for item in registered_hosts.get(app,[])][1:],'hostVerification':'source candidate joined to read-only DNS snapshot; custom domains require their own zone read', 'edge': host_security.get(host['host'], {'proxied': 'unknown', 'zoneSecurity': 'unknown; outside tuturuuu.com snapshot or absent DNS name'}),'path':route,'methods':sorted(set(methods)),'source':path+':1','implementation':implementation+':1','sourceKind':'app-entry' if is_entry else 'legacy-implementation','auth':auth,'authEvidence':signals,'caller':caller,'edgeRequirement':'challenge-free machine transport; preserve origin authentication and rate limits','coverage':'mechanical census; auth signals are not proof of authorization'})

clients = []
for path in sorted(files):
    if not path.startswith(('packages/sdk/src/','packages/internal-api/src/','apps/mobile/lib/')) or re.search(r'\.(?:test|spec)\.',path) or not re.search(r'\.(?:ts|tsx|dart)$',path):
        continue
    for number,line in enumerate(read(path).splitlines(),1):
        for match in re.finditer(r'''['"`](/api/[^'"`\s]+)''',line):
            value = match.group(1)
            if len(value)>250: continue
            client = 'mobile' if path.startswith('apps/mobile') else 'SDK/CLI' if path.startswith('packages/sdk') else 'internal-api'
            auth = 'Supabase/app Bearer via ApiClient' if client=='mobile' else 'API key or CLI session via SDK transport' if client=='SDK/CLI' else 'caller-forwarded cookie/Bearer or explicit credentials via internal-api transport'
            clients.append({'client':client,'pathLiteral':value,'source':path+':'+str(number),'auth':auth,'coverage':'literal census; interpolated/split helper paths may be absent'})
counts = collections.Counter(x['app'] for x in entries if x['sourceKind']=='app-entry')
data = {'sourceRevision': subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'generatedAt':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).isoformat(),'scope':'Active app entries and retained Web legacy implementations. Entry and legacy records are not additive endpoint counts. Worker/native paths are curated separately.','appEntryCount':sum(counts.values()),'legacyImplementationCount':len(entries)-sum(counts.values()),'apps':dict(sorted(counts.items())),'explicitUnknownAuthCount':sum(x['sourceKind']=='app-entry' and x['auth'].startswith('unknown') for x in entries),'routes':entries,'clientPathLiterals':clients,'paused':[{'app':'backend','status':'paused; no execution/source refresh'},{'app':'tanstack-web','status':'paused; no execution/source refresh'}]}
args.output.parent.mkdir(parents=True,exist_ok=True)
metadata = {key:value for key,value in data.items() if key not in ('routes', 'clientPathLiterals')}
with args.output.open('w') as output:
    for kind, records in [('metadata', [metadata]), ('route', entries), ('client-path', clients)]:
        for record in records:
            output.write(json.dumps({'kind':kind, **record}, ensure_ascii=False, separators=(',', ':'))+'\n')
print(json.dumps({key:data[key] for key in ('sourceRevision','appEntryCount','legacyImplementationCount','apps','explicitUnknownAuthCount')},indent=2))
print('Client path literal records:',len(clients))
