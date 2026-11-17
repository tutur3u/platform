import type { MailSenderBlock } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  findBlockForSenders,
  findSenderBlock,
  parseSenderBlockInput,
  senderBlockTarget,
} from './mail-sender-block-model';

const block = (
  id: string,
  kind: MailSenderBlock['kind'],
  value: string
): MailSenderBlock => ({
  createdAt: '2026-11-17T05:00:00.000Z',
  createdBy: null,
  id,
  kind,
  value,
});

describe('parseSenderBlockInput', () => {
  it('reads a local part as an address block', () => {
    expect(parseSenderBlockInput('  Team@SePay.vn ')).toEqual({
      status: 'valid',
      rule: { kind: 'address', value: 'team@sepay.vn' },
    });
  });

  it('reads @domain and bare domains as domain blocks', () => {
    expect(parseSenderBlockInput('@sepay.vn')).toEqual({
      status: 'valid',
      rule: { kind: 'domain', value: 'sepay.vn' },
    });
    expect(parseSenderBlockInput('mail.sepay.vn')).toEqual({
      status: 'valid',
      rule: { kind: 'domain', value: 'mail.sepay.vn' },
    });
  });

  it('refuses public provider domains but allows their addresses', () => {
    expect(parseSenderBlockInput('@Gmail.com')).toEqual({
      status: 'shared_provider',
      domain: 'gmail.com',
    });
    expect(parseSenderBlockInput('someone@gmail.com')).toMatchObject({
      status: 'valid',
    });
  });

  it('reports empty and malformed input', () => {
    expect(parseSenderBlockInput('   ')).toEqual({ status: 'empty' });
    expect(parseSenderBlockInput('not a domain')).toEqual({
      status: 'invalid',
    });
    expect(parseSenderBlockInput('team@')).toEqual({ status: 'invalid' });
    expect(parseSenderBlockInput('@localhost')).toEqual({ status: 'invalid' });
  });
});

describe('findSenderBlock', () => {
  const blocks = [
    block('domain', 'domain', 'sepay.vn'),
    block('sub', 'domain', 'mail.sepay.vn'),
    block('address', 'address', 'team@mail.sepay.vn'),
  ];

  it('prefers the address, then the narrowest domain', () => {
    expect(findSenderBlock('Team@Mail.SePay.vn', blocks)?.id).toBe('address');
    expect(findSenderBlock('lan@mail.sepay.vn', blocks)?.id).toBe('sub');
    expect(findSenderBlock('lan@sepay.vn', blocks)?.id).toBe('domain');
  });

  it('does not match lookalike domains or empty senders', () => {
    expect(findSenderBlock('a@notsepay.vn', blocks)).toBeNull();
    expect(findSenderBlock(null, blocks)).toBeNull();
    expect(findSenderBlock('', blocks)).toBeNull();
  });

  it('returns the first blocked sender among several', () => {
    expect(
      findBlockForSenders(['me@tuturuuu.com', 'lan@sepay.vn'], blocks)?.id
    ).toBe('domain');
    expect(findBlockForSenders(['me@tuturuuu.com'], blocks)).toBeNull();
  });
});

describe('senderBlockTarget', () => {
  it('writes domains with a leading @', () => {
    expect(senderBlockTarget({ kind: 'domain', value: 'sepay.vn' })).toBe(
      '@sepay.vn'
    );
    expect(senderBlockTarget({ kind: 'address', value: 'team@sepay.vn' })).toBe(
      'team@sepay.vn'
    );
  });
});
