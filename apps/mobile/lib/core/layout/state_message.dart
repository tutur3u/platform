import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/grouped_rows.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Empty, error and unavailable states with one shared look.
///
/// The default constructor centres an icon tile, a title, a message and an
/// optional action for a whole page or pane. [AppStateMessage.inline] lays the
/// same content out as a row inside a grouped card.
class AppStateMessage extends StatelessWidget {
  const AppStateMessage({
    required this.icon,
    required this.title,
    this.message,
    this.tone = AppTone.neutral,
    this.actionLabel,
    this.onAction,
    super.key,
  }) : inline = false;

  const AppStateMessage.inline({
    required this.icon,
    required this.title,
    this.message,
    this.tone = AppTone.neutral,
    this.actionLabel,
    this.onAction,
    super.key,
  }) : inline = true;

  final IconData icon;
  final String title;
  final String? message;
  final AppTone tone;
  final String? actionLabel;
  final FutureOr<void> Function()? onAction;
  final bool inline;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final action = actionLabel != null && onAction != null
        ? AppButton.outline(
            size: inline ? AppButtonSize.small : AppButtonSize.normal,
            onPressed: () => unawaited(Future.sync(onAction!)),
            child: Text(actionLabel!),
          )
        : null;
    final titleText = Text(
      title,
      textAlign: inline ? TextAlign.start : TextAlign.center,
      style: (inline ? tokens.typography.base : tokens.typography.large)
          .copyWith(color: c.foreground, fontWeight: FontWeight.w600),
    );
    final messageText = message == null
        ? null
        : Text(
            message!,
            textAlign: inline ? TextAlign.start : TextAlign.center,
            style: tokens.typography.small.copyWith(
              color: c.mutedForeground,
              height: 1.4,
            ),
          );

    if (inline) {
      return Semantics(
        container: true,
        liveRegion: tone == AppTone.destructive,
        child: Padding(
          padding: const EdgeInsets.all(AppLayout.rowHorizontalPadding),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppIconTile(icon: icon, tone: tone),
              const SizedBox(width: AppLayout.rowLeadingGap),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    titleText,
                    if (messageText != null) ...[
                      const SizedBox(height: AppSpacing.xxs),
                      messageText,
                    ],
                    if (action != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      action,
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    return Semantics(
      container: true,
      liveRegion: tone == AppTone.destructive,
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.xxl),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                AppIconTile(icon: icon, tone: tone, size: 56),
                const SizedBox(height: AppSpacing.lg),
                titleText,
                if (messageText != null) ...[
                  const SizedBox(height: AppSpacing.xs + AppSpacing.xxs),
                  messageText,
                ],
                if (action != null) ...[
                  const SizedBox(height: AppSpacing.lg),
                  action,
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
