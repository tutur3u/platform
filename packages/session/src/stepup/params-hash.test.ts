import { describe, expect, it } from 'vitest';
import { encodeBase64Url } from '../encoding';
import { isStepUpAct, paramsHash, type StepUpAct } from './params-hash';

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

const ACT: StepUpAct = 'vault.pin-eval';

describe('paramsHash golden vectors', () => {
  // Each digest is SHA-256 over `ttr-stepup/v1|vault.pin-eval|<canonical JSON>`,
  // computed outside this package from the literal canonical text.
  it.each<[string, unknown, string]>([
    [
      'the vault PIN evaluation parameters',
      {
        wrapVersion: 3,
        clientKey: 'AQIDBA',
        challenge: 'CQkJCQkJCQkJCQkJCQkJCQ',
        blindedElementHash: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc',
      },
      'cd91ad0bbba3407a47fef2823f6d5dc41dcedd1d01fbdbd22dadf7a3a32ae41b',
    ],
    [
      'null',
      null,
      '94f0998a6926752e2be0d7b56771eb1584198645e794e37bfc79c2226604ccf9',
    ],
    [
      'an empty object',
      {},
      '7b5df03871e77bd39769576cbad29540379bbb94e36a6f7cadb25ed0525b66b6',
    ],
    [
      'escapes, booleans and key order',
      { b: [true, false, null], a: '\n"\\' },
      '62618f12681a8851446bef4b5fbe2a24ca99318ea76554301ff15f96fe9a457d',
    ],
  ])('hashes %s', async (_name, params, expected) => {
    const result = await paramsHash(ACT, params);
    if (!result.ok) throw new Error(result.reason);
    expect(hex(result.hash)).toBe(expected);
    expect(result.hash.length).toBe(32);
    expect(result.ph).toBe(encodeBase64Url(result.hash));
  });

  it('is independent of member insertion order and prototype', async () => {
    const left = await paramsHash(ACT, { a: 1, b: { d: 2, c: 3 } });
    const right = await paramsHash(
      ACT,
      Object.assign(Object.create(null), { b: { c: 3, d: 2 }, a: 1 })
    );
    expect(left.ok && right.ok && left.ph === right.ph).toBe(true);
  });

  it('separates parameters that differ in one value', async () => {
    const left = await paramsHash(ACT, { wrapVersion: 3 });
    const right = await paramsHash(ACT, { wrapVersion: 4 });
    expect(left.ok && right.ok && left.ph !== right.ph).toBe(true);
  });
});

describe('paramsHash rejections', () => {
  it.each(['vault.other', 'vault.pin-eval ', '', 'VAULT.PIN-EVAL', 1, null])(
    'rejects the act %j before hashing',
    async (act) => {
      expect(await paramsHash(act as StepUpAct, {})).toEqual({
        ok: false,
        reason: 'act',
      });
      expect(isStepUpAct(act)).toBe(false);
    }
  );

  it.each<[string, unknown]>([
    ['undefined', undefined],
    ['a fraction', { a: 0.5 }],
    ['raw bytes', { key: new Uint8Array([1, 2]) }],
    ['a bigint', { a: 1n }],
    ['a lone surrogate', { a: '\ud800' }],
    ['-0', { a: -0 }],
  ])('rejects parameters with %s', async (_name, params) => {
    expect(await paramsHash(ACT, params)).toEqual({
      ok: false,
      reason: 'params',
    });
  });

  it('accepts the only registered act', () => {
    expect(isStepUpAct('vault.pin-eval')).toBe(true);
  });
});
