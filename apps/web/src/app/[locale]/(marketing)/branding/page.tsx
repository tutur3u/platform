import LogoTab from './logo-tab';
import { Separator } from '@repo/ui/components/ui/separator';
import { useTranslations } from 'next-intl';

const LandingPage = () => {
  const t = useTranslations('branding');

  return (
    <div className="mx-4 flex flex-col gap-8 pt-24 md:mx-32 lg:mx-64">
      <div>
        <h1 className="text-4xl font-semibold">{t('branding')}</h1>

        <Separator className="mt-4" />
      </div>

      <section>
        <h1 className="mb-2 text-2xl font-semibold">Tuturuuu</h1>

        <div className="grid gap-4 md:grid-cols-2">
          <LogoTab
            logoImage="/media/logos/dark-rounded.png"
            pngLink="/media/logos/dark-rounded.png"
            alt="Dark logo"
          />
          <LogoTab
            logoImage="/media/logos/light-rounded.png"
            pngLink="/media/logos/light-rounded.png"
            alt="Light logo"
            light
          />
        </div>
      </section>

      <section>
        <h1 className="mb-2 text-2xl font-semibold">Mira AI</h1>

        <div className="grid gap-4 md:grid-cols-2">
          <LogoTab
            logoImage="/media/logos/mira-dark.png"
            pngLink="/media/logos/mira-dark.png"
            alt="Dark logo"
          />
          <LogoTab
            logoImage="/media/logos/mira-light.png"
            pngLink="/media/logos/mira-light.png"
            alt="Light logo"
            light
          />
        </div>
      </section>

      <section className="mb-8">
        <h1 className="mb-2 text-2xl font-semibold">{t('colors')}</h1>

        <div className="grid grid-cols-2 gap-4 font-bold md:text-lg lg:grid-cols-3 xl:grid-cols-4 xl:text-xl">
          <div className="flex h-32 items-center justify-center rounded-lg border bg-[#4180E9] text-white md:h-48">
            #4180E9
          </div>
          <div className="flex h-32 items-center justify-center rounded-lg border bg-[#4ACA3F] text-white md:h-48">
            #4ACA3F
          </div>
          <div className="flex h-32 items-center justify-center rounded-lg border bg-[#FB7B05] text-white md:h-48">
            #FB7B05
          </div>
          <div className="flex h-32 items-center justify-center rounded-lg border bg-[#E94646] text-white md:h-48">
            #E94646
          </div>
          <div className="flex h-32 items-center justify-center rounded-lg border bg-[#09090B] text-white md:h-48">
            #09090B
          </div>
          <div className="flex h-32 items-center justify-center rounded-lg border bg-[#26292F] text-white md:h-48">
            #26292F
          </div>
          <div className="flex h-32 items-center justify-center rounded-lg border bg-[#FFFFFF] text-[#363636] md:h-48">
            #FFFFFF
          </div>
          <div className="flex h-32 items-center justify-center rounded-lg border bg-[#363636] text-white md:h-48">
            #363636
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;
