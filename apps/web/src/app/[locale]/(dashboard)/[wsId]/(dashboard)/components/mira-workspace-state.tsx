'use client';

import type { ArtifactPresentation } from '@tuturuuu/ai/workspace-artifacts';
import { createContext, type ReactNode, useContext, useState } from 'react';

export const artifactKinds = [
  'tasks',
  'calendar',
  'finance',
  'meetings',
] as const;
export type ArtifactKind = (typeof artifactKinds)[number];
export type ArtifactLayout = 'auto' | 'horizontal' | 'vertical' | 'grid';
export interface WorkspaceArtifact {
  kind: ArtifactKind;
  wsId: string;
  presentation?: ArtifactPresentation;
}
interface WorkspaceState {
  artifacts: WorkspaceArtifact[];
  layout: ArtifactLayout;
  setLayout: (layout: ArtifactLayout) => void;
  open: (
    kind: ArtifactKind,
    wsId: string,
    layout?: ArtifactLayout,
    presentation?: ArtifactPresentation
  ) => void;
  closeAll: () => void;
  focus: (kind: ArtifactKind, wsId: string) => void;
  close: (kind: ArtifactKind, wsId: string) => void;
}
const WorkspaceContext = createContext<WorkspaceState | null>(null);
export const useMiraWorkspace = () => useContext(WorkspaceContext);

export function MiraWorkspaceProvider({ children }: { children: ReactNode }) {
  const [artifacts, setArtifacts] = useState<WorkspaceArtifact[]>([]);
  const [layout, setLayout] = useState<ArtifactLayout>('auto');
  return (
    <WorkspaceContext.Provider
      value={{
        artifacts,
        layout,
        setLayout,
        open(kind, wsId, nextLayout, presentation) {
          if (nextLayout) setLayout(nextLayout);
          setArtifacts((current) =>
            [
              ...current.filter(
                (item) => item.kind !== kind || item.wsId !== wsId
              ),
              {
                kind,
                wsId,
                presentation:
                  presentation ??
                  current.find(
                    (item) => item.kind === kind && item.wsId === wsId
                  )?.presentation,
              },
            ].slice(-3)
          );
        },
        closeAll() {
          setArtifacts([]);
          setLayout('auto');
        },
        focus(kind, wsId) {
          const target = artifacts.find(
            (item) => item.kind === kind && item.wsId === wsId
          );
          if (!target) return;
          setArtifacts([target]);
          setLayout('auto');
        },
        close(kind, wsId) {
          setArtifacts((current) =>
            current.filter((item) => item.kind !== kind || item.wsId !== wsId)
          );
        },
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
