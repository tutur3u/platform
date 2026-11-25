import 'package:flutter/widgets.dart';

/// Keeps paired dialog actions on one row as their content changes.
class AppDialogActions extends StatelessWidget {
  const AppDialogActions({
    required this.actions,
    required this.spacing,
    super.key,
  });

  final List<Widget> actions;
  final double spacing;

  @override
  Widget build(BuildContext context) {
    if (actions.length == 2) {
      return Row(
        spacing: spacing,
        children: actions.map((action) => Expanded(child: action)).toList(),
      );
    }

    return Wrap(
      alignment: WrapAlignment.end,
      spacing: spacing,
      runSpacing: spacing,
      children: actions,
    );
  }
}
