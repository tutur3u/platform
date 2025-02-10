'use client';

import LoadingIndicator from '@/components/common/LoadingIndicator';
import { Button } from '@tutur3u/ui/components/ui/button';
import { ArrowRight, Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, use, useState } from 'react';

export default function ToolsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}) {
  const router = useRouter();
  const { locale } = use(params);

  const [loading, setLoading] = useState(false);

  const updateLocale = async () => {
    setLoading(true);

    const res = await fetch('/api/v1/infrastructure/languages', {
      method: 'POST',
      body: JSON.stringify({ locale: 'en' }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (res.ok) router.refresh();
  };

  if (locale === 'vi')
    return (
      <>
        <div className="flex h-screen w-full flex-col items-center justify-center gap-4 text-center text-2xl font-bold">
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
      </>
    );

  return children;
}
