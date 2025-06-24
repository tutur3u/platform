'use client';

import {
  canUnlinkIdentity,
  getProviderDisplayName,
  getUserIdentities,
  type Identity,
  linkIdentity,
  unlinkIdentity,
} from '@tuturuuu/auth/identity-linking';
import { createClient } from '@tuturuuu/supabase/next/client';
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Github,
  Globe,
  Link as LinkIcon,
  Shield,
  Trash2,
  Zap,
} from '@tuturuuu/ui/icons';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface LinkedIdentitiesCardProps {
  className?: string;
}

const AVAILABLE_PROVIDERS = [
  {
    id: 'google',
    name: 'Google',
    icon: 'google',
    colorScheme: 'red',
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: 'github',
    colorScheme: 'slate',
  },
] as const;

export default function LinkedIdentitiesCard({
  className,
}: LinkedIdentitiesCardProps) {
  const t = useTranslations('settings-account');
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [loading, setLoading] = useState(true);
  const [unlinkLoading, setUnlinkLoading] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState<string | null>(null);
  const [canUnlink, setCanUnlink] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const loadIdentities = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error } = await getUserIdentities(supabase);

      if (error) {
        console.error('Error loading identities:', error);
        setError(t('error-loading-accounts'));
        toast({
          title: t('error-occurred'),
          description: t('error-loading-accounts'),
          variant: 'destructive',
        });
        return;
      }

      if (data) {
        setIdentities(data.identities);
        setCanUnlink(await canUnlinkIdentity(supabase));
      }
    } catch (error) {
      console.error('Error loading identities:', error);
      setError(t('error-loading-accounts'));
      toast({
        title: t('error-occurred'),
        description: t('error-loading-accounts'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleLinkIdentity = async (provider: string) => {
    try {
      setLinkLoading(provider);
      const { error } = await linkIdentity(supabase, provider as any, {
        redirectTo: `${window.location.origin}/settings/account/security?linked=${provider}`,
      });

      if (error) {
        console.error('Error linking identity:', error);
        toast({
          title: t('error-occurred'),
          description: t('error-linking-account', {
            provider: getProviderDisplayName(provider),
          }),
          variant: 'destructive',
        });
      }
      // Note: User will be redirected to OAuth provider, so no success message here
    } catch (error) {
      console.error('Error linking identity:', error);
      toast({
        title: t('error-occurred'),
        description: t('error-linking-account', {
          provider: getProviderDisplayName(provider),
        }),
        variant: 'destructive',
      });
    } finally {
      setLinkLoading(null);
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

    try {
      setUnlinkLoading(identity.id);
      const { error } = await unlinkIdentity(supabase, identity);

      if (error) {
        console.error('Error unlinking identity:', error);
        toast({
          title: t('error-occurred'),
          description: t('error-unlinking-account', {
            provider: getProviderDisplayName(identity.provider),
          }),
          variant: 'destructive',
        });
        return;
      }

      toast({
        title: t('success'),
        description: t('account-unlinked-success', {
          provider: getProviderDisplayName(identity.provider),
        }),
      });

      // Reload identities
      await loadIdentities();
    } catch (error) {
      console.error('Error unlinking identity:', error);
      toast({
        title: t('error-occurred'),
        description: t('error-unlinking-account', {
          provider: getProviderDisplayName(identity.provider),
        }),
        variant: 'destructive',
      });
    } finally {
      setUnlinkLoading(null);
    }
  };

  const getProviderIcon = (
    provider: string,
    size: 'sm' | 'md' | 'lg' = 'sm'
  ) => {
    const sizeClasses = {
      sm: 'h-5 w-5',
      md: 'h-6 w-6',
      lg: 'h-8 w-8',
    }[size];
    const imageSize = {
      sm: 20,
      md: 24,
      lg: 32,
    }[size];

    switch (provider) {
      case 'google':
        return (
          <Image
            src="/media/google-logo.png"
            alt="Google"
            width={imageSize}
            height={imageSize}
            className="object-contain"
          />
        );
      case 'github':
        return <Github className={sizeClasses} />;
      default:
        return <Globe className={sizeClasses} />;
    }
  };

  const getLinkedProviders = () => {
    return identities.map((identity) => identity.provider);
  };

  const getAvailableProviders = () => {
    const linkedProviders = getLinkedProviders();
    return AVAILABLE_PROVIDERS.filter(
      (provider) => !linkedProviders.includes(provider.id)
    );
  };

  useEffect(() => {
    loadIdentities();

    // Check for link success from URL params
    const urlParams = new URLSearchParams(window.location.search);
    const linkedProvider = urlParams.get('linked');
    if (linkedProvider) {
      toast({
        title: t('success'),
        description: t('account-linked-success', {
          provider: getProviderDisplayName(linkedProvider),
        }),
      });

      // Clean up URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('linked');
      window.history.replaceState({}, '', newUrl.toString());

      // Reload identities after linking
      setTimeout(() => loadIdentities(), 1000);
    }
  }, [loadIdentities, t]);

  // Loading State
  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-6">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-dynamic-blue/10 p-2.5 dark:bg-dynamic-blue/20">
              <LinkIcon className="h-5 w-5 text-dynamic-blue dark:text-dynamic-blue/80" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold">
                {t('linked-accounts')}
              </CardTitle>
              <CardDescription className="text-sm">
                {t('linked-accounts-description')}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 p-6 pt-0">
          <div className="space-y-4">
            <Skeleton className="h-4 w-32" />
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-5 w-5 rounded" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error State
  if (error) {
    return (
      <Card className={className}>
        <CardHeader className="pb-6">
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-dynamic-red/10 p-2.5 dark:bg-dynamic-red/20">
              <AlertTriangle className="h-5 w-5 text-dynamic-red dark:text-dynamic-red/80" />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold">
                {t('linked-accounts')}
              </CardTitle>
              <CardDescription className="text-sm text-dynamic-red dark:text-dynamic-red/80">
                {error}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <Button onClick={loadIdentities} variant="outline" className="w-full">
            {t('try-again')}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const availableProviders = getAvailableProviders();

  return (
    <Card className={className}>
      <CardHeader className="pb-6">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-dynamic-blue/10 p-2.5 dark:bg-dynamic-blue/20">
            <LinkIcon className="h-5 w-5 text-dynamic-blue dark:text-dynamic-blue/80" />
          </div>
          <div className="flex-1 space-y-1">
            <CardTitle className="text-xl font-semibold">
              {t('linked-accounts')}
            </CardTitle>
            <CardDescription className="text-sm">
              {t('linked-accounts-description')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-8 p-6 pt-0">
        {/* Prominent Link New Accounts Section */}
        {availableProviders.length > 0 && (
          <div className="rounded-lg border border-dynamic-blue/20 bg-gradient-to-br from-dynamic-blue/5 to-dynamic-indigo/5 p-6 dark:border-dynamic-blue/30 dark:from-dynamic-blue/5 dark:to-dynamic-indigo/5">
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-dynamic-blue/10 p-3 dark:bg-dynamic-blue/20">
                <Zap className="h-6 w-6 text-dynamic-blue dark:text-dynamic-blue/80" />
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-dynamic-blue dark:text-dynamic-blue/90">
                    {t('enhance-security')}
                  </h3>
                  <p className="text-sm text-dynamic-blue/80 dark:text-dynamic-blue/70">
                    {t('enhance-security-description')}
                  </p>
                </div>
                <div className="grid gap-4">
                  {availableProviders.map((provider) => {
                    return (
                      <div
                        key={provider.id}
                        className="group relative overflow-hidden rounded-lg border border-white/20 bg-white/60 backdrop-blur-sm transition-all duration-200 hover:bg-white/80 dark:border-gray-700/50 dark:bg-gray-800/60 dark:hover:bg-gray-800/80"
                      >
                        <div className="p-4">
                          <div className="mb-3 flex items-center gap-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-gray-700">
                              {getProviderIcon(provider.id, 'md')}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                {provider.name}
                              </h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                {t(`provider-benefit-${provider.id}`, {
                                  defaultValue: t('provider-benefit-default', {
                                    provider: provider.name,
                                  }),
                                })}
                              </p>
                            </div>
                          </div>
                          <Button
                            onClick={() => handleLinkIdentity(provider.id)}
                            disabled={linkLoading === provider.id}
                            variant="outline"
                            size="sm"
                          >
                            {linkLoading === provider.id ? (
                              <>
                                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                {t('linking')}...
                              </>
                            ) : (
                              <>
                                <ExternalLink className="mr-2 h-4 w-4" />
                                {t('connect')} {provider.name}
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Currently Linked Identities */}
        {identities.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-dynamic-green dark:text-dynamic-green/80" />
              <h4 className="text-sm font-medium text-foreground">
                {t('connected-accounts')} ({identities.length})
              </h4>
            </div>
            <div className="space-y-3">
              {identities.map((identity) => {
                return (
                  <div
                    key={identity.id}
                    className="group relative overflow-hidden rounded-lg border bg-card transition-all duration-200 hover:shadow-md"
                  >
                    <div className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          {getProviderIcon(identity.provider, 'md')}
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">
                              {getProviderDisplayName(identity.provider)}
                            </span>
                            <Badge
                              variant="outline"
                              className="border-dynamic-green/30 text-xs font-medium text-dynamic-green dark:border-dynamic-green/50 dark:text-dynamic-green/80"
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              {t('connected')}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {identity?.identity_data?.email ||
                              t('connected-on', {
                                date: new Date(
                                  identity.created_at || ''
                                ).toLocaleDateString(),
                              })}
                          </p>
                        </div>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={
                              !canUnlink || unlinkLoading === identity.id
                            }
                          >
                            {unlinkLoading === identity.id ? (
                              <>
                                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                {t('unlinking')}...
                              </>
                            ) : (
                              <>
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t('unlink')}
                              </>
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                              <AlertTriangle className="text-dynamic-amber h-5 w-5" />
                              {t('unlink-account')}
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-left">
                              {t('unlink-confirmation', {
                                provider: getProviderDisplayName(
                                  identity.provider
                                ),
                              })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleUnlinkIdentity(identity)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              {t('unlink-account')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {identities.length === 0 && availableProviders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 rounded-full bg-muted p-4">
              <LinkIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-medium text-foreground">
              {t('no-linked-accounts')}
            </h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              {t('no-linked-accounts-description')}
            </p>
          </div>
        )}

        {/* Security Notice */}
        {!canUnlink && identities.length === 1 && (
          <div className="border-dynamic-amber/30 bg-dynamic-amber/5 dark:border-dynamic-amber/50 dark:bg-dynamic-amber/10 rounded-lg border p-4">
            <div className="flex gap-2">
              <Shield className="text-dynamic-amber dark:text-dynamic-amber/80 mt-0.5 h-5 w-5 flex-shrink-0" />
              <div className="space-y-1">
                <p className="text-dynamic-amber dark:text-dynamic-amber/90 text-sm font-medium">
                  {t('account-security-notice')}
                </p>
                <p className="text-dynamic-amber/80 dark:text-dynamic-amber/70 text-sm">
                  {t('account-security-notice-description')}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
