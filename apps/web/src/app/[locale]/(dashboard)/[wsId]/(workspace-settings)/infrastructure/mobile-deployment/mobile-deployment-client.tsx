'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  activateMobileDeploymentDraft,
  clearMobileDeploymentSecret,
  getMobileDeploymentState,
  issueMobileDeploymentCiToken,
  type MobileDeploymentFileKind,
  type MobileDeploymentSecretKind,
  type MobileDeploymentState,
  revokeMobileDeploymentCiToken,
  rollbackMobileDeploymentVersion,
  saveMobileDeploymentSecret,
  uploadMobileDeploymentFileResource,
} from '@tuturuuu/internal-api/infrastructure';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MobileDeploymentSecretsPanel } from './mobile-deployment-secrets-panel';
import {
  MobileDeploymentAuditPanel,
  MobileDeploymentFilesPanel,
  MobileDeploymentOverviewPanel,
  MobileDeploymentTokensPanel,
} from './mobile-deployment-tab-panels';

const QUERY_KEY = ['mobile-deployment-state'];

export function MobileDeploymentClient({
  initialData,
}: {
  initialData: MobileDeploymentState;
}) {
  const t = useTranslations('mobile-deployment-settings');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tokenName, setTokenName] = useState('GitHub Actions mobile deploy');
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const { data, isFetching, refetch } = useQuery({
    initialData,
    queryFn: () => getMobileDeploymentState(),
    queryKey: QUERY_KEY,
  });

  const refresh = (state?: MobileDeploymentState) => {
    if (state) {
      queryClient.setQueryData(QUERY_KEY, state);
    }
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
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
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('saved') });
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
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('cleared') });
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
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('uploaded') });
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => activateMobileDeploymentDraft(),
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('activated') });
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: () => rollbackMobileDeploymentVersion(),
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('rolledBack') });
    },
  });

  const issueTokenMutation = useMutation({
    mutationFn: () =>
      issueMobileDeploymentCiToken({
        expiresInDays: 90,
        name: tokenName,
        platforms: ['android', 'ios'],
      }),
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: ({ state, token }) => {
      setIssuedToken(token);
      refresh(state);
      toast({ title: t('tokenIssued') });
    },
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => revokeMobileDeploymentCiToken(tokenId),
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('tokenRevoked') });
    },
  });

  const verify = async () => {
    const result = await refetch();
    if (result.data) {
      refresh(result.data);
    }
    toast({ title: t('verified') });
  };

  return (
    <Tabs className="gap-4" defaultValue="overview">
      <TabsList className="grid h-auto w-full grid-cols-2 md:grid-cols-5">
        <TabsTrigger value="overview">{t('overviewTitle')}</TabsTrigger>
        <TabsTrigger value="secrets">{t('secretsTitle')}</TabsTrigger>
        <TabsTrigger value="files">{t('filesTitle')}</TabsTrigger>
        <TabsTrigger value="tokens">{t('tokensTitle')}</TabsTrigger>
        <TabsTrigger value="audit">{t('auditTitle')}</TabsTrigger>
      </TabsList>

      <TabsContent className="mt-0 space-y-4" value="overview">
        <MobileDeploymentOverviewPanel
          activeVersion={data.activeVersion}
          activateDisabled={
            !data.draftVersion?.ready || activateMutation.isPending
          }
          draftVersion={data.draftVersion}
          isFetching={isFetching}
          onActivate={() => activateMutation.mutate()}
          onRollback={() => rollbackMutation.mutate()}
          onVerify={verify}
          rollbackDisabled={rollbackMutation.isPending}
        />
      </TabsContent>

      <TabsContent className="mt-0" value="secrets">
        <MobileDeploymentSecretsPanel
          clearPending={secretClearMutation.isPending}
          envKeys={data.envKeys}
          onClearEnv={(name) =>
            secretClearMutation.mutate({ kind: 'env', name })
          }
          onClearScalar={(name) =>
            secretClearMutation.mutate({ kind: 'scalar', name })
          }
          onSaveEnv={async (payload) => {
            await secretSaveMutation.mutateAsync({ kind: 'env', ...payload });
          }}
          onSaveScalar={async (payload) => {
            await secretSaveMutation.mutateAsync({
              kind: 'scalar',
              ...payload,
            });
          }}
          savePending={secretSaveMutation.isPending}
          scalarValues={data.scalarValues}
        />
      </TabsContent>

      <TabsContent className="mt-0" value="files">
        <MobileDeploymentFilesPanel
          fileArtifacts={data.fileArtifacts}
          onUpload={(kind, file) => fileMutation.mutate({ file, kind })}
          uploadPending={fileMutation.isPending}
        />
      </TabsContent>

      <TabsContent className="mt-0" value="tokens">
        <MobileDeploymentTokensPanel
          issuedToken={issuedToken}
          issuePending={issueTokenMutation.isPending}
          onIssueToken={() => issueTokenMutation.mutate()}
          onRevokeToken={(tokenId) => revokeTokenMutation.mutate(tokenId)}
          onTokenNameChange={setTokenName}
          revokePending={revokeTokenMutation.isPending}
          tokenName={tokenName}
          tokens={data.tokens}
        />
      </TabsContent>

      <TabsContent className="mt-0" value="audit">
        <MobileDeploymentAuditPanel auditEvents={data.auditEvents} />
      </TabsContent>
    </Tabs>
  );
}
