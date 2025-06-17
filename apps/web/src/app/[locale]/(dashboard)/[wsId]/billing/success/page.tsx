import { createClient } from '@tuturuuu/supabase/next/server';
import { Button } from '@tuturuuu/ui/button';
import { format } from 'date-fns';
import { ArrowLeft, CheckCircle, CreditCard, Download } from 'lucide-react';
import Link from 'next/link';

const fetchWorkspaceSubscription = async (
  wsId: string
): Promise<any | null> => {
  try {
    const supabase = await createClient();

    const { data: subscription, error } = await supabase
      .from('workspace_subscription')
      .select('*')
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
  searchParams,
}: {
  params: { wsId: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const { wsId } = params;

  // Fetch the workspace subscription data
  const subscription = await fetchWorkspaceSubscription(wsId);

  // Create paymentDetails from the subscription data, or use defaults if not found
  const paymentDetails = subscription
    ? {
        planName: subscription.plan_name || 'Pro Plan',
        amount: subscription.price
          ? `$${(subscription.price / 100).toFixed(2)}`
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
    <div className="container mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
          <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight">
          Payment Successful!
        </h1>
        <p className="text-muted-foreground">
          Thank you for your subscription. Your payment has been processed
          successfully.
        </p>
      </div>

      {/* Payment Summary Card */}
      <div className="mb-8 rounded-lg border border-border bg-card p-8 shadow-sm dark:bg-card/80">
        <h2 className="mb-6 text-2xl font-semibold text-card-foreground">
          Payment Summary
        </h2>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plan:</span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.planName}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount:</span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.amount}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice ID:</span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.invoiceId}
              </span>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date:</span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.date}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Method:</span>
              <span className="font-medium text-card-foreground">
                {paymentDetails.paymentMethod}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status:</span>
              <span className="inline-flex rounded-full bg-green-100 px-2 text-xs leading-5 font-semibold text-green-800 dark:bg-green-900/30 dark:text-green-400">
                Paid
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* What's Next Card */}
      <div className="mb-8 rounded-lg border border-border bg-card p-8 shadow-sm dark:bg-card/80">
        <h2 className="mb-6 text-2xl font-semibold text-card-foreground">
          What's Next?
        </h2>
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-5 w-5 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-medium text-card-foreground">
                Your subscription is now active
              </p>
              <p className="text-sm text-muted-foreground">
                You now have access to all Pro features and benefits.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-5 w-5 text-green-600 dark:text-green-400" />
            <div>
              <p className="font-medium text-card-foreground">
                Confirmation email sent
              </p>
              <p className="text-sm text-muted-foreground">
                Check your inbox for the receipt and subscription details.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="mt-0.5 h-5 w-5 text-green-600 dark:text-green-400" />
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
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
        <Button asChild className="flex items-center gap-2">
          <Link href={`/${wsId}/billing`}>
            <ArrowLeft className="h-4 w-4" />
            Back to Billing
          </Link>
        </Button>
        <Button variant="outline" className="flex items-center gap-2">
          <Download className="h-4 w-4" />
          Download Receipt
        </Button>
        <Button variant="outline" asChild className="flex items-center gap-2">
          <Link href={`/${wsId}`}>
            <CreditCard className="h-4 w-4" />
            Go to Dashboard
          </Link>
        </Button>
      </div>

      {/* Support Information */}
      <div className="mt-8 rounded-lg border border-border bg-muted/30 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Need help? Contact our{' '}
          <Link
            href="/support"
            className="font-medium text-primary hover:text-primary/80"
          >
            support team
          </Link>{' '}
          or visit our{' '}
          <Link
            href="/help"
            className="font-medium text-primary hover:text-primary/80"
          >
            help center
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
