import 'package:flutter/material.dart' hide Scaffold;
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

Future<T?> showFinanceModal<T>({
  required BuildContext context,
  required Widget Function(BuildContext) builder,
  double maxDialogWidth = 640,
}) {
  return showAdaptiveSheet<T>(
    context: context,
    maxDialogWidth: maxDialogWidth,
    builder: builder,
  );
}

class FinanceModalScaffold extends StatelessWidget {
  const FinanceModalScaffold({
    required this.title,
    required this.child,
    this.subtitle,
    this.actions = const [],
    this.trailing,
    this.maxBodyHeightFactor = 0.76,
    this.padding = const EdgeInsets.fromLTRB(20, 20, 20, 20),
    super.key,
  });

  final String title;
  final String? subtitle;
  final Widget child;
  final List<Widget> actions;
  final Widget? trailing;
  final double maxBodyHeightFactor;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);
    final viewInsets = MediaQuery.viewInsetsOf(context);
    final isCompact = context.isCompact;

    final body = Column(
      children: [
        Expanded(
          child: Padding(
            padding: padding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            style: theme.typography.h4.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          if (subtitle?.trim().isNotEmpty ?? false) ...[
                            const shad.Gap(6),
                            Text(
                              subtitle!,
                              style: theme.typography.textSmall.copyWith(
                                color: theme.colorScheme.mutedForeground,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                    if (trailing != null) ...[
                      const shad.Gap(12),
                      trailing!,
                    ],
                  ],
                ),
                const shad.Gap(18),
                Expanded(
                  child: child,
                ),
              ],
            ),
          ),
        ),
        if (actions.isNotEmpty)
          Container(
            width: double.infinity,
            padding: EdgeInsets.fromLTRB(
              20,
              14,
              20,
              20 + (isCompact ? viewInsets.bottom : 0),
            ),
            decoration: BoxDecoration(
              color: palette.elevatedPanel,
              border: Border(
                top: BorderSide(color: palette.subtleBorder),
              ),
            ),
            child: Wrap(
              alignment: WrapAlignment.end,
              spacing: 10,
              runSpacing: 10,
              children: actions,
            ),
          )
        else if (isCompact && viewInsets.bottom > 0)
          SizedBox(height: viewInsets.bottom),
      ],
    );

    if (isCompact) {
      return SafeArea(
        top: false,
        child: FractionallySizedBox(
          heightFactor: 0.94,
          child: Container(
            decoration: BoxDecoration(
              color: palette.panel,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(28),
              ),
            ),
            child: Column(
              children: [
                const shad.Gap(10),
                Container(
                  width: 48,
                  height: 5,
                  decoration: BoxDecoration(
                    color: theme.colorScheme.mutedForeground.withValues(
                      alpha: 0.28,
                    ),
                    borderRadius: BorderRadius.circular(999),
                  ),
                ),
                const shad.Gap(4),
                Expanded(child: body),
              ],
            ),
          ),
        ),
      );
    }

    return ConstrainedBox(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.sizeOf(context).height * maxBodyHeightFactor,
      ),
      child: ColoredBox(
        color: palette.panel,
        child: body,
      ),
    );
  }
}

class FinancePickerTile extends StatelessWidget {
  const FinancePickerTile({
    required this.title,
    required this.onTap,
    this.leading,
    this.trailing,
    this.subtitle,
    this.isSelected = false,
    super.key,
  });

  final String title;
  final String? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final VoidCallback onTap;
  final bool isSelected;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final palette = FinancePalette.of(context);

    return FinancePanel(
      radius: 18,
      onTap: onTap,
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      borderColor: isSelected ? palette.accent.withValues(alpha: 0.45) : null,
      backgroundColor: isSelected
          ? palette.accent.withValues(alpha: 0.10)
          : palette.panel,
      child: Row(
        children: [
          if (leading != null) ...[
            leading!,
            const shad.Gap(12),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.small.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                if (subtitle?.trim().isNotEmpty ?? false) ...[
                  const shad.Gap(4),
                  Text(
                    subtitle!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.typography.textSmall.copyWith(
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ],
            ),
          ),
          const shad.Gap(12),
          trailing ??
              Icon(
                isSelected ? Icons.check_circle : Icons.chevron_right,
                size: 18,
                color: isSelected
                    ? palette.accent
                    : theme.colorScheme.mutedForeground,
              ),
        ],
      ),
    );
  }
}
