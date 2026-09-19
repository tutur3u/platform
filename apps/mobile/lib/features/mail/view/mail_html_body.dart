import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:url_launcher/url_launcher.dart';

/// Native rendering isolated from the app's authenticated browser state.
class MailHtmlBody extends StatefulWidget {
  const MailHtmlBody({
    required this.html,
    this.inlineImages = const {},
    this.fallbackText = '',
    this.embedded = true,
    this.onViewOriginal,
    super.key,
  });

  final String html;
  final Map<String, String> inlineImages;
  final String fallbackText;
  final bool embedded;
  final VoidCallback? onViewOriginal;

  @override
  State<MailHtmlBody> createState() => _MailHtmlBodyState();
}

class _MailHtmlBodyState extends State<MailHtmlBody> {
  bool _images = false;
  bool _failed = false;
  double _height = 320;
  int _generation = 0;
  String? _document;
  InAppWebViewController? _controller;

  @override
  void initState() {
    super.initState();
    unawaited(_prepare());
  }

  @override
  void didUpdateWidget(covariant MailHtmlBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.html != widget.html) {
      _images = false;
      _height = 320;
    }
    if (oldWidget.html != widget.html ||
        oldWidget.inlineImages != widget.inlineImages) {
      unawaited(_prepare());
    }
  }

  Future<void> _prepare() async {
    final generation = ++_generation;
    _document = null;
    _controller = null;
    _failed = false;
    try {
      final document = await compute(
        renderMailDocument,
        MailDocumentRequest(
          html: widget.html,
          loadImages: _images,
          inlineImages: widget.inlineImages,
        ),
      );
      if (mounted && generation == _generation) {
        setState(() => _document = document);
      }
    } on Object {
      if (mounted && generation == _generation) setState(() => _failed = true);
    }
  }

  void _resize(double height, int generation) {
    if (!mounted ||
        !widget.embedded ||
        !height.isFinite ||
        height <= 0 ||
        generation != _generation) {
      return;
    }
    final next = height.clamp(80.0, 30000.0);
    if ((next - _height).abs() > 1) setState(() => _height = next);
  }

  Future<void> _measure(
    InAppWebViewController? controller,
    int generation,
  ) async {
    if (controller == null) return;
    try {
      final height = await controller.getContentHeight();
      if (height != null) _resize(height.toDouble(), generation);
    } on Object {
      // A dismissed native view may finish loading late. Native scrolling is
      // still available if a platform cannot report its content height.
    }
  }

  @override
  Widget build(BuildContext context) {
    final generation = _generation;
    final document = _document;
    final content = document == null
        ? SingleChildScrollView(
            child: Column(
              children: [
                if (!_failed) const LinearProgressIndicator(),
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: SelectableText(
                    widget.fallbackText.isNotEmpty
                        ? widget.fallbackText
                        : (_failed
                              ? context.l10n.commonSomethingWentWrong
                              : ''),
                  ),
                ),
              ],
            ),
          )
        : Listener(
            onPointerUp: (_) => unawaited(
              Future<void>.delayed(
                const Duration(milliseconds: 100),
                () => _measure(_controller, generation),
              ),
            ),
            child: InAppWebView(
              key: ValueKey(generation),
              initialSettings: InAppWebViewSettings(
                javaScriptEnabled: false,
                incognito: true,
                allowFileAccess: false,
                allowContentAccess: false,
                useShouldOverrideUrlLoading: true,
              ),
              initialData: InAppWebViewInitialData(
                baseUrl: WebUri('about:blank'),
                data: document,
              ),
              onWebViewCreated: (controller) => _controller = controller,
              onContentSizeChanged: (_, previous, next) =>
                  _resize(next.height, generation),
              onLoadStop: (controller, _) => _measure(controller, generation),
              shouldOverrideUrlLoading: (_, action) async {
                final uri = action.request.url;
                final value = uri?.toString() ?? '';
                if ((value == 'about:blank' ||
                        value.startsWith('about:blank#')) &&
                    action.isForMainFrame) {
                  return NavigationActionPolicy.ALLOW;
                }
                if (uri != null &&
                    ['https', 'http', 'mailto', 'tel'].contains(uri.scheme) &&
                    action.isForMainFrame) {
                  await launchUrl(
                    Uri.parse(value),
                    mode: LaunchMode.externalApplication,
                  );
                }
                return NavigationActionPolicy.CANCEL;
              },
            ),
          );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            if (widget.onViewOriginal != null)
              TextButton(
                onPressed: widget.onViewOriginal,
                child: Text(context.l10n.mailViewOriginal),
              ),
            const Spacer(),
            IconButton(
              tooltip: context.l10n.mailLoadImages,
              onPressed: () {
                setState(() => _images = !_images);
                unawaited(_prepare());
              },
              icon: Icon(
                _images ? Icons.image : Icons.image_not_supported_outlined,
              ),
            ),
          ],
        ),
        if (widget.embedded)
          SizedBox(height: _height, child: content)
        else
          Expanded(child: content),
      ],
    );
  }
}
