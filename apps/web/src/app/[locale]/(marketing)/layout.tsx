import { cn } from '@tuturuuu/utils/format';
import type React from 'react';
import Footer from '@/components/layouts/Footer';
import { FontPreloads } from '@/fonts/preloads';
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
      <FontPreloads
        names={[
          'be-vietnam-pro-500-latin',
          'be-vietnam-pro-500-vietnamese',
          'be-vietnam-pro-600-latin',
          'be-vietnam-pro-600-vietnamese',
          'be-vietnam-pro-700-latin',
          'be-vietnam-pro-700-vietnamese',
          'be-vietnam-pro-800-latin',
          'be-vietnam-pro-800-vietnamese',
          'jetbrains-mono',
        ]}
      />
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
