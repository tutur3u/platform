import 'package:flutter/material.dart' hide ButtonStyle;
import 'package:flutter/services.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_splash_surface.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// The opted-in App Lock screen. The Unlock action and its guidance show
/// from the first frame; a cancelled or failed attempt says so.
class AppLockGate extends StatelessWidget {
  const AppLockGate({
    required this.authenticating,
    required this.onUnlock,
    this.failed = false,
    super.key,
  });

  final bool authenticating;
  final VoidCallback onUnlock;

  /// The last unlock attempt was cancelled or failed.
  final bool failed;

  @override
  Widget build(BuildContext context) {
    final dark = shad.Theme.of(context).brightness == Brightness.dark;
    final l10n = context.l10n;
    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        systemNavigationBarColor: dark
            ? AppSplashSurface.darkBackground
            : AppSplashSurface.lightBackground,
        statusBarIconBrightness: dark ? Brightness.light : Brightness.dark,
        systemNavigationBarIconBrightness: dark
            ? Brightness.light
            : Brightness.dark,
      ),
      child: Semantics(
        label: l10n.appLockLockedTitle,
        scopesRoute: true,
        explicitChildNodes: true,
        child: AppSplashSurface(
          child: SafeArea(
            child: Align(
              alignment: Alignment.bottomCenter,
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(AppSpacing.xxl),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 360),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        failed
                            ? l10n.appLockUnavailableDescription
                            : l10n.appLockLockedDescription,
                        key: const ValueKey('app-lock-message'),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: AppSpacing.md),
                      SizedBox(
                        key: const ValueKey('app-lock-unlock-button'),
                        width: double.infinity,
                        height: 48,
                        child: AppButton.primary(
                          enabled: !authenticating,
                          onPressed: onUnlock,
                          alignment: Alignment.center,
                          child: Text(
                            authenticating
                                ? l10n.appLockUnlockingAction
                                : l10n.appLockUnlockAction,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
