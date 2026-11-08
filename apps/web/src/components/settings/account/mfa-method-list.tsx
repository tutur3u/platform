'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText, KeyRound, Phone, Smartphone } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSectionBlock } from '@tuturuuu/ui/custom/settings-section';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import TOTPDialog from './totp-dialog';

type MFAStatus = 'enabled' | 'disabled' | 'coming-soon';
type MFAMessageKey =
  | 'authenticator-app'
  | 'phone-number'
  | 'security-keys'
  | 'recovery-codes';

interface MFAMethod {
  id: string;
  titleKey: MFAMessageKey;
  descriptionKey: `${MFAMessageKey}-description`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  status: MFAStatus;
  dialog: React.ReactNode;
}

const DEFAULT_MFA_METHODS: MFAMethod[] = [
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

export default function MFAMethodList() {
  const t = useTranslations('settings-account');
  const tCommon = useTranslations('common');

  const { data: factorsData, isLoading } = useQuery({
    queryKey: ['mfa-totp-factors'],
    queryFn: async () => {
      const response = await fetch('/api/auth/mfa/totp/factors', {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch MFA factors');
      }

      return (await response.json()) as {
        totp?: Array<{ status: 'unverified' | 'verified' }>;
      };
    },
  });

  const mfaMethods = useMemo(() => {
    const totpFactor = factorsData?.totp?.find(
      (factor) => factor.status === 'verified'
    );

    return DEFAULT_MFA_METHODS.map((method) =>
      method.id === 'authenticator'
        ? {
            ...method,
            status: totpFactor ? ('enabled' as MFAStatus) : 'disabled',
          }
        : method
    );
  }, [factorsData?.totp]);

  if (isLoading) {
    return (
      <>
        {Array.from({ length: 4 }).map((_, index) => (
          <SettingsSectionBlock className="space-y-2" key={index}>
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </SettingsSectionBlock>
        ))}
      </>
    );
  }

  return (
    <>
      {mfaMethods.map((method) => {
        const IconComponent = method.icon;

        return (
          <SettingItemTab
            key={method.id}
            title={
              <>
                {t(method.titleKey)}
                {method.status === 'enabled' ? (
                  <Badge
                    variant="outline"
                    className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                  >
                    {tCommon('enabled')}
                  </Badge>
                ) : method.status === 'disabled' ? (
                  <Badge variant="outline">{t('disabled')}</Badge>
                ) : (
                  <Badge variant="secondary">{t('coming-soon')}</Badge>
                )}
              </>
            }
            description={t(method.descriptionKey)}
            icon={<IconComponent className="size-4" />}
          >
            {method.status !== 'coming-soon' && method.dialog}
          </SettingItemTab>
        );
      })}
    </>
  );
}
