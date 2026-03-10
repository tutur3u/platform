'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceTaskBoard } from '@tuturuuu/types';
import { useTranslations } from 'next-intl';

export interface TaskEstimateBoardsResponse {
  boards: Partial<WorkspaceTaskBoard>[];
}

export interface UpdateTaskEstimateBoardInput {
  boardId: string;
  estimationType: string | null;
  extendedEstimation: boolean;
  allowZeroEstimates: boolean;
  countUnestimatedIssues: boolean;
}

type TaskEstimateBoard = Partial<WorkspaceTaskBoard>;

export type EstimationOption = {
  value: 'none' | 'fibonacci' | 'linear' | 'exponential' | 't-shirt';
  actualValue: WorkspaceTaskBoard['estimation_type'] | null;
  label: string;
  description: string;
  color: string;
};

export const taskEstimateBoardKeys = {
  all: ['task-estimate-boards'] as const,
  list: (wsId: string) => [...taskEstimateBoardKeys.all, wsId] as const,
};

export async function fetchTaskEstimateBoards(
  wsId: string
): Promise<TaskEstimateBoardsResponse> {
  const response = await fetch(`/api/v1/workspaces/${wsId}/boards/estimation`, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch task estimate boards');
  }

  return response.json();
}

async function updateTaskEstimateBoard(
  wsId: string,
  {
    boardId,
    estimationType,
    extendedEstimation,
    allowZeroEstimates,
    countUnestimatedIssues,
  }: UpdateTaskEstimateBoardInput
) {
  const response = await fetch(
    `/api/v1/workspaces/${wsId}/boards/${boardId}/estimation`,
    {
      cache: 'no-store',
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        estimation_type: estimationType,
        extended_estimation: extendedEstimation,
        allow_zero_estimates: allowZeroEstimates,
        count_unestimated_issues: countUnestimatedIssues,
      }),
    }
  );

  if (!response.ok) {
    throw new Error('Failed to update estimation type');
  }

  return (await response.json()) as Partial<WorkspaceTaskBoard>;
}

