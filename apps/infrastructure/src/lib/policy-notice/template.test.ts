import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SESEmailProvider } from '@tuturuuu/email-service/providers/ses';
import { describe, expect, it } from 'vitest';
import { POLICY_CHANGE_NOTICE } from './definition';
import {
  POLICY_NOTICE_ALLOWED_LINKS,
  POLICY_NOTICE_FOOTER_EN,
  POLICY_NOTICE_FOOTER_VI,
  POLICY_NOTICE_HTML,
  POLICY_NOTICE_SUBJECT,
  POLICY_NOTICE_TEXT,
} from './template';

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, '__fixtures__', name), 'utf8');
// Cora's final v4 wording, byte-for-byte (sha256 fdf906d0… and 119d9f48…).
const V4_HTML = fixture('notice-v4.html.txt');
const V4_TEXT = fixture('notice-v4.txt');
const VI_CONTACT =
  'Câu hỏi và yêu cầu về quyền riêng tư: legal@tuturuuu.com · 1900 1509';
const EN_CONTACT =
  'Questions and privacy requests: legal@tuturuuu.com · 1900 1509';

function parse(html: string) {
  return new DOMParser().parseFromString(html, 'text/html');
}

// Text a reader can see: the body only, so <title> and <style> never count.
function visibleText(html: string) {
  return (parse(html).body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function hrefs(html: string) {
  return [...parse(html).querySelectorAll('a')].map(
    (a) => a.getAttribute('href') ?? ''
  );
}

// The exact production transform: the SES provider's sanitizer, CSS inliner
// and SendEmail command, with the network client replaced by a recorder.
async function sendThroughSesProvider() {
  const provider = new SESEmailProvider({
    type: 'ses',
    region: 'us-east-1',
    accessKeyId: 'fixture-access-key',
    secretAccessKey: 'fixture-secret',
  });
  const commands: unknown[] = [];
  Reflect.set(provider, 'sendClient', {
    send: async (command: { input: unknown }) => {
      commands.push(command.input);
      return { $metadata: { httpStatusCode: 200 }, MessageId: 'fixture-id' };
    },
  });
  const result = await provider.send({
    source: '"Tuturuuu" <notice@example.com>',
    recipients: { to: ['recipient@example.com'] },
    content: {
      subject: POLICY_NOTICE_SUBJECT,
      html: POLICY_NOTICE_HTML,
      text: POLICY_NOTICE_TEXT,
      replyTo: POLICY_CHANGE_NOTICE.replyTo,
    },
  });
  expect(result.success).toBe(true);
  expect(commands).toHaveLength(1);
  const input = commands[0] as {
    Message: {
      Subject: { Data: string };
      Body: { Html?: { Data: string }; Text?: { Data: string } };
    };
    ReplyToAddresses?: string[];
  };
  return {
    html: input.Message.Body.Html?.Data ?? '',
    text: input.Message.Body.Text?.Data ?? '',
    subject: input.Message.Subject.Data,
    replyTo: input.ReplyToAddresses,
  };
}

describe('policy notice template (v4 wording)', () => {
  it('uses inline styles only: no <style>, classes, role, lang or comments', () => {
    expect(POLICY_NOTICE_HTML).not.toMatch(/<style|<head|<meta|<title/i);
    expect(POLICY_NOTICE_HTML).not.toMatch(/\sclass=|\srole=|\slang=/i);
    expect(POLICY_NOTICE_HTML).not.toContain('<!--');
  });

  it('loses nothing meaningful through the SES sending transform', async () => {
    const sent = await sendThroughSesProvider();

    expect(visibleText(sent.html)).toBe(visibleText(POLICY_NOTICE_HTML));
    expect(hrefs(sent.html)).toEqual(hrefs(POLICY_NOTICE_HTML));
    expect(sent.html.match(/\sstyle="/g)?.length).toBe(
      POLICY_NOTICE_HTML.match(/\sstyle="/g)?.length
    );
    expect(sent.html).not.toMatch(/<style|\sclass=|tel:/i);
  });

  it('sends multipart HTML and the exact text part', async () => {
    const sent = await sendThroughSesProvider();

    expect(sent.html.length).toBeGreaterThan(0);
    expect(sent.text).toBe(POLICY_NOTICE_TEXT);
    expect(sent.subject).toBe(POLICY_NOTICE_SUBJECT);
  });

  it('replies to legal@tuturuuu.com', async () => {
    const sent = await sendThroughSesProvider();

    expect(POLICY_CHANGE_NOTICE.replyTo).toEqual(['legal@tuturuuu.com']);
    expect(sent.replyTo).toEqual(['legal@tuturuuu.com']);
  });

  it('shows the phone number as plain text, never a tel: link', async () => {
    const sent = await sendThroughSesProvider();
    const doc = parse(sent.html);

    expect(sent.html).not.toContain('tel:');
    expect(doc.body.textContent).toContain('1900 1509');
    for (const anchor of doc.querySelectorAll('a')) {
      expect(anchor.textContent).not.toContain('1900 1509');
    }
    expect(POLICY_NOTICE_TEXT).toContain('1900 1509');
  });

  it('links only to the allowlisted legal pages and contacts', async () => {
    const sent = await sendThroughSesProvider();
    const links = hrefs(sent.html);

    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(POLICY_NOTICE_ALLOWED_LINKS).toContain(link);
      expect(link).toMatch(/^(https:|mailto:)/);
    }
    for (const url of POLICY_NOTICE_TEXT.match(/https?:\/\/\S+/g) ?? []) {
      expect(POLICY_NOTICE_ALLOWED_LINKS).toContain(url);
    }
  });

  it('has no images, tracking pixels, remote CSS or click rewriting', async () => {
    const sent = await sendThroughSesProvider();
    const doc = parse(sent.html);

    expect(doc.querySelectorAll('img, picture, video, iframe')).toHaveLength(0);
    expect(sent.html).not.toMatch(/url\(|background-image|<link/i);
    expect(sent.html).not.toMatch(/utm_|[?&](?:ref|click|track)/i);
  });

  it('is a pure service notice: no [QC]/[ADV] label', () => {
    for (const part of [
      POLICY_NOTICE_SUBJECT,
      POLICY_NOTICE_HTML,
      POLICY_NOTICE_TEXT,
    ]) {
      expect(part).not.toMatch(/\[(?:QC|ADV)\]/i);
    }
  });

  it('adds the service-notice footer after each contact line, in both parts', () => {
    const html = visibleText(POLICY_NOTICE_HTML);
    expect(html.indexOf(POLICY_NOTICE_FOOTER_VI)).toBeGreaterThan(
      html.indexOf(VI_CONTACT)
    );
    expect(html.indexOf(POLICY_NOTICE_FOOTER_EN)).toBeGreaterThan(
      html.indexOf(EN_CONTACT)
    );
    expect(POLICY_NOTICE_TEXT).toContain(
      `${VI_CONTACT}\n\n${POLICY_NOTICE_FOOTER_VI}\n`
    );
    expect(POLICY_NOTICE_TEXT).toContain(
      `${EN_CONTACT}\n\n${POLICY_NOTICE_FOOTER_EN}\n`
    );
  });

  it('keeps the v4 wording exactly, apart from the listed robustness changes', () => {
    expect(visibleText(POLICY_NOTICE_HTML)).toBe(visibleText(V4_HTML));
    // Same links minus tel:, which became plain text.
    expect(hrefs(POLICY_NOTICE_HTML)).toEqual(
      hrefs(V4_HTML).filter((href) => !href.startsWith('tel:'))
    );
    expect(POLICY_NOTICE_SUBJECT).toBe(parse(V4_HTML).title);
    expect(POLICY_NOTICE_TEXT).toBe(V4_TEXT);
    expect(POLICY_NOTICE_FOOTER_VI).toBe(
      'Đây là email thông báo về thay đổi Điều khoản và Chính sách quyền riêng tư của Tuturuuu, không phải email quảng cáo.'
    );
    expect(POLICY_NOTICE_FOOTER_EN).toBe(
      "This is a service notice about changes to Tuturuuu's Terms and Privacy Policy, not a marketing email."
    );
  });
});
