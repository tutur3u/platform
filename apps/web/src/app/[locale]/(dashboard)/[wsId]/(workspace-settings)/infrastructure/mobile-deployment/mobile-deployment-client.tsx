'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  KeyRound,
  RefreshCw,
  Rocket,
  RotateCcw,
  Upload,
  XCircle,
} from '@tuturuuu/icons';
import {
  activateMobileDeploymentDraft,
  getMobileDeploymentState,
  issueMobileDeploymentCiToken,
  type MobileDeploymentFileKind,
  type MobileDeploymentScalarName,
  type MobileDeploymentState,
  replaceMobileDeploymentEnvFile,
  revokeMobileDeploymentCiToken,
  rollbackMobileDeploymentVersion,
  saveMobileDeploymentScalarValue,
  uploadMobileDeploymentFileResource,
} from '@tuturuuu/internal-api/infrastructure';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useToast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const QUERY_KEY = ['mobile-deployment-state'];

const FILE_KINDS: MobileDeploymentFileKind[] = [
  'android_google_services_json',
  'ios_google_service_info_plist',
  'android_upload_keystore',
  'google_play_service_account_json',
  'apple_distribution_certificate_p12',
  'apple_app_store_provisioning_profile',
  'app_store_connect_private_key_p8',
];

const SCALAR_NAMES: MobileDeploymentScalarName[] = [
  'ANDROID_KEYSTORE_ALIAS',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD',
  'GOOGLE_PLAY_PACKAGE_NAME',
  'GOOGLE_PLAY_TRACK',
  'APPLE_BUNDLE_ID',
  'APPLE_DISTRIBUTION_CERTIFICATE_PASSWORD',
  'APPLE_TEAM_ID',
  'APP_STORE_CONNECT_API_KEY_ID',
  'APP_STORE_CONNECT_ISSUER_ID',
];

function ResourceBadge({
  missingLabel,
  ok,
  readyLabel,
}: {
  missingLabel: string;
  ok: boolean;
  readyLabel: string;
}) {
  return ok ? (
    <Badge variant="default">
      <CheckCircle2 className="mr-1 h-3 w-3" />
      {readyLabel}
    </Badge>
  ) : (
    <Badge variant="secondary">
      <XCircle className="mr-1 h-3 w-3" />
      {missingLabel}
    </Badge>
  );
}

