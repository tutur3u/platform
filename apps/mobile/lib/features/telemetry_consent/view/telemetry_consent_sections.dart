import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/layout/grouped_section.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Icon, title and the one-sentence reason for the prompt.
class TelemetryConsentHeader extends StatelessWidget {
  const TelemetryConsentHeader({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const AppIconTile(
          icon: LucideIcons.shieldCheck,
          tone: AppTone.primary,
          size: 56,
        ),
        const SizedBox(height: AppSpacing.lg),
        Semantics(
          header: true,
          child: Text(
            l10n.telemetryConsentTitle,
            style: tokens.typography.h3.copyWith(
              color: tokens.colorScheme.foreground,
              fontWeight: FontWeight.w700,
              height: 1.2,
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          l10n.telemetryConsentLead,
          style: tokens.typography.base.copyWith(
            color: tokens.colorScheme.mutedForeground,
            height: 1.45,
          ),
        ),
      ],
    );
  }
}

/// The plain-language summary: what is shared and what is not.
class TelemetryConsentPoints extends StatelessWidget {
  const TelemetryConsentPoints({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppGroupedCard(
      children: [
        _Point(
          icon: LucideIcons.bug,
          tone: AppTone.warning,
          title: l10n.telemetryConsentCrashTitle,
          body: l10n.telemetryConsentCrashBody,
        ),
        _Point(
          icon: LucideIcons.gauge,
          tone: AppTone.info,
          title: l10n.telemetryConsentUsageTitle,
          body: l10n.telemetryConsentUsageBody,
        ),
        _Point(
          icon: LucideIcons.lock,
          tone: AppTone.success,
          title: l10n.telemetryConsentAccountTitle,
          body: l10n.telemetryConsentAccountBody,
        ),
        _Point(
          icon: LucideIcons.slidersHorizontal,
          title: l10n.telemetryConsentSettingsTitle,
          body: l10n.telemetryConsentSettingsBody,
        ),
      ],
    );
  }
}

class _Point extends StatelessWidget {
  const _Point({
    required this.icon,
    required this.title,
    required this.body,
    this.tone = AppTone.neutral,
  });

  final IconData icon;
  final AppTone tone;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    // One announcement per point instead of a title and a body stop.
    return MergeSemantics(
      child: AppGroupedRow(
        leading: AppIconTile(icon: icon, tone: tone),
        // Large text wraps instead of truncating the claim.
        title: Text(title, maxLines: 4),
        subtitle: Text(body),
      ),
    );
  }
}

/// The full disclosure behind "What's shared", and the privacy notice row.
class TelemetryConsentMore extends StatelessWidget {
  const TelemetryConsentMore({required this.onOpenPrivacy, super.key});

  final VoidCallback onOpenPrivacy;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final muted = tokens.colorScheme.mutedForeground;
    final detail = tokens.typography.small.copyWith(color: muted, height: 1.5);
    return AppGroupedCard(
      dividerInset: AppLayout.rowHorizontalPadding,
      children: [
        // AppDisclosure insets by md; match the grouped rows' leading edge.
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppLayout.rowHorizontalPadding - AppSpacing.md,
          ),
          child: AppDisclosure(
            key: const ValueKey('telemetry-consent-details'),
            leading: Icon(LucideIcons.fileText, size: 18, color: muted),
            title: Text(
              l10n.telemetryConsentDetails,
              style: const TextStyle(fontWeight: FontWeight.w500),
            ),
            childrenPadding: const EdgeInsets.fromLTRB(
              AppSpacing.md,
              0,
              AppSpacing.md,
              AppSpacing.lg,
            ),
            children: [
              Text(l10n.telemetryConsentBody, style: detail),
              const SizedBox(height: AppSpacing.sm),
              Text(l10n.telemetryFirebaseInstallationDisclosure, style: detail),
            ],
          ),
        ),
        AppGroupedRow(
          key: const ValueKey('telemetry-consent-privacy'),
          leading: Icon(LucideIcons.shield, size: 18, color: muted),
          title: Text(l10n.telemetryConsentLearnMore),
          trailing: Icon(LucideIcons.externalLink, size: 18, color: muted),
          onTap: onOpenPrivacy,
        ),
      ],
    );
  }
}
