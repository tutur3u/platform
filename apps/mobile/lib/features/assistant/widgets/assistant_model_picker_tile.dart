import 'package:flutter/material.dart';
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
    return ListTile(
      enabled: allowed,
      selected: selected,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      leading: Icon(allowed ? Icons.auto_awesome_outlined : Icons.lock_outline),
      title: Text(model.label, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            [model.provider, if (price != null) price].join(' · '),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          if (model.description case final description?)
            Text(description, maxLines: 2, overflow: TextOverflow.ellipsis),
          if (model.tags.isNotEmpty)
            Text(
              model.tags.take(3).join(' · '),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.bodySmall,
            ),
        ],
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (showFavorite)
            IconButton(
              tooltip: favorited
                  ? context.l10n.assistantModelUnfavorite
                  : context.l10n.assistantModelFavorite,
              icon: Icon(
                favorited ? Icons.star_rounded : Icons.star_outline_rounded,
              ),
              onPressed: favoriteEnabled ? onFavorite : null,
            ),
          if (selected) const Icon(Icons.check_rounded),
        ],
      ),
      onTap: allowed ? onSelect : null,
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
