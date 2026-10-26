import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_switch.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

class AppToggleRow extends StatelessWidget {
  const AppToggleRow({
    required this.title,
    required this.value,
    required this.onChanged,
    this.subtitle,
    this.leading,
    this.padding = EdgeInsets.zero,
    super.key,
  });
  final Widget title;
  final Widget? subtitle;
  final Widget? leading;
  final bool value;
  final ValueChanged<bool>? onChanged;
  final EdgeInsetsGeometry padding;
  @override
  Widget build(BuildContext context) => Padding(
    padding: padding,
    child: GestureDetector(
      behavior: HitTestBehavior.opaque,
      excludeFromSemantics: true,
      onTap: onChanged == null ? null : () => onChanged!(!value),
      child: MergeSemantics(
        child: Row(
          children: [
            if (leading != null) ...[leading!, const SizedBox(width: 12)],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  DefaultTextStyle.merge(
                    style: AppTokens.of(context).typography.base,
                    child: title,
                  ),
                  if (subtitle != null)
                    DefaultTextStyle.merge(
                      style: AppTokens.of(context).typography.small.copyWith(
                        color: AppTokens.of(
                          context,
                        ).colorScheme.mutedForeground,
                      ),
                      child: subtitle!,
                    ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            AppSwitch(value: value, onChanged: onChanged),
          ],
        ),
      ),
    ),
  );
}
