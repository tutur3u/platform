import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// Status header of the device authenticator: whether this device is
/// registered, plus the actions that apply to that state.
class DeviceMfaStatusCard extends StatelessWidget {
  const DeviceMfaStatusCard({
    required this.registered,
    required this.title,
    required this.children,
    this.subtitle,
    super.key,
  });

  final bool registered;
  final String title;
  final String? subtitle;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return AppGroupedCard(
      padding: const EdgeInsets.all(AppSpacing.lg),
      showDividers: false,
      children: [
        Semantics(
          header: true,
          child: Row(
            children: [
              AppIconTile(
                icon: registered
                    ? LucideIcons.shieldCheck
                    : LucideIcons.smartphoneNfc,
                tone: registered ? AppTone.success : AppTone.primary,
                size: 48,
              ),
              const SizedBox(width: AppSpacing.lg),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: tokens.typography.large.copyWith(
                        fontWeight: FontWeight.w700,
                        color: c.foreground,
                      ),
                    ),
                    if (subtitle case final subtitle?) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      Text(
                        subtitle,
                        style: tokens.typography.small.copyWith(
                          color: c.mutedForeground,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
        if (children.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.lg),
          ...children,
        ],
      ],
    );
  }
}

/// The current one-time code with a ring counting down to its rotation.
class DeviceMfaCodeDisplay extends StatelessWidget {
  const DeviceMfaCodeDisplay({
    required this.code,
    required this.secondsLeft,
    super.key,
  });

  final String code;
  final int secondsLeft;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final seconds = secondsLeft.clamp(0, 30);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        DecoratedBox(
          decoration: BoxDecoration(
            color: c.muted,
            borderRadius: tokens.interface.borderRadius(AppRadius.md),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.lg,
              vertical: AppSpacing.md,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Semantics(
                    liveRegion: true,
                    child: SelectableText(
                      code,
                      style: tokens.typography.x3Large.copyWith(
                        fontFamily: 'monospace',
                        fontWeight: FontWeight.w700,
                        letterSpacing: 6,
                        color: c.foreground,
                      ),
                    ),
                  ),
                ),
                Semantics(
                  label: l10n.deviceMfaCodeChangesIn(seconds),
                  excludeSemantics: true,
                  child: SizedBox.square(
                    dimension: 36,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        CircularProgressIndicator(
                          value: seconds / 30,
                          strokeWidth: 3,
                          color: c.foreground,
                          backgroundColor: c.border,
                        ),
                        Text(
                          '$seconds',
                          style: tokens.typography.xSmall.copyWith(
                            fontWeight: FontWeight.w700,
                            color: c.foreground,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          l10n.deviceMfaCodeHint,
          style: tokens.typography.small.copyWith(color: c.mutedForeground),
        ),
      ],
    );
  }
}
