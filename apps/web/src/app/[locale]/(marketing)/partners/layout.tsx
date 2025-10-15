import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Partners',
  description:
    'Collaborating with innovative organizations and communities to create meaningful impact and drive technological advancement together. Explore our partnerships across education, technology, innovation, and entrepreneurship.',
  openGraph: {
    title: 'Our Partners',
    description:
      'Discover our partnerships with leading organizations, student communities, and innovative startups. Together we build technology, foster innovation, and create lasting impact.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Our Partners',
    description:
      'Collaborating with innovative organizations to create meaningful impact and drive technological advancement together.',
  },
};

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return children;
}
