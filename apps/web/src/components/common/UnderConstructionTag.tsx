import useTranslation from 'next-translate/useTranslation';

const UnderConstructionTag = () => {
  const { t } = useTranslation();
  const label = t('common:underconstruction');

  return (
    <div className="pb-4 md:h-full md:pb-8">
      <div className="flex h-full min-h-full w-full items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/20 p-8 text-center text-2xl font-semibold text-purple-500 md:text-6xl dark:border-purple-300/20 dark:bg-purple-300/10 dark:text-purple-300">
        {label} 🚧
      </div>
    </div>
  );
};

export default UnderConstructionTag;
