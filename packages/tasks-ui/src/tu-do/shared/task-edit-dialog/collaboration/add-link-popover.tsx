'use client';

import { Loader2, Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { isHttpsUrl } from './link-groups';

interface AddLinkPopoverProps {
  pending?: boolean;
  onAdd: (url: string) => Promise<unknown>;
}

export function AddLinkPopover({
  pending = false,
  onAdd,
}: AddLinkPopoverProps) {
  const t = useTranslations('task-collaboration');
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const trimmed = url.trim();
  const invalid = trimmed.length > 0 && !isHttpsUrl(trimmed);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isHttpsUrl(trimmed) || pending) return;
    try {
      await onAdd(trimmed);
      setUrl('');
      setOpen(false);
    } catch {
      // The mutation reports the failure; the URL stays for a retry.
    }
  };

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Plus className="h-3.5 w-3.5" />
          {t('add_link')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <form className="space-y-2" onSubmit={submit}>
          <Input
            aria-invalid={invalid}
            aria-label={t('link_url_label')}
            autoFocus
            onChange={(event) => setUrl(event.target.value)}
            placeholder={t('link_url_placeholder')}
            type="url"
            value={url}
          />
          {invalid && (
            <p className="text-destructive text-xs" role="alert">
              {t('link_url_invalid')}
            </p>
          )}
          <div className="flex justify-end">
            <Button
              disabled={!isHttpsUrl(trimmed) || pending}
              size="sm"
              type="submit"
            >
              {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('add')}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
