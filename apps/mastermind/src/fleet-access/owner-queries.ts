import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FleetControlInput,
  FleetDisplayValueInput,
  FleetGrantInput,
  FleetProjectInput,
  FleetRevokeInput,
} from '@tuturuuu/internal-api/fleet';
import {
  fleetOwnerConsoleFn,
  grantFleetAccessFn,
  revokeFleetAccessFn,
  setFleetDisplayValueFn,
  setFleetStoppedFn,
  upsertFleetProjectFn,
} from './owner-api';
import type { OwnerWrite } from './owner-upstream';

export const ownerConsoleKey = ['fleet-access', 'owner-console'] as const;

/**
 * While Fleet is stopped the access answer names no tier, so the page probes
 * the console once: only the Owner can read it.
 */
export function useOwnerConsole(probe?: { enabled: boolean }) {
  return useQuery({
    queryKey: ownerConsoleKey,
    queryFn: () => fleetOwnerConsoleFn(),
    ...(probe ? { enabled: probe.enabled, retry: false } : {}),
  });
}

/** Every Owner change rereads the console, including refused ones. */
function useOwnerMutation<Input, Data>(
  mutationFn: (input: Input) => Promise<OwnerWrite<Data>>
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => client.invalidateQueries({ queryKey: ownerConsoleKey }),
  });
}

export const useGrantFleetAccess = () =>
  useOwnerMutation((data: FleetGrantInput) => grantFleetAccessFn({ data }));
export const useRevokeFleetAccess = () =>
  useOwnerMutation((data: FleetRevokeInput) => revokeFleetAccessFn({ data }));
export const useSetFleetStopped = () =>
  useOwnerMutation((data: FleetControlInput) => setFleetStoppedFn({ data }));
export const useUpsertFleetProject = () =>
  useOwnerMutation((data: FleetProjectInput) => upsertFleetProjectFn({ data }));
export const useSetFleetDisplayValue = () =>
  useOwnerMutation((data: FleetDisplayValueInput) =>
    setFleetDisplayValueFn({ data })
  );
