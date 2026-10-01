import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export function renderBuildTestNotes(history, identity) {
  if (
    !identity ||
    !/^\d+\.\d+\.\d+$/.test(identity.version ?? '') ||
    !/^[a-f0-9]{40}$/.test(identity.sourceSha ?? '') ||
    !/^[1-9]\d*$/.test(String(identity.number ?? ''))
  )
    throw new Error('Invalid beta build provenance');
  if (
    history?.build &&
    (history.build.version !== identity.version ||
      String(history.build.number) !== String(identity.number) ||
      history.build.sourceSha !== identity.sourceSha)
  )
    throw new Error('Beta history does not match the uploaded build');
  const entries = history?.releases?.filter(
    (item) => item.version === identity.version
  );
  if (entries?.length !== 1)
    throw new Error('Exact beta version history is unavailable');
  const changes = entries[0].changes;
  if (
    !Array.isArray(changes) ||
    !changes.length ||
    changes.some((item) => typeof item !== 'string' || !item.trim())
  ) {
    throw new Error('Exact beta version has no test notes');
  }
  let notes = `Please test ${identity.version}:`;
  for (const change of changes) {
    const bullet = `\n- ${change.trim()}`;
    if (notes.length + bullet.length > 4000) break;
    notes += bullet;
  }
  if (!notes.includes('\n- '))
    throw new Error('Beta change exceeds the test notes limit');
  return notes;
}

export async function ensureBuildWhatsNew(apple, buildId, notes) {
  const path = `/v1/builds/${buildId}/betaBuildLocalizations?limit=200`;
  const resources = await apple(path);
  if (resources.links?.next)
    throw new Error('Ambiguous beta localization pagination');
  const english =
    resources.data?.filter((item) => item.attributes?.locale === 'en-US') ?? [];
  if (english.length > 1)
    throw new Error('Multiple English beta localizations');
  if (
    typeof english[0]?.attributes?.whatsNew === 'string' &&
    english[0].attributes.whatsNew.trim()
  ) {
    return 'preserved';
  }
  notes = typeof notes === 'function' ? await notes() : notes;
  if (typeof notes !== 'string' || !notes.trim() || notes.length > 4000) {
    throw new Error('Version-specific beta test notes are unavailable');
  }
  const existing = english[0];
  if (existing && !existing.id)
    throw new Error('Beta localization identity is missing');
  await apple(
    existing
      ? `/v1/betaBuildLocalizations/${existing.id}`
      : '/v1/betaBuildLocalizations',
    {
      method: existing ? 'PATCH' : 'POST',
      body: JSON.stringify({
        data: {
          type: 'betaBuildLocalizations',
          ...(existing ? { id: existing.id } : {}),
          attributes: existing
            ? { whatsNew: notes }
            : { locale: 'en-US', whatsNew: notes },
          ...(!existing
            ? {
                relationships: {
                  build: { data: { type: 'builds', id: buildId } },
                },
              }
            : {}),
        },
      }),
    }
  );
  const confirmed = await apple(path);
  const saved =
    confirmed.data?.filter((item) => item.attributes?.locale === 'en-US') ?? [];
  if (saved.length !== 1 || saved[0].attributes?.whatsNew !== notes) {
    throw new Error('Beta test notes readback failed');
  }
  return existing ? 'filled' : 'created';
}

// Read only the original upload's nonsecret history artifact, never today's checkout.
export async function originalBuildHistory(
  number,
  version,
  { run = execFileSync } = {}
) {
  const buildNumber = Number(number);
  const runNumber = Math.floor((buildNumber - 100000) / 1000);
  const attempt = buildNumber - 100000 - runNumber * 1000;
  if (
    !Number.isSafeInteger(buildNumber) ||
    runNumber < 1 ||
    attempt < 1 ||
    attempt >= 1000
  ) {
    throw new Error('Beta build does not identify an upload run');
  }
  const api = (path) =>
    JSON.parse(
      run(
        'gh',
        [
          'api',
          `repos/tutur3u/platform/${path}`,
          '--jq',
          path.includes('/workflows/')
            ? '{workflow_runs:[.workflow_runs[]|{id,run_number,run_attempt,head_branch,head_sha}]}'
            : '{artifacts:[.artifacts[]|{id,name,expired,size_in_bytes}]}',
        ],
        {
          encoding: 'utf8',
          timeout: 30_000,
          maxBuffer: 1024 * 1024,
        }
      )
    );
  let upload;
  for (let page = 1; page <= 5; page++) {
    const result = api(
      `actions/workflows/mobile-deploy-stores.yaml/runs?event=push&per_page=100&page=${page}`
    );
    upload = result.workflow_runs?.find(
      (item) =>
        item.run_number === runNumber &&
        item.run_attempt === attempt &&
        item.head_branch === 'production'
    );
    if (upload || (result.workflow_runs?.length ?? 0) < 100) break;
  }
  if (!upload || !/^[a-f0-9]{40}$/.test(upload.head_sha ?? ''))
    throw new Error('Original beta upload source is unavailable');
  const artifacts = api(`actions/runs/${upload.id}/artifacts?per_page=100`);
  const matches =
    artifacts.artifacts?.filter(
      (item) => item.name === 'mobile-beta-release-history' && !item.expired
    ) ?? [];
  if (matches.length !== 1 || matches[0].size_in_bytes > 1024 * 1024)
    throw new Error('Original beta history artifact is unavailable');
  const directory = await mkdtemp(join(tmpdir(), 'beta-test-notes-'));
  try {
    const archive = join(directory, 'history.zip');
    await writeFile(
      archive,
      run(
        'gh',
        [
          'api',
          `repos/tutur3u/platform/actions/artifacts/${matches[0].id}/zip`,
        ],
        { timeout: 30_000, maxBuffer: 1024 * 1024 }
      )
    );
    const history = JSON.parse(
      run('unzip', ['-p', archive, 'release_history.json'], {
        encoding: 'utf8',
        timeout: 30_000,
        maxBuffer: 1024 * 1024,
      })
    );
    const identity = {
      version,
      number: String(number),
      sourceSha: upload.head_sha,
    };
    return renderBuildTestNotes(history, identity);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function uploadedBuildTestNotes(version, number, sourceSha) {
  const history = JSON.parse(
    await readFile(
      new URL('../../apps/mobile/assets/release_history.json', import.meta.url),
      'utf8'
    )
  );
  if (!history.build)
    throw new Error('Uploaded beta history provenance is missing');
  return renderBuildTestNotes(history, {
    version,
    number: String(number),
    sourceSha,
  });
}
