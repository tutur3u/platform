import {
  type FleetAccess,
  type FleetDigestSection,
  type FleetIntentInput,
  type FleetIntentReceipt,
  type fleetDigestStates,
  fleetIntentInputSchema,
} from '@tuturuuu/internal-api/fleet';
import type { Tone } from '../components/tone';

export const fleetTabs = [
  'status',
  'ask',
  'requests',
  'approvals',
  'link',
  'access',
] as const;
export type FleetTab = (typeof fleetTabs)[number];

type Capability = Extract<
  FleetAccess,
  { enabled: true }
>['capabilities'][number];
export type LiveFleetAccess = Extract<FleetAccess, { enabled: true }>;
export type IntentKind = FleetIntentInput['kind'];
export type LaneState = (typeof fleetDigestStates)[number];
export type ReceiptState = FleetIntentReceipt['state'];

/** Tabs follow live capabilities; the API still decides every read and write. */
export function visibleTabs(access: LiveFleetAccess): FleetTab[] {
  const can = (capability: Capability) =>
    access.capabilities.includes(capability);
  return fleetTabs.filter((tab) => {
    switch (tab) {
      case 'status':
        return can('status.read');
      case 'ask':
        return can('ask') && can('status.read');
      case 'requests':
      case 'link':
        return true;
      case 'approvals':
        return can('approve.low');
      case 'access':
        return access.tier === 'owner';
    }
  });
}

const requestCapability: Record<IntentKind, Capability> = {
  status_question: 'ask',
  comment: 'comment',
  'priority.set': 'priority.set',
  'approve.item': 'approve.low',
  'work.create': 'work.create',
  'work.redirect': 'work.redirect',
  'lane.pause': 'lane.pause',
  'approve.deploy': 'approve.deploy',
  'approve.production_change': 'approve.production_change',
};

export type RequestOption = { kind: IntentKind; ownerApproval: boolean };

/**
 * Mirrors intent admission: a kind needs its own capability, or
 * `intent.request` to file it for Owner approval. Questions need `ask`.
 */
export function requestOptions(access: LiveFleetAccess): RequestOption[] {
  const held = new Set<Capability>(access.capabilities);
  return (
    Object.keys(requestCapability) as IntentKind[]
  ).flatMap<RequestOption>((kind) => {
    if (held.has(requestCapability[kind])) {
      return [{ kind, ownerApproval: false }];
    }
    return kind !== 'status_question' && held.has('intent.request')
      ? [{ kind, ownerApproval: true }]
      : [];
  });
}

export type ChoiceField =
  | 'topic'
  | 'priority'
  | 'template'
  | 'objective'
  | 'environment';

type FieldSpec = {
  target: boolean;
  choice?: { field: ChoiceField; options: readonly string[] };
  commitSha?: boolean;
  quoteRequired?: boolean;
};

export const intentFields: Record<IntentKind, FieldSpec> = {
  status_question: {
    target: false,
    choice: { field: 'topic', options: ['status', 'readiness', 'timeline'] },
  },
  comment: { target: true, quoteRequired: true },
  'priority.set': {
    target: true,
    choice: {
      field: 'priority',
      options: ['low', 'normal', 'high', 'urgent'],
    },
  },
  'approve.item': { target: true },
  'work.create': {
    target: true,
    choice: {
      field: 'template',
      options: ['investigation', 'maintenance', 'regression_fix'],
    },
  },
  'work.redirect': {
    target: true,
    choice: {
      field: 'objective',
      options: ['investigate', 'verify', 'prepare_review'],
    },
  },
  'lane.pause': { target: true },
  'approve.deploy': {
    target: true,
    choice: { field: 'environment', options: ['staging', 'production'] },
    commitSha: true,
  },
  'approve.production_change': { target: true, commitSha: true },
};

export type RequestDraft = {
  kind: IntentKind;
  projectKey: string;
  targetKey: string;
  choice: string;
  commitSha: string;
  quote: string;
};

/** Builds the wire shape; `fleetIntentInputSchema` validates it. */
export function draftToInput(draft: RequestDraft): unknown {
  const spec = intentFields[draft.kind];
  const payload: Record<string, string> = { projectKey: draft.projectKey };
  if (spec.target) payload.targetKey = draft.targetKey.trim();
  if (spec.choice) payload[spec.choice.field] = draft.choice;
  if (spec.commitSha) payload.commitSha = draft.commitSha.trim();
  if (draft.kind === 'approve.production_change') {
    payload.environment = 'production';
  }
  const quote = draft.quote.trim();
  return {
    kind: draft.kind,
    payload,
    ...(quote || spec.quoteRequired ? { quote } : {}),
  };
}

export type FieldName =
  | 'projectKey'
  | 'targetKey'
  | 'choice'
  | 'commitSha'
  | 'quote';
export type FieldErrors = Partial<
  Record<FieldName, 'required' | 'badKey' | 'badSha'>
>;

/** Maps schema issues to the fields people can correct. */
export function fieldErrors(draft: RequestDraft): FieldErrors | null {
  const result = fleetIntentInputSchema.safeParse(draftToInput(draft));
  if (result.success) return null;
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const [scope, key] = issue.path;
    if (scope === 'quote') errors.quote = 'required';
    else if (key === 'projectKey') errors.projectKey = 'required';
    else if (key === 'targetKey') {
      errors.targetKey = draft.targetKey.trim() ? 'badKey' : 'required';
    } else if (key === 'commitSha') errors.commitSha = 'badSha';
    else errors.choice = 'required';
  }
  return errors;
}

export const laneTone: Record<LaneState, Tone> = {
  planned: 'gray',
  running: 'blue',
  blocked: 'red',
  ready: 'green',
  done: 'gray',
  paused: 'yellow',
};

export const receiptTone: Record<ReceiptState, Tone> = {
  pending_approval: 'yellow',
  approved: 'blue',
  rejected: 'red',
  claimed: 'blue',
  dispatched: 'blue',
  done: 'green',
  failed: 'red',
  expired: 'gray',
  cancelled: 'gray',
};

export type AskTopic = 'status' | 'readiness' | 'timeline';
type Lane = FleetDigestSection['lanes'][number];

export type DigestAnswer =
  | { kind: 'no-snapshot' }
  | {
      kind: 'status';
      section: FleetDigestSection;
      counts: [LaneState, number][];
    }
  | { kind: 'readiness'; section: FleetDigestSection; lanes: Lane[] }
  | { kind: 'timeline'; section: FleetDigestSection; lanes: Lane[] };

/** Answers a typed question from the caller's scoped digest, with no model. */
export function answerFromDigest(
  sections: FleetDigestSection[],
  projectKey: string,
  topic: AskTopic
): DigestAnswer {
  const section = sections.find((entry) => entry.projectKey === projectKey);
  if (!section) return { kind: 'no-snapshot' };
  switch (topic) {
    case 'status': {
      const counts = new Map<LaneState, number>();
      for (const { state } of section.lanes) {
        counts.set(state, (counts.get(state) ?? 0) + 1);
      }
      return { kind: 'status', section, counts: [...counts] };
    }
    case 'readiness':
      return {
        kind: 'readiness',
        section,
        lanes: section.lanes.filter(
          (lane) => lane.readinessItem || lane.blockerCodes.length > 0
        ),
      };
    case 'timeline':
      return {
        kind: 'timeline',
        section,
        lanes: section.lanes
          .filter((lane) => lane.eta)
          .sort((a, b) => String(a.eta).localeCompare(String(b.eta))),
      };
  }
}
