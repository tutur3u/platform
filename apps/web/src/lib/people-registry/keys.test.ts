import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  InvalidExternalIdError,
  decryptDisplay,
  encryptDisplay,
  lookupHash,
  newWorkspaceKeys,
  type PeopleKey,
  suppressionToken,
  unwrapWorkspaceKey,
  wrappedKeyId,
  wrapWorkspaceKey,
} from './keys';

const wsA = '00000000-0000-4000-8000-00000000000a';
const wsB = '00000000-0000-4000-8000-00000000000b';
const key = (purpose: PeopleKey['purpose'], version = 1): PeopleKey => ({
  purpose,
  version,
  key: randomBytes(32),
});

describe('people registry keys', () => {
  beforeEach(() => {
    process.env.PEOPLE_REGISTRY_WRAP_KID = '1a2b3c4d';
    process.env.PEOPLE_REGISTRY_WRAP_KEY_1a2b3c4d =
      randomBytes(32).toString('hex');
  });
  afterEach(() => {
    delete process.env.PEOPLE_REGISTRY_WRAP_KID;
    delete process.env.PEOPLE_REGISTRY_WRAP_KEY_1a2b3c4d;
    delete process.env.PEOPLE_REGISTRY_WRAP_KEY_0a0b0c0d;
  });

  it('wraps one key per purpose and unwraps only for the same workspace', () => {
    const wrapped = newWorkspaceKeys(wsA);
    expect(Object.keys(wrapped).sort()).toEqual([
      'audit',
      'conversation_lookup',
      'display',
      'sender_lookup',
      'suppression',
    ]);
    const record = {
      purpose: 'display' as const,
      version: 1,
      wrappedKey: wrapped.display,
      current: true,
    };
    expect(unwrapWorkspaceKey(wsA, record).key).toHaveLength(32);
    expect(() => unwrapWorkspaceKey(wsB, record)).toThrow();
    expect(() =>
      unwrapWorkspaceKey(wsA, { ...record, purpose: 'audit' })
    ).toThrow();
  });

  it('refuses to wrap without a configured wrap key', () => {
    delete process.env.PEOPLE_REGISTRY_WRAP_KID;
    expect(() => newWorkspaceKeys(wsA)).toThrow('wrap key is not configured');
  });

  it('separates lookup hashes by workspace, purpose and normalised id', () => {
    const sender = key('sender_lookup');
    const input = {
      wsId: wsA,
      channel: 'whatsapp',
      account: 'acct',
      externalId: '+84 90 000 0000',
    };
    const same = lookupHash(sender, { ...input, externalId: '+8490-000-0000' });
    expect(lookupHash(sender, input).equals(same)).toBe(true);
    expect(lookupHash(sender, { ...input, wsId: wsB }).equals(same)).toBe(
      false
    );
    const conversation = { ...sender, purpose: 'conversation_lookup' as const };
    expect(lookupHash(conversation, input).equals(same)).toBe(false);
    expect(() => lookupHash(key('display'), input)).toThrow();
  });

  it('derives suppression tokens only with the suppression key', () => {
    const lookup = randomBytes(32);
    const suppression = key('suppression');
    expect(suppressionToken(suppression, wsA, lookup)).toHaveLength(32);
    expect(
      suppressionToken(suppression, wsA, lookup).equals(
        suppressionToken(suppression, wsB, lookup)
      )
    ).toBe(false);
    expect(() => suppressionToken(key('audit'), wsA, lookup)).toThrow();
  });

  it('binds display ciphertext to its workspace and identity', () => {
    const display = key('display', 2);
    const sealed = encryptDisplay(display, wsA, 'lookup-1', 'Alice');
    expect(decryptDisplay([display], wsA, 'lookup-1', sealed)).toBe('Alice');
    expect(decryptDisplay([display], wsB, 'lookup-1', sealed)).toBeNull();
    expect(decryptDisplay([display], wsA, 'lookup-2', sealed)).toBeNull();
    expect(
      decryptDisplay([key('display', 2)], wsA, 'lookup-1', sealed)
    ).toBeNull();
    expect(
      encryptDisplay(display, wsA, 'lookup-1', 'Alice').equals(sealed)
    ).toBe(false);
  });
  it('matches the documented lookup encoding', () => {
    const fixed: PeopleKey = {
      purpose: 'sender_lookup',
      version: 1,
      key: Buffer.alloc(32, 1),
    };
    expect(
      lookupHash(fixed, {
        wsId: wsA,
        channel: 'zalo',
        account: 'acct',
        externalId: 'u1',
      }).toString('hex')
    ).toBe('09e93c831cb38d6ad8ae40c1558e38b65d6c810124f4e558c968e81715da67dd');
  });

  it('gives every spelling of one phone number the same hash', () => {
    const sender = key('sender_lookup');
    const hash = (channel: string, externalId: string) =>
      lookupHash(sender, {
        wsId: wsA,
        channel,
        account: 'acct',
        externalId,
      }).toString('hex');
    const spellings = [
      '+84900000000',
      '0084900000000',
      '+84 90 000 0000',
      '(+84) 90-000-0000',
    ];
    expect(new Set(spellings.map((value) => hash('phone', value))).size).toBe(
      1
    );
    expect(() => hash('phone', '84900000000')).toThrow(InvalidExternalIdError);
    expect(() => hash('phone', '0900000000')).toThrow(InvalidExternalIdError);
    expect(
      new Set(
        [...spellings, '84900000000', '84900000000@s.whatsapp.net'].map(
          (value) => hash('whatsapp', value)
        )
      ).size
    ).toBe(1);
    expect(hash('whatsapp', 'ABC123@lid')).toBe(hash('whatsapp', 'abc123@lid'));
    expect(() => hash('phone', 'not a number')).toThrow(InvalidExternalIdError);
    expect(() => hash('email', 'missing-at')).toThrow(InvalidExternalIdError);
  });

  it('authenticates two-byte display key versions', () => {
    const display = key('display', 256);
    const sealed = encryptDisplay(display, wsA, 'binding', 'Bob');
    expect(sealed.readUInt16BE(0)).toBe(256);
    expect(decryptDisplay([display], wsA, 'binding', sealed)).toBe('Bob');
    const other = { ...key('display', 257), key: display.key };
    const tampered = Buffer.from(sealed);
    tampered.writeUInt16BE(257, 0);
    expect(
      decryptDisplay([display, other], wsA, 'binding', tampered)
    ).toBeNull();
  });
  it('wraps under the current kid and unwraps older kids after rotation', () => {
    const material = randomBytes(32);
    const first = wrapWorkspaceKey(wsA, 'display', 1, material);
    expect(wrappedKeyId(first)).toBe('1a2b3c4d');
    expect(Buffer.from(first, 'base64')).toHaveLength(65);

    process.env.PEOPLE_REGISTRY_WRAP_KEY_0a0b0c0d =
      randomBytes(32).toString('hex');
    process.env.PEOPLE_REGISTRY_WRAP_KID = '0a0b0c0d';
    const rotated = wrapWorkspaceKey(wsA, 'display', 1, material);
    expect(wrappedKeyId(rotated)).toBe('0a0b0c0d');

    const record = { purpose: 'display' as const, version: 1, current: true };
    expect(
      unwrapWorkspaceKey(wsA, { ...record, wrappedKey: first }).key.equals(
        material
      )
    ).toBe(true);
    expect(
      unwrapWorkspaceKey(wsA, { ...record, wrappedKey: rotated }).key.equals(
        material
      )
    ).toBe(true);

    const tampered = Buffer.from(rotated, 'base64');
    tampered.writeUInt8(tampered[1]! ^ 0xff, 1);
    expect(() =>
      unwrapWorkspaceKey(wsA, {
        ...record,
        wrappedKey: tampered.toString('base64'),
      })
    ).toThrow();

    delete process.env.PEOPLE_REGISTRY_WRAP_KEY_1a2b3c4d;
    expect(() =>
      unwrapWorkspaceKey(wsA, { ...record, wrappedKey: first })
    ).toThrow('Invalid wrapped key');
    expect(wrappedKeyId(Buffer.alloc(60).toString('base64'))).toBeNull();
  });
  it('authenticates the wrapped body and its bound fields', () => {
    const material = randomBytes(32);
    const wrapped = wrapWorkspaceKey(wsA, 'display', 1, material);
    const record = { purpose: 'display' as const, version: 1, current: true };
    const flip = (offset: number) => {
      const bytes = Buffer.from(wrapped, 'base64');
      bytes.writeUInt8(bytes[offset]! ^ 0x01, offset);
      return bytes.toString('base64');
    };
    expect(() =>
      unwrapWorkspaceKey(wsA, { ...record, wrappedKey: flip(20) })
    ).toThrow();
    expect(() =>
      unwrapWorkspaceKey(wsA, { ...record, wrappedKey: flip(64) })
    ).toThrow();
    expect(() =>
      unwrapWorkspaceKey(wsB, { ...record, wrappedKey: wrapped })
    ).toThrow();
    expect(() =>
      unwrapWorkspaceKey(wsA, {
        ...record,
        purpose: 'audit',
        wrappedKey: wrapped,
      })
    ).toThrow();
    expect(() =>
      unwrapWorkspaceKey(wsA, { ...record, version: 2, wrappedKey: wrapped })
    ).toThrow();
  });

  it('rejects malformed wrapped blobs before any key lookup', () => {
    const bytes = Buffer.from(
      wrapWorkspaceKey(wsA, 'display', 1, randomBytes(32)),
      'base64'
    );
    const record = { purpose: 'display' as const, version: 1, current: true };
    const variants = [
      bytes.subarray(0, 64),
      Buffer.concat([bytes, Buffer.from([0])]),
      Buffer.concat([Buffer.from([0x01]), bytes.subarray(1)]),
      Buffer.concat([Buffer.from([0x03]), bytes.subarray(1)]),
    ].map((variant) => variant.toString('base64'));
    for (const wrappedKey of variants) {
      expect(wrappedKeyId(wrappedKey)).toBeNull();
      expect(() => unwrapWorkspaceKey(wsA, { ...record, wrappedKey })).toThrow(
        'Invalid wrapped key'
      );
    }
    const canonical = bytes.toString('base64');
    expect(
      wrappedKeyId(`${canonical.slice(0, 10)}*${canonical.slice(10)}`)
    ).toBeNull();
  });

  it.each(['ABCDEF12', '0a1b2c3', '0a1b2c3d '])(
    'refuses to wrap under the invalid current kid %j',
    (kid) => {
      process.env.PEOPLE_REGISTRY_WRAP_KID = kid;
      process.env[`PEOPLE_REGISTRY_WRAP_KEY_${kid}`] =
        randomBytes(32).toString('hex');
      expect(() =>
        wrapWorkspaceKey(wsA, 'display', 1, randomBytes(32))
      ).toThrow('wrap key is not configured');
      delete process.env[`PEOPLE_REGISTRY_WRAP_KEY_${kid}`];
    }
  );
});
