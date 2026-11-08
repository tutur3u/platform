import { describe, expect, it } from 'vitest';
import { orgTextAllowed, orgTextDenied, singleScript } from './org-text';
import { ingestSchema } from './schema';

// Reviewer R2 probe corpus (pr-7299-review-r2): every input is escaped so the
// test source carries no invisible characters. `nulled` means the payload is
// accepted with taskTitle null; `rejected` means the whole payload is refused.
type Outcome = 'nulled' | 'rejected';
const DENY_PROBES: Array<[group: string, input: string, taskTitle: Outcome]> = [
  ['baseline', 'customer', 'nulled'],
  ['baseline', 'ghp_canary', 'nulled'],
  ['baseline', 'security fix', 'nulled'],
  ['case', 'CUSTOMER', 'nulled'],
  ['case', 'CuStOmEr', 'nulled'],
  ['case', 'SECURITY', 'nulled'],
  [
    'fullwidth',
    '\u{FF43}\u{FF55}\u{FF53}\u{FF54}\u{FF4F}\u{FF4D}\u{FF45}\u{FF52}',
    'rejected',
  ],
  ['fullwidth', '\u{FF47}\u{FF48}\u{FF50}_canary', 'rejected'],
  [
    'fullwidth',
    '\u{FF53}\u{FF45}\u{FF43}\u{FF55}\u{FF52}\u{FF49}\u{FF54}\u{FF59}',
    'rejected',
  ],
  ['fullwidth', 'canary\u{FF20}example.invalid', 'rejected'],
  [
    'fullwidth',
    '\u{FF0B}\u{FF18}\u{FF14} \u{FF19}\u{FF10}\u{FF11} \u{FF12}\u{FF13}\u{FF14} \u{FF15}\u{FF16}\u{FF17}',
    'rejected',
  ],
  ['compat', '\u{17F}ecurity (long s)', 'rejected'],
  ['compat', '\u{FB01}x/private (ligature)', 'rejected'],
  ['compat', 'ignore\u{A0}previous instructions (NBSP)', 'rejected'],
  [
    'compat',
    'ignore\u{3000}previous instructions (ideographic space)',
    'rejected',
  ],
  ['zero-width', 'cus\u{200B}tomer (ZWSP)', 'rejected'],
  ['zero-width', 'cus\u{200C}tomer (ZWNJ)', 'rejected'],
  ['zero-width', 'cus\u{200D}tomer (ZWJ)', 'rejected'],
  ['zero-width', 'SEC\u{200D}-1234 fix (ZWJ)', 'rejected'],
  ['zero-width', 'ghp\u{200B}_canary (ZWSP)', 'rejected'],
  ['zero-width', 'cus\u{2060}tomer (WJ)', 'rejected'],
  ['zero-width', 'cus\u{FEFF}tomer (BOM)', 'rejected'],
  ['zero-width', 'cus\u{AD}tomer (soft hyphen)', 'rejected'],
  ['zero-width', 'cus\u{E0041}tomer (tag char)', 'rejected'],
  ['zero-width', 'cus\u{180E}tomer (MVS)', 'rejected'],
  ['bidi', 'sys\u{202E}tem prompt (RLO)', 'rejected'],
  ['bidi', 'secu\u{2066}rity (LRI)', 'rejected'],
  ['bidi', 'cus\u{200F}tomer (RLM)', 'rejected'],
  ['C1/sep', 'sys\u{85}tem prompt (NEL)', 'rejected'],
  ['C1/sep', 'ignore\u{2028}previous instructions (LS)', 'rejected'],
  ['C1/sep', 'ignore\u{2029}previous instructions (PS)', 'rejected'],
  ['non-Cf invisible', 'cus\u{34F}tomer (CGJ, Mn)', 'rejected'],
  ['non-Cf invisible', 'cus\u{FE0F}tomer (VS16, Mn)', 'rejected'],
  ['non-Cf invisible', 'cus\u{3164}tomer (Hangul filler, Lo)', 'rejected'],
  ['non-Cf invisible', 'cus\u{115F}tomer (Hangul choseong filler)', 'rejected'],
  ['combining', 'cus\u{301}tomer (acute)', 'rejected'],
  ['combining', 'customer\u{301}', 'rejected'],
  ['combining', 'custo\u{336}mer (strike)', 'rejected'],
  ['combining', 'se\u{323}curity (dot below)', 'rejected'],
  ['cyrillic', '\u{441}ustomer (Cyrillic es)', 'nulled'],
  ['cyrillic', 's\u{435}curity (Cyrillic ie)', 'nulled'],
  ['cyrillic', 'gh\u{440}_canary (Cyrillic er)', 'nulled'],
  ['cyrillic', 'sy\u{455}tem prompt (Cyrillic dze)', 'nulled'],
  ['greek/other', 'cust\u{3BF}mer (Greek omicron)', 'nulled'],
  ['greek/other', 'secur\u{131}ty (dotless i)', 'nulled'],
  ['spacing', 'ignore  previous instructions (2 spaces)', 'nulled'],
  ['name canary', 'Nguy\u{1EC5}n V\u{103}n An', 'nulled'],
  ['name canary', 'NGUY\u{1EC4}N V\u{102}N AN', 'nulled'],
  ['name canary', 'Nguye\u{302}\u{303}n Va\u{306}n An (NFD)', 'rejected'],
  ['name canary', 'Nguy\u{200B}\u{1EC5}n V\u{103}n An (ZWSP)', 'rejected'],
];
// The 17 probes that bypassed the deny scan at 61561aff.
const FORMER_BYPASSES = DENY_PROBES.filter(
  ([group, input]) =>
    [
      'non-Cf invisible',
      'combining',
      'cyrillic',
      'greek/other',
      'spacing',
    ].includes(group) || /\((?:LS|PS)\)$/.test(input)
);
// Arbitrary real names: precomposed (NFC) and single-script, so they pass.
const REAL_NAMES = [
  'Nguyen Van An (no diacritics)',
  'Ph\u{1EA1}m Thu H\u{E0}',
  'Ho\u{E0}ng Ph\u{FA}c',
  'Alex Example',
  '\u{110}\u{1EB7}ng Th\u{1ECB} Mai',
  'Selene',
  'Pax',
  'Jos\u{E9} M\u{FC}ller',
  '\u{674E}\u{5C0F}\u{9F8D}',
  '\u{41E}\u{43B}\u{44C}\u{433}\u{430} \u{41F}\u{435}\u{442}\u{440}\u{43E}\u{432}\u{430}',
  '\u{5C71}\u{7530}\u{306F}\u{306A}\u{3053}',
];
// Accepted by 61561aff and stored raw; refused at ingest now (Pax decision).
const NOW_REFUSED = [
  '\u{FF30}\u{FF41}\u{FF58} (fullwidth)',
  'Selene \u{202E}evorppa\u{202C} (RLO, no deny term)',
  'Pax\u{200B} (ZWSP impersonation)',
  'Ph\u{1EA1}m Thu Ha\u{300} (stray combining grave)',
  'Pa\u{445} (Cyrillic ha)',
  'P\u{3B1}x (Greek alpha)',
];
const IDENT_FIELDS = ['label', 'role', 'team', 'pool', 'modelFamily'] as const;

