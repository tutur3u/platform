'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import {
  getUserWorkspaceConfig,
  listWorkspaceBoards,
  normalizeRootNavigationConfig,
  type RootNavigationTarget,
  updateUserWorkspaceConfig,
} from '@tuturuuu/internal-api';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionFooter,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import DefaultWorkspaceSetting from './workspace/default-workspace-setting';

const ROOT_DEFAULT_NAVIGATION_CONFIG_ID = 'ROOT_DEFAULT_NAVIGATION';

const TARGET_VALUES: RootNavigationTarget[] = [
  'workspace_home',
  'tasks',
  'calendar',
  'finance',
];

const TASK_SUBMODULES = ['home', 'boards'] as const;
const FINANCE_SUBMODULES = [
  'home',
  'transactions',
  'wallets',
  'invoices',
] as const;

const DEFAULT_DRAFT_CONFIG = normalizeRootNavigationConfig(null);

function serializeNavigationConfig(config: {
  target: RootNavigationTarget;
  submodule: string;
  boardId: string;
}) {
  const payload: {
    target: RootNavigationTarget;
    submodule?: string;
    boardId?: string;
  } = { target: config.target };

  if (config.target === 'tasks') {
    payload.submodule = config.submodule;
    if (config.submodule === 'boards' && config.boardId !== 'none') {
      payload.boardId = config.boardId;
    }
  }

  if (config.target === 'finance') {
    payload.submodule = config.submodule;
  }

  return JSON.stringify(payload);
}

interface NavigationSettingsProps {
  wsId?: string;
  user: WorkspaceUser | null;
}

