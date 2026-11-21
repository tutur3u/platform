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
    process.env.PEOPLE_REGISTRY_WRAP_KEY = randomBytes(32).toString('hex');
  });
  afterEach(() => {
    delete process.env.PEOPLE_REGISTRY_WRAP_KEY;
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
    delete process.env.PEOPLE_REGISTRY_WRAP_KEY;
    expect(() => newWorkspaceKeys(wsA)).toThrow('PEOPLE_REGISTRY_WRAP_KEY');
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
});
