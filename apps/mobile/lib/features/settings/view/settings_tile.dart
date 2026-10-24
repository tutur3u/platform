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
    this.trailingWidth,
    this.badge,
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

  /// Wider trailing column for full-size controls such as switches. The
  /// control is centred vertically against the text.
  final double? trailingWidth;

  /// Short accent pill beside the title, such as "New".
  final String? badge;

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
    final titleStyle = theme.typography.base.copyWith(
      fontWeight: FontWeight.w500,
      color: textColor,
    );
    final badgeStyle = theme.typography.xSmall.copyWith(
      fontWeight: FontWeight.w600,
      color: theme.colorScheme.primaryForeground,
    );
    final endStyle = theme.typography.base.copyWith(
      color: muted,
      fontWeight: FontWeight.w400,
    );

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
            child: LayoutBuilder(
              builder: (context, constraints) {
                // The trailing value keeps its natural width while the title
                // (and badge) still fit on one line; otherwise it moves under
                // the title instead of squeezing it mid-word.
                double width(String text, TextStyle style) =>
                    SettingsRowLayout.textWidth(context, text, style);
                final titleWidth =
                    width(title, titleStyle) +
                    (badge == null ? 0 : 24 + width(badge!, badgeStyle));
                final endInline =
                    end.isNotEmpty &&
                    constraints.maxWidth -
                            SettingsRowLayout.iconWidth -
                            SettingsRowLayout.textGap -
                            (trailingWidth ?? SettingsRowLayout.actionWidth) -
                            8 -
                            width(end, endStyle) >=
                        titleWidth;
                final endBelow = end.isNotEmpty && !endInline;
                // With a value line under the title, the trailing value sits
                // on the title line only, so the value keeps the full width.
                final endInTitle = endInline && hasSupportingLine;
                final supporting = hasSupportingLine || endBelow;
                return Row(
                  crossAxisAlignment: supporting && trailingWidth == null
                      ? CrossAxisAlignment.start
                      : CrossAxisAlignment.center,
                  children: [
                    SizedBox(
                      width: SettingsRowLayout.iconWidth,
                      height: SettingsRowLayout.actionWidth,
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: Icon(icon, size: 21, color: iconColor),
                      ),
                    ),
                    const shad.Gap(SettingsRowLayout.textGap),
                    Expanded(
                      child: Padding(
                        padding: EdgeInsets.only(top: supporting ? 2 : 0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            _withTitleEnd(
                              endInTitle ? end : null,
                              endStyle,
                              Wrap(
                                spacing: 8,
                                crossAxisAlignment: WrapCrossAlignment.center,
                                children: [
                                  Text(title, style: titleStyle),
                                  if (badge case final label?)
                                    DecoratedBox(
                                      decoration: ShapeDecoration(
                                        color: theme.colorScheme.primary,
                                        shape: const StadiumBorder(),
                                      ),
                                      child: Padding(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: 8,
                                          vertical: 2,
                                        ),
                                        child: Text(label, style: badgeStyle),
                                      ),
                                    ),
                                ],
                              ),
                            ),
                            if (endBelow) ...[
                              const shad.Gap(2),
                              Text(
                                end,
                                style: theme.typography.small.copyWith(
                                  color: muted,
                                ),
                              ),
                            ],
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
                    if (endInline && !endInTitle)
                      SizedBox(
                        height: SettingsRowLayout.actionWidth,
                        child: Align(
                          widthFactor: 1,
                          alignment: Alignment.centerRight,
                          child: Padding(
                            padding: const EdgeInsets.only(left: 8),
                            child: Text(end, maxLines: 1, style: endStyle),
                          ),
                        ),
                      )
                    else
                      const shad.Gap(8),
                    SizedBox(
                      width: trailingWidth ?? SettingsRowLayout.actionWidth,
                      child: IconButtonTheme(
                        data: IconButtonThemeData(
                          style: IconButton.styleFrom(
                            minimumSize: const Size(44, 44),
                            tapTargetSize: MaterialTapTargetSize.padded,
                            padding: EdgeInsets.zero,
                          ),
                        ),
                        child: trailingWidth != null && trailing != null
                            ? Center(heightFactor: 1, child: trailing)
                            : trailing ??
                                  (showChevron
                                      ? SizedBox(
                                          height: 44,
                                          child: Icon(
                                            shad.LucideIcons.chevronRight,
                                            size: 17,
                                            color: muted,
                                          ),
                                        )
                                      : const SizedBox.shrink()),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ),
      ),
    );
  }
}

/// Places [end] flush right on the title line, or returns [title] alone.
Widget _withTitleEnd(String? end, TextStyle style, Widget title) => end == null
    ? title
    : Row(
        children: [
          Expanded(child: title),
          Padding(
            padding: const EdgeInsets.only(left: 8),
            child: Text(end, maxLines: 1, style: style),
          ),
        ],
      );
