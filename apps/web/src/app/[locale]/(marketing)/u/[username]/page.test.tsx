import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import Page, { generateMetadata } from './page';

const mocks = vi.hoisted(() => ({ read: vi.fn(), connection: vi.fn() }));
vi.mock('@tuturuuu/ui/public-link-button', () => ({
  PublicLinkButton: ({ url }: { url: string | null }) => (
    <output data-public-link={url ?? ''} />
  ),
}));
vi.mock('@tuturuuu/icons', () => ({ UserRound: () => null }));
vi.mock('next/server', () => ({ connection: mocks.connection }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('404');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/lib/public-user-profile', () => ({
  readPublicUserProfile: mocks.read,
  publicProfileImage: (value: string | null) => value || undefined,
}));
beforeEach(() => vi.clearAllMocks());
const props = {
  params: Promise.resolve({ locale: 'en' as const, username: 'creator' }),
};
it('renders only the default public identity and omits private profile values', async () => {
  mocks.read.mockResolvedValue({
    display_name: 'Public Creator',
    avatar_url: 'https://example.com/avatar',
    banner_url: 'https://example.com/banner',
    bio: 'Public biography',
    email: 'private@example.com',
    location: 'Private location',
    id: 'private-id',
  });
  const boundary = Page(props);
  const child = boundary.props.children;
  const html = renderToStaticMarkup(await child.type(child.props));
  expect(html).toContain('https://tuturuuu.com/u/creator');
  expect(html).toContain('Public Creator');
  expect(html).toContain('Public biography');
  expect(html).toContain('https://example.com/avatar');
  expect(html).toContain('https://example.com/banner');
  for (const value of [
    'private@example.com',
    'Private location',
    'private-id',
    '@creator',
  ])
    expect(html).not.toContain(value);
  expect(mocks.connection).toHaveBeenCalled();
  expect(mocks.read).toHaveBeenCalledWith('creator');
});
it('returns not found rather than a placeholder for missing profiles', async () => {
  mocks.read.mockResolvedValue(null);
  const child = Page(props).props.children;
  await expect(child.type(child.props)).rejects.toThrow('404');
});
it('uses public biography in metadata without exposing private account fields', async () => {
  mocks.read.mockResolvedValue({
    display_name: 'Public Creator',
    bio: 'Public biography',
    email: 'private@example.com',
  });
  const metadata = await generateMetadata(props);
  expect(metadata).toEqual({
    title: 'Public Creator',
    description: 'Public biography',
    robots: { index: false, follow: false },
  });
});
