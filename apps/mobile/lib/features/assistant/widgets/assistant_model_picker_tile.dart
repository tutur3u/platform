import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantModelPickerTile extends StatelessWidget {
  const AssistantModelPickerTile({
    required this.model,
    required this.selected,
    required this.allowed,
    required this.favorited,
    required this.showFavorite,
    required this.favoriteEnabled,
    required this.onFavorite,
    required this.onSelect,
    super.key,
  });

  final AssistantGatewayModel model;
  final bool selected;
  final bool allowed;
  final bool favorited;
  final bool showFavorite;
  final bool favoriteEnabled;
  final VoidCallback onFavorite;
  final VoidCallback onSelect;

  @override
  Widget build(BuildContext context) {
    final price = _priceLabel(context, model);
    return Semantics(
      selected: selected,
      enabled: allowed,
      button: true,
      child: Opacity(
        opacity: allowed ? 1 : .5,
        child: AppCard(
          onTap: allowed ? onSelect : null,
          fillColor: selected
              ? AppTokens.of(context).colorScheme.muted
              : AppTokens.of(context).colorScheme.card,
          child: Row(
            children: [
              Icon(allowed ? LucideIcons.sparkles : LucideIcons.lock),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      model.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    Text(
                      [model.provider, if (price != null) price].join(' · '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    if (model.description case final description?)
                      Text(
                        description,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    if (model.tags.isNotEmpty)
                      Text(
                        model.tags.take(3).join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                  ],
                ),
              ),
              if (showFavorite)
                AppIconButton(
                  tooltip: favorited
                      ? context.l10n.assistantModelUnfavorite
                      : context.l10n.assistantModelFavorite,
                  icon: Icon(
                    favorited ? LucideIcons.star : LucideIcons.starOff,
                  ),
                  onPressed: favoriteEnabled ? onFavorite : null,
                ),
              if (selected) const Icon(LucideIcons.check),
            ],
          ),
        ),
      ),
    );
  }

  String? _priceLabel(BuildContext context, AssistantGatewayModel model) {
    final input = model.inputPricePerToken;
    final output = model.outputPricePerToken;
    if (input == null && output == null) return null;
    String format(double value) {
      final perMillion = value * 1000000;
      return perMillion < 0.01
          ? perMillion.toStringAsFixed(4)
          : perMillion.toStringAsFixed(2);
    }

    return [
      if (input != null)
        '${context.l10n.assistantModelInputCost} \$${format(input)}/M',
      if (output != null)
        '${context.l10n.assistantModelOutputCost} \$${format(output)}/M',
    ].join(' · ');
  }
}
