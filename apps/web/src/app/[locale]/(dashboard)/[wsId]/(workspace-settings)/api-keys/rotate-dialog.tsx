'use client';

import { AlertTriangle, RefreshCcw } from '@tuturuuu/icons';
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
import KeyDisplayModal from './key-display-modal';

interface Props {
  apiKey: WorkspaceApiKey;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function RotateDialog({ apiKey, open, onOpenChange }: Props) {
  const t = useTranslations('ws-api-keys');
  const router = useRouter();
  const [isRotating, setIsRotating] = useState(false);
  const [newKey, setNewKey] = useState<{
    key: string;
    prefix: string;
  } | null>(null);

  const handleRotate = async () => {
    setIsRotating(true);

    try {
      const res = await fetch(
        `/api/v1/workspaces/${apiKey.ws_id}/api-keys/${apiKey.id}/rotate`,
        {
          method: 'POST',
        }
      );

      if (res.ok) {
        const responseData = await res.json();
        // Close rotate dialog first
        onOpenChange(false);
        // Then open key display modal after a brief delay
        setTimeout(() => {
          setNewKey({
            key: responseData.key,
            prefix: responseData.prefix,
          });
        }, 100);
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
        toast.error(t('rotate_failed'), {
          description: errorMessage,
        });
      }
    } catch (_) {
      toast.error(t('rotate_failed'), {
        description: t('common.error'),
      });
    } finally {
      setIsRotating(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCcw className="h-5 w-5" />
              {t('rotate_key')}
            </DialogTitle>
            <DialogDescription>{t('rotate_confirm_message')}</DialogDescription>
          </DialogHeader>

          <div className="flex items-start gap-2 rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/10 p-3 text-dynamic-orange">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold">{t('rotate_warning_title')}</p>
              <p>{t('rotate_warning_description')}</p>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-muted/50 p-3">
            <div className="mb-1 font-medium text-sm">{t('key_details')}</div>
            <div className="space-y-1 text-muted-foreground text-sm">
              <div>
                <span className="font-medium">{t('name')}:</span> {apiKey.name}
              </div>
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
              disabled={isRotating}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleRotate}
              disabled={isRotating}
              variant="destructive"
            >
              {isRotating ? t('rotating') : t('rotate_key')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <KeyDisplayModal
        open={!!newKey}
        onOpenChange={(open) => {
          if (!open) {
            setNewKey(null);
            // Refresh the page after user has saved the key
            router.refresh();
          }
        }}
        apiKey={newKey?.key || ''}
        keyPrefix={newKey?.prefix || ''}
        roleName={undefined}
        expiresAt={apiKey.expires_at}
      />
    </>
  );
}
