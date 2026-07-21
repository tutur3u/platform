import { cn } from '@tuturuuu/utils/format';
import type React from 'react';
import Footer from '@/components/layouts/Footer';
import MarketingNavbar from '../marketing-navbar';
import { marketingFontVariables } from './marketing-fonts';
import { ScrollToTop } from './scroll-to-top';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    // Display + mono faces are scoped to marketing so product surfaces keep
    // the app font untouched.
    <div className={cn('contents', marketingFontVariables)}>
      <ScrollToTop />
      <MarketingNavbar />
      {/* pt clears the floating pill navbar (top offset + 3.5rem bar) */}
      <div className="flex flex-col overflow-x-clip pt-20" id="main-content">
        {children}
      </div>
      <Footer />
    </div>
  );
}
