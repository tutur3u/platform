import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';

/// Day timeline surface; the scrollable child owns dock clearance and zoom.
class CalendarDayPanel extends StatelessWidget {
  const CalendarDayPanel({required this.child, super.key});
  final Widget child;
  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final radius = BorderRadius.circular(tokens.shapes.panel);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: tokens.colorScheme.card,
          borderRadius: radius,
          border: tokens.depth.outlined
              ? Border.all(color: tokens.colorScheme.input)
              : null,
          boxShadow: tokens.depth.card,
        ),
        child: ClipRRect(borderRadius: radius, child: child),
      ),
    );
  }
}
