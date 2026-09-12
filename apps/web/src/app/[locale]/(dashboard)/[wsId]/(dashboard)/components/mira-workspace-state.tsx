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
  const [state, setState] = useState<{
    artifacts: WorkspaceArtifact[];
    layout: ArtifactLayout;
  }>({ artifacts: [], layout: 'auto' });
  return (
    <WorkspaceContext.Provider
      value={{
        ...state,
        setLayout(layout) {
          setState((current) => ({ ...current, layout }));
        },
        open(kind, wsId, nextLayout, presentation) {
          setState((current) => ({
            layout: nextLayout ?? current.layout,
            artifacts: [
              ...current.artifacts.filter(
                (item) => item.kind !== kind || item.wsId !== wsId
              ),
              {
                kind,
                wsId,
                presentation:
                  presentation ??
                  current.artifacts.find(
                    (item) => item.kind === kind && item.wsId === wsId
                  )?.presentation,
              },
            ].slice(-3),
          }));
        },
        closeAll() {
          setState({ artifacts: [], layout: 'auto' });
        },
        focus(kind, wsId) {
          setState((current) => {
            const target = current.artifacts.find(
              (item) => item.kind === kind && item.wsId === wsId
            );
            return target ? { artifacts: [target], layout: 'auto' } : current;
          });
        },
        close(kind, wsId) {
          setState((current) => ({
            ...current,
            artifacts: current.artifacts.filter(
              (item) => item.kind !== kind || item.wsId !== wsId
            ),
          }));
        },
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}
