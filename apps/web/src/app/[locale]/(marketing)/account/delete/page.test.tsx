import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import enMessages from '../../../../../../messages/en.json';

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  createClient: vi.fn(),
  getUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
}));
vi.mock('./delete-account-flow', () => ({
  default: () => <div data-testid="delete-account-flow" />,
}));
vi.mock('next-intl/server', () => {
  const messages = enMessages['account-deletion-public'] as Record<
    string,
    string
  >;
  const t = (key: string) => messages[key] ?? key;
  t.rich = (key: string, tags: Record<string, (chunks: string) => unknown>) => {
    const text = messages[key] ?? key;
    return text.split(/(<\w+>[^<]*<\/\w+>)/).map((part) => {
      const match = part.match(/^<(\w+)>([^<]*)<\/\1>$/);
      return match ? tags[match[1]!]!(match[2]!) : part;
    });
  };
  return { getTranslations: vi.fn(async () => t) };
});

import DeleteAccountFlow from './delete-account-flow';
import { AccountDeleteRuntime } from './page';
import PublicAccountDeletion, {
  ACCOUNT_DELETE_LOGIN_HREF,
} from './public-account-deletion';

describe('account deletion page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
    });
  });

  it('renders the public explanation for a signed-out request without redirecting', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const element = await AccountDeleteRuntime();

    expect(mocks.connection).toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(element.type).toBe(PublicAccountDeletion);
  });

  it('keeps signed-in visitors on the existing deletion flow', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const element = await AccountDeleteRuntime();

    expect(element.type).toBe(DeleteAccountFlow);
  });

  it('shows the name, steps, retention facts and a fixed sign-in return', async () => {
    const html = renderToStaticMarkup(await PublicAccountDeletion());
    const copy = enMessages['account-deletion-public'];

    expect(html).toContain(copy.title);
    expect(html).toContain('Tuturuuu JSC');
    for (const key of [
      'step-sign-in',
      'step-subscriptions',
      'step-confirm',
      'deleted-sign-in',
      'kept-profile',
      'kept-backups',
      'kept-ai-metadata',
    ] as const) {
      expect(html).toContain(copy[key].replaceAll("'", '&#x27;'));
    }
    expect(ACCOUNT_DELETE_LOGIN_HREF).toBe('/login?nextUrl=/account/delete');
    expect(html).toContain(
      `href="${ACCOUNT_DELETE_LOGIN_HREF.replaceAll('&', '&amp;')}"`
    );
    expect(html).toContain('href="mailto:privacy@tuturuuu.com"');
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
