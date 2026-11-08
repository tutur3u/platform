import raw from './snapshot.json' with { type: 'json' };
import {
  deriveStage,
  immutableUrl,
  keys,
  object,
  parseEvidence,
  publicProducts,
  productUrl as expectedProductUrl,
  sha,
  stages,
  text,
  timestamp,
  type MigrationStage,
} from './migration-evidence.ts';
export { stages, isSnapshotStale } from './migration-evidence.ts';
export type RoadmapFilter = MigrationStage | 'all';
export const filters: RoadmapFilter[] = ['all', ...stages];
export function parseSnapshot(input: unknown) {
  const value = object(input);
  keys(value, ['sourceCommit', 'checkedAt', 'evidenceInputSha256', 'apps']);
  const sourceCommit = sha(value.sourceCommit),
    checkedAt = timestamp(value.checkedAt);
  const evidenceInputSha256 = text(value.evidenceInputSha256);
  if (!/^[a-f0-9]{64}$/.test(evidenceInputSha256))
    throw new Error('Invalid evidence input identity');
  if (!Array.isArray(value.apps) || value.apps.length !== publicProducts.length)
    throw new Error('Invalid public product set');
  const apps = value.apps.map((item: unknown) => {
    const app = object(item);
    keys(app, [
      'id',
      'name',
      'productUrl',
      'stage',
      'blocked',
      'workInSource',
      'stageEvidence',
      'mergeIncluded',
      'evidence',
      'checkedAt',
    ]);
    const id = publicProducts.find((id) => id === app.id);
    if (!id) throw new Error('Unknown public product');
    const name =
      id === 'ai'
        ? 'AI'
        : id === 'contacts'
          ? 'CRM'
          : id[0].toUpperCase() + id.slice(1);
    if (app.name !== name) throw new Error('Invalid public name');
    if (
      typeof app.blocked !== 'boolean' ||
      typeof app.workInSource !== 'boolean' ||
      typeof app.mergeIncluded !== 'boolean'
    )
      throw new Error('Invalid public flags');
    const productUrl = expectedProductUrl(id, sourceCommit);
    if (app.productUrl !== productUrl || app.checkedAt !== checkedAt)
      throw new Error('Invalid product URL or observation');
    const stageEvidence = parseEvidence(app.stageEvidence, id);
    if (stageEvidence.source && stageEvidence.source.commit !== sourceCommit)
      throw new Error('Evidence source cohort mismatch');
    if (app.mergeIncluded !== Boolean(stageEvidence.pr?.merge))
      throw new Error('Invalid merge inclusion');
    const stage = deriveStage(
      app.workInSource,
      stageEvidence,
      checkedAt,
      app.mergeIncluded
    );
    if (stage !== app.stage) throw new Error('Stage lacks supporting evidence');
    if (
      !Array.isArray(app.evidence) ||
      !app.evidence.length ||
      app.evidence.length > 8
    )
      throw new Error('Missing or excessive public evidence');
    const evidence = app.evidence.map((item: unknown) => {
      const entry = object(item);
      keys(entry, ['label', 'url']);
      const label = text(entry.label),
        url = text(entry.url);
      if (label === 'Migration PR' && url === stageEvidence.pr?.url)
        return { label, url };
      if (
        label === 'Production readback' &&
        url === stageEvidence.production?.url
      )
        return { label, url };
      if (
        label === 'Production receipt' &&
        url === stageEvidence.production?.receiptUrl
      )
        return { label, url };
      if (
        ![
          'Public product',
          'Source configuration',
          'Public publication policy',
          'Migration target',
        ].includes(label)
      )
        throw new Error('Unknown evidence label');
      immutableUrl(url);
      if (
        !url.startsWith(
          `https://github.com/tutur3u/platform/blob/${sourceCommit}/`
        )
      )
        throw new Error('Evidence source mismatch');
      return { label, url };
    });
    return {
      id,
      name,
      productUrl,
      stage,
      blocked: app.blocked,
      workInSource: app.workInSource,
      stageEvidence,
      mergeIncluded: app.mergeIncluded,
      evidence,
      checkedAt,
    };
  });
  if (new Set(apps.map((app) => app.id)).size !== publicProducts.length)
    throw new Error('Duplicate public product');
  return { sourceCommit, checkedAt, evidenceInputSha256, apps };
}
export const snapshot = parseSnapshot(raw);
export type RoadmapApp = (typeof snapshot.apps)[number];
export function filterProducts(
  products: readonly RoadmapApp[],
  query: string,
  stage: RoadmapFilter,
  blockedOnly = false
) {
  const normalized = query.trim().toLocaleLowerCase('en');
  return products.filter(
    (app) =>
      (stage === 'all' || app.stage === stage) &&
      (!blockedOnly || app.blocked) &&
      (!normalized || app.name.toLocaleLowerCase('en').includes(normalized))
  );
}
export function stageCounts(products: readonly RoadmapApp[]) {
  return stages.map((stage) => ({
    stage,
    count: products.filter((app) => app.stage === stage).length,
  }));
}

export function rowSummaryKey(app: RoadmapApp) {
  if (
    app.id === 'roadmap' &&
    app.stage === 'waiting_for_production_sync' &&
    app.mergeIncluded &&
    app.stageEvidence.pr?.state === 'merged' &&
    app.stageEvidence.production === null
  )
    return 'pendingPublicProductionReceipt';
  return app.stage;
}
