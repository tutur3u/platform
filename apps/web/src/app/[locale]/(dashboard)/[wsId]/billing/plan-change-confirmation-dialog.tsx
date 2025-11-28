'use client';

import {
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  CheckCircle,
  Info,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import { centToDollar } from '@/utils/price-helper';

interface PlanDetails {
  id: string;
  name: string;
  price: number;
  billingCycle: string | null;
  features: string[];
}

interface PlanChangeConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: PlanDetails;
  newPlan: PlanDetails;
  isUpgrade: boolean;
  nextBillingDate: string;
  onConfirm: () => void;
  isLoading: boolean;
}

interface PlanCardProps {
  plan: PlanDetails;
  label: string;
  variant: 'neutral' | 'upgrade' | 'downgrade';
}

interface InfoRowProps {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}

function PlanCard({ plan, label, variant }: PlanCardProps) {
  const borderColor =
    variant === 'upgrade'
      ? 'border-dynamic-green'
      : variant === 'downgrade'
        ? 'border-dynamic-orange'
        : 'border-border';

  const badgeColor =
    variant === 'upgrade'
      ? 'bg-dynamic-green/10 text-dynamic-green'
      : variant === 'downgrade'
        ? 'bg-dynamic-orange/10 text-dynamic-orange'
        : 'bg-muted text-muted-foreground';

  return (
    <div
      className={cn(
        'rounded-xl border-2 p-4 transition-all',
        borderColor,
        variant !== 'neutral' && 'shadow-lg'
      )}
    >
      {/* Badge */}
      <div className="mb-3">
        <span
          className={cn(
            'inline-block rounded-full px-2.5 py-0.5 font-medium text-xs uppercase tracking-wider',
            badgeColor
          )}
        >
          {label}
        </span>
      </div>

      {/* Plan Name */}
      <h3 className="mb-2 font-bold text-lg">{plan.name}</h3>

      {/* Price */}
      <div className="mb-4 flex items-baseline gap-1">
        <span className="font-black text-2xl">${centToDollar(plan.price)}</span>
        <span className="text-muted-foreground text-sm">
          /{plan.billingCycle || 'month'}
        </span>
      </div>

      {/* Features */}
      <ul className="space-y-2">
        {plan.features.length > 0 ? (
          plan.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2 text-sm">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="flex-1 leading-relaxed">{feature}</span>
            </li>
          ))
        ) : (
          <li className="flex items-start gap-2 text-sm">
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1 leading-relaxed">
              Full access to platform
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}

function InfoRow({ icon: Icon, text }: InfoRowProps) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 text-muted-foreground leading-relaxed">
        {text}
      </span>
    </div>
  );
}

export function PlanChangeConfirmationDialog({
  open,
  onOpenChange,
  currentPlan,
  newPlan,
  isUpgrade,
  nextBillingDate,
  onConfirm,
  isLoading,
}: PlanChangeConfirmationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl"
        showCloseButton={!isLoading}
        onPointerDownOutside={(e) => isLoading && e.preventDefault()}
      >
        {/* Header Section */}
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'rounded-full p-2',
              isUpgrade ? 'bg-dynamic-green/10' : 'bg-dynamic-orange/10'
            )}
          >
            {isUpgrade ? (
              <ArrowUpCircle className="h-5 w-5 text-dynamic-green" />
            ) : (
              <ArrowDownCircle className="h-5 w-5 text-dynamic-orange" />
            )}
          </div>
          <div className="flex-1">
            <DialogTitle>
              {isUpgrade ? 'Confirm Plan Upgrade' : 'Confirm Plan Downgrade'}
            </DialogTitle>
          </div>
        </div>

        {/* Plan Comparison Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Current Plan Card */}
          <PlanCard plan={currentPlan} label="Current" variant="neutral" />

          {/* New Plan Card */}
          <PlanCard
            plan={newPlan}
            label="New Plan"
            variant={isUpgrade ? 'upgrade' : 'downgrade'}
          />
        </div>

        {/* Information Section */}
        <div className="space-y-2 rounded-lg border border-border/50 bg-muted/30 p-4">
          <InfoRow icon={Info} text="Changes take effect immediately" />
          <InfoRow
            icon={Info}
            text="You'll be charged the prorated amount for the remainder of your billing cycle."
          />
          <InfoRow
            icon={Calendar}
            text={`Next billing date: ${nextBillingDate}`}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              isUpgrade
                ? 'bg-dynamic-green hover:bg-dynamic-green/90'
                : 'bg-dynamic-orange hover:bg-dynamic-orange/90'
            )}
          >
            {isLoading
              ? 'Processing...'
              : isUpgrade
                ? 'Confirm Upgrade'
                : 'Confirm Downgrade'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
