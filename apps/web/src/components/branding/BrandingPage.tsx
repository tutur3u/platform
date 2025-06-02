import LogoTab from './LogoTab';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

const LandingPage = () => {
  const t = useTranslations('branding');

  return (
    <>
      <div className="mx-4 flex flex-col gap-8 pt-24 md:mx-32 lg:mx-64">
        <div>
          <h1 className="text-4xl font-semibold text-zinc-700 dark:text-zinc-200">
            {t('branding')}
          </h1>

          {/* <Divider variant="dashed" className="mt-4" /> */}
        </div>

        <section>
          <h1 className="mb-2 text-2xl font-semibold text-zinc-700 dark:text-zinc-200">
            {t('our-logo')}
          </h1>

          <div className="grid gap-4 xl:grid-cols-2">
            <LogoTab
              logoImage="/media/official-logos/dark-logo.svg"
              pngLink="/media/official-logos/dark-logo.png"
              svgLink="/media/official-logos/dark-logo.svg"
              alt="Dark logo"
            />
            <LogoTab
              logoImage="/media/official-logos/light-logo.svg"
              pngLink="/media/official-logos/light-logo.png"
              svgLink="/media/official-logos/light-logo.svg"
              alt="Light logo"
              light
            />
          </div>
        </section>

        <section>
          <h1 className="mb-2 text-2xl font-semibold text-zinc-700 dark:text-zinc-200">
            {t('colors')}
          </h1>

          <div className="grid grid-cols-2 gap-4 font-bold md:text-lg lg:grid-cols-3 xl:grid-cols-4 xl:text-xl">
            <Button className="flex h-32 items-center justify-center rounded-lg bg-[#4180E9] md:h-48">
              #4180E9
            </Button>

            <Button className="flex h-32 items-center justify-center rounded-lg bg-[#4ACA3F] md:h-48">
              #4ACA3F
            </Button>

            <Button className="flex h-32 items-center justify-center rounded-lg bg-[#FB7B05] md:h-48">
              #FB7B05
            </Button>

            <Button className="flex h-32 items-center justify-center rounded-lg bg-[#E94646] md:h-48">
              #E94646
            </Button>

            <Button className="flex h-32 items-center justify-center rounded-lg bg-[#26292F] md:h-48">
              #26292F
            </Button>

            <Button className="flex h-32 items-center justify-center rounded-lg bg-[#FFFFFF] text-[#363636] md:h-48">
              #FFFFFF
            </Button>

            <Button className="col-span-full flex h-32 items-center justify-center rounded-lg bg-[#363636] md:h-48 xl:col-span-2">
              #363636
            </Button>
          </div>
        </section>
      </div>
    </>
  );
};

export default LandingPage;
