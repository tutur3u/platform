'use client';

import { Copy, Link2, Users } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function SessionInvitation({ roomCode }: { roomCode: string }) {
  const t = useTranslations('parley');
  const [pending, setPending] = useState(false);
  async function copy(link: boolean) {
    setPending(true);
    try {
      await navigator.clipboard.writeText(
        link ? new URL(`/r/${roomCode}`, window.location.origin).href : roomCode
      );
      toast.success(t(link ? 'invite_link_copied' : 'room_code_copied'));
    } catch {
      toast.error(t('copy_failed'));
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      className="space-y-4 rounded-xl border bg-card p-5"
      aria-label={t('invite_participants')}
    >
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 font-semibold">
          <Users className="size-4" aria-hidden />
          {t('invite_participants')}
        </h2>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {t('invite_hint')}
        </p>
      </div>
      <label className="block space-y-2 text-sm" htmlFor="invitation-code">
        <span>{t('room_code')}</span>
        <Input
          id="invitation-code"
          value={roomCode}
          readOnly
          className="font-mono text-xs"
          onFocus={(event) => event.target.select()}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={pending} onClick={() => copy(true)}>
          <Link2 className="size-4" />
          {t('copy_invite_link')}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => copy(false)}>
          <Copy className="size-4" />
          {t('copy_room_code')}
        </Button>
      </div>
    </section>
  );
}
