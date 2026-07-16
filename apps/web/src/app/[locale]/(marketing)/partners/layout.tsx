import { createMarketingMetadata } from '@/lib/seo/marketing-metadata';

export const generateMetadata = createMarketingMetadata({
  title: 'Partners',
  description:
    'Collaborating with innovative organizations and communities to create meaningful impact and drive technological advancement together. Explore our partnerships across education, technology, innovation, and entrepreneurship.',
  socialTitle: 'Our Partners',
  socialDescription:
    'Discover our partnerships with leading organizations, student communities, and innovative startups. Together we build technology, foster innovation, and create lasting impact.',
  pathname: '/partners',
});

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return children;
}
