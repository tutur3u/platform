import Footer from '@/components/layouts/Footer';
import Navbar from '@/components/layouts/Navbar';

interface LayoutProps {
  params: {
    hideNavbar?: boolean;
    hideFooter?: boolean;
  };
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <>
            <Navbar />
      <div className="min-h-screen">{children}</div>
      <Footer />
    </>
  );
}
