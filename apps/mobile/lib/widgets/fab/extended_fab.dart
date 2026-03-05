import 'package:flutter/material.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Pill-shaped Extended FAB with icon and label (e.g. "Add Wallet").
///
/// Fixed bottom-right positioning. Use inside a [Stack] as a positioned child
/// above scrollable content.
class ExtendedFab extends StatelessWidget {
  const ExtendedFab({
    required this.icon,
    required this.label,
    required this.onPressed,
    this.enabled = true,
    this.loading = false,
    this.bottom = 16,
    this.right = 16,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final bool enabled;
  final bool loading;
  final double bottom;
  final double right;

  @override
  Widget build(BuildContext context) {
    return Positioned(
      right: right,
      bottom: bottom,
      child: IntrinsicWidth(
        child: shad.PrimaryButton(
          onPressed: enabled && !loading && onPressed != null
              ? onPressed
              : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
            child: loading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: shad.CircularProgressIndicator(strokeWidth: 2),
                  )
                : Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(icon, size: 20),
                      const shad.Gap(8),
                      Text(label),
                    ],
                  ),
          ),
        ),
      ),
    );
  }
}
