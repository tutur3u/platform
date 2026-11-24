'use client';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { liveVoiceSchema } from './contracts';
import { setLiveVoice, useLiveVoice } from './live-session-store';

/** Mira's spoken voice for this device's next personal Live session. */
export function LiveVoiceSelect({ locked }: { locked: boolean }) {
  const t = useTranslations('meet.live');
  const id = useId();
  const voice = useLiveVoice();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t('voice')}</Label>
      <Select
        value={voice}
        disabled={locked}
        onValueChange={(value) => setLiveVoice(liveVoiceSchema.parse(value))}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {liveVoiceSchema.options.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
