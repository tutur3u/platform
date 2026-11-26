'use client';

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
import { useTranslations } from 'next-intl';
import { useActionState, useState } from 'react';
import { updateWorkspaceReviewPlan } from './review-plan-actions';

export function ReviewPlanPanel({ requestId }: { requestId: string }) {
  const t = useTranslations('workspaceReviewPlan');
  const [grantState, grantAction, granting] = useActionState(
    updateWorkspaceReviewPlan,
    { status: 'idle' }
  );
  const [revokeState, revokeAction, revoking] = useActionState(
    updateWorkspaceReviewPlan,
    { status: 'idle' }
  );
  const [grantId, setGrantId] = useState(requestId);
  const pending = granting || revoking;

  return (
    <section className="space-y-4 rounded-xl border p-5">
      <h2 className="font-semibold text-xl">{t('title')}</h2>
      <form
        action={grantAction}
        className="grid gap-4 md:grid-cols-2"
        onChange={() => setGrantId(crypto.randomUUID())}
      >
        <input name="operation" type="hidden" value="grant" />
        <input name="grantId" type="hidden" value={grantId} />
        <Label>
          {t('workspaceId')}
          <Input name="workspaceId" required />
        </Label>
        <Label>
          {t('plan')}
          <Select name="tier" defaultValue="PLUS">
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PLUS">Plus</SelectItem>
              <SelectItem value="PRO">Pro</SelectItem>
            </SelectContent>
          </Select>
        </Label>
        <Label>
          {t('reason')}
          <Input name="reason" required maxLength={500} />
        </Label>
        <Label>
          {t('expiresOn')}
          <Input name="expiresOn" required type="date" />
        </Label>
        <Button disabled={pending} type="submit">
          {t('grant')}
        </Button>
      </form>
      {grantState.status !== 'idle' && (
        <p role="status">
          {grantState.status === 'granted'
            ? t('granted', { id: grantState.grantId })
            : t(grantState.status)}
        </p>
      )}
      <form
        action={revokeAction}
        className="grid gap-4 border-t pt-4 md:grid-cols-2"
      >
        <input name="operation" type="hidden" value="revoke" />
        <Label>
          {t('workspaceId')}
          <Input name="workspaceId" required />
        </Label>
        <Label>
          {t('grantId')}
          <Input name="grantId" required />
        </Label>
        <Button disabled={pending} type="submit" variant="outline">
          {t('revoke')}
        </Button>
      </form>
      {revokeState.status !== 'idle' && revokeState.status !== 'granted' && (
        <p role="status">{t(revokeState.status)}</p>
      )}
    </section>
  );
}
