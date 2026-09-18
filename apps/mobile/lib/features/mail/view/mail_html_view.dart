import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:url_launcher/url_launcher.dart';

/// Email content never shares the app's authenticated browser session.
class MailHtmlView extends StatefulWidget {
  const MailHtmlView({required this.html, super.key});
  final String html;
  @override
  State<MailHtmlView> createState() => _MailHtmlViewState();
}

class _MailHtmlViewState extends State<MailHtmlView> {
  bool _images = false;
  @override
  Widget build(BuildContext context) {
    final imageSources = _images ? 'https: data:' : 'data:';
    return Scaffold(
      appBar: AppBar(
        title: Text(context.l10n.mailViewOriginal),
        actions: [
          IconButton(
            tooltip: context.l10n.mailLoadImages,
            onPressed: () => setState(() => _images = !_images),
            icon: Icon(
              _images ? Icons.image : Icons.image_not_supported_outlined,
            ),
          ),
        ],
      ),
      body: InAppWebView(
        key: ValueKey(_images),
        initialSettings: InAppWebViewSettings(
          javaScriptEnabled: false,
          incognito: true,
          allowFileAccess: false,
          allowContentAccess: false,
          useShouldOverrideUrlLoading: true,
        ),
        initialData: InAppWebViewInitialData(
          data:
              '''
<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src $imageSources; form-action 'none'; base-uri 'none'">
<style>body{font-family:system-ui;padding:12px;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>
</head><body>${widget.html}</body></html>''',
        ),
        shouldOverrideUrlLoading: (_, action) async {
          final uri = action.request.url;
          if (uri != null &&
              ['https', 'http', 'mailto'].contains(uri.scheme) &&
              action.isForMainFrame) {
            await launchUrl(
              Uri.parse(uri.toString()),
              mode: LaunchMode.externalApplication,
            );
          }
          return NavigationActionPolicy.CANCEL;
        },
      ),
    );
  }
}
