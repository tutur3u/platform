'use client';

import { AlertTriangle, Trash2 } from '@tuturuuu/icons';
import type { WorkspaceApiKey } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  apiKey: WorkspaceApiKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function DeleteDialog({ apiKey, open, onOpenChange }: Props) {
  const t = useTranslations('ws-api-keys');
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      const res = await fetch(
        `/api/v1/workspaces/${apiKey.ws_id}/api-keys/${apiKey.id}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        toast.success(t('delete_success'));
        onOpenChange(false);
        router.refresh();
      } else {
        let errorMessage = t('common.error');
        try {
          const errorData = await res.json();
          errorMessage = errorData.message || errorMessage;
        } catch {
          // If JSON parsing fails, try to get text response
          try {
            const errorText = await res.text();
            errorMessage = errorText.trim() || `HTTP ${res.status}`;
          } catch {
            errorMessage = `HTTP ${res.status}`;
          }
        }
        toast.error(t('delete_failed'), {
          description: errorMessage,
        });
      }
    } catch (_) {
      toast.error(t('delete_failed'), {
        description: t('common.error'),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-dynamic-red" />
            {t('delete_key')}
          </DialogTitle>
          <DialogDescription>{t('delete_confirm_message')}</DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-lg border border-dynamic-red/20 bg-dynamic-red/10 p-3 text-dynamic-red">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold">{t('delete_warning_title')}</p>
            <p>{t('delete_warning_description')}</p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted/50 p-3">
          <div className="mb-1 font-medium text-sm">{t('key_details')}</div>
          <div className="space-y-1 text-muted-foreground text-sm">
            <div>
              <span className="font-medium">{t('name')}:</span> {apiKey.name}
            </div>
            {apiKey.description && (
              <div>
                <span className="font-medium">{t('description_label')}:</span>{' '}
                {apiKey.description}
              </div>
            )}
            {apiKey.key_prefix && (
              <div>
                <span className="font-medium">{t('key_prefix')}:</span>{' '}
                <code className="font-mono">{apiKey.key_prefix}...</code>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleDelete}
            disabled={isDeleting}
            variant="destructive"
          >
            {isDeleting ? t('deleting') : t('delete_key')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
