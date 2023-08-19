// import Footer from "@/components/Footer";
// import Navbar from "@/components/Navbar";

import Footer from '../../components/layouts/Footer';
import Navbar from '../../components/layouts/Navbar';

interface LayoutProps {
  params: {
    hideNavbar?: boolean;
    hideFooter?: boolean;
  };
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="relative w-full">
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
