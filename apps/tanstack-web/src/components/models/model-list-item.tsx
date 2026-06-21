import type { GatewayModelRow } from '@tuturuuu/internal-api';
import { formatTokens } from './model-format';
import { ModelBadges, ModelPricing, ModelTags } from './model-shared';
import type { ModelsMessages } from './models-types';

export function ModelListItem({
  messages,
  model,
}: {
  messages: ModelsMessages;
  model: GatewayModelRow;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="max-w-fit">
          <ModelBadges model={model} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-sm">{model.name}</span>
          <span className="truncate font-mono text-muted-foreground text-xs">
            {model.id}
          </span>
        </div>
        <div className="mt-1">
          <ModelTags model={model} />
        </div>
        {model.description && (
          <p className="mt-1.5 line-clamp-2 grow text-muted-foreground text-xs leading-relaxed">
            {model.description}
          </p>
        )}
      </div>
      <div className="mt-2 flex items-end gap-6 sm:mt-0 sm:items-center">
        <div className="text-right text-xs">
          <div className="flex flex-col">
            <span className="text-[11px] text-muted-foreground uppercase">
              {messages.context_window_label}
            </span>
            <span className="font-medium">
              {formatTokens(model.context_window, messages)}
            </span>
          </div>
          <div className="mt-1 flex flex-col">
            <span className="text-[11px] text-muted-foreground uppercase">
              {messages.max_output_label}
            </span>
            <span className="font-medium">
              {formatTokens(model.max_tokens, messages)}
            </span>
          </div>
          <div className="mt-2 flex flex-col">
            <ModelPricing
              compact
              className="flex flex-col"
              messages={messages}
              model={model}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
