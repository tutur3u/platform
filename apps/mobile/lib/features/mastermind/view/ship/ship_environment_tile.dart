import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/components/app_toast.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/hub_field.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/relative_time.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_clock.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_time_label.dart';
import 'package:mobile/l10n/l10n.dart';

/// The publisher's stand-in for a commit subject it will not send.
const _withheldSubject = 'Withheld, open on Mac';

/// One environment as a compact row: status badges (deploy, CI, and its own
/// freshness only when it is not fresh), then the version and commit id, then
/// one muted line with the subject and how long ago it was released and
/// checked. A reading the hub did not publish is left out rather than shown
/// as an empty word; one it could not read keeps its reason. The evidence
/// and absolute times are in the row's semantics label.
class ShipEnvironmentTile extends StatelessWidget {
  const ShipEnvironmentTile({required this.row, required this.asOf, super.key});

  final EnvironmentRow row;

  /// The snapshot's own time, so "checked 5 min ago" is what the hub saw.
  final DateTime asOf;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final failing = environmentIsFailing(row);
    final muted = Theme.of(context).textTheme.bodySmall;
    final version = row.versionTag;
    final subject = row.commitSubject;
    // The hub's own age wins over the raw release time when it sends both.
    final released = row.ageSeconds != null
        ? asOf.subtract(Duration(seconds: row.ageSeconds!))
        : row.releasedAt;
    final zone = mastermindTimeZoneOf(context);
    final locale = Localizations.localeOf(context).toString();
    final observed = row.observedAt;
    final deploy = _reading(
      row.fields['deploy_status'],
      known: row.deployStatus != DeployStatus.unknown,
      l10n: l10n,
      word: () => MastermindLabels.deployStatus(l10n, row.deployStatus),
    );
    final ci = _reading(
      row.fields['ci_state'],
      known: row.ciState != CiState.unknown,
      l10n: l10n,
      word: () => MastermindLabels.ciState(l10n, row.ciState),
    );
    // Each environment keeps the freshness the hub published for it,
    // whatever the age of the snapshot around it; "fresh" goes without saying.
    final freshness = _reading(
      row.fields['freshness'],
      known:
          row.freshness == Freshness.cached || row.freshness == Freshness.stale,
      l10n: l10n,
      word: () => MastermindLabels.freshness(l10n, row.freshness),
    );
    final evidence = _reading(
      row.fields['evidence'],
      known: row.evidence != Evidence.unknown,
      l10n: l10n,
      word: () => MastermindLabels.evidence(l10n, row.evidence),
    );
    final line = [
      if (subject != null && subject != _withheldSubject) Text(subject),
      if (released != null)
        MastermindTimeLabel(released, sentence: l10n.mastermindShipReleasedAgo),
      if (observed != null)
        MastermindTimeLabel(observed, sentence: l10n.mastermindShipCheckedAgo),
    ];
    final badges = [
      if (failing)
        MastermindStatusChip(
          tone: AppTone.destructive,
          label: l10n.mastermindShipFailing,
        ),
      if (deploy != null)
        _StatusBadge(
          label: l10n.mastermindShipDeployBadge(deploy),
          style: _deployStyle(row.deployStatus),
        ),
      if (ci != null)
        _StatusBadge(
          label: l10n.mastermindShipCiBadge(ci),
          style: _ciStyle(row.ciState),
        ),
      if (freshness != null)
        _StatusBadge(label: freshness, style: (AppIcons.info, AppTone.neutral)),
    ];
    // The spoken ages are recomputed on every clock tick, not cached.
    return MastermindClockBuilder(
      builder: (context, now) => _row(
        context,
        semanticLabel: [
          if (released != null)
            l10n.mastermindShipReleased(
              mastermindSpokenTime(
                l10n,
                released,
                now: now,
                zone: zone,
                locale: locale,
              ),
            ),
          if (observed != null)
            l10n.mastermindShipChecked(
              mastermindSpokenTime(
                l10n,
                observed,
                now: now,
                zone: zone,
                locale: locale,
              ),
            ),
          ?evidence,
        ].join(' · '),
        failing: failing,
        subject: subject,
        version: version,
        muted: muted,
        badges: badges,
        line: line,
      ),
    );
  }

  Widget _row(
    BuildContext context, {
    required String semanticLabel,
    required bool failing,
    required String? subject,
    required String? version,
    required TextStyle? muted,
    required List<Widget> badges,
    required List<Widget> line,
  }) {
    final l10n = context.l10n;
    return AppGroupedRow(
      semanticLabel: semanticLabel,
      leading: AppIconTile(
        icon: failing ? AppIcons.warning : LucideIcons.server,
        tone: failing ? AppTone.destructive : AppTone.neutral,
      ),
      title: Text(MastermindLabels.environment(l10n, row.environment)),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (badges.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: Wrap(
                spacing: AppSpacing.xs,
                runSpacing: AppSpacing.xs,
                children: badges,
              ),
            ),
          if (version != null || row.sha != null)
            _VersionLine(version: version, sha: row.sha),
          if (subject == _withheldSubject)
            Tooltip(
              message: l10n.mastermindShipWithheldTooltip,
              child: Row(
                children: [
                  Icon(AppIcons.info, size: 14, color: muted?.color),
                  const SizedBox(width: AppSpacing.xs),
                  Flexible(
                    child: Text(l10n.mastermindShipWithheld, style: muted),
                  ),
                ],
              ),
            ),
          if (line.isNotEmpty)
            DefaultTextStyle.merge(
              style: muted,
              child: Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: AppSpacing.xs,
                children: [
                  for (final (i, part) in line.indexed) ...[
                    if (i > 0) const Text('·'),
                    part,
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }

  /// The word for one reading: the hub's reason when it could not read it,
  /// the value when [known], and null (left out) otherwise.
  static String? _reading(
    HubField? field, {
    required bool known,
    required AppLocalizations l10n,
    required String Function() word,
  }) {
    if (field != null && field.status != 'ok') return field.reason(l10n);
    return known ? word() : null;
  }

  static (IconData, AppTone) _deployStyle(DeployStatus status) =>
      switch (status) {
        DeployStatus.success => (AppIcons.check, AppTone.success),
        DeployStatus.failure ||
        DeployStatus.error => (AppIcons.warning, AppTone.destructive),
        DeployStatus.pending ||
        DeployStatus.queued => (LucideIcons.hourglass, AppTone.neutral),
        DeployStatus.inProgress => (LucideIcons.play, AppTone.neutral),
        DeployStatus.inactive ||
        DeployStatus.unknown => (AppIcons.info, AppTone.neutral),
      };

  static (IconData, AppTone) _ciStyle(CiState state) => switch (state) {
    CiState.success => (AppIcons.check, AppTone.success),
    CiState.failure || CiState.error => (AppIcons.warning, AppTone.destructive),
    CiState.pending => (LucideIcons.hourglass, AppTone.neutral),
    CiState.unknown => (AppIcons.info, AppTone.neutral),
  };
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label, required this.style});

  final String label;
  final (IconData, AppTone) style;

  @override
  Widget build(BuildContext context) =>
      MastermindStatusChip(tone: style.$2, icon: style.$1, label: label);
}

/// `v1.2.3 · abcdef1`, the commit id in monospace and copyable. It is a
/// public commit id, not a secret.
class _VersionLine extends StatelessWidget {
  const _VersionLine({required this.version, required this.sha});

  final String? version;
  final String? sha;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final sha = this.sha;
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: AppSpacing.xs,
      children: [
        if (version != null) Text(version!),
        if (version != null && sha != null) const Text('·'),
        if (sha != null) ...[
          Text(sha, style: const TextStyle(fontFamily: 'monospace')),
          AppIconButton(
            tooltip: l10n.mastermindShipCopySha,
            icon: const Icon(LucideIcons.copy, size: 16),
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: sha));
              if (context.mounted) {
                showAppToast(context, message: l10n.mastermindShipShaCopied);
              }
            },
          ),
        ],
      ],
    );
  }
}
