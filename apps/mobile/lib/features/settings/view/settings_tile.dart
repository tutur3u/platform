import 'package:flutter/material.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SettingsTile extends StatelessWidget {
  const SettingsTile({
    required this.icon,
    required this.title,
    this.subtitle,
    this.value,
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
  final String? value;
  final VoidCallback? onTap;
  final bool isDestructive;
  final bool showChevron;
  final Widget? trailing;
  final bool grouped;
  final bool wrapSupportingText;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final accentColor = isDestructive
        ? theme.colorScheme.destructive
        : theme.colorScheme.primary;
    final textColor = isDestructive ? theme.colorScheme.destructive : null;
    final hasSupportingLine =
        (value?.trim().isNotEmpty ?? false) ||
        (subtitle?.trim().isNotEmpty ?? false);

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
            padding: const EdgeInsets.symmetric(
              horizontal: SettingsRowLayout.inset,
              vertical: 6,
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
                    child: Icon(icon, size: 18, color: accentColor),
                  ),
                ),
                const shad.Gap(SettingsRowLayout.textGap),
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: theme.typography.small.copyWith(
                            fontWeight: FontWeight.w700,
                            color: textColor,
                          ),
                        ),
                        if (value?.trim().isNotEmpty ?? false) ...[
                          const shad.Gap(4),
                          Text(
                            value!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: theme.typography.textSmall.copyWith(
                              color:
                                  textColor ??
                                  theme.colorScheme.mutedForeground,
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
                            style: theme.typography.textSmall.copyWith(
                              color: theme.colorScheme.mutedForeground,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
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
                                  size: 20,
                                  color: theme.colorScheme.mutedForeground,
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
