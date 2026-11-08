import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/overlays/app_sheet_scaffold.dart';
import 'package:mobile/core/ui/overlays/show_app_sheet.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/ask_card_source.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/presentation/what_needs_me.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

/// Why an open ask is left out of "Use recommendations".
enum BatchExclusion { risky, incomplete }

/// What "Use recommendations" would do: `included` asks are answered with
/// their recommended option; `excluded` ones are listed under "Not included".
typedef BatchPlan = ({
  List<NeedsYou> included,
  List<(NeedsYou, BatchExclusion)> excluded,
});

/// Splits the open asks that have a recommendation and no reply of this device
/// yet. A risky ask (or one with a null `risk_class` beside other p2 fields,
/// see `isRiskyAsk`) and an incomplete one are never answered in a batch.
BatchPlan batchPlan(Iterable<NeedsYou> open, MastermindRepliesState replies) {
  final included = <NeedsYou>[];
  final excluded = <(NeedsYou, BatchExclusion)>[];
  for (final item in open) {
    if (recommendedChoice(item) == null ||
        replies.pendingOptions.containsKey(item.id) ||
        replies.entryFor(item.id, item.versionHash) != null ||
        replies.statusFor(item.id).sending) {
      continue;
    }
    if (isRiskyAsk(item)) {
      excluded.add((item, BatchExclusion.risky));
    } else if (inboxAskFor(item).card.incomplete) {
      excluded.add((item, BatchExclusion.incomplete));
    } else {
      included.add(item);
    }
  }
  return (included: included, excluded: excluded);
}

/// The open asks "Use recommendations" would answer.
List<NeedsYou> recommendableAsks(
  Iterable<NeedsYou> open,
  MastermindRepliesState replies,
) => batchPlan(open, replies).included;

/// Lists every included ask (question, recommended option, checkbox), then
/// answers the checked ones on the existing `/v1/replies` path: one held reply
/// per ask, each with its own Idempotency-Key and the usual durable undo on
/// its card. No signature or device prompt is involved: risky asks never
/// appear here. The sheet then shows what happened to each one.
Future<void> showUseRecommendationsSheet(
  BuildContext context, {
  required List<NeedsYou> items,
  required MastermindRepliesCubit replies,
  List<(NeedsYou, BatchExclusion)> excluded = const [],
}) => showAppSheet<void>(
  context: context,
  size: AppSheetSize.large,
  builder: (context) => UseRecommendationsSheet(
    items: items,
    replies: replies,
    excluded: excluded,
  ),
);

class UseRecommendationsSheet extends StatefulWidget {
  const UseRecommendationsSheet({
    required this.items,
    required this.replies,
    this.excluded = const [],
    super.key,
  });

  final List<NeedsYou> items;
  final MastermindRepliesCubit replies;
  final List<(NeedsYou, BatchExclusion)> excluded;

  @override
  State<UseRecommendationsSheet> createState() =>
      _UseRecommendationsSheetState();
}

class _UseRecommendationsSheetState extends State<UseRecommendationsSheet> {
  late final Set<String> _checked = {for (final item in widget.items) item.id};

  /// Per ask id: whether its reply was queued. Null until confirmed.
  Map<String, bool>? _results;

  Iterable<NeedsYou> get _chosen =>
      widget.items.where((item) => _checked.contains(item.id));

  void _confirm() {
    final results = <String, bool>{};
    for (final item in _chosen) {
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
              for (final item in widget.items)
                if (results == null || results.containsKey(item.id))
                  _row(context, item, results),
            ],
          ),
        ),
        if (results == null && widget.excluded.isNotEmpty)
          SliverToBoxAdapter(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
                  child: Text(
                    l10n.mastermindIrisNotIncludedTitle,
                    key: const ValueKey('use-recommendations-not-included'),
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                AppGroupedSection(
                  children: [
                    for (final (item, why) in widget.excluded)
                      AppGroupedRow(
                        key: ValueKey(
                          'use-recommendations-excluded-${item.id}',
                        ),
                        leading: AppIconTile(
                          icon: why == BatchExclusion.risky
                              ? LucideIcons.fingerprint
                              : LucideIcons.circleSlash,
                          tone: AppTone.warning,
                        ),
                        title: Text(
                          item.hubTitle ?? itemDisplayTitle(l10n, item),
                        ),
                        subtitle: Text(switch (why) {
                          BatchExclusion.risky =>
                            l10n.mastermindIrisNotIncludedRisky,
                          BatchExclusion.incomplete =>
                            l10n.mastermindIrisNotIncludedIncomplete,
                        }),
                      ),
                  ],
                ),
              ],
            ),
          ),
      ],
      actions: [
        if (results == null)
          AppButton.primary(
            key: const ValueKey('use-recommendations-confirm'),
            onPressed: _checked.isEmpty ? null : _confirm,
            child: Text(
              l10n.mastermindIrisUseRecommendationsConfirm(_checked.length),
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
    final others = selectableOptions(item).length - 1;
    return AppGroupedRow(
      key: ValueKey('use-recommendations-row-${item.id}'),
      leading: switch (result) {
        null => Checkbox(
          key: ValueKey('use-recommendations-check-${item.id}'),
          value: _checked.contains(item.id),
          onChanged: (on) => setState(() {
            if (on ?? false) {
              _checked.add(item.id);
            } else {
              _checked.remove(item.id);
            }
          }),
        ),
        true => const AppIconTile(icon: AppIcons.check, tone: AppTone.success),
        false => const AppIconTile(icon: LucideIcons.circleSlash),
      },
      title: Text(item.hubTitle ?? itemDisplayTitle(l10n, item)),
      subtitle: switch (result) {
        null => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (choice != null)
              Text(l10n.mastermindOptionRecommended(choice.$2)),
            if (others > 0)
              Text(l10n.mastermindIrisUseRecommendationsOthers(others)),
          ],
        ),
        true => Text(l10n.mastermindIrisRecommendationQueued),
        false => Text(l10n.mastermindIrisRecommendationSkipped),
      },
    );
  }
}
