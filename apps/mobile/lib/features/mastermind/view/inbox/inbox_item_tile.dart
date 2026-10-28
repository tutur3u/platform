import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/l10n/l10n.dart';

/// One open Needs-you item in the Inbox list: title, body (three lines until
/// "More"), kind and product chips, and the options as read-only chips.
///
/// Tapping the row opens the detail, where a reply can be composed.
class InboxItemTile extends StatefulWidget {
  const InboxItemTile({required this.item, super.key});

  final NeedsYou item;

  @override
  State<InboxItemTile> createState() => _InboxItemTileState();
}

class _InboxItemTileState extends State<InboxItemTile> {
  static const _collapsedLines = 3;
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final l10n = context.l10n;
    final options = selectableOptions(item);
    return AppGroupedRow(
      title: Text(item.title),
      showChevron: true,
      // Pushed, so Back returns to this list with its search and chips intact.
      onTap: () => context.push(Routes.mastermindInboxItemPath(item.id)),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (item.body.isNotEmpty) _body(context, item.body),
          const SizedBox(height: AppSpacing.xs),
          Wrap(
            spacing: AppSpacing.xs,
            runSpacing: AppSpacing.xs,
            children: [
              if (item.kind case final kind?)
                AppBadge(child: Text(MastermindLabels.itemKind(l10n, kind))),
              if (item.product case final product?)
                AppBadge.outline(
                  child: Text(MastermindLabels.product(product)),
                ),
              for (final (_, option) in options)
                OptionChip(
                  option: option,
                  recommended: option == item.recommendedOption,
                ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _body(BuildContext context, String body) {
    final l10n = context.l10n;
    final style = Theme.of(context).textTheme.bodySmall;
    return LayoutBuilder(
      builder: (context, constraints) {
        final painter = TextPainter(
          text: TextSpan(text: body, style: style),
          maxLines: _collapsedLines,
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout(maxWidth: constraints.maxWidth);
        final overflows = painter.didExceedMaxLines;
        painter.dispose();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              body,
              style: style,
              maxLines: _expanded ? null : _collapsedLines,
              overflow: _expanded ? null : TextOverflow.ellipsis,
            ),
            if (overflows || _expanded)
              InkWell(
                onTap: () => setState(() => _expanded = !_expanded),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(
                    minWidth: AppInterfaceTokens.minTouchTarget,
                    minHeight: AppInterfaceTokens.minTouchTarget,
                  ),
                  child: Align(
                    alignment: AlignmentDirectional.centerStart,
                    widthFactor: 1,
                    child: Text(
                      _expanded ? l10n.mastermindLess : l10n.mastermindMore,
                      style: style?.copyWith(
                        color: AppTokens.of(context).colorScheme.primary,
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// A read-only option. The recommended one carries a star and the word
/// "Recommended", never colour alone.
class OptionChip extends StatelessWidget {
  const OptionChip({
    required this.option,
    required this.recommended,
    super.key,
  });

  final String option;
  final bool recommended;

  @override
  Widget build(BuildContext context) => AppBadge.outline(
    leading: recommended ? const Icon(LucideIcons.star, size: 12) : null,
    child: Text(
      recommended ? context.l10n.mastermindOptionRecommended(option) : option,
    ),
  );
}