function VersionSummary({
  label,
  missingLabel,
  noneLabel,
  readyLabel,
  version,
}: {
  label: string;
  missingLabel: string;
  noneLabel: string;
  readyLabel: string;
  version: MobileDeploymentState['activeVersion'];
}) {
  if (!version) {
    return (
      <div className="rounded-md border border-dashed p-3 text-muted-foreground text-sm">
        {label}: {noneLabel}
      </div>
    );
  }

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-medium text-sm">
          {label}: v{version.version} ({version.status})
        </div>
        <ResourceBadge
          missingLabel={missingLabel}
          ok={version.ready}
          readyLabel={readyLabel}
        />
      </div>
      {version.readinessErrors.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground text-xs">
          {version.readinessErrors.slice(0, 6).map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MobileDeploymentClient({
  initialData,
}: {
  initialData: MobileDeploymentState;
}) {
  const t = useTranslations('mobile-deployment-settings');
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [envFile, setEnvFile] = useState('');
  const [scalarName, setScalarName] = useState<MobileDeploymentScalarName>(
    'ANDROID_KEYSTORE_ALIAS'
  );
  const [scalarValue, setScalarValue] = useState('');
  const [tokenName, setTokenName] = useState('GitHub Actions mobile deploy');
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const { data } = useQuery({
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

  const envMutation = useMutation({
    mutationFn: (value: string) => replaceMobileDeploymentEnvFile(value),
    onSuccess: (state) => {
      setEnvFile('');
      refresh(state);
      toast({ title: t('saved') });
    },
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const scalarMutation = useMutation({
    mutationFn: () => saveMobileDeploymentScalarValue(scalarName, scalarValue),
    onSuccess: (state) => {
      setScalarValue('');
      refresh(state);
      toast({ title: t('saved') });
    },
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const fileMutation = useMutation({
    mutationFn: ({
      file,
      kind,
    }: {
      file: File;
      kind: MobileDeploymentFileKind;
    }) => uploadMobileDeploymentFileResource(kind, file),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('uploaded') });
    },
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const activateMutation = useMutation({
    mutationFn: () => activateMobileDeploymentDraft(),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('activated') });
    },
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const rollbackMutation = useMutation({
    mutationFn: () => rollbackMobileDeploymentVersion(),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('rolledBack') });
    },
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const issueTokenMutation = useMutation({
    mutationFn: () =>
      issueMobileDeploymentCiToken({
        expiresInDays: 90,
        name: tokenName,
        platforms: ['android', 'ios'],
      }),
    onSuccess: ({ state, token }) => {
      setIssuedToken(token);
      refresh(state);
      toast({ title: t('tokenIssued') });
    },
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const revokeTokenMutation = useMutation({
    mutationFn: (tokenId: string) => revokeMobileDeploymentCiToken(tokenId),
    onSuccess: (state) => {
      refresh(state);
      toast({ title: t('tokenRevoked') });
    },
    onError: (error) => toast({ title: error.message, variant: 'destructive' }),
  });

  const configuredEnv = new Set(data.envKeys.map((entry) => entry.name));
  const configuredScalars = new Set(
    data.scalarValues.map((entry) => entry.name)
  );
  const configuredFiles = new Set(
    data.fileArtifacts
      .filter((entry) => entry.configured)
      .map((entry) => entry.name)
  );

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('envTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            className="min-h-40 font-mono text-xs"
            onChange={(event) => setEnvFile(event.target.value)}
            placeholder="NEXT_PUBLIC_APP_URL=https://tuturuuu.com"
            value={envFile}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-muted-foreground text-sm">
              {t('configuredKeys', { count: configuredEnv.size })}
            </div>
            <Button
              disabled={!envFile.trim() || envMutation.isPending}
              onClick={() => envMutation.mutate(envFile)}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {t('replaceEnv')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('scalarsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <div className="space-y-1">
                <Label htmlFor="mobile-deployment-scalar-name">
                  {t('name')}
                </Label>
                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  id="mobile-deployment-scalar-name"
                  onChange={(event) =>
                    setScalarName(
                      event.target.value as MobileDeploymentScalarName
                    )
                  }
                  value={scalarName}
                >
                  {SCALAR_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="mobile-deployment-scalar-value">
                  {t('value')}
                </Label>
                <Input
                  id="mobile-deployment-scalar-value"
                  onChange={(event) => setScalarValue(event.target.value)}
                  type="password"
                  value={scalarValue}
                />
              </div>
              <Button
                className="self-end"
                disabled={!scalarValue || scalarMutation.isPending}
                onClick={() => scalarMutation.mutate()}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                {t('save')}
              </Button>
            </div>

            <div className="grid gap-2">
              {SCALAR_NAMES.map((name) => (
                <div
                  className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                  key={name}
                >
                  <span className="min-w-0 truncate font-mono">{name}</span>
                  <ResourceBadge
                    missingLabel={t('missing')}
                    ok={configuredScalars.has(name)}
                    readyLabel={t('ready')}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('filesTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {FILE_KINDS.map((kind) => (
              <div
                className="grid gap-2 rounded-md border p-2 md:grid-cols-[1fr_auto_auto] md:items-center"
                key={kind}
              >
                <div className="min-w-0 truncate font-mono text-sm">{kind}</div>
                <ResourceBadge
                  missingLabel={t('missing')}
                  ok={configuredFiles.has(kind)}
                  readyLabel={t('ready')}
                />
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
            ))}
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
        <Button onClick={() => refresh()} variant="ghost">
          <RefreshCw className="mr-2 h-4 w-4" />
          {t('refresh')}
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
