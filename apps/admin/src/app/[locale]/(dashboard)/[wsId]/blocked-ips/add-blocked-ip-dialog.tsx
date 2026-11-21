'use client';

import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
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
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const BLOCK_REASONS = [
  'manual',
  'otp_send',
  'otp_verify_failed',
  'mfa_challenge',
  'mfa_verify_failed',
  'reauth_send',
  'reauth_verify_failed',
  'password_login_failed',
] as const;

const BLOCK_LEVELS = [
  { value: '1', labelKey: 'level_1' },
  { value: '2', labelKey: 'level_2' },
  { value: '3', labelKey: 'level_3' },
  { value: '4', labelKey: 'level_4' },
  { value: '0', labelKey: 'level_permanent' },
] as const;

export default function AddBlockedIPDialog() {
  const t = useTranslations('blocked-ips');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const [ipAddress, setIpAddress] = useState('');
  const [reason, setReason] = useState<string>('manual');
  const [blockLevel, setBlockLevel] = useState<string>('1');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!ipAddress.trim()) {
      toast.error(t('error_ip_required'));
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/v1/infrastructure/blocked-ips', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ip_address: ipAddress.trim(),
          reason,
          block_level: parseInt(blockLevel, 10),
          notes: notes.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          toast.error(t('error_ip_already_blocked'));
        } else {
          toast.error(data.message || t('error_blocking_ip'));
        }
        return;
      }

      toast.success(t('ip_blocked_success'));
      setOpen(false);
      resetForm();
      router.refresh();
    } catch (error) {
      console.error('Error blocking IP:', error);
      toast.error(t('error_blocking_ip'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setIpAddress('');
    setReason('manual');
    setBlockLevel('1');
    setNotes('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('add_blocked_ip')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('add_blocked_ip_title')}</DialogTitle>
            <DialogDescription>
              {t('add_blocked_ip_description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ip_address">{t('ip_address')}</Label>
              <Input
                id="ip_address"
                placeholder="192.168.1.1"
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reason">{t('reason')}</Label>
              <Select
                value={reason}
                onValueChange={setReason}
                disabled={loading}
              >
                <SelectTrigger id="reason">
                  <SelectValue placeholder={t('select_reason')} />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {t(`reason_${r}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="block_level">{t('block_level')}</Label>
              <Select
                value={blockLevel}
                onValueChange={setBlockLevel}
                disabled={loading}
              >
                <SelectTrigger id="block_level">
                  <SelectValue placeholder={t('select_block_level')} />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_LEVELS.map((level) => (
                    <SelectItem key={level.value} value={level.value}>
                      {t(level.labelKey)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="notes">{t('notes')}</Label>
              <Textarea
                id="notes"
                placeholder={t('notes_placeholder')}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={loading}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t('blocking') : t('block_ip')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
