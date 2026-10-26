import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:url_launcher/url_launcher.dart';

Uri? assistantDocumentUri(String? url) {
  final uri = url == null ? null : Uri.tryParse(url);
  if (uri == null ||
      !{'http', 'https'}.contains(uri.scheme.toLowerCase()) ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty) {
    return null;
  }
  return uri;
}

Future<void> openAssistantDocument(BuildContext context, Uri uri) async {
  var opened = false;
  try {
    opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
  } on Object {
    // Signed attachment URLs must not be included in diagnostics.
  }
  if (!opened && context.mounted) {
    showAppToast(context, message: context.l10n.settingsLinkOpenError);
  }
}
