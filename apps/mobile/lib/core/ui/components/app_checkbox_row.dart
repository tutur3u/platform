import 'package:flutter/material.dart';
import 'package:mobile/core/ui/components/app_checkbox.dart';

class AppCheckboxRow extends StatelessWidget {
  const AppCheckboxRow({
    required this.title,
    required this.value,
    required this.onChanged,
    this.subtitle,
    this.tristate = false,
    this.padding = EdgeInsets.zero,
    super.key,
  });
  final Widget title;
  final Widget? subtitle;
  final bool? value;
  final bool tristate;
  final ValueChanged<bool?>? onChanged;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) => Padding(
    padding: padding,
    child: MergeSemantics(
      child: Row(
        children: [
          AppCheckbox(value: value, tristate: tristate, onChanged: onChanged),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [title, if (subtitle != null) subtitle!],
            ),
          ),
        ],
      ),
    ),
  );
}
