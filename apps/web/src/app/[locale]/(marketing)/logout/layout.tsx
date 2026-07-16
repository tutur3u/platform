import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Log Out',
  description: 'Log out of your Tuturuuu account.',
  indexable: false,
  pathname: '/logout',
});

export default function LogoutLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
