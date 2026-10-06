import 'package:flutter/material.dart';
import 'package:mobile/core/router/link_browser_preference.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:url_launcher/url_launcher.dart';

typedef MobileLinkLaunch = Future<bool> Function(Uri uri, LaunchMode mode);

/// Ordinary web links honor the device preference. Authentication callbacks,
/// signed downloads and app-store update flows use their dedicated launchers.
Future<bool> launchMobileLink(
  Uri uri, {
  MobileLinkLaunch? launch,
  Future<LinkBrowserPreference> Function()? readPreference,
}) async {
  final scheme = uri.scheme.toLowerCase();
  final web = scheme == 'https' || scheme == 'http';
  if (!web && !{'mailto', 'tel', 'sms'}.contains(scheme)) return false;
  if (web && (uri.host.isEmpty || uri.userInfo.isNotEmpty)) return false;
  try {
    final preference = web
        ? await (readPreference ?? readLinkBrowserPreference)()
        : LinkBrowserPreference.external;
    final mode = preference == LinkBrowserPreference.builtIn
        ? LaunchMode.inAppBrowserView
        : LaunchMode.externalApplication;
    return await (launch ?? (uri, mode) => launchUrl(uri, mode: mode))(
      uri,
      mode,
    );
  } on Object {
    // Native errors may include private URLs or platform details.
    return false;
  }
}

/// Visible link actions report failure without exposing a URL or changing mode.
Future<bool> openMobileLink(
  BuildContext context,
  Uri uri, {
  MobileLinkLaunch? launch,
  Future<LinkBrowserPreference> Function()? readPreference,
}) async {
  final opened = await launchMobileLink(
    uri,
    launch: launch,
    readPreference: readPreference,
  );
  if (!opened && context.mounted) {
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(content: Text(context.l10n.settingsLinkOpenError)),
    );
  }
  return opened;
}
