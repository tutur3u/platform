'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Building2,
  ExternalLink,
  Loader2,
  RefreshCw,
} from '@tuturuuu/icons';
import type { AddressInput, CountryAlpha2Input } from '@tuturuuu/payment/polar';
import { Button } from '@tuturuuu/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import {
  getWorkspaceBillingDetails,
  getWorkspaceCustomerPortalUrl,
  type UpdateWorkspaceBillingDetailsInput,
  updateWorkspaceBillingDetails,
} from './actions';
import billingCountryOptions from './billing-country-options.json';

interface BillingDetailsCardProps {
  wsId: string;
}

const COUNTRY_OPTIONS: Array<{
  code: AddressInput['country'];
  label: string;
}> = Object.entries(billingCountryOptions)
  .map(([code, label]) => ({
    code: code as AddressInput['country'],
    label,
  }))
  .sort((a, b) => a.label.localeCompare(b.label));

export default function BillingDetailsCard({ wsId }: BillingDetailsCardProps) {
  const t = useTranslations('billing');
  const queryClient = useQueryClient();

  const form = useForm<UpdateWorkspaceBillingDetailsInput>({
    defaultValues: {
      email: '',
      name: '',
      billingAddress: {
        line1: '',
        line2: '',
        postalCode: '',
        city: '',
        country: 'US',
      },
      taxId: '',
    },
  });

  const {
    data: billingDetails,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['workspace-billing-details', wsId],
    queryFn: async () => {
      const result = await getWorkspaceBillingDetails(wsId);
      if (!result.success || !result.data) {
        throw new Error(result.error ?? t('failed-to-load-billing-details'));
      }
      return result.data;
    },
    enabled: true,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!billingDetails) return;

    form.reset({
      email: billingDetails.email,
      name: billingDetails.name,
      billingAddress: {
        line1: billingDetails.billingAddress.line1,
        line2: billingDetails.billingAddress.line2,
        postalCode: billingDetails.billingAddress.postalCode,
        city: billingDetails.billingAddress.city,
        country: billingDetails.billingAddress.country as CountryAlpha2Input,
      },
      taxId: billingDetails.taxId,
    });
  }, [billingDetails, form]);

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateWorkspaceBillingDetailsInput) =>
      updateWorkspaceBillingDetails(wsId, payload),
    onSuccess: (result) => {
      if (!result.success || !result.data) {
        toast.error(result.error ?? t('failed-to-update-billing-details'));
        return;
      }

      form.reset({
        email: result.data.email,
        name: result.data.name,
        billingAddress: {
          line1: result.data.billingAddress.line1,
          line2: result.data.billingAddress.line2,
          postalCode: result.data.billingAddress.postalCode,
          city: result.data.billingAddress.city,
          country: result.data.billingAddress.country as CountryAlpha2Input,
        },
        taxId: result.data.taxId,
      });

      toast.success(t('billing-details-updated'));
      queryClient.invalidateQueries({
        queryKey: ['workspace-billing-details', wsId],
      });
    },
    onError: () => {
      toast.error(t('failed-to-update-billing-details'));
    },
  });

  const portalMutation = useMutation({
    mutationFn: () => getWorkspaceCustomerPortalUrl(wsId),
    onSuccess: (result) => {
      if (!result.success || !result.data?.url) {
        toast.error(result.error ?? t('failed-to-open-customer-portal'));
        return;
      }

      window.open(result.data.url, '_blank');
    },
    onError: () => {
      toast.error(t('failed-to-open-customer-portal'));
    },
  });

  const isFormDisabled =
    isLoading || updateMutation.isPending || portalMutation.isPending;

  const onSubmit = (data: UpdateWorkspaceBillingDetailsInput) => {
    updateMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="mb-8 rounded-xl border border-border/50 bg-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-full bg-dynamic-blue/10 p-2.5">
            <Building2 className="h-5 w-5 text-dynamic-blue" />
          </div>
          <h3 className="font-semibold text-lg">{t('billing-details')}</h3>
        </div>
        <div className="space-y-3">
          <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-8 rounded-xl border border-border/50 bg-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-full bg-dynamic-blue/10 p-2.5">
            <Building2 className="h-5 w-5 text-dynamic-blue" />
          </div>
          <h3 className="font-semibold text-lg">{t('billing-details')}</h3>
        </div>

        <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-destructive/50 bg-destructive/10 p-6">
          <AlertCircle className="h-10 w-10 text-destructive" />
          <p className="text-center text-destructive text-sm">
            {error instanceof Error ? error.message : t('error-loading-data')}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('try-again')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 rounded-xl border border-border/50 bg-card p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-full bg-dynamic-blue/10 p-2.5">
          <Building2 className="h-5 w-5 text-dynamic-blue" />
        </div>
        <div>
          <h3 className="font-semibold text-lg">{t('billing-details')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('billing-details-description')}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('billing-email')}</FormLabel>
                <FormControl>
                  <Input {...field} type="email" disabled={isFormDisabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('billing-name')}</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isFormDisabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-2">
            <FormLabel>{t('billing-address-line-1')}</FormLabel>
            <div className="space-y-2">
              <FormField
                control={form.control}
                name="billingAddress.line1"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input {...field} disabled={isFormDisabled} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="billingAddress.line2"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder={t('billing-address-line-2-placeholder')}
                        disabled={isFormDisabled}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-2 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="billingAddress.postalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('postal-code')}</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={isFormDisabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="billingAddress.city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('city')}</FormLabel>
                      <FormControl>
                        <Input {...field} disabled={isFormDisabled} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="billingAddress.country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('country')}</FormLabel>
                    <FormControl>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        disabled={isFormDisabled}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t('country')} />
                        </SelectTrigger>
                        <SelectContent>
                          {COUNTRY_OPTIONS.map((country) => (
                            <SelectItem key={country.code} value={country.code}>
                              {country.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          <FormField
            control={form.control}
            name="taxId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('tax-id')}</FormLabel>
                <FormControl>
                  <Input {...field} disabled={isFormDisabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex gap-4">
            <Button
              type="submit"
              disabled={isFormDisabled || !form.formState.isDirty}
              className="min-w-48"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('processing')}
                </>
              ) : (
                t('update-billing-details')
              )}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={isFormDisabled}
              onClick={() => portalMutation.mutate()}
            >
              {portalMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('processing')}
                </>
              ) : (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('open-customer-portal')}
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
