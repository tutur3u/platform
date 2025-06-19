import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  CreditCard,
  Download,
} from '@tuturuuu/ui/icons';
import { addHours, format, isAfter } from 'date-fns';
import Link from 'next/link';

const fetchWorkspaceSubscription = async (
  wsId: string
): Promise<any | null> => {
  try {
    const supabase = await createClient();

    const { data: subscription, error } = await supabase
      .from('workspace_subscription')
      .select('*, workspace_subscription_products(price)')
      .eq('ws_id', wsId)
      .single();

    if (error) {
      console.error('Failed to fetch workspace subscription:', error);
      return null;
    }

    return subscription;
  } catch (err) {
    console.error('Failed to fetch workspace subscription:', err);
    return null;
  }
};

export default async function SuccessPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { wsId } = await params;

  const subscription = await fetchWorkspaceSubscription(wsId);

  // Calculate link expiration
  const createdAt = subscription?.created_at
    ? new Date(subscription.created_at)
    : new Date();
  const expiresAt = addHours(createdAt, 24);
  const isLinkExpired = isAfter(new Date(), expiresAt);

  const paymentDetails = subscription
    ? {
        planName: subscription.plan_name || 'Pro Plan',
        amount: subscription.workspace_subscription_products.price
          ? `$${subscription.workspace_subscription_products.price.toFixed(2)}`
          : '--',
        invoiceId: subscription.id || 'N/A',
        date: subscription.created_at
          ? format(new Date(subscription.created_at), 'MMMM d, yyyy')
          : format(new Date(), 'MMMM d, yyyy'),
        paymentMethod: 'Card',
      }
    : {
        planName: 'Subscription Confirmed',
        amount: '--',
        invoiceId: 'N/A',
        date: format(new Date(), 'MMMM d, yyyy'),
        paymentMethod: '--',
      };

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8 duration-700 animate-in fade-in">
      <div className="mb-8 text-center delay-100 duration-1000 animate-in fade-in">
        <div className="mx-auto mb-4 flex h-16 w-16 animate-pulse items-center justify-center rounded-full bg-green-100 delay-200 dark:bg-green-900/30">
          <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight delay-300 duration-600 animate-in slide-in-from-bottom-4">
          Payment Successful!
        </h1>
        <p className="text-muted-foreground delay-500 duration-600 animate-in slide-in-from-bottom-4">
          Thank you for your subscription. Your payment has been processed
          successfully.
        </p>
      </div>

      {/* Payment Summary Card */}
      <div className="mb-8 rounded-lg border border-border bg-card p-8 shadow-sm transition-all delay-700 duration-300 duration-700 animate-in slide-in-from-bottom-6 hover:scale-[1.02] hover:shadow-lg dark:bg-card/80">
        <h2 className="mb-6 text-2xl font-semibold text-card-foreground">
          Payment Summary
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="-m-2 flex justify-between rounded p-2 transition-all duration-200 hover:scale-105 hover:bg-muted/30">
              <span className="text-muted-foreground">Plan:</span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.planName}
              </span>
            </div>
            <div className="-m-2 flex justify-between rounded p-2 transition-all duration-200 hover:scale-105 hover:bg-muted/30">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.amount}
              </span>
            </div>
            <div className="-m-2 flex justify-between rounded p-2 transition-all duration-200 hover:scale-105 hover:bg-muted/30">
              <span className="text-muted-foreground">Invoice ID:</span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.invoiceId}
              </span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="-m-2 flex justify-between rounded p-2 transition-all duration-200 hover:scale-105 hover:bg-muted/30">
              <span className="text-muted-foreground">Date:</span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.date}
              </span>
            </div>
            <div className="-m-2 flex justify-between rounded p-2 transition-all duration-200 hover:scale-105 hover:bg-muted/30">
              <span className="text-muted-foreground">Payment Method:</span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.paymentMethod}
              </span>
            </div>
            <div className="-m-2 flex justify-between rounded p-2 transition-all duration-200 hover:bg-muted/30">
              <span className="text-muted-foreground">Status:</span>
              <span className="rounded-full bg-green-100 px-2 text-xs leading-5 font-semibold text-green-800 hover:scale-110 dark:bg-green-900/30 dark:text-green-400">
                Paid
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Download Link Expiration Notice */}
      <div className="mb-8 rounded-lg border border-amber-200 bg-amber-50 p-6 text-center transition-all delay-900 duration-300 animate-in fade-in dark:border-amber-800 dark:bg-amber-900/20">
        <div className="mb-2 flex items-center justify-center gap-2">
          <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <p className="font-medium text-amber-800 dark:text-amber-200">
            Download Receipt Availability
          </p>
        </div>
        {isLinkExpired ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            The download link has expired (24 hours after payment). Please
            contact support for a new receipt.
          </p>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Download link expires on{' '}
            {format(expiresAt, "MMMM d, yyyy 'at' h:mm a")} (24 hours after
            payment)
          </p>
        )}
      </div>

      {/* What's Next Card */}
      <div className="mb-8 rounded-lg border border-border bg-card p-8 shadow-sm transition-all delay-1000 duration-300 duration-700 animate-in slide-in-from-bottom-6 hover:scale-[1.02] hover:shadow-lg dark:bg-card/80">
        <h2 className="mb-6 text-2xl font-semibold text-card-foreground">
          What's Next?
        </h2>
        <div className="space-y-4">
          <div className="-m-3 flex items-start gap-3 rounded-lg p-3 transition-all delay-1200 duration-300 duration-500 animate-in slide-in-from-left-4 hover:translate-x-2 hover:bg-muted/30">
            <CheckCircle className="mt-0.5 h-5 w-5 text-green-600 transition-transform duration-300 hover:scale-125 hover:rotate-12 dark:text-green-400" />
            <div>
              <p className="font-medium text-card-foreground">
                Your subscription is now active
              </p>
              <p className="text-sm text-muted-foreground">
                You now have access to all Pro features and benefits.
              </p>
            </div>
          </div>
          <div className="-m-3 flex items-start gap-3 rounded-lg p-3 transition-all delay-1400 duration-300 duration-500 animate-in slide-in-from-left-4 hover:translate-x-2 hover:bg-muted/30">
            <CheckCircle className="mt-0.5 h-5 w-5 text-green-600 transition-transform duration-300 hover:scale-125 hover:rotate-12 dark:text-green-400" />
            <div>
              <p className="font-medium text-card-foreground">
                Confirmation email sent
              </p>
              <p className="text-sm text-muted-foreground">
                Check your inbox for the receipt and subscription details.
              </p>
            </div>
          </div>
          <div className="-m-3 flex items-start gap-3 rounded-lg p-3 transition-all delay-1600 duration-300 duration-500 animate-in slide-in-from-left-4 hover:translate-x-2 hover:bg-muted/30">
            <CheckCircle className="mt-0.5 h-5 w-5 text-green-600 transition-transform duration-300 hover:scale-125 hover:rotate-12 dark:text-green-400" />
            <div>
              <p className="font-medium text-card-foreground">
                Billing cycle started
              </p>
              <p className="text-sm text-muted-foreground">
                Your next billing date will be one month from today.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-4 delay-1800 duration-600 animate-in slide-in-from-bottom-4 sm:flex-row sm:justify-center">
        <Button
          asChild
          className="group flex items-center gap-2 transition-all duration-300 hover:-translate-y-1 hover:scale-110 hover:shadow-xl"
        >
          <Link href={`/${wsId}/billing`}>
            <ArrowLeft className="h-4 w-4 transition-transform duration-300 group-hover:-translate-x-2" />
            Back to Billing
          </Link>
        </Button>
        {isLinkExpired ? (
          <Button
            variant="outline"
            disabled
            className="group flex cursor-not-allowed items-center gap-2 opacity-50"
          >
            <Download className="h-4 w-4" />
            Download Receipt (Expired)
          </Button>
        ) : (
          <Button
            variant="outline"
            asChild
            className="group flex items-center gap-2 transition-all duration-300 hover:-translate-y-1 hover:scale-110 hover:shadow-xl"
          >
            <Link href={`/api/billing/${wsId}/invoice`} target="_blank">
              <Download className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-2 group-hover:scale-125" />
              Download Receipt
            </Link>
          </Button>
        )}
        <Button
          variant="outline"
          asChild
          className="group flex items-center gap-2 transition-all duration-300 hover:-translate-y-1 hover:scale-110 hover:shadow-xl"
        >
          <Link href={`/${wsId}`}>
            <CreditCard className="h-4 w-4 transition-transform duration-300 group-hover:scale-125 group-hover:rotate-45" />
            Go to Dashboard
          </Link>
        </Button>
      </div>

      {/* Support Information */}
      <div className="mt-8 rounded-lg border border-border bg-muted/30 p-6 text-center transition-all delay-2000 duration-300 duration-800 animate-in fade-in hover:scale-105 hover:bg-muted/50">
        <p className="text-sm text-muted-foreground">
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
