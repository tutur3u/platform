import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

enum AppAlertVariant { neutral, info, success, warning, destructive }

/// Inline banner for status, warnings and errors.
///
/// Replaces `shad.Alert`; `shad.Alert(destructive: true)` maps to
/// [AppAlert.destructive]. Status changes are announced as a live region.
class AppAlert extends StatelessWidget {
  const AppAlert({
    this.title,
    this.content,
    this.leading,
    this.trailing,
    this.variant = AppAlertVariant.neutral,
    super.key,
  }) : assert(title != null || content != null, 'Provide title or content.');

  const AppAlert.destructive({
    this.title,
    this.content,
    this.leading,
    this.trailing,
    super.key,
  }) : variant = AppAlertVariant.destructive;

  final Widget? title;
  final Widget? content;

  /// Defaults to the variant's icon; pass `SizedBox.shrink()` to hide it.
  final Widget? leading;
  final Widget? trailing;
  final AppAlertVariant variant;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final (Color accent, IconData icon) = switch (variant) {
      AppAlertVariant.neutral => (c.foreground, AppIcons.info),
      AppAlertVariant.info => (c.info, AppIcons.info),
      AppAlertVariant.success => (c.success, AppIcons.success),
      AppAlertVariant.warning => (c.warning, AppIcons.warning),
      AppAlertVariant.destructive => (c.destructive, AppIcons.error),
    };
    final tinted = variant != AppAlertVariant.neutral;
    return Semantics(
      container: true,
      liveRegion: true,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: tinted
              ? Color.alphaBlend(
                  accent.withValues(alpha: c.isDark ? 0.14 : 0.08),
                  c.card,
                )
              : c.card,
          borderRadius: BorderRadius.circular(AppRadius.sm),
          border: Border.all(
            color: tinted ? accent.withValues(alpha: 0.4) : c.border,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconTheme.merge(
                data: IconThemeData(color: accent, size: 18),
                child: leading ?? Icon(icon),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (title != null)
                      DefaultTextStyle.merge(
                        style: tokens.typography.textSmall.copyWith(
                          color: tinted ? accent : c.foreground,
                          fontWeight: FontWeight.w600,
                        ),
                        child: title!,
                      ),
                    if (title != null && content != null)
                      const SizedBox(height: AppSpacing.xxs),
                    if (content != null)
                      DefaultTextStyle.merge(
                        style: tokens.typography.small.copyWith(
                          color: c.mutedForeground,
                        ),
                        child: content!,
                      ),
                  ],
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: AppSpacing.sm),
                trailing!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}
