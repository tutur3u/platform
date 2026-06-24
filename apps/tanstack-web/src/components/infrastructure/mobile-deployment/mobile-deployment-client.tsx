'use client';

import { useQuery } from '@tanstack/react-query';
import {
  getMobileDeploymentState,
  type MobileDeploymentState,
} from '@tuturuuu/internal-api/infrastructure/mobile';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { MobileDeploymentAuditPanel } from './mobile-deployment-audit-panel';
import { MobileDeploymentFilesPanel } from './mobile-deployment-files-panel';
import { MobileDeploymentOverviewPanel } from './mobile-deployment-overview-panel';
import { MobileDeploymentSecretsPanel } from './mobile-deployment-secrets-panel';
import { MobileDeploymentTokensPanel } from './mobile-deployment-tokens-panel';
import {
  getErrorMessage,
  MOBILE_DEPLOYMENT_QUERY_KEY,
  useMobileDeploymentActions,
} from './use-mobile-deployment-actions';

export function MobileDeploymentClient({
  initialData,
}: {
  initialData: MobileDeploymentState;
}) {
  const t = useTranslations('mobile-deployment-settings');
  const {
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
  } = useMobileDeploymentActions();

  const { data, error, isFetching, refetch } = useQuery({
    initialData,
    queryFn: () => getMobileDeploymentState(),
    queryKey: MOBILE_DEPLOYMENT_QUERY_KEY,
  });

  const verify = async () => {
    const result = await refetch();
    if (result.data) {
      refresh(result.data);
      toast.success(t('verified'));
      return;
    }

    toast.error(getErrorMessage(result.error ?? error, t('error')));
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
