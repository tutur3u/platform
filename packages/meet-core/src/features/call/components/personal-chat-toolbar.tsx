'use client';
import { AudioLines, Info, LockKeyhole } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { liveVoiceSchema } from '../../live-assistant/contracts';
import {
  setLiveVoice,
  useLiveVoice,
} from '../../live-assistant/live-session-store';
import { MiraAdultNotice } from '../../live-assistant/mira-adult-notice';
import {
  MiraPermissionsCard,
  type MiraPermissionsProps,
} from './mira-permissions-card';

function VoiceSettings({ locked }: { locked: boolean }) {
  const t = useTranslations('meet.live');
  const voice = useLiveVoice();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-full pointer-coarse:size-11 text-muted-foreground"
          aria-label={t('voice')}
        >
          <AudioLines aria-hidden className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 space-y-2">
        <Label>{t('voice')}</Label>
        <Select
          value={voice}
          disabled={locked}
          onValueChange={(value) => setLiveVoice(liveVoiceSchema.parse(value))}
        >
          <SelectTrigger aria-label={t('voice')}>
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
      </PopoverContent>
    </Popover>
  );
}

function AssistantInfo({
  permissions,
}: {
  permissions?: MiraPermissionsProps;
}) {
  const t = useTranslations('meet.live');
  const tm = useTranslations('meet.call.miraEverywhere.tutor');
  const ta = useTranslations('meet.call.miraEverywhere.tutor.assistant');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-full pointer-coarse:size-11 text-muted-foreground"
          aria-label={ta('info')}
        >
          <Info aria-hidden className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="max-h-[70dvh] w-80 space-y-3 overflow-y-auto text-sm"
      >
        <p className="text-pretty">
          {t('private_mic_hint')} {tm('privacyDetail')}
        </p>
        <MiraPermissionsCard
          {...permissions}
          className="border-0 bg-transparent p-0"
        />
        <MiraAdultNotice />
        <a
          className="inline-block text-muted-foreground text-xs underline"
          href="https://tuturuuu.com/privacy"
          target="_blank"
          rel="noreferrer"
        >
          {t('phase_legal')}
        </a>
      </PopoverContent>
    </Popover>
  );
}

/** The private caption on the left; voice and the full explanation on the right. */
export function PersonalChatToolbar({
  voice,
  voiceLocked,
  permissions,
}: {
  voice: boolean;
  voiceLocked: boolean;
  permissions?: MiraPermissionsProps;
}) {
  const ta = useTranslations('meet.call.miraEverywhere.tutor.assistant');
  return (
    <div className="flex items-center gap-1 px-3 pt-1">
      <span className="flex items-center gap-1.5 text-muted-foreground text-xs">
        <LockKeyhole aria-hidden className="size-3.5" />
        {ta('private')}
      </span>
      <div className="ms-auto flex items-center">
        {voice && <VoiceSettings locked={voiceLocked} />}
        <AssistantInfo permissions={permissions} />
      </div>
    </div>
  );
}
