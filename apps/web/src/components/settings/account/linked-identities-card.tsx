'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getProviderDisplayName,
  type Identity,
} from '@tuturuuu/auth/identity-linking';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Shield,
  Trash2,
} from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import Image from 'next/image';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
import {
  AUTH_OAUTH_PROVIDER_OPTIONS,
  AUTH_OAUTH_PROVIDERS,
  type AuthOAuthProvider,
} from '@/lib/auth/oauth-providers';
import { useLinkedProviderConfirmation } from './use-linked-provider-confirmation';

interface LinkedIdentitiesCardProps {
  className?: string;
  linkedProvider?: string;
}

type LinkedIdentitiesResponse = {
  identities: Identity[];
  canUnlink: boolean;
};

function SocialLogoMask({ src, alt }: { src: string; alt: string }) {
  return (
    <span
      aria-label={alt}
      role="img"
      className="block size-5 shrink-0 bg-current"
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
      }}
    />
  );
}

const AVAILABLE_PROVIDERS = AUTH_OAUTH_PROVIDERS.map((id) => ({
  id: id as AuthOAuthProvider,
  name: AUTH_OAUTH_PROVIDER_OPTIONS[id].name,
}));

function fetchLinkedIdentities() {
  return apiFetch<LinkedIdentitiesResponse>('/api/v1/users/me/identities', {
    cache: 'no-store',
  });
}

function getLinkedIdentityProviderDisplayName(provider: string) {
  return (
    AUTH_OAUTH_PROVIDER_OPTIONS[provider as AuthOAuthProvider]?.name ??
    getProviderDisplayName(provider)
  );
}

