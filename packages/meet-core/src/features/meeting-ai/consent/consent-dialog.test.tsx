import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import messages from '../../../../../../apps/meet/messages/en.json';
import viMessages from '../../../../../../apps/meet/messages/vi.json';
import { TranscriptionConsentDialog } from './consent-dialog';
import { MEET_CONSENT_NOTICE_VERSION } from './notice';
import type { TranscriptionConsent } from './use-transcription-consent';

vi.mock('@tuturuuu/ui/dialog', () => {
  const Pass = ({ children }: { children?: unknown }) => children;
  return {
    Dialog: Pass,
    DialogContent: Pass,
    DialogDescription: Pass,
    DialogFooter: Pass,
    DialogHeader: Pass,
    DialogTitle: Pass,
  };
});

function render(selfDecision: boolean | undefined, outdated = false) {
  const consent = {
    selfDecision,
    outdated,
    decide: { isPending: false, mutate: vi.fn() },
  } as unknown as TranscriptionConsent;
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      <TranscriptionConsentDialog
        consent={consent}
        open
        onOpenChange={() => {}}
        hostName="Linh"
      />
    </NextIntlClientProvider>
  );
}

describe('transcription consent dialog', () => {
  it('offers Stop transcribing me only after the participant allowed', () => {
    const allowed = render(true);
    expect(allowed).toContain('Stop transcribing me');
    expect(allowed).not.toContain('>Allow<');
    for (const decision of [undefined, false]) {
      const markup = render(decision);
      expect(markup).not.toContain('Stop transcribing me');
      expect(markup).toContain('Allow');
      expect(markup).toContain('Don&#x27;t transcribe me');
    }
  });

  it('replaces the choices with a reload when this bundle shows an outdated notice', () => {
    const markup = render(undefined, true);
    expect(markup).toContain('Reload');
    expect(markup).toContain('notice was updated');
    expect(markup).not.toContain('>Allow<');
    expect(markup).not.toContain('Don&#x27;t transcribe me');
  });

  it('names the provider and makes no deletion promise', () => {
    const markup = render(undefined);
    expect(markup).toContain('Google&#x27;s Gemini');
    expect(markup).toContain('people in the call and workspace admins');
    expect(markup).not.toMatch(/deleted after|365|retention settings/);
    expect(markup).toContain('Transcripts are kept until they are deleted');
    for (const bundle of [messages, viMessages])
      expect(JSON.stringify(bundle.meet.consent)).not.toMatch(/365|\{days\}/);
  });

  it('records a final, dated notice version', () => {
    expect(MEET_CONSENT_NOTICE_VERSION).toBe(
      'meet-transcription-v4-2026-10-30'
    );
    expect(MEET_CONSENT_NOTICE_VERSION).not.toContain('draft');
  });
});
