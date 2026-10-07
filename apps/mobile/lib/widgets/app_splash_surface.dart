import 'package:flutter/material.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Matches flutter_native_splash.yaml without exposing protected content.
class AppSplashSurface extends StatelessWidget {
  const AppSplashSurface({this.child, super.key});

  final Widget? child;

  static const lightBackground = Color(0xFFFFFFFF);
  static const darkBackground = Color(0xFF363636);

  @override
  Widget build(BuildContext context) {
    final dark = shad.Theme.of(context).brightness == Brightness.dark;
    return ColoredBox(
      color: dark ? darkBackground : lightBackground,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Center(
            child: Image.asset(
              dark ? 'assets/logos/dark.png' : 'assets/logos/light.png',
              key: const ValueKey('app-splash-logo'),
              width: 104,
              height: 104,
              excludeFromSemantics: true,
            ),
          ),
          if (child != null) child!,
        ],
      ),
    );
  }
}
