import type { ReactNode } from 'react';

export default async function ToolsLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{
    locale: string;
  }>;
}) {
  const { locale } = await params;

  if (locale === 'vi')
    return (
      <div className="flex h-screen w-full items-center justify-center text-center text-2xl font-bold">
        Bạn cần đổi ngôn ngữ sang tiếng Anh để xem trang này.
      </div>
    );

  return children;
}
