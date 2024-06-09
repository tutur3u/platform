import LogoTab from '@/components/branding/LogoTab';
import { Separator } from '@/components/ui/separator';
import useTranslation from 'next-translate/useTranslation';

const LandingPage = () => {
  const { t } = useTranslation('branding');

  return (
    <div className="mx-4 flex flex-col gap-8 pt-24 md:mx-32 lg:mx-64">
      <div>
        <h1 className="text-4xl font-semibold">{t('branding')}</h1>

        <Separator className="mt-4" />
      </div>

      <section>
        <h1 className="mb-2 text-2xl font-semibold">{t('our-logo')}</h1>

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
        <h1 className="mb-2 text-2xl font-semibold">{t('colors')}</h1>

        <div className="grid grid-cols-2 gap-4 font-bold md:text-lg lg:grid-cols-3 xl:grid-cols-4 xl:text-xl">
          <div className="flex h-32 items-center justify-center rounded-lg bg-[#4180E9] text-white md:h-48">
            #4180E9
          </div>
          <div className="flex h-32 items-center justify-center rounded-lg bg-[#4ACA3F] text-white md:h-48">
            #4ACA3F
          </div>
          <div className="flex h-32 items-center justify-center rounded-lg bg-[#FB7B05] text-white md:h-48">
            #FB7B05
          </div>
          <div className="flex h-32 items-center justify-center rounded-lg bg-[#E94646] text-white md:h-48">
            #E94646
          </div>
          <div className="flex h-32 items-center justify-center rounded-lg bg-[#26292F] text-white md:h-48">
            #26292F
          </div>
          <div className="flex h-32 items-center justify-center rounded-lg bg-[#FFFFFF] text-[#363636] md:h-48">
            #FFFFFF
          </div>
          <div className="col-span-full flex h-32 items-center justify-center rounded-lg bg-[#363636] text-white md:h-48 xl:col-span-2">
            #363636
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
