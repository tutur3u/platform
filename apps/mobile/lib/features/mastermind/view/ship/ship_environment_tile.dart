import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_badge.dart';
import 'package:mobile/core/ui/components/app_toast.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/age_text.dart';
import 'package:mobile/features/mastermind/presentation/gmt7.dart';
import 'package:mobile/features/mastermind/presentation/labels.dart';
import 'package:mobile/features/mastermind/presentation/ship_model.dart';
import 'package:mobile/l10n/l10n.dart';

/// The publisher's stand-in for a commit subject it will not send.
const _withheldSubject = 'Withheld, open on Mac';

/// One environment: deploy and CI as a glyph and a word, its own freshness
/// chip (never the snapshot's age), the version, commit id and subject.
class ShipEnvironmentTile extends StatelessWidget {
  const ShipEnvironmentTile({required this.row, super.key});

  final EnvironmentRow row;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final failing = environmentIsFailing(row);
    final muted = Theme.of(context).textTheme.bodySmall;
    final released = row.releasedAt;
    final age = row.ageSeconds;
    final observed = row.observedAt;
    final version = row.versionTag;
    final subject = row.commitSubject;
    return AppGroupedRow(
      leading: AppIconTile(
        icon: failing ? AppIcons.warning : LucideIcons.server,
        tone: failing ? AppTone.warning : AppTone.neutral,
      ),
      title: Text(MastermindLabels.environment(l10n, row.environment)),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
            child: Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.xs,
              children: [
                if (failing)
                  AppBadge(
                    variant: AppBadgeVariant.warning,
                    child: Text(l10n.mastermindNeedsAttention),
                  ),
                _StatusBadge(
                  label: l10n.mastermindShipDeployBadge(
                    row.fields['deploy_status']?.status != null &&
                            row.fields['deploy_status']!.status != 'ok'
                        ? row.fields['deploy_status']!.reason(l10n)
                        : MastermindLabels.deployStatus(l10n, row.deployStatus),
                  ),
                  style: _deployStyle(row.deployStatus),
                ),
                _StatusBadge(
                  label: l10n.mastermindShipCiBadge(
                    row.fields['ci_state']?.status != null &&
                            row.fields['ci_state']!.status != 'ok'
                        ? row.fields['ci_state']!.reason(l10n)
                        : MastermindLabels.ciState(l10n, row.ciState),
                  ),
                  style: _ciStyle(row.ciState),
                ),
                // Each environment keeps the freshness the hub published for
                // it, whatever the age of the snapshot around it.
                _StatusBadge(
                  label:
                      (row.fields['freshness']?.status != null &&
                          row.fields['freshness']!.status != 'ok'
                      ? row.fields['freshness']!.reason(l10n)
                      : MastermindLabels.freshness(l10n, row.freshness)),
                  style: (AppIcons.info, AppBadgeVariant.outline),
                ),
              ],
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
            )
          else if (subject != null)
            Text(subject),
          if (released != null || age != null)
            Text(
              [
                if (released != null)
                  l10n.mastermindShipReleased(
                    Gmt7.dateTime(released, l10n.localeName),
                  ),
                if (age != null)
                  mastermindAgeText(l10n, Duration(seconds: age)),
              ].join(' · '),
              style: muted,
            ),
          Text(
            [
              if (row.fields['evidence']?.status != null &&
                  row.fields['evidence']!.status != 'ok')
                row.fields['evidence']!.reason(l10n)
              else
                MastermindLabels.evidence(l10n, row.evidence),
              if (observed != null)
                l10n.mastermindShipChecked(
                  Gmt7.dateTime(observed, l10n.localeName),
                ),
            ].join(' · '),
            style: muted,
          ),
        ],
      ),
    );
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
          IconButton(
            tooltip: l10n.mastermindShipCopySha,
            constraints: const BoxConstraints(
              minWidth: AppInterfaceTokens.minTouchTarget,
              minHeight: AppInterfaceTokens.minTouchTarget,
            ),
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
