import useTranslation from 'next-translate/useTranslation';
import HeaderX from '../metadata/HeaderX';
import LogoTab from './LogoTab';
import { Button, CopyButton } from '@mantine/core';

const LandingPage = () => {
  const { t } = useTranslation('branding');

  return (
    <>
      <HeaderX label={t('branding')} />
      <div className="mx-4 flex flex-col gap-4 pb-8 pt-24 md:mx-32 lg:mx-64">
        <h1 className="text-4xl font-semibold text-zinc-700 dark:text-zinc-200">
          {t('branding')}
        </h1>

        <section>
          <h1 className="mb-2 text-2xl font-semibold text-zinc-700 dark:text-zinc-200">
            {t('our-logo')}
          </h1>
          <div className="grid gap-4 xl:grid-cols-2">
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
          </div>
        </section>

        <section>
          <h1 className="mb-2 text-2xl font-semibold text-zinc-700 dark:text-zinc-200">
            {t('colors')}
          </h1>

          <div className="grid grid-cols-2 gap-4 text-xl font-bold lg:grid-cols-3 xl:grid-cols-4">
            <CopyButton value="#4180E9">
              {({ copied, copy }) => (
                <Button
                  className="rounded-lg bg-[#4180E9] p-16"
                  onClick={copy}
                  unstyled
                >
                  {copied ? t('common:copied') : '#4180E9'}
                </Button>
              )}
            </CopyButton>
            <CopyButton value="#4ACA3F">
              {({ copied, copy }) => (
                <Button
                  className="rounded-lg bg-[#4ACA3F] p-16"
                  onClick={copy}
                  unstyled
                >
                  {copied ? t('common:copied') : '#4ACA3F'}
                </Button>
              )}
            </CopyButton>
            <CopyButton value="#FB7B05">
              {({ copied, copy }) => (
                <Button
                  className="rounded-lg bg-[#FB7B05] p-16"
                  onClick={copy}
                  unstyled
                >
                  {copied ? t('common:copied') : '#FB7B05'}
                </Button>
              )}
            </CopyButton>
            <CopyButton value="#E94646">
              {({ copied, copy }) => (
                <Button
                  className="rounded-lg bg-[#E94646] p-16"
                  onClick={copy}
                  unstyled
                >
                  {copied ? t('common:copied') : '#E94646'}
                </Button>
              )}
            </CopyButton>
            <CopyButton value="#26292F">
              {({ copied, copy }) => (
                <Button
                  className="rounded-lg bg-[#26292F] p-16"
                  onClick={copy}
                  unstyled
                >
                  {copied ? t('common:copied') : '#26292F'}
                </Button>
              )}
            </CopyButton>
            <CopyButton value="#FFFFFF">
              {({ copied, copy }) => (
                <Button
                  className="rounded-lg bg-[#FFFFFF] p-16 text-[#363636]"
                  onClick={copy}
                  unstyled
                >
                  {copied ? t('common:copied') : '#FFFFFF'}
                </Button>
              )}
            </CopyButton>
            <CopyButton value="#363636">
              {({ copied, copy }) => (
                <Button
                  className="col-span-full rounded-lg bg-[#363636] p-16 xl:col-span-2"
                  onClick={copy}
                  unstyled
                >
                  {copied ? t('common:copied') : '#363636'}
                </Button>
              )}
            </CopyButton>
          </div>
        </section>
      </div>
    </>
  );
};

export default LandingPage;
