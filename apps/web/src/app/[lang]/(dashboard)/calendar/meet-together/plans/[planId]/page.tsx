import useTranslation from 'next-translate/useTranslation';
import Link from 'next/link';

const UnderConstructionTag = () => {
  const { t } = useTranslation();
  const label = t('common:underconstruction');

  return (
    <div className="h-screen p-4 pb-20 md:p-32 md:pb-40">
      <div className="flex h-full min-h-full w-full flex-col items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/20 p-8 text-center text-xl font-semibold text-purple-500 md:text-4xl lg:text-6xl dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300">
        {label} 🚧
        <Link
          href="/calendar/meet-together"
          className="mt-4 rounded-lg border-2 border-purple-600/50 p-2 text-center text-base font-semibold hover:bg-purple-600 hover:text-white dark:border-purple-300/30 dark:hover:bg-purple-300 dark:hover:text-purple-800"
        >
          Back to Meet Together
        </Link>
      </div>
    </div>
  );
};

export default UnderConstructionTag;
