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
          baseUrl: WebUri('about:blank'),
          data:
              '''
<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src $imageSources; form-action 'none'; base-uri 'none'">
<style>
html,body{margin:0;max-width:100%;font-family:system-ui;overflow-wrap:anywhere}
body{padding:12px;box-sizing:border-box}img{max-width:100%;height:auto}
@media(max-width:600px){table{width:100%!important;max-width:100%!important;table-layout:fixed}td,th{min-width:0!important;overflow-wrap:anywhere}}
</style>
</head><body>${widget.html}</body></html>''',
        ),
        shouldOverrideUrlLoading: (_, action) async {
          final uri = action.request.url;
          // WKWebView asks permission even for the initial in-memory document.
          // Keep all other navigation outside this isolated email renderer.
          if (uri?.toString() == 'about:blank' && action.isForMainFrame) {
            return NavigationActionPolicy.ALLOW;
          }
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
