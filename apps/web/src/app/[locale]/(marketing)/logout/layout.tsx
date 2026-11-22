import { SorbetRouteScope } from '@tuturuuu/ui/custom/sorbet-route-scope';
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
  return (
    <>
      {/* Log out shares the Sorbet sign-in design for every visitor. */}
      <SorbetRouteScope />
      {children}
    </>
  );
}
