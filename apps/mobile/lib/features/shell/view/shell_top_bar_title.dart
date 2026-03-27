import 'package:flutter/material.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_chrome_config.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ShellTopBarTitle extends StatelessWidget {
  const ShellTopBarTitle({required this.matchedLocation, super.key});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final config = ShellChromeConfig.forLocation(context, matchedLocation);

    return SizedBox(
      height: mobileSectionAppBarHeight,
      child: Row(
        children: [
          Image.asset(
            'assets/logos/transparent.png',
            width: mobileSectionAppBarLogoSize,
            height: mobileSectionAppBarLogoSize,
            fit: BoxFit.contain,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Align(
              alignment: Alignment.centerLeft,
              child: _AnimatedTitleText(title: config.title),
            ),
          ),
        ],
      ),
    );
  }
}

class _AnimatedTitleText extends StatelessWidget {
  const _AnimatedTitleText({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 220),
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      layoutBuilder: (currentChild, previousChildren) => Stack(
        alignment: Alignment.centerLeft,
        children: [
          ...previousChildren,
          if (currentChild != null) currentChild,
        ],
      ),
      transitionBuilder: (child, animation) {
        final offsetAnimation = Tween<Offset>(
          begin: const Offset(0, 0.12),
          end: Offset.zero,
        ).animate(animation);
        return FadeTransition(
          opacity: animation,
          child: SlideTransition(position: offsetAnimation, child: child),
        );
      },
      child: Text(
        title,
        key: ValueKey<String>(title),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: theme.typography.large.copyWith(
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
