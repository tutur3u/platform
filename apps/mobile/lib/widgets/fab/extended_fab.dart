import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
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
    this.includeBottomSafeArea = true,
    super.key,
  });

  final IconData icon;
  final String label;
  final VoidCallback? onPressed;
  final bool enabled;
  final bool loading;
  final double bottom;
  final double right;
  final bool includeBottomSafeArea;

  static const double _fabSize = 56;

  @override
  Widget build(BuildContext context) {
    ShellChromeActionsCubit? shell;
    try {
      shell = context.read<ShellChromeActionsCubit>();
    } on ProviderNotFoundException {
      // Standalone pages retain their own action.
    }
    if (shell != null && GoRouter.maybeOf(context) != null) {
      return ShellChromeActions(
        ownerId: 'page-primary-action',
        locations: {GoRouterState.of(context).matchedLocation},
        actions: [
          ShellActionSpec(
            id: 'page-primary-action',
            inDock: true,
            icon: icon,
            tooltip: label,
            enabled: enabled,
            isLoading: loading,
            callbackToken: (label, enabled, loading),
            onPressed: onPressed,
          ),
        ],
      );
    }
    final safeAreaPadding = MediaQuery.paddingOf(context);
    final bottomInset = includeBottomSafeArea ? safeAreaPadding.bottom : 0.0;

    return Positioned(
      right: right + safeAreaPadding.right,
      bottom: bottom + bottomInset,
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
                      child: NovaLoadingIndicator(size: 20),
                    )
                  : Icon(icon, size: 24),
            ),
          ),
        ),
      ),
    );
  }
}
