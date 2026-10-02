'use client';

import { ArrowRight, Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import {
  createStarterDraft,
  type StarterType,
  starterTypes,
} from './starter-drafts';
import { useLettinMutation } from './use-lettin';

export function CreateWorld({
  wsId,
  initialStarter = 'blank',
}: {
  wsId: string;
  initialStarter?: StarterType;
}) {
  const t = useTranslations('lettin');
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [starter, setStarter] = useState<StarterType>(initialStarter);
  const mutation = useLettinMutation(wsId);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus size={16} />
          {t('newWorld')}
        </Button>
      </DialogTrigger>
      <DialogContent className="notebook-theme studio-create-dialog">
        <DialogHeader>
          <DialogTitle>{t('newWorld')}</DialogTitle>
          <DialogDescription>{t('draftHint')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-5"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              const result = await mutation.mutateAsync({
                action: 'createWorld',
                draft: createStarterDraft(title.trim(), starter, (key) =>
                  t(key)
                ),
              });
              router.push(`/${wsId}/worlds/${result.id}`);
            } catch {
              /* The mutation error is rendered below. */
            }
          }}
        >
          <label className="block space-y-2 text-sm">
            <span>{t('title')}</span>
            <Input
              required
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <fieldset className="space-y-3">
            <legend className="text-sm">{t('chooseStartingPoint')}</legend>
            <div className="studio-template-options">
              {starterTypes.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={starter === type}
                  onClick={() => setStarter(type)}
                >
                  {t(`starter${type}`)}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">{t('starterHint')}</p>
          </fieldset>
          <Button disabled={mutation.isPending || !title.trim()}>
            {t(mutation.isPending ? 'creating' : 'create')}
            <ArrowRight size={16} />
          </Button>
          {mutation.errorMessage && (
            <p role="alert" className="text-sm">
              {mutation.errorMessage}
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
