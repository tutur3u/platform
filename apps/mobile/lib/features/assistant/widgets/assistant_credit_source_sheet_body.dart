import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantCreditSourceSheetBody extends StatelessWidget {
  const AssistantCreditSourceSheetBody({
    required this.shellState,
    required this.isPersonalWorkspace,
    required this.onClose,
    required this.onSelect,
    super.key,
  });

  final AssistantShellState shellState;
  final bool isPersonalWorkspace;
  final VoidCallback onClose;
  final ValueChanged<AssistantCreditSource> onSelect;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final showWorkspaceOption = !isPersonalWorkspace;

    return SafeArea(
      top: false,
      child: Material(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(24),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      context.l10n.assistantSourceLabel,
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: MaterialLocalizations.of(
                      context,
                    ).closeButtonTooltip,
                    visualDensity: VisualDensity.compact,
                    onPressed: onClose,
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              _CreditSourceOptionCard(
                icon: Icons.person_rounded,
                title: context.l10n.assistantSourcePersonal,
                credits: shellState.personalCredits,
                selected:
                    shellState.creditSource == AssistantCreditSource.personal,
                onTap: () => onSelect(AssistantCreditSource.personal),
              ),
              if (showWorkspaceOption) ...[
                const SizedBox(height: 10),
                _CreditSourceOptionCard(
                  icon: Icons.apartment_rounded,
                  title: context.l10n.assistantSourceWorkspace,
                  credits: shellState.workspaceCredits,
                  selected:
                      shellState.creditSource ==
                      AssistantCreditSource.workspace,
                  disabled: shellState.workspaceCreditLocked,
                  onTap: () => onSelect(AssistantCreditSource.workspace),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _CreditSourceOptionCard extends StatelessWidget {
  const _CreditSourceOptionCard({
    required this.icon,
    required this.title,
    required this.credits,
    required this.selected,
    required this.onTap,
    this.disabled = false,
  });

  final IconData icon;
  final String title;
  final AssistantCredits credits;
  final bool selected;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final locale = Localizations.localeOf(context).toLanguageTag();
    final total = credits.totalAllocated + credits.bonusCredits;
    final remaining = total > 0
        ? math.max<num>(0, total - credits.totalUsed)
        : math.max<num>(0, credits.remaining);
    final percentRemaining = total > 0
        ? ((remaining / total) * 100).clamp(0, 100)
        : 0.0;
    final compactFormatter = NumberFormat.compact(locale: locale);
    final remainingLabel = compactFormatter.format(remaining);
    final totalLabel = compactFormatter.format(total);
    final borderColor = selected
        ? theme.colorScheme.primary.withValues(alpha: 0.45)
        : theme.colorScheme.outlineVariant.withValues(alpha: 0.5);
    final surfaceColor = selected
        ? theme.colorScheme.primary.withValues(alpha: 0.08)
        : theme.colorScheme.surfaceContainerLow;
    final foregroundColor = disabled
        ? theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.56)
        : theme.colorScheme.onSurface;

    return InkWell(
      onTap: disabled ? null : onTap,
      borderRadius: BorderRadius.circular(16),
      child: Ink(
        decoration: BoxDecoration(
          color: surfaceColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: borderColor),
        ),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.surface,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(icon, color: foregroundColor, size: 18),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: theme.textTheme.titleSmall?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: foregroundColor,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          context.l10n.assistantCreditsTitle,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (disabled)
                    Icon(
                      Icons.lock_outline_rounded,
                      size: 18,
                      color: theme.colorScheme.onSurfaceVariant,
                    )
                  else if (selected)
                    Icon(
                      Icons.check_circle_rounded,
                      size: 20,
                      color: theme.colorScheme.primary,
                    )
                  else
                    Icon(
                      Icons.chevron_right_rounded,
                      size: 18,
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        value: total > 0 ? percentRemaining / 100 : 0,
                        minHeight: 6,
                        backgroundColor: theme.colorScheme.surface,
                        valueColor: AlwaysStoppedAnimation<Color>(
                          _creditProgressColor(
                            theme,
                            percentRemaining.toDouble(),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Text(
                    total > 0
                        ? '$remainingLabel / $totalLabel'
                        : remainingLabel,
                    style: theme.textTheme.labelLarge?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: foregroundColor,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _creditProgressColor(ThemeData theme, double percentRemaining) {
    if (percentRemaining > 30) {
      return theme.colorScheme.primary;
    }
    if (percentRemaining > 10) {
      return Colors.orange;
    }
    return theme.colorScheme.error;
  }
}
