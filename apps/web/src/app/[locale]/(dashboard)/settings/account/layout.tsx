import SettingsNav from './settings-nav';
import { getTranslations } from 'next-intl/server';

interface AccountLayoutProps {
  children: React.ReactNode;
}

export default async function AccountLayout({ children }: AccountLayoutProps) {
  const t = await getTranslations('settings-account');

  return (
    <div className="w-full">
      {/* Header */}
      <div className="mb-8 space-y-1 md:space-y-3">
        <h1 className="text-lg font-bold tracking-tight text-foreground md:text-3xl">
          {t('account')}
        </h1>
        <p className="max-w-2xl text-sm text-foreground/70 md:text-lg">
          {t('page-description')}
        </p>
      </div>

      {/* Layout with enhanced sidebar navigation */}
      <div className="flex w-full flex-col gap-8 md:flex-row">
        {/* Enhanced Navigation Sidebar */}
        <div className="w-full md:w-96">
          <div className="sticky top-20">
            <div className="mb-4">
              <h2 className="text-sm font-semibold tracking-wide text-foreground/80 uppercase">
                {t('account-settings')}
              </h2>
            </div>
            <SettingsNav className="grid gap-2" />
          </div>
        </div>

        {/* Main Content */}
        <div className="w-full">{children}</div>
      </div>
    </div>
  );
}
