import { reportConfigs } from '@tuturuuu/utils/configs/reports';
import { describe, expect, it } from 'vitest';
import { renderReportEmail } from './email-template';
import {
  buildReviewedEmailEnvelope,
  type ReviewedReportEmailInput,
} from './reviewed-email-envelope';

function input(): ReviewedReportEmailInput {
  return {
    workspaceId: '00000000-0000-4000-8000-000000000001',
    reportId: '00000000-0000-4000-8000-000000000002',
    subjectId: '00000000-0000-4000-8000-000000000003',
    groupId: '00000000-0000-4000-8000-000000000004',
    creatorId: '00000000-0000-4000-8000-000000000005',
    revision: '1',
    recipient: '  LEARNER@example.com  ',
    report: {
      title: null,
      content: 'Line one\nLine two & <three>',
      feedback: '',
      score: 0,
      userName: 'Learner',
      groupName: 'Class',
      teacherName: 'Teacher',
    },
    configs: {
      ...Object.fromEntries(reportConfigs.map(({ id }) => [id!, ''])),
      REPORT_TITLE_PREFIX: 'Progress',
      REPORT_TITLE_SUFFIX: 'August',
      REPORT_INTRO: '{{user_name}} · {{group_name}} · {{group_manager_name}}',
      BRAND_NAME: 'Synthetic center',
    },
  };
}
function envelope(value = input()) {
  const result = buildReviewedEmailEnvelope(value);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('Expected valid synthetic fixture');
  return result;
}
describe('unwired reviewed report presentation envelope', () => {
  it('derives normalized recipient, transport subject and actual renderer HTML from one copy', () => {
    const original = input();
    const result = envelope(original);
    expect(result.recipient).toBe('learner@example.com');
    expect(result.subject).toBe('Progress August');
    expect(result.html).toContain('<title>Progress August</title>');
    expect(result.html).toBe(
      renderReportEmail(original.report, { ...original.configs })
    );
    expect(result.html).toContain('Line one<br />Line two &amp; &lt;three&gt;');
    expect(result.html).toContain('<strong>Learner</strong>');
    expect(result.html).toContain('0.0');
    expect(result.digest).toMatch(/^[a-f0-9]{64}$/);
    original.report.content = 'Changed after construction';
    original.report.userName = 'Other learner';
    original.configs = { ...original.configs, BRAND_NAME: 'Changed brand' };
    original.recipient = 'other@example.com';
    expect(result.snapshot.report.content).toBe('Line one\nLine two & <three>');
    expect(result.html).not.toContain('Changed after construction');
    expect(result.recipient).toBe('learner@example.com');
    expect(Object.isFrozen(result.snapshot.report)).toBe(true);
    expect(Object.isFrozen(result.snapshot.configs)).toBe(true);
  });
  it('is deterministic across input property/config order and dispatch recipient normalization', () => {
    const first = input();
    const second = {
      ...first,
      configs: Object.fromEntries(Object.entries(first.configs).reverse()),
      recipient: 'learner@example.com',
    };
    expect(envelope(first).digest).toBe(envelope(second).digest);
  });
  it.each(['userName', 'groupName', 'teacherName', 'score'] as const)(
    'binds actual renderer input %s',
    (key) => {
      const changed = input();
      changed.report = {
        ...changed.report,
        [key]: key === 'score' ? 85.5 : 'Changed identity',
      };
      expect(envelope(changed).digest).not.toBe(envelope().digest);
      expect(envelope(changed).html).not.toBe(envelope().html);
    }
  );
  it.each([
    'BRAND_NAME',
    'REPORT_CONTENT_TEXT',
    'REPORT_INTRO',
    'BRAND_LOCATION',
  ])('binds actual renderer configuration %s', (key) => {
    const changed = input();
    changed.configs = { ...changed.configs, [key]: 'Changed configured text' };
    expect(envelope(changed).digest).not.toBe(envelope().digest);
    expect(envelope(changed).html).not.toBe(envelope().html);
  });
  it.each(['revision', 'creatorId', 'recipient'] as const)(
    'binds scope/review identity %s even when visible text is unchanged',
    (key) => {
      const changed = input();
      changed[key] =
        key === 'revision'
          ? '2'
          : key === 'recipient'
            ? 'other@example.com'
            : '00000000-0000-4000-8000-000000000006';
      expect(envelope(changed).digest).not.toBe(envelope().digest);
    }
  );
  it('preserves explicit null and intentionally cleared text with actual English/Vietnamese defaults', () => {
    const cleared = input();
    cleared.report = {
      title: ' ',
      content: '',
      feedback: '',
      score: null,
      userName: null,
      groupName: null,
      teacherName: null,
    };
    cleared.creatorId = null;
    cleared.configs = Object.fromEntries(
      reportConfigs.map(({ id }) => [id!, ''])
    );
    expect(envelope(cleared).subject).toBe('Progress report');
    cleared.configs = { ...cleared.configs, REPORT_INTRO: 'Học viên' };
    expect(envelope(cleared).subject).toBe('Báo cáo học tập');
    expect(envelope(cleared).html).toContain('<title>Báo cáo học tập</title>');
  });
  it('escapes markup through the real renderer without normalizing away reviewed human text', () => {
    const value = input();
    value.report.title = '<script>Title</script>';
    value.report.feedback = '  First\n\nSecond  ';
    value.report.userName = '<img src=x>';
    const result = envelope(value);
    expect(result.subject).toBe('<script>Title</script>');
    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;script&gt;Title&lt;/script&gt;');
    expect(result.html).toContain('  First<br /><br />Second  ');
    expect(result.snapshot.report.feedback).toBe(value.report.feedback);
  });
  it.each([
    (value: ReviewedReportEmailInput) =>
      Reflect.deleteProperty(value, 'revision'),
    (value: ReviewedReportEmailInput) =>
      Reflect.deleteProperty(value.report, 'teacherName'),
    (value: ReviewedReportEmailInput) =>
      Reflect.deleteProperty(value.configs, 'BRAND_LOCATION'),
  ])(
    'rejects missing evidence instead of substituting an unreviewed default',
    (remove) => {
      const value = input();
      remove(value);
      expect(buildReviewedEmailEnvelope(value)).toEqual({
        ok: false,
        reason: 'missing-input',
      });
    }
  );
  it.each([
    { revision: '0' },
    { revision: '9223372036854775808' },
    { revision: '1.5' },
    { recipient: '' },
    { recipient: 'not-an-address' },
    { workspaceId: 'foreign' },
  ])('rejects malformed identity/revision/recipient %j', (change) => {
    expect(buildReviewedEmailEnvelope({ ...input(), ...change })).toEqual({
      ok: false,
      reason: 'invalid-input',
    });
  });
  it.each([NaN, Infinity, '85'])(
    'rejects malformed score %s rather than silently omitting it',
    (score) => {
      const value = input();
      value.report.score = score as number;
      expect(buildReviewedEmailEnvelope(value)).toEqual({
        ok: false,
        reason: 'invalid-input',
      });
    }
  );
  it('rejects unallowlisted or non-text configuration values', () => {
    const value = input();
    value.configs = { ...value.configs, EXTRA: 'Not reviewed' };
    expect(buildReviewedEmailEnvelope(value)).toEqual({
      ok: false,
      reason: 'invalid-input',
    });
    value.configs = { ...input().configs, REPORT_INTRO: null as never };
    expect(buildReviewedEmailEnvelope(value)).toEqual({
      ok: false,
      reason: 'invalid-input',
    });
  });
});