export default function NavigationSettings({ user }: NavigationSettingsProps) {
  const t = useTranslations('settings.preferences.navigation');
  const tCommon = useTranslations('common');
  const queryClient = useQueryClient();
  const [selectedDefaultWorkspaceId, setSelectedDefaultWorkspaceId] = useState<
    string | null
  >(user?.default_workspace_id ?? null);

  useEffect(() => {
    setSelectedDefaultWorkspaceId(user?.default_workspace_id ?? null);
  }, [user?.default_workspace_id]);

  const startPageWorkspaceId = selectedDefaultWorkspaceId ?? null;

  const {
    data: savedConfig,
    isError: isConfigError,
    isLoading: isConfigLoading,
  } = useQuery({
    queryKey: [
      'user-workspace-config',
      startPageWorkspaceId,
      ROOT_DEFAULT_NAVIGATION_CONFIG_ID,
    ],
    queryFn: async () => {
      if (!startPageWorkspaceId) {
        return null;
      }

      const response = await getUserWorkspaceConfig(
        startPageWorkspaceId,
        ROOT_DEFAULT_NAVIGATION_CONFIG_ID
      );
      return response.value;
    },
    enabled: Boolean(startPageWorkspaceId),
  });

  const normalizedSavedConfig = useMemo(() => {
    if (isConfigLoading || isConfigError) {
      return null;
    }

    return normalizeRootNavigationConfig(savedConfig ?? null);
  }, [isConfigError, isConfigLoading, savedConfig]);

  const [draftConfig, setDraftConfig] = useState<{
    target: RootNavigationTarget;
    submodule: string;
    boardId: string;
  } | null>(null);
  const [lastHydratedValue, setLastHydratedValue] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (isConfigLoading || isConfigError || !normalizedSavedConfig) {
      return;
    }

    const currentSavedValue = `${startPageWorkspaceId}:${savedConfig ?? ''}`;
    if (currentSavedValue !== lastHydratedValue || !draftConfig) {
      setDraftConfig(normalizedSavedConfig);
      setLastHydratedValue(currentSavedValue);
    }
  }, [
    isConfigError,
    isConfigLoading,
    draftConfig,
    lastHydratedValue,
    normalizedSavedConfig,
    savedConfig,
    startPageWorkspaceId,
  ]);

  const effectiveDraftConfig = draftConfig ?? DEFAULT_DRAFT_CONFIG;
  const effectiveSavedConfig = normalizedSavedConfig ?? DEFAULT_DRAFT_CONFIG;

  const safeTarget: RootNavigationTarget = TARGET_VALUES.includes(
    effectiveDraftConfig.target
  )
    ? effectiveDraftConfig.target
    : 'workspace_home';
  const safeSubmoduleForTasks = (TASK_SUBMODULES as readonly string[]).includes(
    effectiveDraftConfig.submodule
  )
    ? effectiveDraftConfig.submodule
    : 'home';

  const shouldFetchBoards =
    Boolean(startPageWorkspaceId) &&
    safeTarget === 'tasks' &&
    safeSubmoduleForTasks === 'boards';

  const { data: boardsPayload, isSuccess: areBoardsFetched } = useQuery({
    queryKey: ['navigation-settings-boards', startPageWorkspaceId],
    queryFn: () => listWorkspaceBoards(startPageWorkspaceId!),
    enabled: shouldFetchBoards,
    staleTime: 60 * 1000,
  });

  const boards = useMemo(() => {
    return (boardsPayload?.boards ?? []).filter(
      (board) => !board.deleted_at && !board.archived_at
    );
  }, [boardsPayload]);

  const safeSubmoduleForFinance = (
    FINANCE_SUBMODULES as readonly string[]
  ).includes(effectiveDraftConfig.submodule)
    ? effectiveDraftConfig.submodule
    : 'home';
  const hasBoardOptions = shouldFetchBoards && areBoardsFetched;
  const selectedBoardExists =
    effectiveDraftConfig.boardId === 'none' ||
    !hasBoardOptions ||
    boards.some((board) => board.id === effectiveDraftConfig.boardId);
  const safeBoardId =
    effectiveDraftConfig.boardId === 'none' || selectedBoardExists
      ? effectiveDraftConfig.boardId
      : 'none';

  useEffect(() => {
    if (!hasBoardOptions) {
      return;
    }

    if (!draftConfig || safeBoardId === draftConfig.boardId) {
      return;
    }

    setDraftConfig((previous) =>
      previous
        ? {
            ...previous,
            boardId: safeBoardId,
          }
        : previous
    );
  }, [draftConfig, hasBoardOptions, safeBoardId]);

  const normalizedDraftConfig = useMemo(
    () => ({
      ...effectiveDraftConfig,
      boardId: safeBoardId,
    }),
    [effectiveDraftConfig, safeBoardId]
  );

  const serializedCurrentConfig = useMemo(
    () => serializeNavigationConfig(normalizedDraftConfig),
    [normalizedDraftConfig]
  );
  const serializedSavedConfig = useMemo(
    () => serializeNavigationConfig(effectiveSavedConfig),
    [effectiveSavedConfig]
  );

  const canEditConfig =
    !isConfigLoading && !isConfigError && Boolean(draftConfig);
  const isDirty =
    canEditConfig && serializedCurrentConfig !== serializedSavedConfig;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!startPageWorkspaceId) {
        throw new Error('Workspace ID is required');
      }
      if (!canEditConfig) {
        throw new Error('Start page settings are not ready to save');
      }

      return updateUserWorkspaceConfig(
        startPageWorkspaceId,
        ROOT_DEFAULT_NAVIGATION_CONFIG_ID,
        serializedCurrentConfig
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [
          'user-workspace-config',
          startPageWorkspaceId,
          ROOT_DEFAULT_NAVIGATION_CONFIG_ID,
        ],
      });
      toast.success(t('save_success'));
    },
    onError: () => {
      toast.error(t('save_error'));
    },
  });

  return (
    <SettingsSection title={t('title')} description={t('description')}>
      <SettingItemTab
        title={t('default_workspace_label')}
        description={t('default_workspace_help')}
        controlWidth="lg"
      >
        <DefaultWorkspaceSetting
          defaultWorkspaceId={user?.default_workspace_id}
          onSelectedWorkspaceChange={setSelectedDefaultWorkspaceId}
          user={user}
        />
      </SettingItemTab>

      {!startPageWorkspaceId ? (
        <SettingsSectionMessage>
          {t('workspace_required')}
        </SettingsSectionMessage>
      ) : isConfigLoading ? (
        <SettingsSectionMessage className="justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
        </SettingsSectionMessage>
      ) : isConfigError ? (
        <SettingsSectionMessage>{t('load_error')}</SettingsSectionMessage>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
        >
          <SettingItemTab
            title={t('root_target_label')}
            description={t('root_target_help')}
            controlWidth="lg"
          >
            <Select
              value={safeTarget}
              onValueChange={(value) => {
                if (!TARGET_VALUES.includes(value as RootNavigationTarget)) {
                  return;
                }

                const nextTarget = value as RootNavigationTarget;
                setDraftConfig({
                  target: nextTarget,
                  submodule: 'home',
                  boardId: 'none',
                });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workspace_home">
                  {t('targets.workspace_home')}
                </SelectItem>
                <SelectItem value="tasks">{t('targets.tasks')}</SelectItem>
                <SelectItem value="calendar">
                  {t('targets.calendar')}
                </SelectItem>
                <SelectItem value="finance">{t('targets.finance')}</SelectItem>
              </SelectContent>
            </Select>
          </SettingItemTab>

          {safeTarget === 'tasks' && (
            <SettingItemTab
              title={t('tasks_submodule_label')}
              controlWidth="lg"
            >
              <Select
                value={safeSubmoduleForTasks}
                onValueChange={(value) => {
                  if ((TASK_SUBMODULES as readonly string[]).includes(value)) {
                    setDraftConfig((previous) =>
                      previous
                        ? {
                            ...previous,
                            submodule: value,
                            boardId:
                              value === 'boards' ? previous.boardId : 'none',
                          }
                        : previous
                    );
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">
                    {t('tasks_submodules.home')}
                  </SelectItem>
                  <SelectItem value="boards">
                    {t('tasks_submodules.boards')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingItemTab>
          )}

          {safeTarget === 'tasks' && safeSubmoduleForTasks === 'boards' && (
            <SettingItemTab title={t('tasks_board_label')} controlWidth="lg">
              <div className="space-y-2">
                <Select
                  value={safeBoardId}
                  onValueChange={(value) =>
                    setDraftConfig((previous) =>
                      previous
                        ? {
                            ...previous,
                            boardId: value,
                          }
                        : previous
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('tasks_board_any')}</SelectItem>
                    {boards.map((board) => (
                      <SelectItem key={board.id} value={board.id}>
                        {board.name || t('unnamed_board')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!selectedBoardExists && (
                  <p className="text-dynamic-yellow text-sm">
                    {t('stale_board_warning')}
                  </p>
                )}
              </div>
            </SettingItemTab>
          )}

          {safeTarget === 'finance' && (
            <SettingItemTab
              title={t('finance_submodule_label')}
              controlWidth="lg"
            >
              <Select
                value={safeSubmoduleForFinance}
                onValueChange={(value) => {
                  if (
                    (FINANCE_SUBMODULES as readonly string[]).includes(value)
                  ) {
                    setDraftConfig((previous) =>
                      previous
                        ? {
                            ...previous,
                            submodule: value,
                          }
                        : previous
                    );
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">
                    {t('finance_submodules.home')}
                  </SelectItem>
                  <SelectItem value="transactions">
                    {t('finance_submodules.transactions')}
                  </SelectItem>
                  <SelectItem value="wallets">
                    {t('finance_submodules.wallets')}
                  </SelectItem>
                  <SelectItem value="invoices">
                    {t('finance_submodules.invoices')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingItemTab>
          )}

          <SettingsSectionFooter>
            <Button
              type="submit"
              disabled={!canEditConfig || !isDirty || saveMutation.isPending}
            >
              {saveMutation.isPending
                ? tCommon('saving')
                : tCommon('save_changes')}
            </Button>
          </SettingsSectionFooter>
        </form>
      )}
    </SettingsSection>
  );
}
