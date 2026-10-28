import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/components/app_icon_button.dart';
import 'package:mobile/core/ui/components/app_toast.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/hub_field.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
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
    final released = row.ageSeconds != null
        ? Duration(seconds: row.ageSeconds!)
        : row.releasedAt == null
        ? null
        : asOf.difference(row.releasedAt!);
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
    final timing = [
      if (released != null)
        l10n.mastermindShipReleasedAgo(mastermindAgeText(l10n, released)),
      if (observed != null)
        l10n.mastermindShipCheckedAgo(
          mastermindAgeText(l10n, asOf.difference(observed)),
        ),
    ];
    final line = [
      if (subject != null && subject != _withheldSubject) subject,
      ...timing,
    ].join(' · ');
    final badges = [
      if (failing)
        AppBadge(
          variant: AppBadgeVariant.destructive,
          child: Text(l10n.mastermindShipFailing),
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
        _StatusBadge(
          label: freshness,
          style: (AppIcons.info, AppBadgeVariant.outline),
        ),
    ];
    return AppGroupedRow(
      semanticLabel: [
        if (row.releasedAt case final at?)
          l10n.mastermindShipReleased(Gmt7.dateTime(at, l10n.localeName)),
        if (observed != null)
          l10n.mastermindShipChecked(Gmt7.dateTime(observed, l10n.localeName)),
        ?evidence,
      ].join(' · '),
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
          if (line.isNotEmpty) Text(line, style: muted),
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

  static (IconData, AppBadgeVariant) _deployStyle(DeployStatus status) =>
      switch (status) {
        DeployStatus.success => (AppIcons.check, AppBadgeVariant.success),
        DeployStatus.failure ||
        DeployStatus.error => (AppIcons.warning, AppBadgeVariant.warning),
        DeployStatus.pending ||
        DeployStatus.queued => (LucideIcons.hourglass, AppBadgeVariant.outline),
        DeployStatus.inProgress => (LucideIcons.play, AppBadgeVariant.outline),
        DeployStatus.inactive ||
        DeployStatus.unknown => (AppIcons.info, AppBadgeVariant.outline),
      };

  static (IconData, AppBadgeVariant) _ciStyle(CiState state) => switch (state) {
    CiState.success => (AppIcons.check, AppBadgeVariant.success),
    CiState.failure ||
    CiState.error => (AppIcons.warning, AppBadgeVariant.warning),
    CiState.pending => (LucideIcons.hourglass, AppBadgeVariant.outline),
    CiState.unknown => (AppIcons.info, AppBadgeVariant.outline),
  };
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label, required this.style});

  final String label;
  final (IconData, AppBadgeVariant) style;

  @override
  Widget build(BuildContext context) =>
      AppBadge(variant: style.$2, leading: Icon(style.$1), child: Text(label));
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
