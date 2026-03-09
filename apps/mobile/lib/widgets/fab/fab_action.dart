import 'package:flutter/material.dart';

/// Describes a single action in a Speed Dial FAB.
class FabAction {
  const FabAction({
    required this.icon,
    required this.label,
    required this.onPressed,
  });

  final IconData icon;
  final String label;
  final VoidCallback onPressed;
}
