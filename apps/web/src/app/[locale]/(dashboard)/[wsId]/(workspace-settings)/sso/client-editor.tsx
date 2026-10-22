'use client';
import {
  SSO_NAME_ID_FORMAT,
  type SsoClientInput,
  type SsoManagedClient,
} from '@tuturuuu/internal-api/sso';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function ClientEditor({
  client,
  busy,
  onSave,
  onCancel,
}: {
  client?: SsoManagedClient;
  busy: boolean;
  onSave: (input: SsoClientInput) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('workspace-sso');
  const [signing, setSigning] = useState(
    client?.requestSigningMode ?? 'required'
  );
  const fields = [
    { name: 'displayName', value: client?.displayName, max: 160 },
    { name: 'entityId', value: client?.entityId, max: 2048 },
    { name: 'acsUrl', value: client?.acsUrl, max: 2048 },
    { name: 'domains', value: client?.domains.join(', '), max: 8192 },
  ];
  return (
    <form
      className="space-y-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const value = (name: string) => String(form.get(name) ?? '').trim();
        onSave({
          displayName: value('displayName'),
          entityId: value('entityId'),
          acsUrl: value('acsUrl'),
          domains: value('domains')
            .split(',')
            .map((d) => d.trim())
            .filter(Boolean),
          nameIdFormat: SSO_NAME_ID_FORMAT,
          requestSigning:
            signing === 'required'
              ? { mode: 'required', certificate: value('certificate') }
              : { mode: 'unsigned' },
        });
      }}
    >
      <h2 className="font-semibold">
        {t(client ? 'editClient' : 'createClient')}
      </h2>
      {fields.map((field) => (
        <div key={field.name} className="space-y-2">
          <Label htmlFor={`sso-${field.name}`}>{t(field.name)}</Label>
          <Input
            id={`sso-${field.name}`}
            name={field.name}
            required
            maxLength={field.max}
            defaultValue={field.value}
            type={field.name === 'acsUrl' ? 'url' : 'text'}
          />
        </div>
      ))}
      <p className="text-muted-foreground text-sm">{t('domainsHelp')}</p>
      <div className="space-y-2">
        <Label htmlFor="sso-nameid">{t('nameIdFormat')}</Label>
        <Input id="sso-nameid" value={SSO_NAME_ID_FORMAT} readOnly />
        <p className="text-muted-foreground text-sm">{t('nameIdHelp')}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="sso-signing">{t('requestSigning')}</Label>
        <select
          id="sso-signing"
          className="w-full rounded-md border bg-background p-2"
          value={signing}
          onChange={(e) =>
            setSigning(e.target.value === 'unsigned' ? 'unsigned' : 'required')
          }
        >
          <option value="required">{t('signingRequired')}</option>
          <option value="unsigned">{t('signingUnsigned')}</option>
        </select>
        <p className="text-muted-foreground text-sm">{t('signingHelp')}</p>
      </div>
      {signing === 'required' && (
        <div className="space-y-2">
          <Label htmlFor="sso-certificate">{t('spCertificate')}</Label>
          <Textarea
            id="sso-certificate"
            name="certificate"
            required
            maxLength={16384}
            defaultValue={client?.spCertificate ?? ''}
            rows={6}
          />
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {t('save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={onCancel}
        >
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

export function EnableClientDialog({
  client,
  busy,
  onConfirm,
  onClose,
}: {
  client: SsoManagedClient | null;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations('workspace-sso');
  return (
    <Dialog
      open={client !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('confirmTitle')}</DialogTitle>
          <DialogDescription>
            {t('confirmDescription', { name: client?.displayName ?? '' })}
          </DialogDescription>
        </DialogHeader>
        <p className="text-sm">{t('confirmWarning')}</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            {t('cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {t('confirmEnable')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
