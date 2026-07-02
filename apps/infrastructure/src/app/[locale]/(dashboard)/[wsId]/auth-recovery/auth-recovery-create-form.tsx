'use client';

import { Loader2, ShieldCheck } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';

interface AuthRecoveryCreateFormProps {
  allowNormalLogin: boolean;
  allowRecoveryEmail: boolean;
  clearEmailScoped: boolean;
  clearRelatedIpBlocks: boolean;
  clearRelatedIpCounters: boolean;
  email: string;
  isPending: boolean;
  isWorking: boolean;
  onSubmit: () => void;
  reason: string;
  setAllowNormalLogin: (value: boolean) => void;
  setAllowRecoveryEmail: (value: boolean) => void;
  setClearEmailScoped: (value: boolean) => void;
  setClearRelatedIpBlocks: (value: boolean) => void;
  setClearRelatedIpCounters: (value: boolean) => void;
  setEmail: (value: string) => void;
  setReason: (value: string) => void;
}

export function AuthRecoveryCreateForm({
  allowNormalLogin,
  allowRecoveryEmail,
  clearEmailScoped,
  clearRelatedIpBlocks,
  clearRelatedIpCounters,
  email,
  isPending,
  isWorking,
  onSubmit,
  reason,
  setAllowNormalLogin,
  setAllowRecoveryEmail,
  setClearEmailScoped,
  setClearRelatedIpBlocks,
  setClearRelatedIpCounters,
  setEmail,
  setReason,
}: AuthRecoveryCreateFormProps) {
  const t = useTranslations('auth-recovery-admin');
  const options = [
    {
      checked: allowNormalLogin,
      label: t('fields.allow_normal_login'),
      setChecked: setAllowNormalLogin,
    },
    {
      checked: allowRecoveryEmail,
      label: t('fields.allow_recovery_email'),
      setChecked: setAllowRecoveryEmail,
    },
    {
      checked: clearEmailScoped,
      label: t('fields.reset_otp_send'),
      setChecked: setClearEmailScoped,
    },
    {
      checked: clearRelatedIpCounters,
      label: t('fields.reset_otp_attempts'),
      setChecked: setClearRelatedIpCounters,
    },
    {
      checked: clearRelatedIpBlocks,
      label: t('fields.unblock_related_ips'),
      setChecked: setClearRelatedIpBlocks,
    },
  ];

  return (
    <form
      className="space-y-4 rounded-lg border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div>
        <p className="font-medium">{t('create.title')}</p>
        <p className="text-muted-foreground text-sm">
          {t('create.description')}
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="auth-recovery-email">{t('fields.email')}</Label>
          <Input
            id="auth-recovery-email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="auth-recovery-reason">{t('fields.reason')}</Label>
          <Textarea
            id="auth-recovery-reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder={t('fields.reason_placeholder')}
            required
            value={reason}
          />
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {options.map((option) => (
          <label
            className="flex items-start gap-2 rounded-md border border-border p-3 text-sm"
            key={option.label}
          >
            <Checkbox
              checked={option.checked}
              onCheckedChange={(value) => option.setChecked(Boolean(value))}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <Button disabled={isWorking} type="submit">
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck className="h-4 w-4" />
        )}
        {t('actions.create')}
      </Button>
    </form>
  );
}
