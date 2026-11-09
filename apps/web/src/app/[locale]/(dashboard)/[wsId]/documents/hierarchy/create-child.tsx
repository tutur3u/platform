'use client';

import {
  createWorkspaceDocument,
  InternalApiError,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function CreateChild({
  wsId,
  parentId,
  onCreated,
}: {
  wsId: string;
  parentId: string | null;
  onCreated: () => void;
}) {
  const t = useTranslations('document-hierarchy');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [state, setState] = useState<
    'idle' | 'pending' | 'unknown' | 'rejected'
  >('idle');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {parentId ? t('create-child') : t('create-root')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {parentId ? t('create-child') : t('create-root')}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if ((state !== 'idle' && state !== 'rejected') || !name.trim())
              return;
            setState('pending');
            try {
              const result = await createWorkspaceDocument(wsId, {
                name: name.trim(),
                parent_id: parentId,
              });
              setState('idle');
              setName('');
              setOpen(false);
              onCreated();
              router.push(`/${wsId}/documents/${result.id}`);
            } catch (error) {
              setState(
                error instanceof InternalApiError &&
                  error.status >= 400 &&
                  error.status < 500 &&
                  error.status !== 408
                  ? 'rejected'
                  : 'unknown'
              );
              onCreated();
            }
          }}
        >
          <Label htmlFor="child-document-name">{t('name')}</Label>
          <Input
            id="child-document-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={state === 'pending' || state === 'unknown'}
            required
          />
          {state === 'rejected' && <p role="alert">{t('create-rejected')}</p>}
          {state === 'unknown' && (
            <div role="alert">
              <p>{t('create-unknown')}</p>
              <DialogClose asChild>
                <Link href={`/${wsId}/documents`}>{t('inspect-pages')}</Link>
              </DialogClose>
            </div>
          )}
          <Button
            disabled={
              state === 'pending' || state === 'unknown' || !name.trim()
            }
            type="submit"
          >
            {t('create-child')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
