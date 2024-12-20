import { getTranslations } from 'next-intl/server';

export default async function ToolDetailsPage() {
  const t = await getTranslations('common');

  return (
    <div className="flex h-screen w-full items-center justify-center text-2xl font-bold lg:text-4xl xl:text-5xl">
      {t('coming_soon')} ✨
    </div>
  );
}
