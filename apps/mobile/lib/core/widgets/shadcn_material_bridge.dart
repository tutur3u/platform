import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Restores the Material infrastructure intentionally removed from
/// `ShadcnApp` in shadcn_flutter 0.0.54.
class ShadcnMaterialBridge extends StatelessWidget {
  const ShadcnMaterialBridge({required this.child, super.key});

  final Widget child;

  static Widget appBuilder(BuildContext context, Widget? child) {
    return ShadcnMaterialBridge(child: child ?? const SizedBox.shrink());
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Theme(
      data: theme.brightness == Brightness.light
          ? AppTheme.light
          : AppTheme.dark,
      child: Material(
        color: Colors.transparent,
        child: ScaffoldMessenger(
          child: AnnotatedRegion<SystemUiOverlayStyle>(
            value: AppTheme.systemUiOverlayStyleFor(theme.brightness),
            child: child,
          ),
        ),
      ),
    );
  }
}
