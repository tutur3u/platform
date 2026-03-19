'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, Loader2, Trash2 } from '@tuturuuu/icons';
import type { Workspace } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch, uploadToStorageUrl } from '@/lib/api-fetch';

interface Props {
  workspace: Workspace;
  defaultValue?: string | null;
  disabled?: boolean;
}

export default function LogoInput({ workspace, disabled }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const { data: logoData } = useQuery({
    queryKey: ['workspace-logo', workspace.id, workspace.logo_url],
    queryFn: () =>
      apiFetch<{ url: string | null }>(
        `/api/v1/workspaces/${workspace.id}/logo`,
        {
          cache: 'no-store',
        }
      ),
    enabled: !!workspace.logo_url,
  });

  const uploadLogoMutation = useMutation({
    mutationFn: async (selectedFile: File) => {
      const payload = await apiFetch<{
        signedUrl: string;
        token: string;
        filePath: string;
      }>(`/api/v1/workspaces/${workspace.id}/logo/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: selectedFile.name }),
      });

      await uploadToStorageUrl(payload.signedUrl, selectedFile, payload.token);

      await apiFetch(`/api/v1/workspaces/${workspace.id}/logo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: payload.filePath }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Workspace updated',
        description: 'Workspace logo updated successfully.',
      });
      setFile(null);
      router.refresh();
    },
    onError: (error) => {
      console.error('Error uploading logo:', error);
      toast({
        title: 'Error uploading logo',
        description: 'There was an error uploading the logo.',
      });
    },
  });

  const deleteLogoMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/v1/workspaces/${workspace.id}/logo`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      toast({
        title: 'Workspace updated',
        description: 'Workspace logo updated successfully.',
      });
      router.refresh();
    },
    onError: (error) => {
      console.error('Error removing logo:', error);
      toast({
        title: 'Error uploading logo',
        description: 'There was an error uploading the logo.',
      });
    },
  });

  const uploadLogo = async () => {
    if (!file) return;
    await uploadLogoMutation.mutateAsync(file);
  };

  const uploading =
    uploadLogoMutation.isPending || deleteLogoMutation.isPending;
  const logoUrl = logoData?.url ?? null;

  return (
    <>
      {logoUrl ? (
        <div className="mb-4 flex items-center justify-center">
          <Image
            width={320}
            height={80}
            src={logoUrl}
            alt="Logo"
            className="rounded-lg"
          />
        </div>
      ) : null}

      <div className="flex items-start gap-2">
        <Input
          id="single"
          type="file"
          accept="image/*"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={disabled}
        />

        <Button
          type="submit"
          size="icon"
          onClick={uploadLogo}
          disabled={!file || uploading}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Check className="h-5 w-5" />
          )}
        </Button>
        {workspace.logo_url && (
          <Button
            type="button"
            variant="destructive"
            size="icon"
            onClick={() => void deleteLogoMutation.mutateAsync()}
            disabled={uploading}
          >
            {deleteLogoMutation.isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Trash2 className="h-5 w-5" />
            )}
          </Button>
        )}
      </div>
    </>
  );
}
