'use client';

import type { HiveBuildInfo } from '../../../engine/types';

type HiveServerBuildInfoProps = {
  buildInfo: HiveBuildInfo;
  labels: {
    commit: string;
    commitMessage: string;
    unknown: string;
    version: string;
  };
};

export function HiveServerBuildInfo({
  buildInfo,
  labels,
}: HiveServerBuildInfoProps) {
  return (
    <div className="space-y-2 border-border border-t pt-3 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">{labels.version}</span>
        <span className="font-medium">v{buildInfo.version}</span>
      </div>
      <div>
        <p className="text-muted-foreground">{labels.commit}</p>
        <p className="mt-1 break-all font-mono text-[11px] text-foreground">
          {buildInfo.commitHash ?? labels.unknown}
        </p>
      </div>
      <div>
        <p className="text-muted-foreground">{labels.commitMessage}</p>
        <p className="mt-1 max-h-24 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/30 p-2 text-foreground">
          {buildInfo.commitMessage ?? labels.unknown}
        </p>
      </div>
    </div>
  );
}
