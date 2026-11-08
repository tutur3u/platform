import { describe, expect, it } from 'vitest';
import {
  buildDnsPlan,
  createHighEntropyToken,
  decideStaffTestSend,
  describeSendingGate,
  dnsRecordsForStorage,
  hashToken,
  NEWSLETTER_DAILY_CAP,
  NewsletterGateError,
  normalizeLocalPart,
  normalizeSendingSubdomain,
  normalizeStaffMessage,
  normalizeSubscriberEmail,
  ownershipDnsRecord,
  type SesIdentitySnapshot,
  UNSUBSCRIBE_TOKEN_PATTERN,
} from './domain';

const readyDomain = {
  approval: 'approved' as const,
  dkimVerified: true,
  mailFromVerified: true,
  subdomain: 'news.example.com',
  txtVerified: true,
};

const readySender = { approval: 'approved' as const, localPart: 'news' };

function ses(overrides: Partial<SesIdentitySnapshot> = {}): SesIdentitySnapshot {
  return {
    dkimTokens: ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'],
    dkimVerified: true,
    mailFromDomain: 'bounce.news.example.com',
    mailFromVerified: true,
    mxHost: 'feedback-smtp.us-east-1.amazonses.com',
    mxPriority: 10,
    ownershipTxtVerified: true,
    spfValue: 'v=spf1 include:amazonses.com ~all',
    ...overrides,
  };
}

function refused(
  overrides: Partial<Parameters<typeof decideStaffTestSend>[0]> = {}
) {
  const result = decision(overrides);
  if (result.ok) throw new Error('expected a refusal');
  return result.code;
}

function decision(
  overrides: Partial<Parameters<typeof decideStaffTestSend>[0]> = {}
) {
  return decideStaffTestSend({
    acceptedToday: 0,
    actorEmail: 'ada@example.com',
    domain: readyDomain,
    flagEnabled: true,
    localPart: 'news',
    recipient: 'ada@example.com',
    sender: readySender,
    ...overrides,
  });
}

describe('normalizeSendingSubdomain', () => {
  it('accepts a customer subdomain and strips one trailing dot', () => {
    expect(normalizeSendingSubdomain(' News.Example.COM. ')).toBe(
      'news.example.com'
    );
    expect(normalizeSendingSubdomain('a.b.co.uk')).toBe('a.b.co.uk');
    expect(normalizeSendingSubdomain('news.example.co.uk')).toBe(
      'news.example.co.uk'
    );
  });

  it('refuses apex names, public suffixes, platform names, and locals', () => {
    expect(() => normalizeSendingSubdomain('example.com')).toThrow(
      expect.objectContaining({ code: 'apex_domain' })
    );
    expect(() => normalizeSendingSubdomain('example.co.uk')).toThrow(
      expect.objectContaining({ code: 'apex_domain' })
    );
    expect(() => normalizeSendingSubdomain('news.co.uk')).toThrow(
      expect.objectContaining({ code: 'apex_domain' })
    );
    expect(() => normalizeSendingSubdomain('foo.github.io')).toThrow(
      expect.objectContaining({ code: 'apex_domain' })
    );
    expect(() => normalizeSendingSubdomain('co.uk')).toThrow(
      expect.objectContaining({ code: 'public_suffix' })
    );
    expect(() => normalizeSendingSubdomain('blogspot.com')).toThrow(
      expect.objectContaining({ code: 'public_suffix' })
    );
    expect(() => normalizeSendingSubdomain('news.tuturuuu.com')).toThrow(
      expect.objectContaining({ code: 'platform_domain' })
    );
    expect(() => normalizeSendingSubdomain('tuturuuu.com')).toThrow(
      expect.objectContaining({ code: 'platform_domain' })
    );
    expect(() => normalizeSendingSubdomain('*.example.com')).toThrow(
      expect.objectContaining({ code: 'wildcard' })
    );
    expect(() => normalizeSendingSubdomain('127.0.0.1')).toThrow(
      expect.objectContaining({ code: 'ip_address' })
    );
    expect(() => normalizeSendingSubdomain('::1')).toThrow(
      expect.objectContaining({ code: 'ip_address' })
    );
    expect(() => normalizeSendingSubdomain('foo.localhost')).toThrow(
      expect.objectContaining({ code: 'localhost' })
    );
    expect(() => normalizeSendingSubdomain('xn--news.example.com')).toThrow(
      expect.objectContaining({ code: 'invalid_subdomain' })
    );
  });
});

