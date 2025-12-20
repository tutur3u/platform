'use client';

import { ArrowLeft, CheckCircle, CreditCard, Download } from '@tuturuuu/icons';
import type { Checkout } from '@tuturuuu/payment/polar';
import { Button } from '@tuturuuu/ui/button';
import { format } from 'date-fns';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { centToDollar } from '@/utils/price-helper';

interface PaymentDetails {
  planName?: string;
  amount?: string;
  checkoutId?: string;
  date?: string;
  paymentMethod?: string;
}

interface ClientComponentProps {
  wsId: string;
  checkout: Checkout;
}

export default function ClientComponent({
  wsId,
  checkout,
}: ClientComponentProps) {
  const t = useTranslations('billing');

  // Use order data if available, otherwise fall back to subscription
  const paymentDetails: PaymentDetails = {
    planName: checkout.product?.name || 'Unknown Plan',
    amount: `$${centToDollar(checkout.amount)}`,
    checkoutId: checkout.id,
    date: format(new Date(checkout.createdAt), 'MMMM d, yyyy'),
    paymentMethod: 'Card',
  };

  return (
    <div className="fade-in container mx-auto max-w-6xl animate-in px-4 py-8 duration-700">
      <div className="fade-in mb-8 animate-in text-center delay-100 duration-1000">
        <div className="mx-auto mb-4 flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-green-100 delay-200 dark:bg-green-900/30">
          <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="slide-in-from-bottom-4 mb-2 animate-in font-bold text-3xl tracking-tight delay-300 duration-600">
          {t('success.title')}
        </h1>
        <p className="slide-in-from-bottom-4 animate-in text-muted-foreground delay-500 duration-600">
          {t('success.message')}
        </p>
      </div>

      {/* Payment Summary Card */}
      <div className="slide-in-from-bottom-6 mb-8 animate-in rounded-lg border border-border bg-card p-8 shadow-sm transition-all delay-700 duration-700 hover:scale-[1.02] hover:shadow-lg dark:bg-card/80">
        <h2 className="mb-6 font-semibold text-2xl text-card-foreground">
          {t('success.payment-summary')}
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="-m-2 flex justify-between rounded p-2 transition-all duration-200 hover:scale-105 hover:bg-muted/30">
              <span className="text-muted-foreground">{t('success.plan')}</span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.planName}
              </span>
            </div>
            <div className="-m-2 flex justify-between rounded p-2 transition-all duration-200 hover:scale-105 hover:bg-muted/30">
              <span className="text-muted-foreground">
                {t('success.amount')}:
              </span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.amount}
              </span>
            </div>
            <div className="-m-2 flex justify-between rounded p-2 transition-all duration-200 hover:scale-105 hover:bg-muted/30">
              <span className="text-muted-foreground">
                {t('success.invoice-id')}
              </span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.checkoutId}
              </span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="-m-2 flex justify-between rounded p-2 transition-all duration-200 hover:scale-105 hover:bg-muted/30">
              <span className="text-muted-foreground">{t('success.date')}</span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.date}
              </span>
            </div>
            <div className="-m-2 flex justify-between rounded p-2 transition-all duration-200 hover:scale-105 hover:bg-muted/30">
              <span className="text-muted-foreground">
                {t('success.payment-method')}
              </span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.paymentMethod}
              </span>
            </div>
            <div className="-m-2 flex justify-between rounded p-2 transition-all duration-200 hover:bg-muted/30">
              <span className="text-muted-foreground">
                {t('success.status')}
              </span>
              <span className="rounded-full bg-green-100 px-2 font-semibold text-green-800 text-xs leading-5 hover:scale-110 dark:bg-green-900/30 dark:text-green-400">
                {t('success.completed')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* What's Next Card */}
      <div className="slide-in-from-bottom-6 mb-8 animate-in rounded-lg border border-border bg-card p-8 shadow-sm transition-all delay-1000 duration-300 duration-700 hover:scale-[1.02] hover:shadow-lg dark:bg-card/80">
        <h2 className="mb-6 font-semibold text-2xl text-card-foreground">
          {t('success.what-next')}
        </h2>
        <div className="space-y-4">
          <div className="slide-in-from-left-4 -m-3 flex animate-in items-start gap-3 rounded-lg p-3 transition-all delay-1200 duration-300 duration-500 hover:translate-x-2 hover:bg-muted/30">
            <CheckCircle className="mt-0.5 h-5 w-5 text-green-600 transition-transform duration-300 hover:rotate-12 hover:scale-125 dark:text-green-400" />
            <div>
              <p className="font-medium text-card-foreground">
                {t('success.active-plan')}
              </p>
              <p className="text-muted-foreground text-sm">
                {t('success.active-plan-desc')}
              </p>
            </div>
          </div>
          <div className="slide-in-from-left-4 -m-3 flex animate-in items-start gap-3 rounded-lg p-3 transition-all delay-1400 duration-300 duration-500 hover:translate-x-2 hover:bg-muted/30">
            <CheckCircle className="mt-0.5 h-5 w-5 text-green-600 transition-transform duration-300 hover:rotate-12 hover:scale-125 dark:text-green-400" />
            <div>
              <p className="font-medium text-card-foreground">
                {t('success.confirmation-email')}
              </p>
              <p className="text-muted-foreground text-sm">
                {t('success.confirmation-email-desc')}
              </p>
            </div>
          </div>
          <div className="slide-in-from-left-4 -m-3 flex animate-in items-start gap-3 rounded-lg p-3 transition-all delay-1600 duration-300 duration-500 hover:translate-x-2 hover:bg-muted/30">
            <CheckCircle className="mt-0.5 h-5 w-5 text-green-600 transition-transform duration-300 hover:rotate-12 hover:scale-125 dark:text-green-400" />
            <div>
              <p className="font-medium text-card-foreground">
                {t('success.billing-cycle')}
              </p>
              <p className="text-muted-foreground text-sm">
                {t('success.billing-cycle-desc')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="slide-in-from-bottom-4 flex animate-in flex-col gap-4 delay-1800 duration-600 sm:flex-row sm:justify-center">
        <Button
          asChild
          className="group flex items-center gap-2 transition-all duration-300 hover:-translate-y-1 hover:scale-110 hover:shadow-xl"
        >
          <Link href={`/${wsId}/billing`}>
            <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-2" />
            {t('success.back-to-billing')}
          </Link>
        </Button>
        <Button
          variant="outline"
          asChild
          className="group flex items-center gap-2 transition-all duration-300 hover:-translate-y-1 hover:scale-110 hover:shadow-xl"
        >
          <Link href={`/api/billing/${wsId}/invoice`} target="_blank">
            <Download className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-2 group-hover:scale-125" />
            {t('success.download-receipt')}
          </Link>
        </Button>
        <Button
          variant="outline"
          asChild
          className="group flex items-center gap-2 transition-all duration-300 hover:-translate-y-1 hover:scale-110 hover:shadow-xl"
        >
          <Link href={`/${wsId}`}>
            <CreditCard className="h-4 w-4 transition-transform duration-300 group-hover:rotate-45 group-hover:scale-125" />
            {t('success.go-to-dashboard')}
          </Link>
        </Button>
      </div>

      {/* Support Information */}
      <div className="fade-in mt-8 animate-in rounded-lg border border-border bg-muted/30 p-6 text-center transition-all delay-2000 duration-300 duration-800 hover:scale-105 hover:bg-muted/50">
        <p className="text-muted-foreground text-sm">
          Need help? Contact our{' '}
          <Link
            href="/#"
            className="inline-block font-medium text-primary transition-all duration-300 hover:scale-110 hover:text-primary/80 hover:underline"
          >
            support team
          </Link>{' '}
          or visit our{' '}
          <Link
            href="/#"
            className="inline-block font-medium text-primary transition-all duration-300 hover:scale-110 hover:text-primary/80 hover:underline"
          >
            help center
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
