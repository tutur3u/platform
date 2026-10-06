import 'package:mobile/core/router/link_browser_preference.dart';
import 'package:mobile/core/router/mobile_link_launcher.dart';
import 'package:url_launcher/url_launcher.dart';

typedef MobileDeepLinkLaunchUrl =
    Future<bool> Function(Uri uri, LaunchMode mode);

Future<bool> launchExternalMobileDeepLink(
  Uri uri, {
  MobileDeepLinkLaunchUrl? launch,
  Future<LinkBrowserPreference> Function()? readPreference,
}) => launchMobileLink(uri, launch: launch, readPreference: readPreference);
