import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/sorbet/sorbet_tokens.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/apps/models/app_module.dart';
import 'package:mobile/l10n/l10n.dart';

class AppLauncherTile extends StatelessWidget {
  const AppLauncherTile({
    required this.module,
    required this.onPressed,
    super.key,
  });

  final AppModule module;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return AppLauncherButton(
      radius: tokens.shapes.card,
      onPressed: onPressed,
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.sm),
        child: Row(
          children: [
            AppProductIcon(module: module),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                module.label(context.l10n),
                style: tokens.typography.ui.copyWith(
                  fontWeight: FontWeight.w700,
                  color: tokens.colorScheme.cardForeground,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AppLauncherButton extends StatelessWidget {
  const AppLauncherButton({
    required this.radius,
    required this.onPressed,
    required this.child,
    super.key,
  });

  final double radius;
  final VoidCallback onPressed;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final shape = RoundedRectangleBorder(
      borderRadius: BorderRadius.circular(radius),
      side: BorderSide(color: colors.border),
    );
    return Semantics(
      button: true,
      child: Material(
        color: colors.card,
        shape: shape,
        clipBehavior: Clip.antiAlias,
        child: InkWell(onTap: onPressed, customBorder: shape, child: child),
      ),
    );
  }
}

class AppProductIcon extends StatelessWidget {
  const AppProductIcon({
    required this.module,
    this.size = 44,
    this.round = false,
    super.key,
  });

  final AppModule module;
  final double size;
  final bool round;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final hues = SorbetTokens.maybeOf(context)?.hues;
    final (hue, tone) = switch (module.id) {
      'tasks' || 'meet' || 'mastermind' => (hues?.blue, AppTone.info),
      'finance' || 'timer' || 'habits' => (hues?.green, AppTone.success),
      'calendar' => (hues?.orange, AppTone.warning),
      'documents' ||
      'education' ||
      'mail' ||
      'cms' => (hues?.purple, AppTone.primary),
      'chat' => (hues?.pink, AppTone.primary),
      'crm' || 'drive' || 'inventory' => (hues?.teal, AppTone.success),
      'notes' => (hues?.yellow, AppTone.warning),
      _ => (null, AppTone.neutral),
    };
    final ink = hue?.ink ?? tone.foreground(colors);
    final fill = Color.alphaBlend(
      ink.withValues(alpha: colors.isDark ? 0.2 : 0.14),
      colors.card,
    );
    return ExcludeSemantics(
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: fill,
          borderRadius: BorderRadius.circular(round ? size / 2 : size * 0.32),
        ),
        child: SizedBox.square(
          dimension: size,
          child: Icon(module.icon, color: ink, size: size < 44 ? 18 : 22),
        ),
      ),
    );
  }
}
