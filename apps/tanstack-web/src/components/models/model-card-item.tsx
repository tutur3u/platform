import type { GatewayModelRow } from '@tuturuuu/internal-api';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { formatTokens, modelType } from './model-format';
import { ModelBadges, ModelPricing, ModelTags } from './model-shared';
import type { ModelsMessages } from './models-types';

export function ModelCardItem({
  messages,
  model,
}: {
  messages: ModelsMessages;
  model: GatewayModelRow;
}) {
  return (
    <Card className="flex h-full flex-col overflow-hidden transition-shadow duration-200 hover:shadow-lg">
      <CardHeader className="pb-4">
        <div className="mb-2">
          <ModelBadges model={model} />
        </div>
        <CardTitle
          className="truncate text-left font-bold text-xl"
          title={model.name}
        >
          {model.name}
        </CardTitle>
        <div
          className="truncate text-left font-mono text-muted-foreground text-sm"
          title={model.id}
        >
          {model.id}
        </div>
      </CardHeader>
      <CardContent className="flex grow flex-col">
        {model.description && (
          <p className="mb-4 line-clamp-3 grow text-muted-foreground text-sm">
            {model.description}
          </p>
        )}

        <div className="mb-4">
          <ModelTags model={model} limit={3} />
        </div>

        <div className="mt-auto grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 text-sm">
          <div className="flex flex-col">
            <span className="font-semibold text-muted-foreground text-xs uppercase">
              {messages.context_window_label}
            </span>
            <span className="font-medium">
              {formatTokens(model.context_window, messages)}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-muted-foreground text-xs uppercase">
              {messages.max_output_label}
            </span>
            <span className="font-medium">
              {formatTokens(model.max_tokens, messages)}
            </span>
          </div>
          <ModelPricing
            className={
              modelType(model) === 'image' && model.image_gen_price != null
                ? 'col-span-2 flex flex-col'
                : 'flex flex-col'
            }
            messages={messages}
            model={model}
          />
        </div>
      </CardContent>
    </Card>
  );
}
