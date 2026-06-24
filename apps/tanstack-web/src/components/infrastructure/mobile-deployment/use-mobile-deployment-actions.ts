'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  activateMobileDeploymentDraft,
  clearMobileDeploymentSecret,
  issueMobileDeploymentCiToken,
  type MobileDeploymentFileKind,
  type MobileDeploymentSecretKind,
  type MobileDeploymentState,
  revokeMobileDeploymentCiToken,
  rollbackMobileDeploymentVersion,
  saveMobileDeploymentSecret,
  uploadMobileDeploymentFileResource,
} from '@tuturuuu/internal-api/infrastructure/mobile';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export const MOBILE_DEPLOYMENT_QUERY_KEY = ['mobile-deployment-state'];

export function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useMobileDeploymentActions() {
  const t = useTranslations('mobile-deployment-settings');
  const queryClient = useQueryClient();
  const [tokenName, setTokenName] = useState('GitHub Actions mobile deploy');
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const refresh = (state?: MobileDeploymentState) => {
    if (state) {
      queryClient.setQueryData(MOBILE_DEPLOYMENT_QUERY_KEY, state);
    }
    queryClient.invalidateQueries({ queryKey: MOBILE_DEPLOYMENT_QUERY_KEY });
  };

  const showError = (mutationError: unknown) => {
    toast.error(getErrorMessage(mutationError, t('error')));
  };

  const secretSaveMutation = useMutation({
    mutationFn: ({
      kind,
      name,
      previousName,
      value,
    }: {
      kind: MobileDeploymentSecretKind;
      name: string;
      previousName?: string;
      value: string;
    }) => saveMobileDeploymentSecret({ kind, name, previousName, value }),
    onError: showError,
    onSuccess: (state) => {
      refresh(state);
      toast.success(t('saved'));
    },
  });

  const secretClearMutation = useMutation({
    mutationFn: ({
      kind,
      name,
    }: {
      kind: MobileDeploymentSecretKind;
      name: string;
    }) => clearMobileDeploymentSecret({ kind, name }),
    onError: showError,
    onSuccess: (state) => {
      refresh(state);
      toast.success(t('cleared'));
    },
  });

  const fileMutation = useMutation({
    mutationFn: ({
      file,
      kind,
    }: {
      file: File;
      kind: MobileDeploymentFileKind;
    }) => uploadMobileDeploymentFileResource(kind, file),
    onError: showError,
    onSuccess: (state) => {
      refresh(state);
      toast.success(t('uploaded'));
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => activateMobileDeploymentDraft(),
    onError: showError,
    onSuccess: (state) => {
      refresh(state);
      toast.success(t('activated'));
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: () => rollbackMobileDeploymentVersion(),
    onError: showError,
    onSuccess: (state) => {
      refresh(state);
      toast.success(t('rolledBack'));
    },
  });

  const issueTokenMutation = useMutation({
    mutationFn: () =>
      issueMobileDeploymentCiToken({
        expiresInDays: 90,
        name: tokenName,
        platforms: ['android', 'ios'],
      }),
    onError: showError,
    onSuccess: ({ state, token }) => {
      setIssuedToken(token);
      refresh(state);
      toast.success(t('tokenIssued'));
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => revokeMobileDeploymentCiToken(tokenId),
    onError: showError,
    onSuccess: (state) => {
      refresh(state);
      toast.success(t('tokenRevoked'));
    },
  });

  return {
    activateMutation,
    fileMutation,
    issuedToken,
    issueTokenMutation,
    refresh,
    revokeTokenMutation,
    rollbackMutation,
    secretClearMutation,
    secretSaveMutation,
    setTokenName,
    tokenName,
  };
}
