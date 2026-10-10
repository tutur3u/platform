import 'dart:async';

import 'package:flutter/material.dart' hide ButtonStyle;
import 'package:flutter/services.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_splash_surface.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AppLockGate extends StatefulWidget {
  const AppLockGate({
    required this.authenticating,
    required this.onUnlock,
    super.key,
  });

  final bool authenticating;
  final VoidCallback onUnlock;

  @override
  State<AppLockGate> createState() => _AppLockGateState();
}

class _AppLockGateState extends State<AppLockGate> {
  late final Timer _recoveryTimer;
  bool _showRecovery = false;

  @override
  void initState() {
    super.initState();
    // One deadline per mounted lock entry, never restarted by an auth result.
    _recoveryTimer = Timer(const Duration(seconds: 5), () {
      if (mounted) setState(() => _showRecovery = true);
    });
  }

  @override
  void dispose() {
    _recoveryTimer.cancel();
    super.dispose();
  }

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
          child: !_showRecovery
              ? null
              : SafeArea(
                  child: Align(
                    alignment: Alignment.bottomCenter,
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(24),
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 360),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              l10n.appLockLockedDescription,
                              textAlign: TextAlign.center,
                            ),
                            const SizedBox(height: 12),
                            SizedBox(
                              key: const ValueKey('app-lock-unlock-button'),
                              width: double.infinity,
                              height: 48,
                              child: shad.PrimaryButton(
                                enabled: !widget.authenticating,
                                onPressed: widget.onUnlock,
                                alignment: Alignment.center,
                                child: Text(
                                  widget.authenticating
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