const node = {
  key: 'a'.repeat(32),
  kind: 'agent',
  label: 'Release agent',
  role: 'Release',
  status: 'working',
  activity: 'now',
  taskTitle: 'Prepare release',
};
const lane = { ...node, key: 'b'.repeat(32), kind: 'lane' };
const withNode = (patch: Record<string, unknown>) => ({
  v: 3,
  seq: 1,
  sentAt: 1793000000000,
  events: [],
  snapshot: {
    needsYou: [],
    environments: [],
    lanes: [],
    backlog: [],
    org: { nodes: [{ ...node, ...patch }, lane], edges: [] },
  },
});
const taskTitleOutcome = (value: string) => {
  const result = ingestSchema.safeParse(withNode({ taskTitle: value }));
  if (!result.success) return 'rejected';
  if (result.data.v !== 3) throw new Error('Expected v3');
  if (result.data.snapshot?.org?.nodes[0]?.taskTitle !== null) return 'kept';
  expect(JSON.stringify(result.data)).not.toContain(value);
  return 'nulled';
};

describe('R2 probe corpus', () => {
  it('has the reviewer counts: 50 deny probes, 17 former bypasses', () => {
    expect(DENY_PROBES).toHaveLength(50);
    expect(FORMER_BYPASSES).toHaveLength(17);
  });
  it.each(DENY_PROBES)(
    '%s probe %j is refused in every identifier field and taskTitle is %s',
    (_group, input, outcome) => {
      for (const field of IDENT_FIELDS)
        expect(
          ingestSchema.safeParse(withNode({ [field]: input })).success
        ).toBe(false);
      expect(taskTitleOutcome(input)).toBe(outcome);
    }
  );
  it.each(FORMER_BYPASSES)(
    'former %s bypass %j is now caught by validation or the deny scan',
    (_group, input) => {
      expect(!orgTextAllowed(input) || orgTextDenied(input)).toBe(true);
    }
  );
  it.each(REAL_NAMES)('accepts the real name %j everywhere', (name) => {
    expect(orgTextAllowed(name)).toBe(true);
    expect(orgTextDenied(name)).toBe(false);
    expect(singleScript(name)).toBe(true);
    for (const field of IDENT_FIELDS) {
      const parsed = ingestSchema.parse(withNode({ [field]: name }));
      if (parsed.v !== 3) throw new Error('Expected v3');
      expect(parsed.snapshot?.org?.nodes[0]?.[field]).toBe(name);
    }
    expect(taskTitleOutcome(name)).toBe('kept');
  });
  it.each(NOW_REFUSED)('refuses the spoof %j in identifier fields', (value) => {
    for (const field of IDENT_FIELDS)
      expect(ingestSchema.safeParse(withNode({ [field]: value })).success).toBe(
        false
      );
  });
});