describe('actual transport admission boundaries', () => {
  it.each(['', 'Học viên'])(
    'falls back when both configured title parts are whitespace (%s)',
    (intro) => {
      const value = input();
      value.configs = {
        ...value.configs,
        REPORT_TITLE_PREFIX: '  ',
        REPORT_TITLE_SUFFIX: '\t',
        REPORT_INTRO: intro,
      };
      const result = envelope(value);
      const expected = intro ? 'Báo cáo học tập' : 'Progress report';
      expect(result.subject).toBe(expected);
      expect(result.html).toContain(`<title>${expected}</title>`);
    }
  );
  it('trims valid configured parts before joining without rewriting original snapshot text', () => {
    const value = input();
    value.configs = {
      ...value.configs,
      REPORT_TITLE_PREFIX: '  Progress  ',
      REPORT_TITLE_SUFFIX: ' August ',
    };
    const result = envelope(value);
    expect(result.subject).toBe('Progress August');
    expect(result.html).toContain('<title>Progress August</title>');
    expect(result.snapshot.configs.REPORT_TITLE_PREFIX).toBe('  Progress  ');
  });
  it.each([
    'learner@localhost',
    'learner@-example.com',
    'learner@example-.com',
    `learner@${'a'.repeat(64)}.com`,
    `${'a'.repeat(243)}@example.com`,
  ])(
    'rejects recipient disallowed by actual transport validation: %s',
    (recipient) => {
      expect(buildReviewedEmailEnvelope({ ...input(), recipient })).toEqual({
        ok: false,
        reason: 'invalid-input',
      });
    }
  );
  it.each([
    'learner+review@example.com',
    `${'a'.repeat(242)}@example.com`,
    '  LEARNER@example.com  ',
  ])('preserves transport-valid recipient control: %s', (recipient) => {
    expect(envelope({ ...input(), recipient }).recipient).toBe(
      recipient.trim().toLowerCase()
    );
  });
  it.each([false, true])(
    'accepts exactly200 resolved subject characters, config fallback=%s',
    (fallback) => {
      const value = input();
      if (fallback)
        value.configs = {
          ...value.configs,
          REPORT_TITLE_PREFIX: 'x'.repeat(198),
          REPORT_TITLE_SUFFIX: 'y',
        };
      else value.report.title = 'x'.repeat(200);
      expect(envelope(value).subject).toHaveLength(200);
    }
  );
  it.each([false, true])(
    'rejects201 resolved subject characters without truncation, config fallback=%s',
    (fallback) => {
      const value = input();
      if (fallback)
        value.configs = {
          ...value.configs,
          REPORT_TITLE_PREFIX: 'x'.repeat(199),
          REPORT_TITLE_SUFFIX: 'y',
        };
      else value.report.title = 'x'.repeat(201);
      expect(buildReviewedEmailEnvelope(value)).toEqual({
        ok: false,
        reason: 'invalid-input',
      });
      if (!fallback) expect(value.report.title).toHaveLength(201);
    }
  );
});
