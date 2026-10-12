import { type Board, boardSchema, fail, type Item } from './operational-schema';

export function checkEvidence(input: unknown) {
  const board = boardSchema.parse(input);
  const ids = new Set<string>();
  const writers = new Set<string>();
  const units = board.units.map((unit) => {
    if (ids.has(unit.id)) fail('INVALID_EVIDENCE', 'duplicate unit id');
    ids.add(unit.id);
    if (unit.state === 'active') {
      if (writers.has(unit.worktree))
        fail('INVALID_EVIDENCE', 'multiple active writers in one worktree');
      writers.add(unit.worktree);
    }
    const current = new Map<string, string>();
    let staleReceipts = 0;
    for (const receipt of unit.evidence) {
      if (!unit.requiredEvidence.includes(receipt.kind))
        fail('INVALID_EVIDENCE', 'unknown evidence kind');
      if (receipt.head !== unit.head) {
        staleReceipts++;
        continue;
      }
      if (current.has(receipt.kind))
        fail('INVALID_EVIDENCE', 'duplicate current-head gate');
      current.set(receipt.kind, receipt.result);
    }
    const missing = unit.requiredEvidence.filter(
      (kind) => current.get(kind) !== 'pass'
    );
    if (unit.state === 'delivered' && missing.length)
      fail('INVALID_EVIDENCE', 'delivered claim lacks current-head PASS');
    return { id: unit.id, state: unit.state, missing, staleReceipts };
  });
  return {
    recordedEvidenceComplete: units.every(
      (u) => !u.missing.length && ['merged', 'delivered'].includes(u.state)
    ),
    units,
    liveVerificationPerformed: false,
  };
}

export function verificationFor(item: Item, board: Board): Board {
  const matches = board.units.filter((u) => u.id === item.id);
  const unit = matches[0];
  if (
    matches.length !== 1 ||
    !unit ||
    unit.requiredEvidence.length !== item.requiredEvidence.length ||
    unit.requiredEvidence.some((kind) => !item.requiredEvidence.includes(kind))
  ) {
    fail(
      'INVALID_EVIDENCE',
      'evidence requirements must match this request exactly'
    );
  }
  const proof = { version: board.version, units: matches };
  if (!checkEvidence(proof).recordedEvidenceComplete)
    fail('INVALID_EVIDENCE', 'current-head evidence is incomplete');
  return proof;
}
