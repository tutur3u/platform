'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { prepareMeetingProgramming } from '../lib/prepare-programming';
export function useProgrammingOpener(
  meetingId: string,
  name: string,
  accountId: string
) {
  const cache = useQueryClient();
  const scope = `${accountId}:${meetingId}`;
  const currentScope = useRef<string | null>(scope);
  currentScope.current = scope;
  const pending = useRef<{ scope: string; promise: Promise<void> } | null>(
    null
  );
  useEffect(() => {
    currentScope.current = scope;
    return () => {
      if (currentScope.current === scope) currentScope.current = null;
    };
  }, [scope]);
  const mutation = useMutation({
    mutationFn: (input: { meetingId: string; name: string; scope: string }) =>
      prepareMeetingProgramming(
        input.meetingId,
        input.name,
        undefined,
        () => currentScope.current === input.scope
      ),
    onSuccess: (_, input) =>
      cache.invalidateQueries({
        queryKey: ['meet-programming', input.meetingId],
      }),
  });
  return {
    ...mutation,
    prepare: () => {
      if (pending.current?.scope === scope) return pending.current.promise;
      const promise = mutation
        .mutateAsync({ meetingId, name, scope })
        .finally(() => {
          if (pending.current?.promise === promise) pending.current = null;
        });
      pending.current = { scope, promise };
      return promise;
    },
  };
}
