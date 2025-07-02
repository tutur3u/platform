'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { Badge } from '@tuturuuu/ui/badge';
import { FileText, KeyRound, Phone, Smartphone } from '@tuturuuu/ui/icons';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import TOTPDialog from './totp-dialog';

type MFAStatus = 'enabled' | 'disabled' | 'coming-soon';

interface MFAMethod {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: React.ComponentType<any>;
  status: MFAStatus;
  dialog: React.ReactNode;
}

export default function MFAMethodList() {
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const t = useTranslations('settings-account');
  const tCommon = useTranslations('common');

  const defaultMfaMethods: MFAMethod[] = [
    {
      id: 'authenticator',
      titleKey: 'authenticator-app',
      descriptionKey: 'authenticator-app-description',
      icon: Smartphone,
      status: 'disabled',
      dialog: <TOTPDialog />,
    },
    {
      id: 'phone',
      titleKey: 'phone-number',
      descriptionKey: 'phone-number-description',
      icon: Phone,
      status: 'coming-soon',
      dialog: null,
    },
    {
      id: 'security-keys',
      titleKey: 'security-keys',
      descriptionKey: 'security-keys-description',
      icon: KeyRound,
      status: 'coming-soon',
      dialog: null,
    },
    {
      id: 'recovery-codes',
      titleKey: 'recovery-codes',
      descriptionKey: 'recovery-codes-description',
      icon: FileText,
      status: 'coming-soon',
      dialog: null,
    },
  ];

  const [mfaMethods, setMfaMethods] = useState<MFAMethod[]>(defaultMfaMethods);

  useEffect(() => {
    const fetchMFAFactors = async () => {
      try {
        const { data: factorsData, error } =
          await supabase.auth.mfa.listFactors();

        if (error) {
          console.error('Error fetching MFA factors:', error);
          setLoading(false);
          return;
        }

        // Update the authenticator method status based on enrolled factors
        const totpFactor = factorsData?.totp?.find(
          (factor) => factor.status === 'verified'
        );

        setMfaMethods((prev) =>
          prev.map((method) => {
            if (method.id === 'authenticator') {
              return {
                ...method,
                status: totpFactor ? 'enabled' : ('disabled' as MFAStatus),
              };
            }
            return method;
          })
        );
      } catch (error) {
        console.error('Error fetching MFA factors:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMFAFactors();
  }, [supabase.auth]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex animate-pulse items-start gap-3 rounded-lg border p-4 dark:border-gray-700"
          >
            <div className="h-8 w-8 rounded-full bg-gray-200 p-2 dark:bg-gray-700" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/3 rounded bg-gray-200 dark:bg-gray-700" />
              <div className="h-3 w-2/3 rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {mfaMethods.map((method) => {
        const IconComponent = method.icon;

        return (
          <div
            key={method.id}
            className="flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50"
          >
            <div className="rounded-full bg-gray-100 p-2 dark:bg-gray-800">
              <IconComponent className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium">
                    {method.id === 'authenticator' && t('authenticator-app')}
                    {method.id === 'phone' && t('phone-number')}
                    {method.id === 'security-keys' && t('security-keys')}
                    {method.id === 'recovery-codes' && t('recovery-codes')}
                  </h3>
                  {method.status === 'enabled' ? (
                    <Badge
                      variant="secondary"
                      className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    >
                      {tCommon('enabled')}
                    </Badge>
                  ) : method.status === 'disabled' ? (
                    <Badge
                      variant="secondary"
                      className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    >
                      {t('disabled')}
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                    >
                      {t('coming-soon')}
                    </Badge>
                  )}
                </div>

                {method.status !== 'coming-soon' && method.dialog}
              </div>
              <p className="text-xs text-muted-foreground">
                {method.id === 'authenticator' &&
                  t('authenticator-app-description')}
                {method.id === 'phone' && t('phone-number-description')}
                {method.id === 'security-keys' &&
                  t('security-keys-description')}
                {method.id === 'recovery-codes' &&
                  t('recovery-codes-description')}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
