import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

enum DownloadNetworkConsent { wifiOnly, allowCellular }

typedef DownloadConnectivity = Future<List<ConnectivityResult>> Function();

/// Wi-Fi-only is the default. Cellular or unknown interfaces require a choice;
/// no download callback executes while this dialog is unanswered or dismissed.
Future<DownloadNetworkConsent?> requestDownloadNetworkConsent(
  BuildContext context, {
  DownloadConnectivity? connectivity,
}) async {
  List<ConnectivityResult> interfaces;
  try {
    interfaces = await (connectivity ?? Connectivity().checkConnectivity)();
  } on Object {
    interfaces = const [];
  }
  if (!context.mounted) return null;
  if (interfaces.contains(ConnectivityResult.wifi)) {
    return DownloadNetworkConsent.wifiOnly;
  }
  final l10n = context.l10n;
  return await showDialog<DownloadNetworkConsent>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(l10n.downloadNetworkWarningTitle),
      content: Text(l10n.downloadNetworkWarningBody),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text(l10n.commonCancel),
        ),
        TextButton(
          onPressed: () =>
              Navigator.pop(context, DownloadNetworkConsent.wifiOnly),
          child: Text(l10n.downloadNetworkUseWifi),
        ),
        FilledButton(
          onPressed: () =>
              Navigator.pop(context, DownloadNetworkConsent.allowCellular),
          child: Text(l10n.downloadNetworkContinue),
        ),
      ],
    ),
  );
}
