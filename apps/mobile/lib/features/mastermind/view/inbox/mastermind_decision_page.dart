import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/decisions_model.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/view/inbox/decision_tile.dart';
import 'package:mobile/features/mastermind/view/mastermind_freshness_strip.dart';
import 'package:mobile/features/mastermind/view/mastermind_section.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/l10n/l10n.dart';

/// `/mastermind/inbox/decision/:decisionId`: one journal decision in full.
///
/// The id is an opaque snapshot id used only to look the decision up. If the
/// snapshot no longer holds it the page says so and offers the way back; it is
/// never an error. The journal is history, so there is nothing to answer.
class MastermindDecisionPage extends StatefulWidget {
  const MastermindDecisionPage({required this.decisionId, super.key});

  final String decisionId;

  @override
  State<MastermindDecisionPage> createState() => _MastermindDecisionPageState();
}

class _MastermindDecisionPageState extends State<MastermindDecisionPage> {
  /// What was first shown here, to notice a decision that changed since.
  String? _openedSignature;

  @override
  Widget build(BuildContext context) => MastermindSection(
    builder: (context, ready, freshness) {
      final decision = journalDecisionById(ready.snapshot, widget.decisionId);
      if (decision != null) _openedSignature ??= _signature(decision);
      return AppPageScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          SliverToBoxAdapter(
            child: MastermindFreshnessStrip(freshness: freshness),
          ),
          SliverToBoxAdapter(
            child: decision == null
                ? const _Gone()
                : _Detail(
                    decision: decision,
                    updated: _signature(decision) != _openedSignature,
                  ),
          ),
        ],
      );
    },
  );
}

String _signature(JournalDecision d) => [
  d.title,
  d.at.toIso8601String(),
  d.area.name,
  d.risk.name,
  d.by,
  d.category.name,
  d.why,
  d.reversible,
  d.product?.name,
].join('\u0000');

class _Gone extends StatelessWidget {
  const _Gone();

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xxxl),
      child: AppStateMessage(
        icon: LucideIcons.scrollText,
        title: l10n.mastermindDecisionGoneTitle,
        actionLabel: l10n.mastermindBackToDecisions,
        onAction: () =>
            context.go(inboxLocation(segment: InboxSegment.decisions)),
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  const _Detail({required this.decision, required this.updated});

  final JournalDecision decision;
  final bool updated;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final locale = Localizations.localeOf(context).toString();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ShellTitleOverride(
          ownerId: 'mastermind-decision',
          locations: {Routes.mastermindInboxDecisionPath(decision.id)},
          title: decision.title,
          showLeadingBrand: false,
        ),
        if (updated)
          AppGroupedSection.spaced(
            children: [
              AppGroupedRow(
                leading: const AppIconTile(
                  icon: AppIcons.info,
                  tone: AppTone.warning,
                ),
                title: Text(l10n.mastermindDecisionUpdated),
              ),
            ],
          ),
        // The title is the shell's title override above; the body repeats none.
        AppGroupedSection.spaced(
          caption: l10n.mastermindWhy,
          children: [
            AppGroupedRow(
              title: Text(
                decision.why == null || decision.why!.isEmpty
                    ? l10n.mastermindWhyMissing
                    : decision.why!,
              ),
            ),
          ],
        ),
        AppGroupedSection.spaced(
          children: [
            _Fact(
              label: l10n.mastermindDecidedBy,
              value: _decidedBy(l10n, DecidedBy.parse(decision.by)),
            ),
            _Fact(
              label: l10n.mastermindReversible,
              value: decision.reversible
                  ? l10n.mastermindReversibleYes
                  : l10n.mastermindReversibleNo,
            ),
            AppGroupedRow(
              title: Text(l10n.mastermindRiskLabel),
              trailing: RiskBadge(risk: decision.risk),
            ),
            _Fact(
              label: l10n.mastermindCategoryLabel,
              value: MastermindLabels.decisionCategory(l10n, decision.category),
            ),
            _Fact(
              label: l10n.mastermindAreaLabel,
              value: MastermindLabels.decisionArea(l10n, decision.area),
            ),
            if (decision.product case final product?)
              AppGroupedRow(
                title: Text(l10n.mastermindProductFilter),
                trailing: AppBadge.outline(
                  child: Text(MastermindLabels.product(product)),
                ),
              ),
            _Fact(
              label: l10n.mastermindDecidedOnLabel,
              value: Gmt7.dateTime(decision.at, locale),
            ),
          ],
        ),
      ],
    );
  }

  static String _decidedBy(AppLocalizations l10n, DecidedBy by) => switch (by) {
    DecidedByMastermind() => l10n.mastermindDecidedByMastermind,
    DecidedByUser() => l10n.mastermindDecidedByUser,
    // The role slug is shown verbatim, never translated.
    DecidedByRole(:final slug) => l10n.mastermindDecidedByRole(slug),
  };
}

class _Fact extends StatelessWidget {
  const _Fact({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) =>
      AppGroupedRow(title: Text(label), trailing: Text(value));
}
