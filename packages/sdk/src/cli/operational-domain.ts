import { z } from 'zod';
import { verificationFor } from './operational-evidence';
import {
  canonical,
  fail,
  type Item,
  intakeItemSchema,
  itemSchema,
  type Update,
} from './operational-schema';

export function validateGraph(items: Map<string, Item>) {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function visit(id: string) {
    if (visiting.has(id)) fail('INVALID_DEPENDENCY', 'dependency cycle');
    if (visited.has(id)) return;
    const item = items.get(id);
    if (!item) fail('INVALID_DEPENDENCY', `unknown dependency ${id}`);
    visiting.add(id);
    for (const dependency of item.dependencies ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of items.keys()) visit(id);
}

export function validateProjection(items: Map<string, Item>) {
  validateGraph(items);
  for (const item of items.values()) {
    if (item.status === 'active' && !item.owner.trim())
      fail('INVALID_STATE', 'active request needs an owner');
    if (
      ['ready', 'active', 'verified'].includes(item.status) &&
      (item.dependencies ?? []).some(
        (id) => items.get(id)?.status !== 'verified'
      )
    ) {
      // Legacy reopening leaves ready/active dependents alone. Only verified claims are revoked.
      if (item.status === 'verified')
        fail('INVALID_STATE', 'verified request has unverified dependencies');
    }
    if (item.status === 'verified') {
      if (!item.verification)
        fail('INVALID_EVIDENCE', 'verified request lacks evidence');
      verificationFor(item, item.verification);
    } else if (item.verification)
      fail('INVALID_EVIDENCE', 'nonverified request retains a current verdict');
  }
}

export function intakePlan(items: Map<string, Item>, input: unknown) {
  const incoming = z.array(intakeItemSchema).min(1).max(10_000).parse(input);
  const proposed = new Map(items);
  const added: Item[] = [];
  const retained: string[] = [];
  for (const item of incoming) {
    const original = proposed.get(item.id);
    if (original) {
      const fields = [
        'title',
        'source',
        'acceptance',
        'kind',
        'dependencies',
        'requiredEvidence',
        'priority',
      ] as const;
      if (
        fields.some(
          (f) =>
            canonical(original[f] ?? (f === 'priority' ? 2 : [])) !==
            canonical(item[f])
        )
      )
        fail(
          'INTAKE_CONFLICT',
          `conflicting intake ${item.id}; use audited update`
        );
      retained.push(item.id);
    } else {
      const current = itemSchema.parse({
        ...item,
        status: 'captured',
        owner: '',
        links: [],
        note: '',
      });
      proposed.set(item.id, current);
      added.push(current);
    }
  }
  validateGraph(proposed);
  return { added, retained };
}

export function updatePlan(items: Map<string, Item>, change: Update) {
  const previous = items.get(change.id);
  if (!previous) fail('UNKNOWN_ID', 'unknown request id');
  const item = { ...previous };
  if (change.status !== undefined) {
    if (['ready', 'active', 'verified'].includes(change.status)) {
      const pending = (item.dependencies ?? []).filter(
        (id) => items.get(id)?.status !== 'verified'
      );
      if (pending.length)
        fail(
          'DEPENDENCY_PENDING',
          `unverified dependencies: ${pending.join(', ')}`
        );
    }
    if (change.status === 'verified') {
      if (!change.evidence)
        fail(
          'INVALID_EVIDENCE',
          'verified requires a current-head evidence board'
        );
      item.verification = verificationFor(item, change.evidence);
      delete item.invalidatedDependencies;
    } else if (previous.status === 'verified') delete item.verification;
    item.status = change.status;
  }
  if (change.priority !== undefined) item.priority = change.priority;
  if (change.owner !== undefined) item.owner = change.owner;
  if (change.note !== undefined) item.note = change.note;
  if (change.link !== undefined && !item.links.includes(change.link))
    item.links = [...item.links, change.link];
  if (item.status === 'active' && !item.owner.trim())
    fail('INVALID_STATE', 'active request needs an owner');
  const proposed = new Map(items);
  proposed.set(item.id, item);
  const events = [{ item, action: 'update' }];
  let changed = true;
  while (changed) {
    changed = false;
    for (const dependent of proposed.values()) {
      const pending = (dependent.dependencies ?? []).filter(
        (id) => proposed.get(id)?.status !== 'verified'
      );
      if (dependent.status === 'verified' && pending.length) {
        const invalidated = {
          ...dependent,
          status: 'implemented' as const,
          invalidatedDependencies: pending,
        };
        delete invalidated.verification;
        proposed.set(dependent.id, invalidated);
        events.push({ item: invalidated, action: 'dependency-invalidated' });
        changed = true;
      }
    }
  }
  return { item, events };
}
