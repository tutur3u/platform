import 'package:flutter/material.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';

/// Title and supporting line of a sign-in step.
class AuthHeading extends StatelessWidget {
  const AuthHeading({
    this.title,
    this.subtitle,
    this.centered = true,
    this.large = false,
    super.key,
  });

  final String? title;

  /// Usually a [Text]; a [Text.rich] can bold the address a code went to.
  final Widget? subtitle;
  final bool centered;

  /// The welcome title, one step larger.
  final bool large;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final align = centered ? TextAlign.center : TextAlign.start;
    final titleStyle = tokens.typography.title.copyWith(color: c.foreground);
    return Column(
      crossAxisAlignment: centered
          ? CrossAxisAlignment.center
          : CrossAxisAlignment.start,
      children: [
        if (title case final text?)
          Semantics(
            header: true,
            child: Text(
              text,
              textAlign: align,
              style: large
                  ? titleStyle.copyWith(fontSize: 26, height: 32 / 26)
                  : titleStyle,
            ),
          ),
        if (subtitle case final line?) ...[
          const AppGap(AppSpacing.xs),
          DefaultTextStyle.merge(
            textAlign: align,
            style: tokens.typography.bodySm.copyWith(color: c.mutedForeground),
            child: line,
          ),
        ],
      ],
    );
  }
}

/// The quiet back affordance at the top of a step ("Other ways to sign in").
class AuthBackButton extends StatelessWidget {
  const AuthBackButton({required this.onPressed, this.label, super.key});

  final VoidCallback? onPressed;
  final String? label;

  @override
  Widget build(BuildContext context) {
    final text = label ?? MaterialLocalizations.of(context).backButtonTooltip;
    return AppButton.ghost(
      size: AppButtonSize.small,
      onPressed: onPressed,
      leading: const Icon(LucideIcons.chevronLeft, size: 16),
      child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis),
    );
  }
}

/// The sign-in hero: the sorbet bowl on the ground tone with the brand mark.
class AuthHeroBand extends StatelessWidget {
  const AuthHeroBand({super.key});

  @override
  Widget build(BuildContext context) {
    final c = AppTokens.of(context).colorScheme;
    final ground = SorbetTokens.maybeOf(context)?.ground ?? c.muted;
    return LayoutBuilder(
      builder: (context, constraints) {
        // Short screens (and large text) give the form the room.
        final screen = MediaQuery.sizeOf(context).height;
        final height = screen < 640 ? 150.0 : 230.0;
        final art = (height - 24) * 320 / 280;
        return Container(
          height: height,
          decoration: BoxDecoration(
            color: ground,
            borderRadius: BorderRadius.circular(32),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              AppIllustration(
                AppIllustrationKind.welcomeBowl,
                size: art.clamp(0, constraints.maxWidth - 32),
                cycles: 2,
              ),
              PositionedDirectional(
                top: 16,
                start: 18,
                child: Image.asset(
                  'assets/logos/transparent.png',
                  width: 26,
                  height: 26,
                  excludeFromSemantics: true,
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