describe('org text validation', () => {
  it('rejects instead of normalizing, so stored text is what renders', () => {
    for (const value of [
      'Pax\u{200B}',
      'Pax\u{2028}',
      'Pax\u{E000}',
      'Pax\u{FE0F}',
      'Pax\u{3164}',
      'Pax\u{9}',
      'Pax\u{1F}',
      'Pax\u{7F}',
      '\u{FF30}ax',
      'Pa\u{301}x',
      'Pax\u{336}',
      '\u{2126}',
    ])
      expect(orgTextAllowed(value)).toBe(false);
    for (const value of [
      'Pax',
      'Ph\u{1EA1}m Thu H\u{E0}',
      '\u{674E}\u{5C0F}\u{9F8D}',
      'v2.1 (beta)',
    ])
      expect(orgTextAllowed(value)).toBe(true);
  });
  it('applies the single-script rule to identifier fields only', () => {
    const mixed = 'Sync \u{41C}\u{43E}\u{441}\u{43A}\u{432}\u{430} board';
    expect(singleScript(mixed)).toBe(false);
    for (const field of IDENT_FIELDS)
      expect(ingestSchema.safeParse(withNode({ [field]: mixed })).success).toBe(
        false
      );
    expect(taskTitleOutcome(mixed)).toBe('kept');
    expect(singleScript('gpt-5.5 / opus 4')).toBe(true);
    expect(singleScript('\u{D55C}\u{AD6D}\u{C5B4} \u{6F22}\u{5B57}')).toBe(
      true
    );
    expect(singleScript('Pax \u{674E}')).toBe(false);
  });
  it('deny-scans accented ASCII terms and collapsed whitespace', () => {
    for (const value of [
      'c\u{FA}stomer',
      'S\u{C9}CURITY',
      'ignore \t previous instructions',
      'sy\u{455}tem\u{A0}\u{A0}prompt',
    ])
      expect(orgTextDenied(value)).toBe(true);
  });
});
