import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Shared lock canvas aligned to generated native launch artwork bounds.
class AppSplashSurface extends StatelessWidget {
  const AppSplashSurface({this.child, super.key});

  final Widget? child;

  static const lightBackground = Color(0xFFFFFFFF);
  static const darkBackground = Color(0xFF09090B);

  @override
  Widget build(BuildContext context) {
    final dark = shad.Theme.of(context).brightness == Brightness.dark;
    final compactRecovery =
        child != null && MediaQuery.textScalerOf(context).scale(14) > 21;
    return ColoredBox(
      color: dark ? darkBackground : lightBackground,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Align(
            alignment: compactRecovery ? Alignment.topCenter : Alignment.center,
            child: Padding(
              padding: EdgeInsets.only(
                top: compactRecovery
                    ? MediaQuery.viewPaddingOf(context).top + 24
                    : 0,
              ),
              child: SizedBox(
                key: const ValueKey('app-splash-logo'),
                width: 104,
                height: 104,
                child: Center(
                  // Native generated artwork: iOS 104pt, Android 80dp.
                  child: Image.asset(
                    'assets/logos/transparent.png',
                    width: defaultTargetPlatform == TargetPlatform.android
                        ? 80
                        : 104,
                    height: defaultTargetPlatform == TargetPlatform.android
                        ? 80
                        : 104,
                    excludeFromSemantics: true,
                  ),
                ),
              ),
            ),
          ),
          if (child != null) child!,
        ],
      ),
    );
  }
}
