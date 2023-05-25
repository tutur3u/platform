import useTranslation from 'next-translate/useTranslation';
import HeaderX from '../metadata/HeaderX';
import LogoTab from './LogoTab';

const LandingPage = () => {
  const { t } = useTranslation('branding');
  return (
    <>
      <HeaderX label={t('branding')} />
      <div className="mx-4 mb-8 mt-24 flex flex-col gap-9 md:mx-32 lg:mx-64">
        <h1 className="text-4xl font-semibold text-zinc-700 dark:text-zinc-200 xl:text-5xl">
          {t('branding')}
        </h1>
        <section>
          <div>
            <h1 className="mb-5 text-2xl font-semibold text-zinc-700 dark:text-zinc-200 xl:text-3xl">
              {t('our-logo')}
            </h1>
            <div className="grid grid-cols-2 gap-12 sm:grid-cols-2 md:grid-cols-3 lg:gap-8 xl:grid-cols-4">
              <LogoTab
                logoImage="/media/official-logos/dark-logo.svg"
                alt="Dark logo"
                pngLink="/media/official-logos/dark-logo.png"
                svgLink="/media/official-logos/dark-logo.svg"
                light={false}
              />
              <LogoTab
                logoImage="/media/official-logos/light-logo.svg"
                alt="Light logo"
                pngLink="/media/official-logos/light-logo.png"
                svgLink="/media/official-logos/light-logo.svg"
                light={true}
              />
              <LogoTab
                logoImage="/media/official-logos/dark-logo-mono.svg"
                alt="Dark logo mono"
                pngLink="/media/official-logos/dark-logo-mono.png"
                svgLink="/media/official-logos/dark-logo-mono.svg"
                light={false}
              />
              <LogoTab
                logoImage="/media/official-logos/light-logo-mono.svg"
                alt="Light logo mono"
                pngLink="/media/official-logos/light-logo-mono.png"
                svgLink="/media/official-logos/light-logo-mono.svg"
                light={true}
              />
            </div>
          </div>
        </section>

        <section>
          <div className="">
            <h1 className="mb-5 text-2xl font-semibold text-zinc-700 dark:text-zinc-200 xl:text-3xl">
              {t('colors')}
            </h1>
            <div className="grid grid-cols-2 gap-6 xl:grid-cols-3">
              <div className="h-44 rounded-xl bg-[#4180E9] p-3 text-xl font-bold">
                #4180E9
              </div>
              <div className="h-44 rounded-xl bg-[#4ACA3F] p-3 text-xl font-bold text-[#26292F]">
                #4ACA3F
              </div>
              <div className="h-44 rounded-xl bg-[#FB7B05] p-3 text-xl font-bold text-[#26292F]">
                #FB7B05
              </div>
              <div className="h-44 rounded-xl bg-[#E94646] p-3 text-xl font-bold">
                #E94646
              </div>
              <div className="h-44 rounded-xl bg-[#26292F] p-3 text-xl font-bold">
                #26292F
              </div>
              <div className="h-44 rounded-xl bg-[#FFFFFF] p-3 text-xl font-bold text-[#363636]">
                #FFFFFF
              </div>
              <div className="h-44 rounded-xl bg-[#363636] p-3 text-xl font-bold">
                #363636
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
};

export default LandingPage;
