'use client';
import { decodeRoomCode } from '@tuturuuu/meet-core/features/call/lib/room-code';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { joinScenario } from './actions';

export function JoinSession() {
  const t = useTranslations('parley');
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState('');
  return (
    <form
      className="w-full space-y-2 sm:w-auto"
      action={(data) => {
        if (!decodeRoomCode(code.trim())) {
          toast.error(t('invalid_code'));
          return;
        }
        startTransition(async () => {
          await joinScenario(data);
        });
      }}
    >
      <label htmlFor="room-code" className="font-medium text-sm">
        {t('join')}
      </label>
      <div className="flex gap-2">
        <Input
          id="room-code"
          name="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={t('room_code')}
          required
          className="sm:w-60"
        />
        <Button variant="outline" disabled={pending || !code.trim()}>
          {t(pending ? 'joining' : 'join')}
        </Button>
      </div>
    </form>
  );
}
