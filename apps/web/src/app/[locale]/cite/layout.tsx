import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import Footer from '@/components/layouts/Footer';
import { supportedLocales } from '@/i18n/routing';
import { marketingFontVariables } from '../(marketing)/marketing-fonts';
import MarketingNavbar from '../marketing-navbar';

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

/** Public tool shell: the marketing navbar and footer around one task page. */
export default function CiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className={cn('contents', marketingFontVariables)}>
      <MarketingNavbar />
      {/* pt clears the floating pill navbar (top offset + 3.5rem bar) */}
      <div className="flex flex-col overflow-x-clip pt-20" id="main-content">
        {children}
      </div>
      <Footer />
    </div>
  );
}
