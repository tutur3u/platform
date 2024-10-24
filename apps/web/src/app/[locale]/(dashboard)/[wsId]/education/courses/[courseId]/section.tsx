import { Separator } from '@repo/ui/components/ui/separator';
import { getTranslations } from 'next-intl/server';
import { ReactNode } from 'react';

export default async function CourseSection({
  title,
  icon,
  hideContent,
}: {
  title: string;
  icon: ReactNode;
  hideContent?: boolean;
}) {
  const t = await getTranslations();

  return (
    <div className="bg-foreground/5 border-foreground/10 rounded-lg border p-4">
      <div className="flex items-center gap-2 text-lg font-semibold md:text-2xl">
        {icon}
        {title}
      </div>
      {hideContent || (
        <>
          <Separator className="my-2" />
          <div className="opacity-50">{t('common.no_content_yet')}.</div>
        </>
      )}
    </div>
  );
}
