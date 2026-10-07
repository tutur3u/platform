'use client';

import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceActor } from '../../../../../hooks/use-workspace-visibility';
import { useFinanceHref } from '../../finance-route-context';
import {
  type CreateSubscriptionInvoicePayload,
  createSubscriptionInvoiceWithInternalApi,
} from '../internal-api';
import { formatInvoiceRecalculationDescription } from '../invoice-visibility-format';
import { invalidateInvoiceMutationQueries } from '../query-invalidation';
import type { getSubscriptionBlockReason } from '../subscription-admission';

type Options = {
  createMultipleInvoices: boolean;
  printAfterCreate: boolean;
  downloadImageAfterCreate: boolean;
};
type Scope = {
  actor: ReturnType<typeof useWorkspaceActor>;
  wsId: string;
  customerId: string;
};
type Intent = {
  scope: Scope;
  revision: number;
  payload: CreateSubscriptionInvoicePayload;
  options: Options;
  onReset: () => void;
  areNumbersHidden: boolean;
  currency: string;
};

/** Completion belongs to a draft; admission is never undone by leaving it. */
export function useSubscriptionCreate({
  wsId,
  payload,
  options,
  blockedReason,
  checkoutReady,
  areNumbersHidden,
  currency,
  onReset,
}: {
  wsId: string;
  payload: CreateSubscriptionInvoicePayload;
  options: Options;
  blockedReason: ReturnType<typeof getSubscriptionBlockReason>;
  checkoutReady: boolean;
  areNumbersHidden: boolean;
  currency: string;
  onReset: () => void;
}) {
  const actor = useWorkspaceActor();
  const client = useQueryClient();
  const router = useRouter();
  const financeHref = useFinanceHref();
  const t = useTranslations();
  const locale = useLocale();
  const scope = useMemo(
    () => ({ actor, wsId, customerId: payload.customer_id }),
    [actor, wsId, payload.customer_id]
  );
  const draft = JSON.stringify({
    payload,
    options,
    areNumbersHidden,
    currency,
    locale,
    blockedReason,
    checkoutReady,
  });
  const state = useRef<{
    active: boolean;
    scope: Scope;
    revision: number;
    draft: string;
    owner: Intent | null;
  }>({ active: false, scope, revision: 0, draft: '', owner: null });
  const [creating, setCreating] = useState(false);
  useLayoutEffect(() => {
    state.current = {
      active: true,
      scope,
      revision: state.current.revision + 1,
      draft: '',
      owner: null,
    };
    setCreating(false);
    return () => {
      state.current.active = false;
      state.current.revision++;
      state.current.owner = null;
    };
  }, [scope]);
  useLayoutEffect(() => {
    if (state.current.draft !== draft) {
      state.current.draft = draft;
      state.current.revision++;
    }
  }, [draft]);
  const active = (intent: Intent) => {
    if (
      !state.current.active ||
      state.current.scope !== intent.scope ||
      state.current.owner !== intent ||
      state.current.revision !== intent.revision ||
      !intent.scope.actor
    )
      return false;
    try {
      intent.scope.actor.assertActive();
      return true;
    } catch {
      return false;
    }
  };
  const submit = async () => {
    if (
      state.current.owner ||
      !state.current.active ||
      state.current.scope !== scope
    )
      return;
    if (blockedReason) {
      toast(t(`ws-invoices.${blockedReason}`));
      return;
    }
    if (!checkoutReady) {
      toast(t('ws-invoices.create_subscription_invoice_validation'));
      return;
    }
    if (!payload.products.length) {
      toast(t('ws-invoices.no_products_to_invoice'));
      return;
    }
    const intent: Intent = {
      scope,
      revision: state.current.revision,
      payload: structuredClone(payload),
      options: { ...options },
      onReset,
      areNumbersHidden,
      currency,
    };
    state.current.owner = intent;
    if (!active(intent)) {
      state.current.owner = null;
      return;
    }
    setCreating(true);
    try {
      if (!active(intent)) return;
      const result = await createSubscriptionInvoiceWithInternalApi(
        intent.scope.wsId,
        intent.payload
      );
      if (!active(intent)) return;
      void invalidateInvoiceMutationQueries(client, intent.scope.wsId);
      if (!active(intent)) return;
      if (result.data?.values_recalculated) {
        const { calculated_values, frontend_values } = result.data;
        toast(t('ws-invoices.subscription_invoice_created_recalculated'), {
          description: formatInvoiceRecalculationDescription({
            areNumbersHidden: intent.areNumbersHidden,
            calculatedTotal: calculated_values.total,
            currency: intent.currency,
            frontendTotal: frontend_values?.total || 0,
            roundingApplied: calculated_values.rounding_applied,
            t,
          }),
          duration: 5000,
        });
      } else
        toast(
          t('ws-invoices.subscription_invoice_created_success', {
            invoiceId: result.invoice_id,
          })
        );
      if (!active(intent)) return;
      if (intent.options.createMultipleInvoices) intent.onReset();
      else {
        const params = new URLSearchParams();
        if (intent.options.printAfterCreate) params.set('print', 'true');
        if (intent.options.downloadImageAfterCreate)
          params.set('image', 'true');
        router.push(
          `/${intent.scope.wsId}${financeHref(`/invoices/${result.invoice_id}`)}${params.toString() ? `?${params.toString()}` : ''}`
        );
      }
    } catch (error) {
      if (active(intent))
        toast(
          t('ws-invoices.error_creating_subscription_invoice', {
            error:
              error instanceof Error
                ? error.message
                : t('ws-invoices.failed_to_create_subscription_invoice'),
          })
        );
    } finally {
      // A newer draft may expire effects, but only this still-owned pending write
      // can release its indicator. An old scope can never clear a new owner.
      if (
        state.current.active &&
        state.current.scope === intent.scope &&
        state.current.owner === intent
      ) {
        state.current.owner = null;
        setCreating(false);
      }
    }
  };
  return { submit, creating };
}
