import 'package:flutter/material.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SettingsTile extends StatelessWidget {
  const SettingsTile({
    required this.icon,
    required this.title,
    this.subtitle,
    this.value,
    this.trailingValue,
    this.onTap,
    this.isDestructive = false,
    this.showChevron = true,
    this.trailing,
    this.grouped = false,
    this.wrapSupportingText = false,
    super.key,
  });

  final IconData icon;
  final String title;
  final String? subtitle;

  /// Current-value summary shown under the title.
  final String? value;

  /// Short current value shown before the chevron, such as a theme name.
  final String? trailingValue;
  final VoidCallback? onTap;
  final bool isDestructive;
  final bool showChevron;
  final Widget? trailing;
  final bool grouped;
  final bool wrapSupportingText;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final muted = theme.colorScheme.mutedForeground;
    final iconColor = isDestructive
        ? theme.colorScheme.destructive
        : theme.colorScheme.foreground;
    final textColor = isDestructive ? theme.colorScheme.destructive : null;
    final hasSupportingLine =
        (value?.trim().isNotEmpty ?? false) ||
        (subtitle?.trim().isNotEmpty ?? false);
    final end = trailingValue?.trim() ?? '';

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(grouped ? 0 : 14),
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(
            minHeight: SettingsRowLayout.minHeight,
          ),
          child: Ink(
            padding: const EdgeInsets.fromLTRB(
              SettingsRowLayout.inset,
              8,
              SettingsRowLayout.inset - 8,
              8,
            ),
            child: Row(
              crossAxisAlignment: hasSupportingLine
                  ? CrossAxisAlignment.start
                  : CrossAxisAlignment.center,
              children: [
                SizedBox(
                  width: SettingsRowLayout.iconWidth,
                  height: SettingsRowLayout.actionWidth,
                  child: Align(
                    alignment: Alignment.centerLeft,
                    child: Icon(icon, size: 22, color: iconColor),
                  ),
                ),
                const shad.Gap(SettingsRowLayout.textGap),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(top: hasSupportingLine ? 2 : 0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: theme.typography.base.copyWith(
                            fontWeight: FontWeight.w600,
                            color: textColor,
                          ),
                        ),
                        if (value?.trim().isNotEmpty ?? false) ...[
                          const shad.Gap(2),
                          Text(
                            value!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: theme.typography.small.copyWith(
                              color: textColor ?? muted,
                              fontWeight: FontWeight.w400,
                            ),
                          ),
                        ],
                        if (subtitle?.trim().isNotEmpty ?? false) ...[
                          const shad.Gap(2),
                          Text(
                            subtitle!,
                            maxLines: onTap != null && !wrapSupportingText
                                ? 1
                                : null,
                            overflow: onTap != null && !wrapSupportingText
                                ? TextOverflow.ellipsis
                                : null,
                            style: theme.typography.small.copyWith(
                              color: muted,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
                if (end.isNotEmpty)
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 132),
                    child: SizedBox(
                      height: SettingsRowLayout.actionWidth,
                      child: Align(
                        alignment: Alignment.centerRight,
                        child: Padding(
                          padding: const EdgeInsets.only(left: 8),
                          child: Text(
                            end,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.typography.base.copyWith(
                              color: muted,
                              fontWeight: FontWeight.w400,
                            ),
                          ),
                        ),
                      ),
                    ),
                  )
                else
                  const shad.Gap(8),
                SizedBox(
                  width: SettingsRowLayout.actionWidth,
                  child: IconButtonTheme(
                    data: IconButtonThemeData(
                      style: IconButton.styleFrom(
                        minimumSize: const Size(44, 44),
                        tapTargetSize: MaterialTapTargetSize.padded,
                        padding: EdgeInsets.zero,
                      ),
                    ),
                    child:
                        trailing ??
                        (showChevron
                            ? SizedBox(
                                height: 44,
                                child: Icon(
                                  Icons.chevron_right,
                                  size: 22,
                                  color: muted,
                                ),
                              )
                            : const SizedBox.shrink()),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
