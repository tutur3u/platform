import useTranslation from 'next-translate/useTranslation';
import Form from './form';

export default async function MarketingPage() {
  const { t } = useTranslation('meet-together');

  return (
    <div className="flex w-full flex-col items-center">
      <div className="text-foreground mt-8 flex max-w-6xl flex-col gap-6 px-3 py-8 lg:gap-14">
        <div className="flex flex-col items-center">
          <p className="mx-auto my-4 max-w-xl text-center text-lg font-semibold !leading-tight md:mb-4 md:text-2xl lg:text-3xl">
            {t('headline-p1')}{' '}
            <span className="bg-gradient-to-r from-pink-500 via-yellow-500 to-sky-600 bg-clip-text text-transparent dark:from-pink-300 dark:via-amber-300 dark:to-blue-300">
              {t('headline-p2')}
            </span>
            .
          </p>
        </div>
      </div>

      <Form />

      {/* <Separator className="mb-4 mt-8 md:mt-16" />

      <div className="text-foreground flex flex-col gap-8">
        <h2 className="text-center font-bold md:text-lg">Your plans</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="border-foreground/20 hover:border-foreground group relative flex flex-col rounded-lg border p-6">
            <h3 className="min-h-[40px] font-bold">Feature 1</h3>
            <div className="flex grow flex-col justify-between gap-4">
              <p className="text-sm opacity-80">Feature 1 description</p>
              <div className="opacity-60 group-hover:opacity-100">Icon 1</div>
            </div>
          </div>
          <div className="border-foreground/20 hover:border-foreground group relative flex flex-col rounded-lg border p-6">
            <h3 className="min-h-[40px] font-bold">Feature 2</h3>
            <div className="flex grow flex-col justify-between gap-4">
              <p className="text-sm opacity-80">Feature 2 description</p>
              <div className="opacity-60 group-hover:opacity-100">Icon 2</div>
            </div>
          </div>
          <div className="border-foreground/20 hover:border-foreground group relative flex flex-col rounded-lg border p-6">
            <h3 className="min-h-[40px] font-bold">Feature 3</h3>
            <div className="flex grow flex-col justify-between gap-4">
              <p className="text-sm opacity-80">Feature 3 description</p>
              <div className="opacity-60 group-hover:opacity-100">Icon 3</div>
            </div>
          </div>
        </div>
      </div> */}
    </div>
  );
}
