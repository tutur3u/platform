import 'package:flutter/material.dart';
import 'package:mobile/core/platform/apple_store_policy.dart';
import 'package:mobile/core/router/link_browser_preference.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/settings/view/settings_tile.dart';
import 'package:mobile/l10n/l10n.dart';

/// Public account-deletion page. Store review requires deletion to be
/// reachable from inside the app; the web page owns confirmation and the
/// deletion request itself.
final Uri accountDeletionUri = Uri.parse('https://tuturuuu.com/account/delete');

/// Apple store builds keep the website's commercial navigation outside the app.
Future<bool> openAccountDeletionPage(
  BuildContext context, {
  MobileLinkLaunch? launch,
}) => openMobileLink(
  context,
  accountDeletionUri,
  launch: launch,
  readPreference: () async => isAppleStorePlatform()
      ? LinkBrowserPreference.external
      : LinkBrowserPreference.builtIn,
);

/// Destructive Settings row that opens [accountDeletionUri].
class SettingsDeleteAccountRow extends StatelessWidget {
  const SettingsDeleteAccountRow({this.launch, super.key});

  /// Test seam for the platform launcher.
  final MobileLinkLaunch? launch;

  @override
  Widget build(BuildContext context) {
    return SettingsTile(
      grouped: true,
      isDestructive: true,
      icon: LucideIcons.userMinus,
      title: context.l10n.settingsDeleteAccount,
      onTap: () => openAccountDeletionPage(context, launch: launch),
    );
  }
}