export function useTaskEstimates(wsId: string) {
  const queryClient = useQueryClient();
  const translate = useTranslations('task-estimates');
  const query = useQuery({
    queryKey: taskEstimateBoardKeys.list(wsId),
    queryFn: () => fetchTaskEstimateBoards(wsId),
    enabled: !!wsId,
  });

  const mutation = useMutation({
    mutationFn: (input: UpdateTaskEstimateBoardInput) =>
      updateTaskEstimateBoard(wsId, input),
    onSuccess: (updatedBoard) => {
      queryClient.setQueryData<TaskEstimateBoardsResponse | undefined>(
        taskEstimateBoardKeys.list(wsId),
        (current) => ({
          boards:
            current?.boards.map((board) =>
              board.id === updatedBoard.id
                ? { ...board, ...updatedBoard }
                : board
            ) ?? [],
        })
      );
    },
  });

  const getEstimationTypes = (): EstimationOption[] => {
    return [
      {
        value: 'none',
        actualValue: null,
        label: translate('estimation_types.none.label'),
        description: translate('estimation_types.none.description'),
        color: 'bg-muted/50 text-muted-foreground',
      },
      {
        value: 'fibonacci',
        actualValue: 'fibonacci',
        label: translate('estimation_types.fibonacci.label'),
        description: translate('estimation_types.fibonacci.description'),
        color: 'bg-dynamic-blue/10 text-dynamic-blue',
      },
      {
        value: 'linear',
        actualValue: 'linear',
        label: translate('estimation_types.linear.label'),
        description: translate('estimation_types.linear.description'),
        color: 'bg-dynamic-green/10 text-dynamic-green',
      },
      {
        value: 'exponential',
        actualValue: 'exponential',
        label: translate('estimation_types.exponential.label'),
        description: translate('estimation_types.exponential.description'),
        color: 'bg-dynamic-purple/10 text-dynamic-purple',
      },
      {
        value: 't-shirt',
        actualValue: 't-shirt',
        label: translate('estimation_types.t-shirt.label'),
        description: translate('estimation_types.t-shirt.description'),
        color: 'bg-dynamic-orange/10 text-dynamic-orange',
      },
    ];
  };

  const getEstimationTypeInfo = (
    estimationTypes: EstimationOption[],
    type: WorkspaceTaskBoard['estimation_type'] | null
  ): EstimationOption | null => {
    if (estimationTypes.length === 0) {
      return null;
    }

    const defaultEstimationType = estimationTypes[0]!;
    return (
      estimationTypes.find(
        (estimationType) => estimationType.actualValue === type
      ) ?? defaultEstimationType
    );
  };

  const getRangeInfo = (type: string) => {
    switch (type) {
      case 'fibonacci':
        return {
          label: translate('dialog.fibonacci_range'),
          standard: {
            label: translate('dialog.standard_range'),
            description: translate(
              'estimation_types.fibonacci.description_standard'
            ),
          },
          extended: {
            label: translate('dialog.extended_range'),
            description: translate(
              'estimation_types.fibonacci.description_extended'
            ),
          },
        };
      case 'linear':
        return {
          label: translate('dialog.linear_range'),
          standard: {
            label: translate('dialog.standard_range'),
            description: translate(
              'estimation_types.linear.description_standard'
            ),
          },
          extended: {
            label: translate('dialog.extended_range'),
            description: translate(
              'estimation_types.linear.description_extended'
            ),
          },
        };
      case 'exponential':
        return {
          label: translate('dialog.exponential_range'),
          standard: {
            label: translate('dialog.standard_range'),
            description: translate(
              'estimation_types.exponential.description_standard'
            ),
          },
          extended: {
            label: translate('dialog.extended_range'),
            description: translate(
              'estimation_types.exponential.description_extended'
            ),
          },
        };
      case 't-shirt':
        return {
          label: translate('dialog.t_shirt_range'),
          standard: {
            label: translate('dialog.standard_range'),
            description: translate(
              'estimation_types.t-shirt.description_standard'
            ),
          },
          extended: {
            label: translate('dialog.extended_range'),
            description: translate(
              'estimation_types.t-shirt.description_extended'
            ),
          },
        };
      default:
        return null;
    }
  };

  const getEstimationDescription = (
    estimationTypes: EstimationOption[],
    type: WorkspaceTaskBoard['estimation_type'] | null,
    isExtended?: boolean
  ) => {
    if (!type) {
      return translate('estimation_types.none.description');
    }

    if (isExtended === undefined) {
      return (
        getEstimationTypeInfo(estimationTypes, type)?.description ??
        translate('estimation_types.none.description')
      );
    }

    switch (type) {
      case 'fibonacci':
        return translate(
          isExtended
            ? 'estimation_types.fibonacci.description_extended'
            : 'estimation_types.fibonacci.description_standard'
        );
      case 'linear':
        return translate(
          isExtended
            ? 'estimation_types.linear.description_extended'
            : 'estimation_types.linear.description_standard'
        );
      case 'exponential':
        return translate(
          isExtended
            ? 'estimation_types.exponential.description_extended'
            : 'estimation_types.exponential.description_standard'
        );
      case 't-shirt':
        return translate(
          isExtended
            ? 'estimation_types.t-shirt.description_extended'
            : 'estimation_types.t-shirt.description_standard'
        );
      default:
        return translate('estimation_types.none.description');
    }
  };

  const getTaskEstimateStats = (
    boards: TaskEstimateBoard[],
    estimationTypes: EstimationOption[]
  ) => {
    return {
      totalBoards: boards.length,
      configuredBoards: boards.filter((board) => board.estimation_type).length,
      extendedBoards: boards.filter(
        (board) => board.estimation_type && board.extended_estimation
      ).length,
      estimationTypes: estimationTypes.slice(1).map((estimationType) => ({
        ...estimationType,
        count: boards.filter(
          (board) => board.estimation_type === estimationType.actualValue
        ).length,
        extendedCount: boards.filter(
          (board) =>
            board.estimation_type === estimationType.actualValue &&
            board.extended_estimation
        ).length,
      })),
    };
  };

  return {
    boards: query.data?.boards ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isUpdating: mutation.isPending,
    updateEstimation: mutation.mutateAsync,
    getEstimationTypes,
    getEstimationTypeInfo,
    getRangeInfo,
    getEstimationDescription,
    getTaskEstimateStats,
  };
}
