import 'package:url_launcher/url_launcher.dart';

typedef MobileDeepLinkLaunchUrl =
    Future<bool> Function(
      Uri uri,
      LaunchMode mode,
    );

Future<bool> launchExternalMobileDeepLink(
  Uri uri, {
  MobileDeepLinkLaunchUrl? launch,
}) {
  final launchUrlFn =
      launch ?? (Uri uri, LaunchMode mode) => launchUrl(uri, mode: mode);

  return launchUrlFn(uri, LaunchMode.inAppBrowserView);
}
