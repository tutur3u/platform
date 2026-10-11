import { describe, expect, it } from 'vitest';
import { connectedReplyDraft } from './connected-mail-reply';

const message = {
  id: 'id',
  from: 'sender@example.test',
  subject: 'Hello',
  date: '',
  unread: false,
  starred: false,
  text: 'Original',
  replyTo: ['support@example.test', 'team@example.test'],
  to: ['me@example.test', 'other@example.test'],
  cc: ['OTHER@example.test', 'cc@example.test'],
};
describe('connected reply and forward', () => {
  it('honors all Reply-To addresses and preserves To/Cc roles without duplicates', () => {
    expect(
      connectedReplyDraft(message, 'ME@example.test', 'reply_all')
    ).toMatchObject({
      to: ['support@example.test', 'team@example.test', 'other@example.test'],
      cc: ['cc@example.test'],
      subject: 'Re: Hello',
    });
  });
  it('continues sent conversations with the original recipients', () => {
    expect(
      connectedReplyDraft(
        { ...message, from: 'me@example.test' },
        'me@example.test',
        'reply'
      )
    ).toMatchObject({ to: ['other@example.test'], cc: [] });
  });
  it('forward starts with empty recipients and does not add a reply prefix', () => {
    expect(
      connectedReplyDraft(message, 'me@example.test', 'forward')
    ).toMatchObject({ to: [], cc: [], subject: 'Fwd: Hello' });
  });
});
