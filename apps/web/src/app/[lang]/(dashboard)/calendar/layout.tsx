import Footer from '@/components/layouts/Footer';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function Layout({ children }: LayoutProps) {
  return (
    <>
      {children}
      <Footer />
    </>
  );
}
