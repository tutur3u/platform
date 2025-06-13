'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@tuturuuu/ui/input-otp';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

type VerifyForm = {
  totp: string;
};

export default function VerifyMFAForm() {
  const [loading, setLoading] = useState(false);
  const [factors, setFactors] = useState<any[]>([]);
  const [initialized, setInitialized] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { toast } = useToast();
  const t = useTranslations('settings-account');
  const tCommon = useTranslations('common');

  const verifySchema = z.object({
    totp: z
      .string()
      .min(6, t('code-must-be-6-digits'))
      .max(6, t('code-must-be-6-digits')),
  });

  const form = useForm<VerifyForm>({
    resolver: zodResolver(verifySchema),
    defaultValues: {
      totp: '',
    },
  });

  useEffect(() => {
    const fetchFactors = async () => {
      try {
        const { data: factorsData, error } =
          await supabase.auth.mfa.listFactors();
        if (error) throw error;

        const verifiedFactors =
          factorsData?.totp?.filter((factor) => factor.status === 'verified') ||
          [];

        setFactors(verifiedFactors);

        if (verifiedFactors.length === 0) {
          toast({
            title: t('no-mfa-methods'),
            description: t('no-verified-mfa-methods'),
            variant: 'destructive',
          });
          // Delay redirect to allow user to read the message
          setTimeout(() => {
            router.push('/settings/account/security');
          }, 2000);
        }
      } catch (error) {
        console.error('Error fetching MFA factors:', error);
        toast({
          title: tCommon('error'),
          description: t('failed-load-mfa-factors'),
          variant: 'destructive',
        });
        // Delay redirect on error as well
        setTimeout(() => {
          router.push('/');
        }, 2000);
      } finally {
        setInitialized(true);
      }
    };

    fetchFactors();
  }, [supabase.auth, router, toast, t]);

  // Handle Escape key to go back
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loading) {
        const returnUrl = searchParams.get('returnUrl');
        if (returnUrl) {
          router.push('/');
        } else {
          router.back();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [loading, router, searchParams]);

  const onSubmit = async (data: VerifyForm) => {
    if (factors.length === 0) return;

    setLoading(true);

    try {
      let verificationSuccess = false;
      let lastError: any = null;

      // Try each verified factor until one succeeds
      for (const factor of factors) {
        try {
          const { data: challenge, error: challengeError } =
            await supabase.auth.mfa.challenge({
              factorId: factor.id,
            });

          if (challengeError) continue;

          const { error: verifyError } = await supabase.auth.mfa.verify({
            factorId: factor.id,
            challengeId: challenge.id,
            code: data.totp,
          });

          if (!verifyError) {
            verificationSuccess = true;
            break;
          }

          lastError = verifyError;
        } catch (error) {
          lastError = error;
          continue;
        }
      }

      if (!verificationSuccess) {
        throw lastError || new Error('Verification failed for all factors');
      }

      toast({
        title: t('success'),
        description: t('mfa-verification-successful'),
      });

      // Redirect to return URL or dashboard
      const returnUrl = searchParams.get('returnUrl');
      if (returnUrl) {
        router.push(decodeURIComponent(returnUrl));
      } else {
        router.push('/');
      }
    } catch (error) {
      console.error('Error verifying MFA:', error);
      form.setError('totp', {
        message: t('invalid-verification-code-simple'),
      });
      form.setValue('totp', '');

      toast({
        title: t('verification-failed'),
        description: t('invalid-verification-code'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (!initialized) {
    return (
      <Card className="overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-xl">
        <CardContent className="flex h-64 items-center justify-center p-8">
          <LoadingIndicator />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="m-0 overflow-hidden rounded-2xl border p-0 shadow-2xl backdrop-blur-xl">
      <CardContent className="m-0 w-full translate-x-2 space-y-4 p-6">
        <div className="space-y-2 text-center">
          <h2 className="bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-2xl font-bold text-transparent dark:from-white dark:to-gray-300">
            {t('mfa-verification-title')}
          </h2>
          <p className="text-sm text-balance text-muted-foreground">
            {t('mfa-verification-description')}
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="totp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {t('verification-code')}
                  </FormLabel>
                  <FormControl>
                    <InputOTP
                      maxLength={6}
                      {...field}
                      onChange={(value) => {
                        form.setValue('totp', value);
                        if (value.length === 6) {
                          form.handleSubmit(onSubmit)();
                        }
                      }}
                      disabled={loading}
                      className="justify-center"
                    >
                      <InputOTPGroup className="w-full gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <InputOTPSlot
                            key={i}
                            index={i}
                            className="h-12 w-full rounded-lg border bg-white/50 text-lg font-semibold transition-all duration-200 focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-gray-700/50 dark:bg-gray-800/50"
                          />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              variant={loading ? 'outline' : undefined}
              className="h-12 w-full transform font-medium shadow-lg transition-all duration-200 hover:scale-[1.02] hover:shadow-xl"
              disabled={loading || form.watch('totp').length !== 6}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <LoadingIndicator className="h-4 w-4" />
                  <span>{t('verifying')}</span>
                </div>
              ) : (
                t('verify-code')
              )}
            </Button>
          </form>
        </Form>
        <Separator />
        <Button
          variant="destructive"
          onClick={async () => {
            await supabase.auth.signOut();
            router.push('/');
            router.refresh();
          }}
          className="w-full"
          disabled={loading}
        >
          {t('logout')}
        </Button>
      </CardContent>
    </Card>
  );
}
