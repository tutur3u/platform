import { describe, expect, it } from 'vitest';
import {
  ApprovalProtocolError,
  parsePeriodicApprovalRequest,
  parsePeriodicApprovalResult,
} from './approval-protocol';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const context = {
  actorAuthUid: id(1),
  actorWorkspaceUserId: id(2),
  workspaceId: id(3),
};
const request = (count = 1, expectedRevision = '9007199254740993') => ({
  version: 1,
  kind: 'periodic',
  actionId: id(4),
  workspaceId: id(3),
  selections: Array.from({ length: count }, (_, n) => ({
    reportId: id(10 + n),
    expectedRevision,
  })),
});
const result = (count = 1) => ({
  version: 1,
  kind: 'periodic',
  actionId: id(4),
  ...context,
  replayed: false,
  rendererVersion: 'report-html-v1',
  entries: Array.from({ length: count }, (_, n) => ({
    reportId: id(10 + n),
    observedRevision: '9007199254740993',
    reviewRevision: '9007199254740994',
    receiptRevision: '9007199254740994',
    receiptId: id(100 + n),
    fullReviewInputDigest: 'a'.repeat(64),
    presentationDigest: 'b'.repeat(64),
    recipientDigest: 'c'.repeat(64),
  })),
});
const parse = (value: unknown, count = 1) =>
  parsePeriodicApprovalResult(
    value,
    parsePeriodicApprovalRequest(request(count)),
    context
  );
const category = (call: () => unknown, expected: string) => {
  try {
    call();
    throw new Error('Expected protocol failure');
  } catch (error) {
    expect(error).toBeInstanceOf(ApprovalProtocolError);
    expect((error as ApprovalProtocolError).category).toBe(expected);
    expect((error as Error).message).toBe(
      'Approval protocol validation failed.'
    );
  }
};

describe('explicit periodic request protocol (unwired)', () => {
  it.each([1, 50])('accepts exactly %i selected entries', (count) =>
    expect(
      parsePeriodicApprovalRequest(request(count)).selections
    ).toHaveLength(count)
  );
  it.each([0, 51])('rejects selection count %i', (count) =>
    category(
      () => parsePeriodicApprovalRequest(request(count)),
      'invalid_request'
    )
  );
  it('rejects duplicates', () => {
    const value = request(2);
    value.selections[1] = { ...value.selections[0]! };
    category(() => parsePeriodicApprovalRequest(value), 'invalid_request');
  });
  it.each([
    '0',
    '-1',
    '01',
    '1e3',
    '1.0',
    '+1',
    ' 1',
    '1 ',
    '1\n',
    '9223372036854775808',
    '9'.repeat(200),
  ])('rejects noncanonical or overflowing revision %s', (value) =>
    category(
      () => parsePeriodicApprovalRequest(request(1, value)),
      'invalid_request'
    )
  );
  it.each(['1', '9007199254740993', '9223372036854775807'])(
    'retains exact decimal TEXT %s',
    (value) =>
      expect(
        parsePeriodicApprovalRequest(request(1, value)).selections[0]
          ?.expectedRevision
      ).toBe(value)
  );
  it('rejects numeric revisions without rounding', () => {
    const value = request();
    category(
      () =>
        parsePeriodicApprovalRequest({
          ...value,
          selections: [
            { reportId: id(10), expectedRevision: 9007199254740992 },
          ],
        }),
      'invalid_request'
    );
  });
  it.each([
    { actorAuthUid: id(1) },
    { filters: {} },
    { approved_by: id(2) },
    { approveAll: true },
  ])('rejects caller identity and unbounded selector %o', (extra) =>
    category(
      () => parsePeriodicApprovalRequest({ ...request(), ...extra }),
      'invalid_request'
    )
  );
  it.each(['daily', 'all'])('rejects unsupported kind %s', (kind) =>
    category(
      () => parsePeriodicApprovalRequest({ ...request(), kind }),
      'invalid_request'
    )
  );
  it('does not mutate input and freezes the returned snapshot', () => {
    const value = request();
    const before = structuredClone(value);
    const parsed = parsePeriodicApprovalRequest(value);
    value.selections[0]!.expectedRevision = '1';
    expect(parsed.selections[0]?.expectedRevision).toBe(
      before.selections[0]?.expectedRevision
    );
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.selections)).toBe(true);
    expect(Object.isFrozen(parsed.selections[0])).toBe(true);
  });
});

