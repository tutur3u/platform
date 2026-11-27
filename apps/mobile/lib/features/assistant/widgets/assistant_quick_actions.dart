import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';

/// One quick action on the new-chat screen; [prompt] is placed in the
/// composer when the tile is tapped.
class AssistantQuickAction {
  const AssistantQuickAction({
    required this.id,
    required this.prompt,
    required this.icon,
    required this.tone,
  });

  final String id;
  final String prompt;
  final IconData icon;
  final AppTone tone;
}

/// The quick actions Mira offers on a new chat, mirroring the web empty
/// state: agenda, open tasks, focus and a finance entry.
List<AssistantQuickAction> assistantQuickActions(BuildContext context) {
  final l10n = context.l10n;
  return [
    AssistantQuickAction(
      id: 'calendar',
      prompt: l10n.assistantQuickPromptCalendar,
      icon: LucideIcons.calendarDays,
      tone: AppTone.info,
    ),
    AssistantQuickAction(
      id: 'tasks',
      prompt: l10n.assistantQuickPromptTasks,
      icon: LucideIcons.listTodo,
      tone: AppTone.warning,
    ),
    AssistantQuickAction(
      id: 'focus',
      prompt: l10n.assistantQuickPromptFocus,
      icon: LucideIcons.target,
      tone: AppTone.success,
    ),
    AssistantQuickAction(
      id: 'finance',
      prompt: l10n.assistantQuickPromptExpense,
      icon: LucideIcons.wallet,
      tone: AppTone.primary,
    ),
  ];
}

/// A responsive grid of quick actions: one column below 272dp, two columns on
/// compact widths, and a single row of four from 600dp of available width.
/// Narrower-than-row tiles lay the icon beside the prompt so the grid stays
/// short on phones; tiles in a row share the tallest one's height.
class AssistantQuickActionGrid extends StatelessWidget {
  const AssistantQuickActionGrid({required this.onSelected, super.key});

  final ValueChanged<String> onSelected;

  static const double _rowWidth = 600;
  static const double _twoColumnWidth = 272;

  @override
  Widget build(BuildContext context) {
    final actions = assistantQuickActions(context);
    return LayoutBuilder(
      key: const ValueKey('assistant-quick-actions'),
      builder: (context, constraints) {
        final columns = switch (constraints.maxWidth) {
          >= _rowWidth => 4,
          >= _twoColumnWidth => 2,
          _ => 1,
        };
        const gap = AppSpacing.sm;
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: gap,
          children: [
            for (var start = 0; start < actions.length; start += columns)
              IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  spacing: gap,
                  children: [
                    for (final action in actions.skip(start).take(columns))
                      Expanded(
                        child: _QuickActionTile(
                          action: action,
                          inline: columns == 2,
                          onTap: () => onSelected(action.prompt),
                        ),
                      ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}

class _QuickActionTile extends StatelessWidget {
  const _QuickActionTile({
    required this.action,
    required this.inline,
    required this.onTap,
  });

  final AssistantQuickAction action;

  /// Icon beside the prompt instead of above it.
  final bool inline;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final radius = BorderRadius.circular(AppRadius.md);
    final prompt = Text(
      action.prompt,
      maxLines: 3,
      overflow: TextOverflow.ellipsis,
      style: tokens.typography.uiSm.copyWith(color: colors.foreground),
    );
    return Semantics(
      button: true,
      child: Material(
        key: ValueKey('assistant-quick-action-${action.id}'),
        color: colors.muted.withValues(alpha: colors.isDark ? 0.45 : 0.6),
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: inline
                ? const EdgeInsets.symmetric(
                    horizontal: AppSpacing.sm + 2,
                    vertical: AppSpacing.sm + 2,
                  )
                : const EdgeInsets.all(AppSpacing.md),
            child: inline
                ? Row(
                    spacing: AppSpacing.sm,
                    children: [
                      AppIconTile(
                        icon: action.icon,
                        tone: action.tone,
                        size: 28,
                      ),
                      Expanded(child: prompt),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      AppIconTile(icon: action.icon, tone: action.tone),
                      const SizedBox(height: AppSpacing.sm),
                      prompt,
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
