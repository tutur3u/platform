import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/home_needs_you_card.dart';
import 'package:mobile/l10n/l10n.dart';

/// The latest three events from `now.digest`, newest first. Display only: the
/// full feed and its "new" cursor arrive with the Activity screen.
class HomeActivityCard extends StatelessWidget {
  const HomeActivityCard({required this.model, super.key});

  final MastermindHomeModel model;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    return AppGroupedSection.spaced(
      caption: l10n.mastermindActivityTitle,
      children: [
        if (model.activity.isEmpty)
          AppGroupedRow(title: Text(l10n.mastermindActivityEmpty)),
        for (final event in model.activity)
          AppGroupedRow(
            title: Text(eventSummary(l10n, event)),
            subtitle: Text(
              '${MastermindLabels.eventKind(l10n, event.kind)} · '
              '${Gmt7.dateTime(event.ts, locale)}',
            ),
          ),
      ],
    );
  }
}

/// One display line for an event. Security payloads collapse to the fixed
/// line, so a security title or detail can never leak through the feed.
String eventSummary(AppLocalizations l10n, SnapshotEvent event) =>
    switch (event.payload) {
      final SecurityItem item => securityLine(l10n, item),
      NeedsYouItem(:final title) ||
      LaneItem(:final title) ||
      BacklogEntry(:final title) => title,
      ProductRelease(:final product) => MastermindLabels.releaseProduct(
        product,
      ),
      ProductQuota(:final instance) => instance,
      EnvironmentRow(:final product, :final environment) =>
        '${MastermindLabels.releaseProduct(product)} · '
            '${MastermindLabels.environment(l10n, environment)}',
      Receipt(:final title) => title,
    };
