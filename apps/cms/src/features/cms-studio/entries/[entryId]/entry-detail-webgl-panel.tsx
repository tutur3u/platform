'use client';

import {
  Copy,
  ExternalLink,
  Gamepad2,
  Loader2,
  PackageOpen,
  UploadCloud,
} from '@tuturuuu/icons';
import type { ExternalProjectStudioAsset } from '@tuturuuu/types';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import type { CmsStrings } from '../../cms-strings';
import {
  type EntryDetailUploadProgressItem,
  EntryDetailUploadProgressList,
} from './entry-detail-upload-progress';

function getWebglArtifactMetadata(
  asset: ExternalProjectStudioAsset | null | undefined
) {
  const metadata = asset?.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return null;
  }

  const record = metadata as Record<string, unknown>;
  if (
    record.kind !== 'webgl-package' ||
    typeof record.entryUrl !== 'string' ||
    !Array.isArray(record.files)
  ) {
    return null;
  }

  return {
    entryUrl: record.entryUrl,
    files: record.files,
    rootPath: typeof record.rootPath === 'string' ? record.rootPath : '',
  };
}

function getAbsoluteUrl(path: string) {
  return new URL(path, window.location.origin).toString();
}

type EntryDetailWebglPanelProps = {
  onUploadWebglClick: () => void;
  strings: CmsStrings;
  uploadProgressItems: EntryDetailUploadProgressItem[];
  uploadWebglPending: boolean;
  webglPackageAsset: ExternalProjectStudioAsset | null;
  webglPackagePlayerPath: string | null;
  webglPackagePublicPlayerPath: string | null;
};

export function EntryDetailWebglPanel({
  onUploadWebglClick,
  strings,
  uploadProgressItems,
  uploadWebglPending,
  webglPackageAsset,
  webglPackagePlayerPath,
  webglPackagePublicPlayerPath,
}: EntryDetailWebglPanelProps) {
  const webglArtifact = getWebglArtifactMetadata(webglPackageAsset);
  const webglManifestText = webglPackageAsset
    ? JSON.stringify(webglPackageAsset.metadata ?? {}, null, 2)
    : '';

  return (
    <Card className="overflow-hidden border-dynamic-blue/25 bg-dynamic-blue/5 shadow-none">
      <CardHeader className="gap-4 border-dynamic-blue/15 border-b bg-background/70">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-dynamic-blue/25 bg-dynamic-blue/10 text-dynamic-blue">
                <Gamepad2 className="mr-1.5 h-3.5 w-3.5" />
                {strings.webglDeploymentBadge}
              </Badge>
              <Badge variant="outline">{strings.webglZipHint}</Badge>
            </div>
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <PackageOpen className="h-5 w-5 text-dynamic-blue" />
                {strings.webglDeploymentTitle}
              </CardTitle>
              <CardDescription className="mt-2 text-sm leading-6">
                {strings.webglDeploymentDescription}
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={uploadWebglPending} onClick={onUploadWebglClick}>
              {uploadWebglPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="mr-2 h-4 w-4" />
              )}
              {uploadWebglPending
                ? strings.mediaProcessingLabel
                : webglPackageAsset
                  ? strings.webglReplaceAction
                  : strings.webglUploadAction}
            </Button>
            {webglArtifact && webglPackagePlayerPath ? (
              <Button
                variant="outline"
                onClick={() =>
                  window.open(
                    webglPackagePlayerPath,
                    '_blank',
                    'noopener,noreferrer'
                  )
                }
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {strings.webglOpenAction}
              </Button>
            ) : null}
            {webglPackagePublicPlayerPath ? (
              <>
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      getAbsoluteUrl(webglPackagePublicPlayerPath),
                      '_blank',
                      'noopener,noreferrer'
                    )
                  }
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {strings.webglOpenPublicAction}
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    void navigator.clipboard?.writeText(
                      getAbsoluteUrl(webglPackagePublicPlayerPath)
                    )
                  }
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {strings.webglCopyPublicLinkAction}
                </Button>
              </>
            ) : null}
            {webglManifestText ? (
              <Button
                variant="outline"
                onClick={() =>
                  void navigator.clipboard?.writeText(webglManifestText)
                }
              >
                <Copy className="mr-2 h-4 w-4" />
                {strings.webglCopyManifestAction}
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-5">
        <EntryDetailUploadProgressList items={uploadProgressItems} />
        {webglArtifact ? (
          <div className="grid gap-3 md:grid-cols-[14rem_minmax(0,1fr)]">
            <div className="rounded-[1.2rem] border border-border/70 bg-background/85 p-4">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                {strings.webglAssetCountLabel}
              </div>
              <div className="mt-2 font-semibold text-3xl">
                {webglArtifact.files.length}
              </div>
            </div>
            <div className="min-w-0 rounded-[1.2rem] border border-border/70 bg-background/85 p-4">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                {strings.webglEntryUrlLabel}
              </div>
              <div className="mt-2 break-all font-mono text-muted-foreground text-xs leading-6">
                {webglArtifact.entryUrl}
              </div>
            </div>
            <div className="min-w-0 rounded-[1.2rem] border border-border/70 bg-background/85 p-4 md:col-span-2">
              <div className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                {strings.webglPublicEntryUrlLabel}
              </div>
              <div className="mt-2 break-all font-mono text-muted-foreground text-xs leading-6">
                {webglPackagePublicPlayerPath ??
                  strings.webglPublicLinkUnavailable}
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="flex w-full flex-col gap-3 rounded-[1.2rem] border border-dynamic-blue/30 border-dashed bg-background/70 p-5 text-left transition hover:border-dynamic-blue/50 hover:bg-background"
            disabled={uploadWebglPending}
            onClick={onUploadWebglClick}
          >
            <span className="flex items-center gap-2 font-medium">
              <UploadCloud className="h-4 w-4 text-dynamic-blue" />
              {strings.webglUploadAction}
            </span>
            <span className="max-w-2xl text-muted-foreground text-sm leading-6">
              {strings.webglEmptyDescription}
            </span>
          </button>
        )}
      </CardContent>
    </Card>
  );
}
