import 'package:flutter/material.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/apps/registry/app_registry.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class ShellTopBarTitle extends StatelessWidget {
  const ShellTopBarTitle({required this.matchedLocation, super.key});

  final String matchedLocation;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    final module = AppRegistry.moduleFromLocation(matchedLocation);
    if (module != null) {
      return _buildTitleRow(theme, module.label(context.l10n));
    }

    final title = switch (matchedLocation) {
      Routes.home => context.l10n.navHome,
      Routes.assistant => 'Assistant',
      Routes.profileRoot => context.l10n.profileTitle,
      Routes.settings => context.l10n.settingsTitle,
      Routes.apps => context.l10n.navApps,
      _ => null,
    };

    return _buildTitleRow(theme, title ?? context.l10n.navApps);
  }

  Widget _buildTitleRow(shad.ThemeData theme, String title) {
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
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.typography.large.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
