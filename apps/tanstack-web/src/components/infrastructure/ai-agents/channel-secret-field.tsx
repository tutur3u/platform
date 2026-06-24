'use client';

import { Eye, EyeOff, RotateCcw, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { SECRET_CLEAR_VALUE } from './ai-agents-utils';
import type { Channel } from './channel-types';

function secretDescriptor(channel: Channel | undefined, name: string) {
  return channel?.secrets.find((secret) => secret.name === name);
}

export function SensitiveSecretField({
  channel,
  label,
  name,
  secretName,
}: {
  channel?: Channel;
  label: string;
  name: string;
  secretName: string;
}) {
  const t = useTranslations('ai-agents-settings');
  const descriptor = secretDescriptor(channel, secretName);
  const [editing, setEditing] = useState(!descriptor?.configured);
  const [showValue, setShowValue] = useState(false);
  const [cleared, setCleared] = useState(false);

  if (cleared) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <input name={name} type="hidden" value={SECRET_CLEAR_VALUE} />
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 text-muted-foreground">
            {t('secret.cleared_on_save')}
          </span>
          <Button
            onClick={() => setCleared(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <RotateCcw className="h-4 w-4" />
            {t('actions.undo')}
          </Button>
        </div>
      </div>
    );
  }

  if (descriptor?.configured && !editing) {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            className="font-mono"
            readOnly
            value={t('secret.configured', {
              suffix: descriptor.lastFour ?? '****',
            })}
          />
          <Button
            onClick={() => setEditing(true)}
            type="button"
            variant="outline"
          >
            {t('actions.replace')}
          </Button>
          <Button
            onClick={() => setCleared(true)}
            type="button"
            variant="secondary"
          >
            <Trash2 className="h-4 w-4" />
            {t('actions.clear')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex gap-2">
        <Input
          className="font-mono"
          id={name}
          name={name}
          placeholder={label}
          type={showValue ? 'text' : 'password'}
        />
        <Button
          aria-label={showValue ? t('actions.hide') : t('actions.show')}
          onClick={() => setShowValue((value) => !value)}
          size="icon"
          type="button"
          variant="outline"
        >
          {showValue ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </Button>
        {descriptor?.configured ? (
          <Button
            onClick={() => setEditing(false)}
            type="button"
            variant="ghost"
          >
            {t('actions.cancel')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
