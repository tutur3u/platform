'use client';

import { ArrowRight, Globe } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { persistLocalePreference } from '@tuturuuu/ui/custom/locale-preference';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';

export default function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{
    locale: string;
  }>;
}) {
  const router = useRouter();
  const { locale } = use(params);

  const [loading, setLoading] = useState(false);

  const updateLocale = () => {
    setLoading(true);
    persistLocalePreference('en');
    router.refresh();
    setLoading(false);
  };

  if (locale === 'vi')
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center gap-4 text-center font-bold text-2xl">
        <div>Bạn cần đổi ngôn ngữ sang tiếng Anh để xem trang này.</div>
        <Button onClick={updateLocale} disabled={loading}>
          {loading ? (
            <LoadingIndicator className="text-background" />
          ) : (
            <>
              <Globe />
              Đổi ngôn ngữ
              <ArrowRight />
            </>
          )}
        </Button>
      </div>
    );

  return children;
}
