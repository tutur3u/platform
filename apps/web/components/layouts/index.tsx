import { FC } from "react";
import Navbar from "./Navbar";
import Footer from "./Footer";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: FC<LayoutProps> = ({ children }: LayoutProps) => {
  return (
    <div className="relative">
      <Navbar />
      <div>{children}</div>
      <Footer />
    </div>
  );
};

export default Layout;
