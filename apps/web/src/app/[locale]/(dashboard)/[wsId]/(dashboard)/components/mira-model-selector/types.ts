import type { AIModelUI } from '@tuturuuu/types';
import type { MouseEvent } from 'react';

export interface MiraModelSelectorProps {
  creditsWsId?: string;
  disabled?: boolean;
  hotkeySignal?: number;
  model: AIModelUI;
  onChange: (model: AIModelUI) => void;
  shortcutLabel?: string;
  wsId: string;
}

export type ModelFavoriteToggleHandler = (
  event: MouseEvent<HTMLButtonElement>,
  modelId: string,
  modelLabel: string
) => void;

export type ModelAllowedFn = (candidateModel: AIModelUI) => boolean;

export type ModelFavoritedFn = (modelId: string) => boolean;

export interface MiraModelListProps {
  defaultModelId: string | null;
  fillHeight?: boolean;
  hasNextPage?: boolean;
  isEmptyMessage: string;
  isFavorited: ModelFavoritedFn;
  isFetchingNextPage?: boolean;
  isModelAllowed: ModelAllowedFn;
  model: AIModelUI;
  models: AIModelUI[];
  onLoadMore?: () => void;
  onSelectModel: (model: AIModelUI) => void;
  onToggleFavorite: ModelFavoriteToggleHandler;
  pendingModelId: string | null;
}
