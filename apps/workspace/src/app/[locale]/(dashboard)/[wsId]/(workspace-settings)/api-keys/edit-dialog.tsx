'use client';

import type { WorkspaceApiKey } from '@tuturuuu/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { useState } from 'react';
import type * as z from 'zod';
import ApiKeyForm, { type ApiConfigFormSchema } from './form';
import KeyDisplayModal from './key-display-modal';

interface Role {
  id: string;
  name: string;
}

interface Props {
  data: Partial<WorkspaceApiKey> & { ws_id: string };
  roles?: Role[];
  trigger?: React.ReactNode;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  submitLabel?: string;
}

export default function ApiKeyEditDialog({
  data,
  roles,
  trigger,
  open: externalOpen,
  setOpen: setExternalOpen,
  submitLabel,
}: Props) {
  const router = useRouter();
  const t = useTranslations('ws-api-keys');

  const [internalOpen, setInternalOpen] = useState(false);
  const [newKey, setNewKey] = useState<{
    key: string;
    prefix: string;
    roleName?: string;
    expiresAt?: string | null;
  } | null>(null);

  const open = externalOpen ?? internalOpen;
  const setOpen = setExternalOpen ?? setInternalOpen;

  const handleSubmit = async (values: z.infer<typeof ApiConfigFormSchema>) => {
    const res = await fetch(
      data.id
        ? `/api/v1/workspaces/${data.ws_id}/api-keys/${data.id}`
        : `/api/v1/workspaces/${data.ws_id}/api-keys`,
      {
        method: data.id ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(values),
      }
    );

    if (res.ok) {
      try {
        const responseData = await res.json();

        // For new keys, the server returns the generated key and prefix
        // Show it to the user in a modal (they won't be able to see it again)
        if (!data.id && responseData.key) {
          const roleName = roles?.find((r) => r.id === values.role_id)?.name;
          const prefix =
            responseData.prefix ?? responseData.key?.slice(0, 8) ?? '';
          setNewKey({
            key: responseData.key,
            prefix,
            roleName,
            expiresAt: values.expires_at,
          });
          toast.success(t('key_created_successfully'));
        } else {
          toast.success(t('key_updated_successfully'));
        }

        setOpen(false);
        router.refresh();
      } catch (_) {
        // Handle non-JSON response
        toast.success(
          t(data.id ? 'key_updated_successfully' : 'key_created_successfully')
        );
        setOpen(false);
        router.refresh();
      }
    } else {
      try {
        const errorData = await res.json();
        toast.error(t(`failed_to_${data.id ? 'edit' : 'create'}_key`), {
          description: errorData.message,
        });
      } catch (_) {
        // Fallback to status text if JSON parsing fails
        const fallbackMessage = await res
          .text()
          .catch(() => `${res.status} ${res.statusText || 'Request failed'}`);
        toast.error(t(`failed_to_${data.id ? 'edit' : 'create'}_key`), {
          description: fallbackMessage,
        });
      }
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
        <DialogContent
          onOpenAutoFocus={(e) => (data.name ? e.preventDefault() : null)}
        >
          <DialogHeader>
            <DialogTitle>{t('api_key')}</DialogTitle>
            <DialogDescription>
              {data.id
                ? t('edit_existing_workspace_key')
                : t('add_new_workspace_key')}
            </DialogDescription>
          </DialogHeader>

          <ApiKeyForm
            data={data}
            roles={roles}
            onSubmit={handleSubmit}
            submitLabel={submitLabel}
          />
        </DialogContent>
      </Dialog>

      {newKey && (
        <KeyDisplayModal
          open={!!newKey}
          onOpenChange={(open) => !open && setNewKey(null)}
          apiKey={newKey.key}
          keyPrefix={newKey.prefix}
          roleName={newKey.roleName}
          expiresAt={newKey.expiresAt}
        />
      )}
    </>
  );
}
