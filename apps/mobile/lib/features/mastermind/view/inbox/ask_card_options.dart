import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/features/mastermind/asks/ask_v2_support.dart';
import 'package:mobile/features/mastermind/view/widgets/large_text.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_status_chip.dart';
import 'package:mobile/l10n/l10n.dart';

/// The least a tap target may be on the Inbox card, in dp. Above the 44 dp
/// token floor on purpose: these are the buttons that answer an ask.
const double askCardMinTarget = 48;

/// One answer choice as a full-width button that is at least
/// [askCardMinTarget] tall. The label and its notes wrap, never ellipsize.
/// The recommended one carries a filled check, the word "Recommended" and its
/// one-line reason, so the mark never rests on colour alone.
///
/// With no [onTap] the choice is shown but cannot be picked.
class AskOptionTile extends StatelessWidget {
  const AskOptionTile({
    required this.option,
    required this.recommended,
    required this.why,
    required this.onTap,
    super.key,
  });

  final AskOption option;
  final bool recommended;

  /// `recommended_why`, shown under the recommended option only.
  final String? why;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final enabled = onTap != null;
    final large = mastermindLargeText(context);
    final note = option.note;
    final reason = recommended ? why : null;
    final chip = MastermindStatusChip(
      label: l10n.mastermindRecommended,
      icon: LucideIcons.check,
      tone: AppTone.success,
    );
    final label = Text(
      option.label,
      style: tokens.typography.base.copyWith(
        color: c.foreground,
        fontWeight: FontWeight.w600,
        height: 1.3,
      ),
    );
    final body = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (recommended && large) ...[chip, const SizedBox(height: 4)],
        label,
        for (final line in [?note, ?reason])
          Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xs),
            child: Text(
              line,
              style: tokens.typography.small.copyWith(color: c.mutedForeground),
            ),
          ),
      ],
    );
    return Semantics(
      button: true,
      enabled: enabled,
      label: [
        if (recommended) l10n.mastermindRecommended,
        option.label,
        ?note,
        ?reason,
      ].join('. '),
      onTap: onTap,
      excludeSemantics: true,
      child: Opacity(
        opacity: enabled ? 1 : 0.72,
        child: Material(
          color: recommended ? AppTone.success.fill(c) : Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(AppRadius.sm),
            side: BorderSide(color: recommended ? c.success : c.border),
          ),
          child: InkWell(
            customBorder: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadius.sm),
            ),
            onTap: onTap,
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: askCardMinTarget),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: AppSpacing.sm,
                ),
                child: Row(
                  children: [
                    Icon(
                      recommended
                          ? LucideIcons.circleCheck
                          : LucideIcons.circle,
                      size: 20,
                      color: recommended ? c.success : c.mutedForeground,
                    ),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(child: body),
                    if (recommended && !large) ...[
                      const SizedBox(width: AppSpacing.sm),
                      chip,
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A full-width disclosure row ("Show full text", "+2 more options") that
/// expands in place, never navigates.
class AskDisclosureRow extends StatelessWidget {
  const AskDisclosureRow({
    required this.label,
    required this.expanded,
    required this.onTap,
    super.key,
  });

  final String label;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final color = tokens.colorScheme.primary;
    return Semantics(
      button: true,
      expanded: expanded,
      label: label,
      onTap: onTap,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.xs),
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: askCardMinTarget,
            minWidth: askCardMinTarget,
          ),
          child: Align(
            alignment: AlignmentDirectional.centerStart,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Flexible(
                  child: Text(
                    label,
                    style: tokens.typography.small.copyWith(
                      color: color,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                Icon(
                  expanded ? LucideIcons.chevronUp : LucideIcons.chevronDown,
                  size: 16,
                  color: color,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A tinted, icon-led note: incomplete, expired and similar states.
class AskNotice extends StatelessWidget {
  const AskNotice({
    required this.tone,
    required this.icon,
    required this.text,
    super.key,
  });

  final AppTone tone;
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: tone.fill(c),
        borderRadius: BorderRadius.circular(AppRadius.sm),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, size: 18, color: tone.foreground(c)),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                text,
                style: tokens.typography.small.copyWith(
                  color: c.foreground,
                  height: 1.4,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