describe('local part and message', () => {
  it('allows a normal local part and denies role accounts', () => {
    expect(normalizeLocalPart(' News ')).toBe('news');
    for (const denied of [
      'postmaster',
      'abuse',
      'admin',
      'root',
      'security',
      'hostmaster',
      'webmaster',
      'support',
    ]) {
      expect(() => normalizeLocalPart(denied)).toThrow(
        expect.objectContaining({ code: 'local_part_denied' })
      );
    }
    expect(() => normalizeLocalPart('a'.repeat(33))).toThrow(
      expect.objectContaining({ code: 'invalid_local_part' })
    );
  });

  it('strips header breaks from the subject and caps the body', () => {
    expect(normalizeStaffMessage('Hello\r\nthere', 'Body')).toEqual({
      subject: 'Hello there',
      text: 'Body',
    });
    expect(() => normalizeStaffMessage(' ', 'Body')).toThrow(
      expect.objectContaining({ code: 'invalid_message' })
    );
    expect(normalizeSubscriberEmail(' Ada@Example.com ')).toBe(
      'ada@example.com'
    );
  });
});

describe('dns plan', () => {
  it('builds SES records and stores the ownership value as null', () => {
    const token = createHighEntropyToken();
    const records = buildDnsPlan('news.example.com', token, ses());
    expect(records.map((record) => record.purpose)).toEqual([
      'ownership',
      'dkim',
      'dkim',
      'dkim',
      'mail_from_spf',
      'mail_from_mx',
    ]);
    expect(records[0]).toMatchObject({
      host: '_tuturuuu-verify.news.example.com',
      type: 'TXT',
      value: token,
    });
    expect(records[1]).toMatchObject({
      host: 'aaaaaaaa._domainkey.news.example.com',
      type: 'CNAME',
      value: 'aaaaaaaa.dkim.amazonses.com',
    });
    const stored = dnsRecordsForStorage(records, token, hashToken(token));
    expect(stored[0]?.value).toBeNull();
    expect(JSON.stringify(stored).includes(token)).toBe(false);
  });

  it('rejects a mail-from name that is not a direct child', () => {
    expect(() =>
      buildDnsPlan(
        'news.example.com',
        createHighEntropyToken(),
        ses({ mailFromDomain: 'news.example.com' })
      )
    ).toThrow(expect.objectContaining({ code: 'ses_records' }));
    expect(() =>
      buildDnsPlan(
        'news.example.com',
        createHighEntropyToken(),
        ses({ mxHost: 'mail.example.com' })
      )
    ).toThrow(expect.objectContaining({ code: 'ses_records' }));
    expect(() =>
      ownershipDnsRecord('example.com', createHighEntropyToken())
    ).toThrow(expect.objectContaining({ code: 'apex_domain' }));
  });
});

describe('staff test decision', () => {
  it('allows one actor recipient under the cap', () => {
    expect(decision()).toEqual({
      from: 'news@news.example.com',
      ok: true,
    });
    expect(decision({ recipient: 'Ada@Example.com' }).ok).toBe(true);
  });

  it('checks the flag, domain, sender, recipient, and cap in that order', () => {
    expect(refused({ acceptedToday: 10, flagEnabled: false })).toBe(
      'flag_disabled'
    );
    expect(refused({ localPart: 'admin' })).toBe('local_part_denied');
    expect(refused({ domain: null })).toBe('domain_missing');
    expect(
      refused({ domain: { ...readyDomain, approval: 'suspended' } })
    ).toBe('domain_suspended');
    expect(refused({ domain: { ...readyDomain, approval: 'pending' } })).toBe(
      'domain_not_approved'
    );
    expect(refused({ domain: { ...readyDomain, txtVerified: false } })).toBe(
      'domain_unverified'
    );
    expect(refused({ sender: null })).toBe('sender_missing');
    expect(refused({ sender: { ...readySender, approval: 'pending' } })).toBe(
      'sender_not_approved'
    );
    expect(refused({ recipient: 'other@example.com' })).toBe(
      'recipient_not_actor'
    );
    expect(
      refused({ recipient: 'ada@example.com,other@example.com' })
    ).toBe('not_one_recipient');
    expect(refused({ acceptedToday: NEWSLETTER_DAILY_CAP })).toBe('daily_cap');
    expect(decision({ acceptedToday: NEWSLETTER_DAILY_CAP - 1 }).ok).toBe(true);
  });

  it('describes the settings gate without a recipient or a cap', () => {
    expect(
      describeSendingGate({
        domain: readyDomain,
        flagEnabled: true,
        senders: [readySender],
      })
    ).toEqual({ allowed: true, code: null });
    expect(
      describeSendingGate({
        domain: readyDomain,
        flagEnabled: false,
        senders: [readySender],
      }).code
    ).toBe('flag_disabled');
    expect(
      describeSendingGate({
        domain: readyDomain,
        flagEnabled: true,
        senders: [],
      }).code
    ).toBe('sender_missing');
  });
});

describe('unsubscribe token', () => {
  it('returns a high-entropy token and stores only its hash', () => {
    const token = createHighEntropyToken();
    const digest = hashToken(token);
    expect(token).toMatch(UNSUBSCRIBE_TOKEN_PATTERN);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toBe(token);
    expect(new NewsletterGateError('invalid_token').code).toBe('invalid_token');
  });
});
