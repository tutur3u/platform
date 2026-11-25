import 'package:flutter/material.dart';
import 'package:mobile/core/theme/dynamic_colors.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/documents/view/document_format_actions.dart';
import 'package:mobile/features/tasks_boards/utils/tiptap_quill_colors.dart'
    show taskDescriptionThemePalette;
import 'package:mobile/l10n/l10n.dart';

/// The document editor's formatting bar: the web toolbar's groups in one
/// horizontally scrolling row, divided by hairlines. Sits above the
/// keyboard on phones and under the editor on wide screens.
class DocumentFormatToolbar extends StatelessWidget {
  const DocumentFormatToolbar({required this.groups, super.key});

  final List<List<AppFormatAction>> groups;

  @override
  Widget build(BuildContext context) {
    final colors = AppTokens.of(context).colorScheme;
    final solid = MediaQuery.highContrastOf(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.card.withValues(alpha: solid ? 1 : 0.96),
        border: Border(top: BorderSide(color: colors.border)),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.xs,
          vertical: AppSpacing.xxs,
        ),
        child: Row(
          children: [
            for (var g = 0; g < groups.length; g++) ...[
              if (g > 0)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.xxs,
                  ),
                  child: SizedBox(
                    width: 1,
                    height: 20,
                    child: ColoredBox(color: colors.border),
                  ),
                ),
              for (final action in groups[g])
                AppIconButton(
                  icon: Icon(action.icon),
                  tooltip: action.tooltip,
                  onPressed: action.onPressed,
                  variant: action.selected
                      ? AppButtonVariant.secondary
                      : AppButtonVariant.ghost,
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Picks one of the web's swatches for [channel]; pops the hue, or an
/// empty string to clear.
class DocumentSwatchSheet extends StatelessWidget {
  const DocumentSwatchSheet({required this.channel, super.key});

  final DocumentColorChannel channel;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final palette = taskDescriptionThemePalette(context.dynamicColors);
    final highlight = channel == DocumentColorChannel.highlight;
    return AppSheetScaffold(
      title: highlight
          ? l10n.documentsFormatHighlight
          : l10n.documentsFormatTextColor,
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          _Swatch(
            label: l10n.documentsColorNone,
            background: c.background,
            foreground: c.mutedForeground,
            border: c.border,
            icon: LucideIcons.ban,
            onTap: () => Navigator.of(context).pop(''),
          ),
          for (final hue in documentSwatchHues)
            _Swatch(
              label: documentSwatchLabel(l10n, hue),
              background: highlight
                  ? palette['var(--calendar-bg-$hue)']!
                  : c.background,
              foreground: palette['var(--$hue)']!,
              border: highlight ? palette['var(--$hue)']! : c.border,
              onTap: () => Navigator.of(context).pop(hue),
            ),
        ],
      ),
    );
  }
}

class _Swatch extends StatelessWidget {
  const _Swatch({
    required this.label,
    required this.background,
    required this.foreground,
    required this.border,
    required this.onTap,
    this.icon,
  });

  final String label;
  final Color background;
  final Color foreground;
  final Color border;
  final VoidCallback onTap;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    return Semantics(
      button: true,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: SizedBox(
          width: 72,
          child: Column(
            children: [
              Container(
                width: 44,
                height: 44,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: background,
                  border: Border.all(color: border),
                  borderRadius: BorderRadius.circular(AppRadius.md),
                ),
                child: icon == null
                    ? Text(
                        'A',
                        style: tokens.typography.large.copyWith(
                          color: foreground,
                          fontWeight: FontWeight.w700,
                        ),
                      )
                    : Icon(icon, size: 18, color: foreground),
              ),
              const SizedBox(height: AppSpacing.xxs),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tokens.typography.xSmall.copyWith(
                  color: tokens.colorScheme.mutedForeground,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The swatch's name, as the web labels it.
String documentSwatchLabel(AppLocalizations l10n, String hue) => switch (hue) {
  'yellow' => l10n.taskBoardDetailColorYellow,
  'orange' => l10n.taskBoardDetailColorOrange,
  'red' => l10n.taskBoardDetailColorRed,
  'pink' => l10n.taskBoardDetailColorPink,
  'purple' => l10n.taskBoardDetailColorPurple,
  'blue' => l10n.taskBoardDetailColorBlue,
  'green' => l10n.taskBoardDetailColorGreen,
  _ => l10n.taskBoardDetailColorGray,
};
