export type SquareProductionLaunchStageId =
  | 'hardware'
  | 'connect'
  | 'pair'
  | 'verify';

export type SquareProductionLaunchStageStatus =
  | 'manual'
  | 'complete'
  | 'needsAction'
  | 'blocked'
  | 'ready';

export function getSquareProductionLaunchProgress({
  connectionReady,
  deviceReady,
}: {
  connectionReady: boolean;
  deviceReady: boolean;
}) {
  const setupReady = connectionReady && deviceReady;

  return [
    { id: 'hardware', status: 'manual' },
    {
      id: 'connect',
      status: connectionReady ? 'complete' : 'needsAction',
    },
    {
      id: 'pair',
      status: deviceReady
        ? 'complete'
        : connectionReady
          ? 'needsAction'
          : 'blocked',
    },
    { id: 'verify', status: setupReady ? 'ready' : 'blocked' },
  ] as const;
}
