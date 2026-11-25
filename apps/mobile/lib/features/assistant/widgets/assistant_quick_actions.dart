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

/// A two-column grid of quick actions on compact widths and a single row of
/// four from 600dp of available width.
class AssistantQuickActionGrid extends StatelessWidget {
  const AssistantQuickActionGrid({required this.onSelected, super.key});

  final ValueChanged<String> onSelected;

  static const double _rowWidth = 600;

  @override
  Widget build(BuildContext context) {
    final actions = assistantQuickActions(context);
    return LayoutBuilder(
      key: const ValueKey('assistant-quick-actions'),
      builder: (context, constraints) {
        final columns = constraints.maxWidth >= _rowWidth ? 4 : 2;
        const gap = AppSpacing.sm;
        final available = constraints.maxWidth - gap * (columns - 1);
        // Floored so rounding never pushes the last tile onto a new run.
        final width = (available / columns).floorToDouble();
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final action in actions)
              SizedBox(
                width: width,
                child: _QuickActionTile(
                  action: action,
                  onTap: () => onSelected(action.prompt),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _QuickActionTile extends StatelessWidget {
  const _QuickActionTile({required this.action, required this.onTap});

  final AssistantQuickAction action;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final colors = tokens.colorScheme;
    final radius = BorderRadius.circular(AppRadius.md);
    return Semantics(
      button: true,
      child: Material(
        key: ValueKey('assistant-quick-action-${action.id}'),
        color: colors.muted.withValues(alpha: colors.isDark ? 0.45 : 0.6),
        borderRadius: radius,
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 96),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  AppIconTile(icon: action.icon, tone: action.tone),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    action.prompt,
                    maxLines: 3,
                    overflow: TextOverflow.ellipsis,
                    style: tokens.typography.uiSm.copyWith(
                      color: colors.foreground,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
