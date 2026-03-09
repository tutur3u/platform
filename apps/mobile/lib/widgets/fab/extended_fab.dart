import 'package:flutter/material.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Circular FAB with icon (e.g. "Add Wallet").
///
/// Fixed bottom-right positioning. Use inside a [Stack] as a positioned child
/// above scrollable content.
/// The [label] is used for accessibility semantics only.
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

  static const double _fabSize = 56;

  @override
  Widget build(BuildContext context) {
    final safeAreaPadding = MediaQuery.paddingOf(context);

    return Positioned(
      right: right + safeAreaPadding.right,
      bottom: bottom + safeAreaPadding.bottom,
      child: Semantics(
        label: label,
        button: true,
        child: SizedBox(
          width: _fabSize,
          height: _fabSize,
          child: shad.PrimaryButton(
            onPressed: enabled && !loading && onPressed != null
                ? onPressed
                : null,
            shape: shad.ButtonShape.circle,
            density: shad.ButtonDensity.icon,
            child: Center(
              child: loading
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: shad.CircularProgressIndicator(strokeWidth: 2.5),
                    )
                  : Icon(icon, size: 24),
            ),
          ),
        ),
      ),
    );
  }
}
