import useTranslation from 'next-translate/useTranslation';

const UnderConstructionTag = () => {
  const { t } = useTranslation();
  const label = t('common:underconstruction');

  return (
    <div className="p-4 md:h-screen md:p-8">
      <div className="flex h-full min-h-full w-full items-center justify-center rounded-lg border border-purple-300/20 bg-purple-300/10 p-8 text-center text-2xl font-semibold text-purple-300 md:text-6xl">
        {label} 🚧
      </div>
    </div>
  );
};

export default UnderConstructionTag;
