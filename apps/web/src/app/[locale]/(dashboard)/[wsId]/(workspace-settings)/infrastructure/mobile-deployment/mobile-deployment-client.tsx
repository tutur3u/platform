'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  RefreshCw,
  Rocket,
  RotateCcw,
  Upload,
} from '@tuturuuu/icons';
import {
  activateMobileDeploymentDraft,
  clearMobileDeploymentEnvKeyValue,
  clearMobileDeploymentScalarValue,
  getMobileDeploymentState,
  issueMobileDeploymentCiToken,
  type MobileDeploymentFileKind,
  type MobileDeploymentScalarName,
  type MobileDeploymentState,
  revokeMobileDeploymentCiToken,
  rollbackMobileDeploymentVersion,
  saveMobileDeploymentEnvKeyValue,
  saveMobileDeploymentScalarValue,
  uploadMobileDeploymentFileResource,
} from '@tuturuuu/internal-api/infrastructure';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { MOBILE_DEPLOYMENT_FILE_KINDS } from './mobile-deployment-config';
import { MobileDeploymentEnvPanel } from './mobile-deployment-env-panel';
import {
  ResourceBadge,
  ResourceMetadata,
  VersionSummary,
} from './mobile-deployment-resource-status';
import { MobileDeploymentScalarPanel } from './mobile-deployment-scalar-panel';

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

  const envSaveMutation = useMutation({
    mutationFn: async ({
      name,
      previousName,
      value,
    }: {
      name: string;
      previousName?: string;
      value: string;
    }) => {
      const normalizedName = name.trim();
      const state = await saveMobileDeploymentEnvKeyValue(
        normalizedName,
        value
      );

      if (previousName && previousName !== normalizedName) {
        return clearMobileDeploymentEnvKeyValue(previousName);
      }

      return state;
    },
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('saved') });
    },
  });

  const envClearMutation = useMutation({
    mutationFn: (name: string) => clearMobileDeploymentEnvKeyValue(name),
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('cleared') });
    },
  });

  const scalarSaveMutation = useMutation({
    mutationFn: ({
      name,
      value,
    }: {
      name: MobileDeploymentScalarName;
      value: string;
    }) => saveMobileDeploymentScalarValue(name, value),
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('saved') });
    },
  });

  const scalarClearMutation = useMutation({
    mutationFn: (name: MobileDeploymentScalarName) =>
      clearMobileDeploymentScalarValue(name),
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

  const fileStatusByName = useMemo(
    () => new Map(data.fileArtifacts.map((entry) => [entry.name, entry])),
    [data.fileArtifacts]
  );

  const verify = async () => {
    const result = await refetch();
    if (result.data) {
      refresh(result.data);
    }
    toast({ title: t('verified') });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <VersionSummary
          label={t('activeVersion')}
          missingLabel={t('missing')}
          noneLabel={t('none')}
          readyLabel={t('ready')}
          version={data.activeVersion}
        />
        <VersionSummary
          label={t('draftVersion')}
          missingLabel={t('missing')}
          noneLabel={t('none')}
          readyLabel={t('ready')}
          version={data.draftVersion}
        />
      </div>

      <div className="flex justify-end">
        <Button disabled={isFetching} onClick={verify} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('verify')}
        </Button>
      </div>

      <MobileDeploymentEnvPanel
        clearPending={envClearMutation.isPending}
        envKeys={data.envKeys}
        onClear={(name) => envClearMutation.mutate(name)}
        onSave={async (payload) => {
          await envSaveMutation.mutateAsync(payload);
        }}
        savePending={envSaveMutation.isPending}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <MobileDeploymentScalarPanel
          clearPending={scalarClearMutation.isPending}
          onClear={(name) => scalarClearMutation.mutate(name)}
          onSave={async (payload) => {
            await scalarSaveMutation.mutateAsync(payload);
          }}
          savePending={scalarSaveMutation.isPending}
          scalarValues={data.scalarValues}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('filesTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {MOBILE_DEPLOYMENT_FILE_KINDS.map((kind) => {
              const status = fileStatusByName.get(kind);
              const configured = Boolean(status?.configured);

              return (
                <div
                  className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                  key={kind}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 truncate font-mono text-sm">
                        {kind}
                      </span>
                      <ResourceBadge
                        missingLabel={t('missing')}
                        ok={configured}
                        readyLabel={t('ready')}
                      />
                    </div>
                    <ResourceMetadata status={status} />
                  </div>
                  <Label className="inline-flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm">
                    <Upload className="mr-2 h-4 w-4" />
                    {t('upload')}
                    <input
                      className="sr-only"
                      disabled={fileMutation.isPending}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          fileMutation.mutate({ file, kind });
                        }
                        event.currentTarget.value = '';
                      }}
                      type="file"
                    />
                  </Label>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('tokensTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {issuedToken && (
            <Alert>
              <KeyRound className="h-4 w-4" />
              <AlertTitle>{t('tokenIssued')}</AlertTitle>
              <AlertDescription className="break-all font-mono text-xs">
                {issuedToken}
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <Label htmlFor="mobile-deployment-token-name">{t('name')}</Label>
              <Input
                id="mobile-deployment-token-name"
                onChange={(event) => setTokenName(event.target.value)}
                value={tokenName}
              />
            </div>
            <Button
              disabled={!tokenName.trim() || issueTokenMutation.isPending}
              onClick={() => issueTokenMutation.mutate()}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {t('issueToken')}
            </Button>
          </div>

          <div className="grid gap-2">
            {data.tokens.map((token) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
                key={token.id}
              >
                <div>
                  <div className="font-medium">{token.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {token.prefix}...{token.lastFour}
                  </div>
                </div>
                <Button
                  disabled={
                    Boolean(token.revokedAt) || revokeTokenMutation.isPending
                  }
                  onClick={() => revokeTokenMutation.mutate(token.id)}
                  size="sm"
                  variant="outline"
                >
                  {t('revoke')}
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!data.draftVersion?.ready || activateMutation.isPending}
          onClick={() => activateMutation.mutate()}
        >
          <Rocket className="mr-2 h-4 w-4" />
          {t('activate')}
        </Button>
        <Button
          disabled={rollbackMutation.isPending}
          onClick={() => rollbackMutation.mutate()}
          variant="outline"
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('rollback')}
        </Button>
      </div>

      <Separator />

      <div className="space-y-2">
        <h2 className="font-semibold text-base">{t('auditTitle')}</h2>
        <div className="grid gap-2">
          {data.auditEvents.slice(0, 12).map((event) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              key={event.id}
            >
              <span>{event.eventType}</span>
              <span className="text-muted-foreground text-xs">
                {new Date(event.createdAt).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
