import { afterEach, describe, expect, it, vi } from 'vitest';
import FeedbackPage from './page';

const mocks = vi.hoisted(() => ({ user: vi.fn(), connection: vi.fn() }));
vi.mock('@tuturuuu/utils/user-helper', () => ({ getCurrentUser: mocks.user }));
vi.mock('@tuturuuu/utils/common/metadata', () => ({
  NO_INDEX_ROBOTS: { index: false },
}));
vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('./feedback-form', () => ({ FeedbackForm: () => null }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});
describe('Web feedback entry', () => {
  it('opts into request-time identity and requires login before rendering any form', async () => {
    mocks.user.mockResolvedValue(null);
    await expect(FeedbackPage()).rejects.toThrow(
      'REDIRECT:/login?returnUrl=%2Ffeedback'
    );
    expect(mocks.connection).toHaveBeenCalledOnce();
    expect(mocks.connection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.user.mock.invocationCallOrder[0]!
    );
  });
  it('keeps the existing submission flag default off', async () => {
    mocks.user.mockResolvedValue({ id: 'actor-one' });
    vi.stubEnv('PRODUCT_FEEDBACK_SUBMISSION_ENABLED', undefined);
    const page = await FeedbackPage();
    expect(page.props.children[1].type).toBe('p');
    expect(page.props.children[1].props.role).toBe('alert');
  });
  it('renders an actor-keyed form only with explicit intake activation', async () => {
    mocks.user.mockResolvedValue({ id: 'actor-one' });
    vi.stubEnv('PRODUCT_FEEDBACK_SUBMISSION_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'synthetic-public-key');
    const page = await FeedbackPage();
    expect(page.props.children[1].key).toBe('actor-one');
    expect(page.props.children[1].props.siteKey).toBe('synthetic-public-key');
  });
});
