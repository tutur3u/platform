import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Compact label/value pair inside an [AppSummaryHero].
class AppHeroFact extends StatelessWidget {
  const AppHeroFact({required this.label, required this.value, super.key});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return Semantics(
      container: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            value,
            style: tokens.typography.large.copyWith(
              color: c.foreground,
              fontWeight: FontWeight.w700,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
          Text(
            label,
            style: tokens.typography.xSmall.copyWith(color: c.mutedForeground),
          ),
        ],
      ),
    );
  }
}

/// The opening summary of an app's root page: what matters right now, in
/// one glance, with the app's own tone.
///
/// An eyebrow (icon tile and label), a [headline] (a figure or a short
/// statement), a supporting line, up to four [facts] and a few [actions].
/// On wide layouts the facts move beside the headline. The tinted surface
/// is a plain gradient fill, so it costs no blur or extra layers.
class AppSummaryHero extends StatelessWidget {
  const AppSummaryHero({
    required this.eyebrow,
    required this.headline,
    this.icon,
    this.tone = AppTone.primary,
    this.supporting,
    this.facts = const [],
    this.actions = const [],
    super.key,
  });

  final String eyebrow;
  final String headline;
  final IconData? icon;
  final AppTone tone;
  final String? supporting;
  final List<AppHeroFact> facts;

  /// Usually one primary and one secondary `AppButton`.
  final List<Widget> actions;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final solid = MediaQuery.highContrastOf(context);
    final tint = tone.fill(c);
    final radius = BorderRadius.circular(AppRadius.card);

    final intro = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          children: [
            if (icon case final icon?) ...[
              AppIconTile(icon: icon, tone: tone, size: 28),
              const SizedBox(width: AppSpacing.sm),
            ],
            Flexible(
              child: Text(
                eyebrow,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.small.copyWith(
                  color: c.mutedForeground,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.md),
        Semantics(
          header: true,
          child: Text(
            headline,
            style: type.x3Large.copyWith(
              color: c.foreground,
              fontWeight: FontWeight.w700,
              height: 1.1,
              letterSpacing: -0.4,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
        if (supporting case final supporting?) ...[
          const SizedBox(height: AppSpacing.xs + 2),
          Text(
            supporting,
            style: type.small.copyWith(color: c.mutedForeground, height: 1.4),
          ),
        ],
      ],
    );
    final factWrap = facts.isEmpty
        ? null
        : Wrap(
            spacing: AppSpacing.xxl,
            runSpacing: AppSpacing.md,
            children: facts,
          );

    return Container(
      decoration: BoxDecoration(
        borderRadius: radius,
        color: solid ? c.card : null,
        gradient: solid
            ? null
            : LinearGradient(
                begin: AlignmentDirectional.topStart,
                end: AlignmentDirectional.bottomEnd,
                colors: [
                  Color.alphaBlend(tint, c.card),
                  c.card.withValues(alpha: 0.9),
                ],
              ),
        border: Border.all(
          color: solid ? c.border : tone.foreground(c).withValues(alpha: 0.18),
        ),
      ),
      padding: const EdgeInsets.all(AppSpacing.xl),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final wide = constraints.maxWidth >= Breakpoints.mediumMin - 80;
          final top = wide && factWrap != null
              ? Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(child: intro),
                    const SizedBox(width: AppSpacing.xxl),
                    ConstrainedBox(
                      constraints: BoxConstraints(
                        maxWidth: constraints.maxWidth / 2,
                      ),
                      child: factWrap,
                    ),
                  ],
                )
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    intro,
                    if (factWrap != null) ...[
                      const SizedBox(height: AppSpacing.lg),
                      factWrap,
                    ],
                  ],
                );
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              top,
              if (actions.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.lg),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: actions,
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
