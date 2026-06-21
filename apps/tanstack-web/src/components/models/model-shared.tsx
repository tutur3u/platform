import type { GatewayModelRow } from '@tuturuuu/internal-api';
import { Badge } from '@tuturuuu/ui/badge';
import { formatPrice, modelType, numberValue } from './model-format';
import type { ModelsMessages } from './models-types';
import { ProviderLogo } from './provider-logo';

export function ModelBadges({ model }: { model: GatewayModelRow }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <Badge
        variant="outline"
        className="flex shrink-0 items-center gap-1.5 px-2 py-0.5 capitalize"
      >
        <ProviderLogo
          provider={model.provider}
          size={12}
          className="opacity-70"
        />
        {model.provider}
      </Badge>
      <Badge className="shrink-0 bg-primary/10 text-primary capitalize hover:bg-primary/20 hover:text-primary">
        {modelType(model)}
      </Badge>
    </div>
  );
}

export function ModelTags({
  limit,
  model,
}: {
  limit?: number;
  model: GatewayModelRow;
}) {
  if (!model.tags?.length) {
    return null;
  }

  const visibleTags = limit ? model.tags.slice(0, limit) : model.tags;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleTags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="px-1.5 py-0 text-[10px] uppercase"
        >
          {tag}
        </Badge>
      ))}
      {limit && model.tags.length > limit && (
        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
          +{model.tags.length - limit}
        </Badge>
      )}
    </div>
  );
}

export function ModelPricing({
  className,
  compact = false,
  messages,
  model,
}: {
  className?: string;
  compact?: boolean;
  messages: ModelsMessages;
  model: GatewayModelRow;
}) {
  const labelClass = compact
    ? 'text-[11px] text-muted-foreground uppercase'
    : 'font-semibold text-muted-foreground text-xs uppercase';

  if (modelType(model) === 'image' && model.image_gen_price != null) {
    const price = numberValue(model.image_gen_price);

    return (
      <div className={className}>
        <span className={labelClass}>{messages.generation_price_label}</span>
        <span className="font-medium">
          {price == null
            ? messages.not_available
            : `$${price.toFixed(3)} ${messages.per_image}`}
        </span>
      </div>
    );
  }

  return (
    <>
      <div className={className}>
        <span className={labelClass}>{messages.input_price_label}</span>
        <span className="font-medium">
          {formatPrice(model.input_price_per_token, messages)}
        </span>
      </div>
      <div className={className}>
        <span className={labelClass}>{messages.output_price_label}</span>
        <span className="font-medium">
          {formatPrice(model.output_price_per_token, messages)}
        </span>
      </div>
    </>
  );
}
