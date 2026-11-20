import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile/core/theme/app_theme.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/core/theme/appearance/appearance_theme.dart';
import 'package:mobile/core/theme/appearance/interface_theme.dart';
import 'package:mobile/core/theme/sorbet/sorbet_scope.dart';
import 'package:mobile/core/theme/sorbet/sorbet_theme.dart';
import 'package:mobile/core/ui/components/account_overlay_scope.dart';
import 'package:mobile/core/ui/tokens/app_interface_tokens.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Restores the Material infrastructure intentionally removed from
/// `ShadcnApp` in shadcn_flutter 0.0.54.
class ShadcnMaterialBridge extends StatelessWidget {
  const ShadcnMaterialBridge({
    required this.child,
    this.navigatorBoundary,
    super.key,
  });

  final Widget child;
  final Widget Function(Widget)? navigatorBoundary;

  static Widget appBuilder(BuildContext context, Widget? child) {
    return ShadcnMaterialBridge(child: child ?? const SizedBox.shrink());
  }

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final appearance = AppearanceScope.maybeOf(context)?.settings;
    final sorbet = SorbetScope.maybeOf(context);

    final base = sorbet != null
        ? SorbetAppTheme.materialTheme(sorbet, theme.brightness)
        : appearance != null
        ? AppearanceTheme.materialTheme(appearance, theme.brightness)
        : theme.brightness == Brightness.light
        ? AppTheme.light
        : AppTheme.dark;
    final interface = appearance?.interfaceTokens;
    return Theme(
      data: interface == null && sorbet == null
          ? base
          : AppInterfaceTheme.apply(
              base,
              sorbet == null
                  ? interface!
                  : SorbetAppTheme.interfaceTokens(
                      sorbet,
                      interface ?? AppInterfaceTokens.standard,
                    ),
            ),
      child: AppInterfaceScope(
        settings: appearance ?? const AppearanceSettings(),
        child: Material(
          color: Colors.transparent,
          child: ScaffoldMessenger(
            child: AnnotatedRegion<SystemUiOverlayStyle>(
              value: AppTheme.systemUiOverlayStyleFor(theme.brightness),
              child:
                  navigatorBoundary?.call(_AccountToastLayer(child: child)) ??
                  child,
            ),
          ),
        ),
      ),
    );
  }
}

class _AccountToastLayer extends StatefulWidget {
  const _AccountToastLayer({required this.child});

  final Widget child;

  @override
  State<_AccountToastLayer> createState() => _AccountToastLayerState();
}

class _AccountToastLayerState extends State<_AccountToastLayer> {
  final GlobalKey _navigatorKey = GlobalKey();

  @override
  Widget build(BuildContext context) {
    final scope = AccountOverlayScope.maybeOf(context);
    final toastTheme =
        shad.ComponentTheme.maybeOf<shad.ToastTheme>(context) ??
        const shad.ToastTheme();
    return shad.ComponentTheme(
      data: scope?.allowed == false
          ? const shad.ToastTheme(maxStackedEntries: 0)
          : toastTheme,
      child: shad.ToastLayer(
        key: ValueKey(scope?.epoch),
        child: KeyedSubtree(key: _navigatorKey, child: widget.child),
      ),
    );
  }
}