export default function LinkedIdentitiesCard({
  className,
  linkedProvider,
}: LinkedIdentitiesCardProps) {
  const t = useTranslations('settings-account');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [linkLoading, setLinkLoading] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['linked-identities'],
    queryFn: fetchLinkedIdentities,
  });

  const unlinkMutation = useMutation({
    mutationFn: async (identity: Identity) => {
      await apiFetch(`/api/v1/users/me/identities/${identity.id}`, {
        method: 'DELETE',
      });
      return identity;
    },
    onSuccess: (identity) => {
      toast({
        title: t('success'),
        description: t('account-unlinked-success', {
          provider: getLinkedIdentityProviderDisplayName(identity.provider),
        }),
      });
      void queryClient.invalidateQueries({ queryKey: ['linked-identities'] });
    },
    onError: (_error, identity) => {
      toast({
        title: t('error-occurred'),
        description: t('error-unlinking-account', {
          provider: getLinkedIdentityProviderDisplayName(identity.provider),
        }),
        variant: 'destructive',
      });
    },
  });

  useLinkedProviderConfirmation({
    fetchIdentities: fetchLinkedIdentities,
    getProviderName: getLinkedIdentityProviderDisplayName,
    linkedProvider,
    t,
  });

  useEffect(() => {
    if (!linkedProvider) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete('settingsLinkedProvider');
    router.replace(
      nextParams.size > 0 ? `${pathname}?${nextParams.toString()}` : pathname,
      { scroll: false }
    );
    void queryClient.invalidateQueries({ queryKey: ['linked-identities'] });
  }, [linkedProvider, pathname, queryClient, router, searchParams]);

  const identities = data?.identities ?? [];
  const canUnlink = data?.canUnlink ?? false;
  const unlinkLoadingId = unlinkMutation.isPending
    ? (unlinkMutation.variables?.id ?? null)
    : null;
  const linkedProvidersSummary = useMemo(
    () => identities.map((identity) => identity.provider),
    [identities]
  );
  const availableProviders = AVAILABLE_PROVIDERS.filter(
    (provider) => !linkedProvidersSummary.includes(provider.id)
  );

  const handleLinkIdentity = (provider: string) => {
    try {
      setLinkLoading(provider);
      const returnTo = `${pathname}${
        searchParams.size > 0 ? `?${searchParams.toString()}` : ''
      }`;

      window.location.assign(
        `/api/v1/users/me/identities/link/${provider}?returnTo=${encodeURIComponent(
          returnTo
        )}`
      );
    } catch (linkError) {
      console.error('Error linking identity:', linkError);
      setLinkLoading(null);
      toast({
        title: t('error-occurred'),
        description: t('error-linking-account', {
          provider: getLinkedIdentityProviderDisplayName(provider),
        }),
        variant: 'destructive',
      });
    }
  };

  const handleUnlinkIdentity = async (identity: Identity) => {
    if (!canUnlink) {
      toast({
        title: t('cannot-unlink'),
        description: t('cannot-unlink-description'),
        variant: 'destructive',
      });
      return;
    }

    await unlinkMutation.mutateAsync(identity);
  };

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'apple':
        return <SocialLogoMask src="/media/logos/apple.svg" alt="Apple" />;
      case 'azure':
        return (
          <Image
            src="/media/logos/microsoft.svg"
            alt="Microsoft"
            width={20}
            height={20}
            className="object-contain"
          />
        );
      case 'google':
        return (
          <Image
            src="/media/google-logo.png"
            alt="Google"
            width={20}
            height={20}
            className="object-contain"
          />
        );
      case 'github':
        return <SocialLogoMask src="/media/logos/github.svg" alt="GitHub" />;
      default:
        return <Globe className="h-5 w-5" />;
    }
  };

  if (isLoading) {
    return (
      <SettingsSection
        className={className}
        title={t('linked-accounts')}
        description={t('linked-accounts-description')}
      >
        {[1, 2].map((i) => (
          <SettingsSectionBlock
            className="flex items-center justify-between gap-4"
            key={i}
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-5 rounded" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <Skeleton className="h-8 w-16" />
          </SettingsSectionBlock>
        ))}
      </SettingsSection>
    );
  }

  if (error) {
    return (
      <SettingsSection
        className={className}
        title={t('linked-accounts')}
        description={t('linked-accounts-description')}
      >
        <SettingsSectionMessage
          action={
            <Button onClick={() => void refetch()} variant="outline" size="sm">
              {t('try-again')}
            </Button>
          }
          tone="error"
        >
          {t('error-loading-accounts')}
        </SettingsSectionMessage>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      className={className}
      title={t('linked-accounts')}
      description={t('linked-accounts-description')}
      action={
        identities.length > 0 && (
          <span className="text-muted-foreground text-sm">
            {t('connected-accounts')} ({identities.length})
          </span>
        )
      }
    >
      {identities.map((identity) => (
        <SettingItemTab
          key={identity.id}
          title={
            <>
              {getLinkedIdentityProviderDisplayName(identity.provider)}
              <Badge
                variant="outline"
                className="border-dynamic-green/30 font-medium text-dynamic-green text-xs"
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                {t('connected')}
              </Badge>
            </>
          }
          description={
            identity.identity_data?.email ||
            t('connected-on', {
              date: new Date(identity.created_at || '').toLocaleDateString(),
            })
          }
          icon={getProviderIcon(identity.provider)}
        >
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-dynamic-red hover:text-dynamic-red"
                disabled={!canUnlink || unlinkLoadingId === identity.id}
              >
                {unlinkLoadingId === identity.id ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {t('unlinking')}...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    {t('unlink')}
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-dynamic-amber" />
                  {t('unlink-account')}
                </AlertDialogTitle>
                <AlertDialogDescription className="text-left">
                  {t('unlink-confirmation', {
                    provider: getLinkedIdentityProviderDisplayName(
                      identity.provider
                    ),
                  })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void handleUnlinkIdentity(identity)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t('unlink-account')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </SettingItemTab>
      ))}

      {!canUnlink && identities.length === 1 && (
        <SettingItemTab
          layout="stacked"
          title={t('account-security-notice')}
          description={t('account-security-notice-description')}
          icon={<Shield className="size-4 text-dynamic-yellow" />}
        />
      )}

      {availableProviders.length > 0 && (
        <SettingItemTab
          layout="stacked"
          title={t('enhance-security')}
          description={t('enhance-security-description')}
        />
      )}

      {availableProviders.map((provider) => (
        <SettingItemTab
          key={provider.id}
          title={provider.name}
          description={t(`provider-benefit-${provider.id}`, {
            defaultValue: t('provider-benefit-default', {
              provider: provider.name,
            }),
          })}
          icon={getProviderIcon(provider.id)}
        >
          <Button
            onClick={() => handleLinkIdentity(provider.id)}
            disabled={linkLoading === provider.id}
            variant="outline"
            size="sm"
          >
            {linkLoading === provider.id ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t('linking')}...
              </>
            ) : (
              <>
                <ExternalLink className="h-4 w-4" />
                {t('connect')} {provider.name}
              </>
            )}
          </Button>
        </SettingItemTab>
      ))}

      {identities.length === 0 && availableProviders.length === 0 && (
        <SettingsSectionMessage>
          <p className="font-medium text-foreground">
            {t('no-linked-accounts')}
          </p>
          <p className="mt-0.5">{t('no-linked-accounts-description')}</p>
        </SettingsSectionMessage>
      )}
    </SettingsSection>
  );
}
