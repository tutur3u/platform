'use client';

import { CreditCard, Loader2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
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
import { useWallets } from '../hooks';

interface Props {
  wsId: string;
  invoiceId: string;
  initialNotice: string | null;
  initialNote: string | null;
  initialWalletId: string | null;
}

export default function InvoiceEditForm({
  wsId,
  invoiceId,
  initialNotice,
  initialNote,
  initialWalletId,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const supabase = createClient();
  const { data: wallets = [], isLoading: walletsLoading } = useWallets(wsId);

  const [notice, setNotice] = useState<string>(initialNotice || '');
  const [note, setNote] = useState<string>(initialNote || '');
  const [walletId, setWalletId] = useState<string>(initialWalletId || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      const { error } = await supabase
        .from('finance_invoices')
        .update({ notice, note, wallet_id: walletId || undefined })
        .eq('id', invoiceId);
      if (error) throw error;
      toast.success(t('common.saved', { default: 'Saved' }));
      router.refresh();
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : t('common.error', { default: 'Something went wrong' })
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('ws-invoices.edit_invoice')}</CardTitle>
        <CardDescription>
          {t('ws-invoices.edit_invoice_description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Content / Notice */}
        <div className="space-y-2">
          <Label htmlFor="invoice-content">{t('ws-invoices.content')}</Label>
          <Textarea
            id="invoice-content"
            value={notice}
            onChange={(e) => setNotice(e.target.value)}
            placeholder={t('ws-invoices.content_placeholder')}
            className="min-h-[80px]"
          />
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="invoice-notes">{t('ws-invoices.notes')}</Label>
          <Textarea
            id="invoice-notes"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('ws-invoices.notes_placeholder')}
            className="min-h-[60px]"
          />
        </div>

        {/* Payment Method (Wallet) */}
        <div className="space-y-2">
          <Label htmlFor="wallet-select">{t('ws-wallets.wallet')}</Label>
          <Select
            value={walletId}
            onValueChange={setWalletId}
            disabled={walletsLoading}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={t('ws-invoices.select_wallet_required')}
              />
            </SelectTrigger>
            <SelectContent>
              {wallets.map((wallet) => (
                <SelectItem key={wallet.id} value={wallet.id || 'invalid'}>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    <div className="flex flex-row gap-2">
                      <p className="font-medium">
                        {wallet.name || t('ws-invoices.unnamed_wallet')}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {wallet.type || 'STANDARD'} - {wallet.currency || 'VND'}
                      </p>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('common.saving', { default: 'Saving…' })}
              </>
            ) : (
              t('common.save', { default: 'Save' })
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
