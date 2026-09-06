import { generateKeyPairSync } from 'node:crypto';
import { dkimSign } from 'mailauth/lib/dkim/sign';
import { describe, expect, it } from 'vitest';
import { verifyRawGroupSender } from './authentication';

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const key = publicKey.replace(/-----[^\n]+-----|\s/g, '');
const dns = async () => [[`v=DKIM1; k=rsa; p=${key}`]];
const original =
  'From: Sender <sender@example.com>\r\nTo: group@example.com\r\nSubject: Group test\r\nDate: Sun, 06 Sep 2026 00:00:00 +0000\r\nMessage-ID: <group-test@example.com>\r\n\r\nPrivate member copy\r\n';
async function signed(domain = 'example.com') {
  const result = await dkimSign(Buffer.from(original), {
    signatureData: [{ signingDomain: domain, selector: 'test', privateKey }],
  });
  expect(result.errors).toEqual([]);
  return result.signatures + original;
}

describe('raw group sender authentication', () => {
  it('accepts an intact signature aligned with the actual sender', async () => {
    expect(
      await verifyRawGroupSender(
        Buffer.from(await signed()),
        'sender@example.com',
        dns
      )
    ).toBe(true);
  });
  it('rejects changed content and a mismatched parsed sender', async () => {
    const message = await signed();
    expect(
      await verifyRawGroupSender(
        Buffer.from(message.replace('Private member copy', 'Forged content')),
        'sender@example.com',
        dns
      )
    ).toBe(false);
    expect(
      await verifyRawGroupSender(Buffer.from(message), 'other@example.com', dns)
    ).toBe(false);
  });
  it('rejects an unrelated signing domain', async () => {
    expect(
      await verifyRawGroupSender(
        Buffer.from(await signed('attacker.com')),
        'sender@example.com',
        dns
      )
    ).toBe(false);
  });
  it('does not trust forged Authentication-Results on unsigned mail', async () => {
    const forged = `Authentication-Results: mx.example.com; dkim=pass header.d=example.com\r\n${original}`;
    expect(
      await verifyRawGroupSender(Buffer.from(forged), 'sender@example.com', dns)
    ).toBe(false);
  });
  it('rejects ambiguous From headers', async () => {
    expect(
      await verifyRawGroupSender(
        Buffer.from(`From: intruder@example.com\r\n${await signed()}`),
        'sender@example.com',
        dns
      )
    ).toBe(false);
  });
});
