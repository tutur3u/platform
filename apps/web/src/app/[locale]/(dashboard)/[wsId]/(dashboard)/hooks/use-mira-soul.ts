'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getMiraSoul,
  type MiraSoulResponse,
  type MiraSoulUpdate,
  updateMiraSoul,
} from '@tuturuuu/internal-api/mira-soul';
import { miraSoulKeys, useMiraSoulScope } from '@/components/mira-soul-scope';

export function useMiraSoul() {
  const scope = useMiraSoulScope();
  return useQuery({
    queryKey: miraSoulKeys.detail(scope?.actorId ?? null),
    enabled: !!scope?.actorId,
    queryFn: async ({ signal }) => {
      if (!scope?.actorId)
        throw new Error('Assistant settings owner unavailable');
      const epoch = scope.epoch;
      const intent = scope.intent;
      scope.check(epoch);
      const result = await getMiraSoul(scope.actorId, {
        signal: AbortSignal.any([signal, scope.controller.signal]),
      });
      scope.check(epoch);
      if (scope.intent !== intent)
        throw new Error('Assistant settings publication changed');
      return result;
    },
    staleTime: 1000 * 60 * 5,
    select: (data) => data.soul,
  });
}

export function useUpdateMiraSoul() {
  const client = useQueryClient();
  const scope = useMiraSoulScope();
  const mutation = useMutation({
    mutationFn: async ({
      data,
      epoch,
      intent,
    }: {
      data: MiraSoulUpdate;
      epoch: number;
      intent: number;
    }) => {
      if (!scope?.actorId)
        throw new Error('Assistant settings owner unavailable');
      scope.check(epoch);
      if (scope.intent !== intent)
        throw new Error('Assistant settings intent changed');
      const receipt = await updateMiraSoul(scope.actorId, data, {
        signal: scope.controller.signal,
      });
      scope.check(epoch);
      if (scope.intent !== intent)
        throw new Error('Assistant settings intent changed');
      return receipt;
    },
    onMutate: async ({ data, epoch, intent }) => {
      if (!scope?.actorId)
        throw new Error('Assistant settings owner unavailable');
      const key = miraSoulKeys.detail(scope.actorId);
      scope.check(epoch);
      await client.cancelQueries({ queryKey: key, exact: true });
      scope.check(epoch);
      if (scope.intent !== intent)
        throw new Error('Assistant settings intent changed');
      const previous = client.getQueryData<MiraSoulResponse>(key);
      const optimistic = previous
        ? { soul: { ...previous.soul, ...data } }
        : undefined;
      if (optimistic) client.setQueryData(key, optimistic);
      return {
        key,
        previous,
        query: client.getQueryCache().find({ queryKey: key, exact: true }),
        updateCount: client.getQueryState(key)?.dataUpdateCount,
      };
    },
    onSuccess: (receipt, variables, context) => {
      if (
        context &&
        scope?.active &&
        scope.epoch === variables.epoch &&
        scope.intent === variables.intent &&
        client.getQueryCache().find({ queryKey: context.key, exact: true }) ===
          context.query &&
        client.getQueryState(context.key)?.dataUpdateCount ===
          context.updateCount
      )
        client.setQueryData(context.key, receipt);
    },
    onError: (_error, variables, context) => {
      if (
        context?.previous &&
        scope?.active &&
        scope.epoch === variables.epoch &&
        scope.intent === variables.intent &&
        client.getQueryCache().find({ queryKey: context.key, exact: true }) ===
          context.query &&
        client.getQueryState(context.key)?.dataUpdateCount ===
          context.updateCount
      )
        client.setQueryData(context.key, context.previous);
    },
    onSettled: (_receipt, _error, variables, context) => {
      if (
        context &&
        scope?.active &&
        scope.epoch === variables.epoch &&
        scope.intent === variables.intent
      )
        void client.invalidateQueries({ queryKey: context.key, exact: true });
    },
  });
  const prepare = (data: MiraSoulUpdate) => {
    if (!scope) throw new Error('Assistant settings owner unavailable');
    scope.check(scope.epoch);
    return { data, epoch: scope.epoch, intent: ++scope.intent };
  };
  type InternalOptions = NonNullable<Parameters<typeof mutation.mutate>[1]>;
  type ReplaceVariables<Args extends unknown[]> = Args extends [
    infer First,
    unknown,
    ...infer Tail,
  ]
    ? [First, MiraSoulUpdate, ...Tail]
    : Args;
  type PublicOptions = {
    onSuccess?: (
      ...args: ReplaceVariables<
        Parameters<NonNullable<InternalOptions['onSuccess']>>
      >
    ) => void;
    onError?: (
      ...args: ReplaceVariables<
        Parameters<NonNullable<InternalOptions['onError']>>
      >
    ) => void;
    onSettled?: (
      data: MiraSoulResponse | undefined,
      error: Error | null,
      variables: MiraSoulUpdate,
      ...tail: Parameters<NonNullable<InternalOptions['onSettled']>> extends [
        unknown,
        unknown,
        unknown,
        ...infer Tail,
      ]
        ? Tail
        : never
    ) => void;
  };
  const admittedOptions = (
    options: PublicOptions | undefined,
    variables: ReturnType<typeof prepare>
  ): InternalOptions => {
    const current = () =>
      scope?.active &&
      scope.epoch === variables.epoch &&
      scope.intent === variables.intent;
    return {
      onSuccess: (...args) => {
        if (current())
          options?.onSuccess?.(args[0], variables.data, args[2], args[3]);
      },
      onError: (...args) => {
        if (current())
          options?.onError?.(args[0], variables.data, args[2], args[3]);
      },
      onSettled: (...args) => {
        if (current())
          options?.onSettled?.(
            args[0],
            args[1],
            variables.data,
            args[3],
            args[4]
          );
      },
    };
  };
  return {
    ...mutation,
    mutate: (data: MiraSoulUpdate, options?: PublicOptions) => {
      const variables = prepare(data);
      return mutation.mutate(variables, admittedOptions(options, variables));
    },
    mutateAsync: (data: MiraSoulUpdate, options?: PublicOptions) => {
      const variables = prepare(data);
      return mutation.mutateAsync(
        variables,
        admittedOptions(options, variables)
      );
    },
  };
}