describe('complete periodic result comparison (not authentication)', () => {
  it.each([1, 50])(
    'accepts full %i-entry original and replay result',
    (count) => {
      expect(parse(result(count), count).entries).toHaveLength(count);
      expect(parse({ ...result(count), replayed: true }, count).replayed).toBe(
        true
      );
    }
  );
  it.each(['actionId', 'workspaceId', 'actorAuthUid', 'actorWorkspaceUserId'])(
    'rejects foreign %s',
    (field) =>
      category(() => parse({ ...result(), [field]: id(999) }), 'scope_mismatch')
  );
  it('rejects a foreign comparison workspace even if result matches request', () =>
    category(
      () =>
        parsePeriodicApprovalResult(
          result(),
          parsePeriodicApprovalRequest(request()),
          { ...context, workspaceId: id(999) }
        ),
      'scope_mismatch'
    ));
  it('rejects malformed context without trusting a type assertion', () =>
    category(
      () =>
        parsePeriodicApprovalResult(
          result(),
          parsePeriodicApprovalRequest(request()),
          { ...context, actorAuthUid: 'body actor' }
        ),
      'invalid_context'
    ));
  it.each([
    null,
    {},
    { ...result(), replayed: undefined },
    { ...result(), replayed: 'true' },
    { ...result(), kind: 'daily' },
    { ...result(), rendererVersion: ' ' },
    { ...result(), errors: [] },
  ])('rejects malformed result %o', (value) =>
    category(() => parse(value), 'invalid_result')
  );
  it('rejects empty results', () =>
    category(() => parse({ ...result(), entries: [] }), 'invalid_result'));
  it('rejects partial results', () =>
    category(() => parse(result(), 2), 'incomplete_result'));
  it('rejects extra results', () =>
    category(() => parse(result(2)), 'incomplete_result'));
  it('rejects duplicate report identities', () => {
    const value = result(2);
    value.entries[1]!.reportId = id(10);
    category(() => parse(value, 2), 'incomplete_result');
  });
  it('rejects duplicate receipt identities', () => {
    const value = result(2);
    value.entries[1]!.receiptId = id(100);
    category(() => parse(value, 2), 'incomplete_result');
  });
  it('rejects unmatched report identity even at equal count', () => {
    const value = result();
    value.entries[0]!.reportId = id(999);
    category(() => parse(value), 'incomplete_result');
  });
  it.each(['observedRevision', 'reviewRevision', 'receiptRevision'])(
    'rejects stale/mismatched %s',
    (field) => {
      const value = result();
      Object.assign(value.entries[0]!, {
        [field]:
          '9007199254740993' === value.entries[0]![field as 'observedRevision']
            ? '1'
            : '9007199254740993',
      });
      category(() => parse(value), 'revision_mismatch');
    }
  );
  it.each(['fullReviewInputDigest', 'presentationDigest', 'recipientDigest'])(
    'rejects malformed %s independently',
    (field) => {
      const value = result();
      Object.assign(value.entries[0]!, { [field]: 'private raw value' });
      category(() => parse(value), 'invalid_result');
    }
  );
  it('keeps full review input and presentation digests separate without encoding claims', () => {
    const parsed = parse(result());
    expect(parsed.entries[0]?.fullReviewInputDigest).toBe('a'.repeat(64));
    expect(parsed.entries[0]?.presentationDigest).toBe('b'.repeat(64));
    expect(parsed.rendererVersion).toBe('report-html-v1');
  });
  it('compares above safe integer without Number conversion', () => {
    const value = result();
    value.entries[0]!.reviewRevision = '9007199254740993';
    value.entries[0]!.receiptRevision = '9007199254740993';
    category(() => parse(value), 'revision_mismatch');
  });
  it('returns independent frozen result entries', () => {
    const value = result();
    const parsed = parse(value);
    value.entries[0]!.presentationDigest = 'd'.repeat(64);
    expect(parsed.entries[0]?.presentationDigest).toBe('b'.repeat(64));
    expect(Object.isFrozen(parsed.entries[0])).toBe(true);
    expect(Object.isFrozen(parsed.entries)).toBe(true);
  });
});

it('rejects digest terminal newline despite regex end-anchor behavior', () => {
  const value = result();
  value.entries[0]!.fullReviewInputDigest += '\n';
  category(() => parse(value), 'invalid_result');
});
it('rejects renderer label terminal newline', () =>
  category(
    () => parse({ ...result(), rendererVersion: 'v1\n' }),
    'invalid_result'
  ));

it('accepts the exact signed-bigint maximum resulting revision', () => {
  const selected = parsePeriodicApprovalRequest(
    request(1, '9223372036854775806')
  );
  const value = result();
  Object.assign(value.entries[0]!, {
    observedRevision: '9223372036854775806',
    reviewRevision: '9223372036854775807',
    receiptRevision: '9223372036854775807',
  });
  expect(
    parsePeriodicApprovalResult(value, selected, context).entries[0]
      ?.reviewRevision
  ).toBe('9223372036854775807');
});
it('cannot claim a successful advancing revision beyond the signed-bigint maximum', () => {
  const selected = parsePeriodicApprovalRequest(
    request(1, '9223372036854775807')
  );
  const value = result();
  Object.assign(value.entries[0]!, {
    observedRevision: '9223372036854775807',
    reviewRevision: '9223372036854775808',
    receiptRevision: '9223372036854775808',
  });
  category(
    () => parsePeriodicApprovalResult(value, selected, context),
    'invalid_result'
  );
});
