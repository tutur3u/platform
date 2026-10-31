import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';
import 'package:mobile/features/mastermind/presentation/what_needs_me.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// The open asks "Use recommendations" would answer: each with a recommended
/// selectable option, and no reply of this device already pending for it.
List<NeedsYou> recommendableAsks(
  Iterable<NeedsYou> open,
  MastermindRepliesState replies,
) => [
  for (final item in open)
    if (recommendedChoice(item) != null &&
        !replies.pendingOptions.containsKey(item.id) &&
        replies.entryFor(item.id, item.versionHash) == null &&
        !replies.statusFor(item.id).sending)
      item,
];

/// Confirms, then answers every listed ask with its recommended option on the
/// existing `/v1/replies` path: one held reply per ask, each with its own
/// Idempotency-Key and the usual durable undo on its card. The sheet then
/// shows what happened to each one. No native dialog is involved.
Future<void> showUseRecommendationsSheet(
  BuildContext context, {
  required List<NeedsYou> items,
  required MastermindRepliesCubit replies,
}) => showAppSheet<void>(
  context: context,
  size: AppSheetSize.medium,
  builder: (context) => UseRecommendationsSheet(items: items, replies: replies),
);

class UseRecommendationsSheet extends StatefulWidget {
  const UseRecommendationsSheet({
    required this.items,
    required this.replies,
    super.key,
  });

  final List<NeedsYou> items;
  final MastermindRepliesCubit replies;

  @override
  State<UseRecommendationsSheet> createState() =>
      _UseRecommendationsSheetState();
}

class _UseRecommendationsSheetState extends State<UseRecommendationsSheet> {
  /// Per ask id: whether its reply was queued. Null until confirmed.
  Map<String, bool>? _results;

  void _confirm() {
    final results = <String, bool>{};
    for (final item in widget.items) {
      final choice = recommendedChoice(item);
      results[item.id] =
          choice != null &&
          widget.replies.queueOption(item: item, optionIndex: choice.$1);
    }
    setState(() => _results = results);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final results = _results;
    final sent = results?.values.where((ok) => ok).length ?? 0;
    return AppSheetScaffold(
      title: l10n.mastermindIrisUseRecommendations,
      description: results == null
          ? l10n.mastermindIrisUseRecommendationsDescription
          : l10n.mastermindIrisRecommendationsResult(sent, results.length),
      slivers: [
        SliverToBoxAdapter(
          child: AppGroupedSection(
            children: [
              for (final item in widget.items) _row(context, item, results),
            ],
          ),
        ),
      ],
      actions: [
        if (results == null)
          AppButton.primary(
            key: const ValueKey('use-recommendations-confirm'),
            onPressed: widget.items.isEmpty ? null : _confirm,
            child: Text(
              l10n.mastermindIrisUseRecommendationsConfirm(widget.items.length),
            ),
          )
        else
          AppButton.secondary(
            key: const ValueKey('use-recommendations-done'),
            onPressed: () => Navigator.of(context).maybePop(),
            child: Text(l10n.mastermindIrisDone),
          ),
      ],
    );
  }

  Widget _row(BuildContext context, NeedsYou item, Map<String, bool>? results) {
    final l10n = context.l10n;
    final choice = recommendedChoice(item);
    final result = results?[item.id];
    return AppGroupedRow(
      key: ValueKey('use-recommendations-row-${item.id}'),
      leading: switch (result) {
        null => const AppIconTile(
          icon: LucideIcons.star,
          tone: AppTone.primary,
        ),
        true => const AppIconTile(icon: AppIcons.check, tone: AppTone.success),
        false => const AppIconTile(icon: LucideIcons.circleSlash),
      },
      title: Text(item.hubTitle ?? itemDisplayTitle(l10n, item)),
      subtitle: Text(switch (result) {
        null =>
          choice == null ? '' : l10n.mastermindOptionRecommended(choice.$2),
        true => l10n.mastermindIrisRecommendationQueued,
        false => l10n.mastermindIrisRecommendationSkipped,
      }),
    );
  }
}
