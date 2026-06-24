'use client';

import type {
  BlockBlockedIpPayload,
  BlockedIpBlockLevel,
  BlockedIpBlockReason,
} from '@tuturuuu/internal-api/infrastructure';
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
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';

const BLOCK_REASONS = [
  'manual',
  'otp_send',
  'otp_verify_failed',
  'mfa_challenge',
  'mfa_verify_failed',
  'reauth_send',
  'reauth_verify_failed',
  'password_login_failed',
] as const satisfies readonly BlockedIpBlockReason[];

const BLOCK_LEVELS = [
  { labelKey: 'level_1', value: 1 },
  { labelKey: 'level_2', value: 2 },
  { labelKey: 'level_3', value: 3 },
  { labelKey: 'level_4', value: 4 },
  { labelKey: 'level_permanent', value: 0 },
] as const satisfies readonly {
  labelKey: string;
  value: BlockedIpBlockLevel;
}[];

export type BlockedIpFormValues = BlockBlockedIpPayload;

type BlockedIpFormProps = {
  isPending?: boolean;
  onCreate?: (values: BlockedIpFormValues) => Promise<void> | void;
  onFinish?: () => void;
};

function toBlockLevel(value: string): BlockedIpBlockLevel {
  const parsed = Number.parseInt(value, 10);

  return parsed === 0 || parsed === 1 || parsed === 2 || parsed === 3
    ? parsed
    : parsed === 4
      ? 4
      : 1;
}

export default function BlockedIpForm({
  isPending,
  onCreate,
  onFinish,
}: BlockedIpFormProps) {
  const t = useTranslations('blocked-ips');
  const [ipAddress, setIpAddress] = useState('');
  const [reason, setReason] = useState<BlockedIpBlockReason>('manual');
  const [blockLevel, setBlockLevel] = useState<string>('1');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const disabled = isPending || isSubmitting;

  function resetForm() {
    setIpAddress('');
    setReason('manual');
    setBlockLevel('1');
    setNotes('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedIpAddress = ipAddress.trim();
    if (!normalizedIpAddress) {
      toast.error(t('error_ip_required'));
      return;
    }

    setIsSubmitting(true);

    try {
      await onCreate?.({
        blockLevel: toBlockLevel(blockLevel),
        ipAddress: normalizedIpAddress,
        notes: notes.trim() || undefined,
        reason,
      });
      resetForm();
      onFinish?.();
    } catch {
      // Mutation handlers own localized toast/error reporting.
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <Label htmlFor="blocked-ip-address">{t('ip_address')}</Label>
        <Input
          autoComplete="off"
          disabled={disabled}
          id="blocked-ip-address"
          onChange={(event) => setIpAddress(event.target.value)}
          placeholder="192.168.1.1"
          value={ipAddress}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="blocked-ip-reason">{t('reason')}</Label>
        <Select
          disabled={disabled}
          onValueChange={(value) => setReason(value as BlockedIpBlockReason)}
          value={reason}
        >
          <SelectTrigger id="blocked-ip-reason">
            <SelectValue placeholder={t('select_reason')} />
          </SelectTrigger>
          <SelectContent>
            {BLOCK_REASONS.map((blockReason) => (
              <SelectItem key={blockReason} value={blockReason}>
                {t(`reason_${blockReason}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="blocked-ip-level">{t('block_level')}</Label>
        <Select
          disabled={disabled}
          onValueChange={setBlockLevel}
          value={blockLevel}
        >
          <SelectTrigger id="blocked-ip-level">
            <SelectValue placeholder={t('select_block_level')} />
          </SelectTrigger>
          <SelectContent>
            {BLOCK_LEVELS.map((level) => (
              <SelectItem key={level.value} value={String(level.value)}>
                {t(level.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="blocked-ip-notes">{t('notes')}</Label>
        <Textarea
          disabled={disabled}
          id="blocked-ip-notes"
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t('notes_placeholder')}
          rows={3}
          value={notes}
        />
      </div>

      <div className="flex justify-end">
        <Button disabled={disabled} type="submit">
          {disabled ? t('blocking') : t('block_ip')}
        </Button>
      </div>
    </form>
  );
}
