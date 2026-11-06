import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Titled surface for one block of content: a chart, a short list, a
/// breakdown or an inline form. It replaces hand-built `Card` + `Column` +
/// title combinations.
///
/// Set [padded] to `false` when the child brings its own row insets, such
/// as a list of `AppRichRow`s.
class AppPanel extends StatelessWidget {
  const AppPanel({
    required this.child,
    this.title,
    this.subtitle,
    this.actionLabel,
    this.onAction,
    this.padded = true,
    super.key,
  });

  final Widget child;
  final String? title;
  final String? subtitle;
  final String? actionLabel;
  final VoidCallback? onAction;
  final bool padded;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final type = tokens.typography;
    final solid = MediaQuery.highContrastOf(context);
    final radius = tokens.interface.borderRadius(AppRadius.card);
    final hasAction = actionLabel != null && onAction != null;
    final hasHeader = title != null || hasAction;
    final header = !hasHeader
        ? null
        : Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.xs,
              0,
            ),
            child: Row(
              children: [
                Expanded(
                  child: Semantics(
                    header: true,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (title case final title?)
                          Text(
                            title,
                            style: type.base.copyWith(
                              color: c.foreground,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        if (subtitle case final subtitle?)
                          Text(
                            subtitle,
                            style: type.xSmall.copyWith(
                              color: c.mutedForeground,
                              height: 1.35,
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                if (hasAction)
                  AppButton.ghost(
                    size: AppButtonSize.small,
                    onPressed: onAction,
                    child: Text(actionLabel!),
                  )
                else
                  const SizedBox(height: kMinInteractiveDimension),
              ],
            ),
          );
    return DecoratedBox(
      decoration: BoxDecoration(
        color: c.card.withValues(alpha: solid ? 1 : 0.86),
        borderRadius: radius,
        border: Border.all(color: c.border.withValues(alpha: solid ? 1 : 0.7)),
      ),
      child: ClipRRect(
        borderRadius: radius,
        child: Material(
          type: MaterialType.transparency,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              ?header,
              Padding(
                padding: padded
                    ? EdgeInsets.fromLTRB(
                        AppSpacing.lg,
                        hasHeader ? AppSpacing.xs : AppSpacing.lg,
                        AppSpacing.lg,
                        AppSpacing.lg,
                      )
                    : EdgeInsets.zero,
                child: child,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
