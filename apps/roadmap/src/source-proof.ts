import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { MigrationEvidence, ProductId } from './migration-evidence.ts';

export function verifyPublicSource({
  id,
  evidence,
  sourceCommit,
  readSubtree,
  isAncestor,
  readReceipt,
}: {
  id: ProductId;
  evidence: MigrationEvidence;
  sourceCommit: string;
  readSubtree: (commit: string, app: ProductId) => string;
  isAncestor: (commit: string, source: string) => boolean;
  readReceipt: (url: string) => Uint8Array;
}) {
  const { source, pr, production } = evidence;
  if (
    source &&
    (source.commit !== sourceCommit ||
      readSubtree(sourceCommit, id) !== source.appSubtree)
  )
    throw new Error('Pinned app source identity mismatch');
  if (pr?.merge && (!source || !isAncestor(pr.merge.sha, sourceCommit)))
    throw new Error('Missing merge ancestry');
  if (!production) return;
  if (!source || !pr?.merge) throw new Error('Missing production source proof');
  if (
    [pr.merge.sha, production.deployedSha].some(
      (commit) => readSubtree(commit, id) !== source.appSubtree
    )
  )
    throw new Error('App-subtree equivalence mismatch');
  const bytes = readReceipt(production.receiptUrl);
  if (
    bytes.byteLength > 128 * 1024 ||
    createHash('sha256').update(bytes).digest('hex') !==
      production.receiptSha256
  )
    throw new Error('Production receipt identity mismatch');
  const {
    receiptUrl: _url,
    receiptSha256: _digest,
    ...attestation
  } = production;
  if (
    !isDeepStrictEqual(
      JSON.parse(Buffer.from(bytes).toString('utf8')),
      attestation
    )
  )
    throw new Error('Production receipt content mismatch');
}
