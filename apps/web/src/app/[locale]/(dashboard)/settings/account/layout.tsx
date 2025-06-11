import { SettingsNav } from './components';
import { getTranslations } from 'next-intl/server';

interface AccountLayoutProps {
  children: React.ReactNode;
}

export default async function AccountLayout({ children }: AccountLayoutProps) {
  const t = await getTranslations('settings-account');

  return (
    <div className="container mx-auto max-w-7xl p-6">
      {/* Header */}
      <div className="mb-8 space-y-3">
        <h1 className="text-dynamic-foreground text-3xl font-bold tracking-tight">
          {t('account')}
        </h1>
        <p className="max-w-2xl text-lg text-foreground/70">
          {t('page-description')}
        </p>
      </div>

      {/* Layout with enhanced sidebar navigation */}
      <div className="flex flex-col gap-8 md:flex-row">
        {/* Enhanced Navigation Sidebar */}
        <div className="w-96">
          <div className="sticky top-6">
            <div className="mb-4">
              <h2 className="text-dynamic-foreground/80 text-sm font-semibold tracking-wide uppercase">
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
