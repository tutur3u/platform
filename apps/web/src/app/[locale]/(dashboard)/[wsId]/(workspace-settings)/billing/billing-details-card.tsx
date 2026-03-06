'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Building2, Loader2, RefreshCw } from '@tuturuuu/icons';
import type { AddressInput, CountryAlpha2Input } from '@tuturuuu/payment/polar';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import {
  getWorkspaceBillingDetails,
  type UpdateWorkspaceBillingDetailsInput,
  updateWorkspaceBillingDetails,
} from './actions';
import billingCountryOptions from './billing-country-options.json';

interface BillingDetailsCardProps {
  wsId: string;
  hasManageSubscriptionPermission: boolean;
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

const DEFAULT_FORM: UpdateWorkspaceBillingDetailsInput = {
  email: '',
  billingName: '',
  billingAddress: {
    line1: '',
    line2: '',
    postalCode: '',
    city: '',
    country: 'US',
  },
  taxId: '',
};

export default function BillingDetailsCard({
  wsId,
  hasManageSubscriptionPermission,
}: BillingDetailsCardProps) {
  const t = useTranslations('billing');
  const queryClient = useQueryClient();
  const [formData, setFormData] =
    useState<UpdateWorkspaceBillingDetailsInput>(DEFAULT_FORM);
  const [initialData, setInitialData] =
    useState<UpdateWorkspaceBillingDetailsInput | null>(null);

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
    enabled: hasManageSubscriptionPermission,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (!billingDetails) return;

    const nextFormData: UpdateWorkspaceBillingDetailsInput = {
      email: billingDetails.email,
      billingName: billingDetails.billingName,
      billingAddress: {
        line1: billingDetails.billingAddress.line1,
        line2: billingDetails.billingAddress.line2,
        postalCode: billingDetails.billingAddress.postalCode,
        city: billingDetails.billingAddress.city,
        country: billingDetails.billingAddress.country as CountryAlpha2Input,
      },
      taxId: billingDetails.taxId,
    };

    const formSerialized = JSON.stringify(formData);
    const initialSerialized =
      initialData !== null ? JSON.stringify(initialData) : null;
    const isInitialLoad = initialData === null;
    const isPristine =
      initialSerialized !== null && formSerialized === initialSerialized;

    if (!isInitialLoad && !isPristine) {
      return;
    }

    const nextSerialized = JSON.stringify(nextFormData);

    if (
      initialSerialized !== null &&
      nextSerialized === initialSerialized &&
      formSerialized === initialSerialized
    ) {
      return;
    }

    setFormData(nextFormData);
    setInitialData(nextFormData);
  }, [billingDetails, formData, initialData]);

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateWorkspaceBillingDetailsInput) =>
      updateWorkspaceBillingDetails(wsId, payload),
    onSuccess: (result) => {
      if (!result.success || !result.data) {
        toast.error(result.error ?? t('failed-to-update-billing-details'));
        return;
      }

      const updatedData: UpdateWorkspaceBillingDetailsInput = {
        email: result.data.email,
        billingName: result.data.billingName,
        billingAddress: {
          line1: result.data.billingAddress.line1,
          line2: result.data.billingAddress.line2,
          postalCode: result.data.billingAddress.postalCode,
          city: result.data.billingAddress.city,
          country: result.data.billingAddress.country as CountryAlpha2Input,
        },
        taxId: result.data.taxId,
      };

      setFormData(updatedData);
      setInitialData(updatedData);
      toast.success(t('billing-details-updated'));
      queryClient.invalidateQueries({
        queryKey: ['workspace-billing-details', wsId],
      });
    },
    onError: () => {
      toast.error(t('failed-to-update-billing-details'));
    },
  });

  const hasChanges = useMemo(() => {
    const baseline = initialData ?? DEFAULT_FORM;
    return JSON.stringify(formData) !== JSON.stringify(baseline);
  }, [formData, initialData]);

  if (!hasManageSubscriptionPermission) {
    return null;
  }

  const isFormDisabled = isLoading || updateMutation.isPending;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    updateMutation.mutate(formData);
  };

  const handleFieldChange = (
    field: keyof UpdateWorkspaceBillingDetailsInput,
    value: string
  ) => {
    setFormData((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleAddressFieldChange = (
    field: keyof UpdateWorkspaceBillingDetailsInput['billingAddress'],
    value: string
  ) => {
    setFormData((previous) => ({
      ...previous,
      billingAddress: {
        ...previous.billingAddress,
        [field]: value,
      },
    }));
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

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="billing-email">{t('billing-email')}</Label>
          <Input
            id="billing-email"
            type="email"
            value={formData.email}
            onChange={(event) => handleFieldChange('email', event.target.value)}
            disabled={isFormDisabled}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="billing-name">{t('billing-name')}</Label>
          <Input
            id="billing-name"
            value={formData.billingName}
            onChange={(event) =>
              handleFieldChange('billingName', event.target.value)
            }
            disabled={isFormDisabled}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="billing-line1">{t('billing-address-line-1')}</Label>
          <div className="space-y-2">
            <Input
              id="billing-line1"
              value={formData.billingAddress.line1}
              onChange={(event) =>
                handleAddressFieldChange('line1', event.target.value)
              }
              disabled={isFormDisabled}
            />
            <Input
              id="billing-line2"
              value={formData.billingAddress.line2}
              onChange={(event) =>
                handleAddressFieldChange('line2', event.target.value)
              }
              placeholder={t('billing-address-line-2-placeholder')}
              disabled={isFormDisabled}
            />
            <div className="grid gap-2 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="billing-postal-code">{t('postal-code')}</Label>
                <Input
                  id="billing-postal-code"
                  value={formData.billingAddress.postalCode}
                  onChange={(event) =>
                    handleAddressFieldChange('postalCode', event.target.value)
                  }
                  disabled={isFormDisabled}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="billing-city">{t('city')}</Label>
                <Input
                  id="billing-city"
                  value={formData.billingAddress.city}
                  onChange={(event) =>
                    handleAddressFieldChange('city', event.target.value)
                  }
                  disabled={isFormDisabled}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="billing-country">{t('country')}</Label>
              <Select
                value={formData.billingAddress.country}
                onValueChange={(value) =>
                  handleAddressFieldChange(
                    'country',
                    value as UpdateWorkspaceBillingDetailsInput['billingAddress']['country']
                  )
                }
                disabled={isFormDisabled}
              >
                <SelectTrigger id="billing-country">
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
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="billing-tax-id">{t('tax-id')}</Label>
          <Input
            id="billing-tax-id"
            value={formData.taxId}
            onChange={(event) => handleFieldChange('taxId', event.target.value)}
            disabled={isFormDisabled}
          />
        </div>

        <Button
          type="submit"
          disabled={isFormDisabled || !hasChanges}
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
      </form>
    </div>
  );
}
