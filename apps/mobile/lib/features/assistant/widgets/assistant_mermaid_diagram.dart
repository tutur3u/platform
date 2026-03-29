import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

class AssistantMermaidDiagramCard extends StatefulWidget {
  const AssistantMermaidDiagramCard({
    required this.definition,
    this.subdued = false,
    super.key,
  });

  final String definition;
  final bool subdued;

  @override
  State<AssistantMermaidDiagramCard> createState() =>
      _AssistantMermaidDiagramCardState();
}

class _AssistantMermaidDiagramCardState
    extends State<AssistantMermaidDiagramCard> {
  static const _fallbackPreviewHeight = 220.0;
  static const _minPreviewHeight = 160.0;
  static const _maxPreviewHeight = 420.0;

  double? _previewHeight;
  String? _renderError;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final resolvedHeight = (_previewHeight ?? _fallbackPreviewHeight).clamp(
      _minPreviewHeight,
      _maxPreviewHeight,
    );
    final mutedColor = widget.subdued
        ? theme.colorScheme.onSurfaceVariant
        : theme.colorScheme.onSurface;

    return Container(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withValues(alpha: 0.58),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.85),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 10, 8),
            child: Row(
              children: [
                Icon(
                  Icons.account_tree_outlined,
                  size: 18,
                  color: mutedColor,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    context.l10n.assistantMermaidDiagramLabel,
                    style: theme.textTheme.labelLarge?.copyWith(
                      color: mutedColor,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Tooltip(
                  message: context.l10n.assistantEnterFullscreenAction,
                  child: IconButton(
                    onPressed: _openFullscreen,
                    icon: const Icon(Icons.open_in_full_rounded),
                    visualDensity: VisualDensity.compact,
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: SizedBox(
                height: resolvedHeight,
                child: ColoredBox(
                  color: theme.colorScheme.surface,
                  child: _renderError == null
                      ? Stack(
                          children: [
                            Positioned.fill(
                              child: IgnorePointer(
                                child: AssistantMermaidWebView(
                                  definition: widget.definition,
                                  interactive: false,
                                  onRenderedHeight: _handleRenderedHeight,
                                  onRenderError: _handleRenderError,
                                ),
                              ),
                            ),
                            Positioned.fill(
                              child: Material(
                                color: Colors.transparent,
                                child: InkWell(onTap: _openFullscreen),
                              ),
                            ),
                          ],
                        )
                      : _AssistantMermaidErrorState(error: _renderError!),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  void _handleRenderedHeight(double height) {
    if (!mounted) {
      return;
    }

    setState(() {
      _renderError = null;
      _previewHeight = height;
    });
  }

  void _handleRenderError(String error) {
    if (!mounted) {
      return;
    }

    setState(() {
      _renderError = error;
    });
  }

  Future<void> _openFullscreen() async {
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => AssistantMermaidViewerPage(
          definition: widget.definition,
        ),
        fullscreenDialog: true,
      ),
    );
  }
}

class AssistantMermaidViewerPage extends StatefulWidget {
  const AssistantMermaidViewerPage({
    required this.definition,
    super.key,
  });

  final String definition;

  @override
  State<AssistantMermaidViewerPage> createState() =>
      _AssistantMermaidViewerPageState();
}

class _AssistantMermaidViewerPageState
    extends State<AssistantMermaidViewerPage> {
  InAppWebViewController? _controller;
  String? _renderError;
  var _isDiagramReady = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      backgroundColor: theme.colorScheme.surface,
      appBar: AppBar(
        title: Text(context.l10n.assistantMermaidDiagramLabel),
        actions: [
          Tooltip(
            message: context.l10n.assistantMermaidZoomOut,
            child: IconButton(
              onPressed: _isDiagramReady ? _zoomOut : null,
              icon: const Icon(Icons.zoom_out_rounded),
            ),
          ),
          Tooltip(
            message: context.l10n.assistantMermaidZoomReset,
            child: IconButton(
              onPressed: _isDiagramReady ? _resetZoom : null,
              icon: const Icon(Icons.fit_screen_rounded),
            ),
          ),
          Tooltip(
            message: context.l10n.assistantMermaidZoomIn,
            child: IconButton(
              onPressed: _isDiagramReady ? _zoomIn : null,
              icon: const Icon(Icons.zoom_in_rounded),
            ),
          ),
        ],
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Text(
                context.l10n.assistantMermaidZoomHint,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
            Expanded(
              child: ColoredBox(
                color: theme.colorScheme.surfaceContainerLowest,
                child: _renderError == null
                    ? AssistantMermaidWebView(
                        definition: widget.definition,
                        interactive: true,
                        onControllerReady: _handleControllerReady,
                        onDiagramReady: _handleDiagramReady,
                        onRenderError: (error) {
                          if (!mounted) {
                            return;
                          }
                          setState(() {
                            _renderError = error;
                            _isDiagramReady = false;
                          });
                        },
                      )
                    : _AssistantMermaidErrorState(error: _renderError!),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleControllerReady(InAppWebViewController controller) async {
    _controller = controller;
  }

  Future<void> _handleDiagramReady() async {
    if (!mounted) {
      return;
    }
    setState(() {
      _renderError = null;
      _isDiagramReady = true;
    });
    await _resetZoom();
  }

  Future<void> _zoomIn() async {
    await _runZoomCommand('assistantMermaidZoomIn');
  }

  Future<void> _zoomOut() async {
    await _runZoomCommand('assistantMermaidZoomOut');
  }

  Future<void> _resetZoom() async {
    await _runZoomCommand('assistantMermaidResetZoom');
  }

  Future<void> _runZoomCommand(String helperName) async {
    final controller = _controller;
    if (controller == null) {
      return;
    }

    try {
      await controller.evaluateJavascript(
        source:
            '''
(() => {
  const fn = window['$helperName'];
  if (typeof fn !== 'function') {
    return null;
  }
  fn();
  return window.assistantMermaidScale || 1;
})()
''',
      );
    } on Object {
      // Ignore platform-specific JS bridge failures.
    }
  }
}

class AssistantMermaidWebView extends StatefulWidget {
  const AssistantMermaidWebView({
    required this.definition,
    required this.interactive,
    this.onRenderedHeight,
    this.onRenderError,
    this.onControllerReady,
    this.onDiagramReady,
    super.key,
  });

  final String definition;
  final bool interactive;
  final ValueChanged<double>? onRenderedHeight;
  final ValueChanged<String>? onRenderError;
  final ValueChanged<InAppWebViewController>? onControllerReady;
  final FutureOr<void> Function()? onDiagramReady;

  @override
  State<AssistantMermaidWebView> createState() =>
      _AssistantMermaidWebViewState();
}

class _AssistantMermaidWebViewState extends State<AssistantMermaidWebView> {
  static Future<String>? _mermaidScriptFuture;

  late final Future<String> _scriptFuture = _mermaidScriptFuture ??= rootBundle
      .loadString('assets/mermaid/mermaid.min.js');

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<String>(
      future: _scriptFuture,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const Center(child: NovaLoadingIndicator());
        }

        if (snapshot.hasError || !snapshot.hasData) {
          return _AssistantMermaidErrorState(
            error: context.l10n.assistantMermaidRenderError,
          );
        }

        return _AssistantMermaidInAppWebView(
          definition: widget.definition,
          mermaidScript: snapshot.data!,
          interactive: widget.interactive,
          onRenderedHeight: widget.onRenderedHeight,
          onRenderError: widget.onRenderError,
          onControllerReady: widget.onControllerReady,
          onDiagramReady: widget.onDiagramReady,
        );
      },
    );
  }
}

class _AssistantMermaidInAppWebView extends StatelessWidget {
  const _AssistantMermaidInAppWebView({
    required this.definition,
    required this.mermaidScript,
    required this.interactive,
    this.onRenderedHeight,
    this.onRenderError,
    this.onControllerReady,
    this.onDiagramReady,
  });

  final String definition;
  final String mermaidScript;
  final bool interactive;
  final ValueChanged<double>? onRenderedHeight;
  final ValueChanged<String>? onRenderError;
  final ValueChanged<InAppWebViewController>? onControllerReady;
  final FutureOr<void> Function()? onDiagramReady;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final html = _buildHtml(
      definition: definition,
      mermaidScript: mermaidScript,
      brightness: theme.brightness,
      backgroundColor: interactive
          ? theme.colorScheme.surfaceContainerLowest
          : theme.colorScheme.surface,
      foregroundColor: theme.colorScheme.onSurface,
      interactive: interactive,
    );

    return InAppWebView(
      initialData: InAppWebViewInitialData(data: html),
      initialSettings: InAppWebViewSettings(
        transparentBackground: true,
        supportZoom: interactive,
        builtInZoomControls: interactive,
        verticalScrollBarEnabled: interactive,
        horizontalScrollBarEnabled: interactive,
        disableVerticalScroll: !interactive,
        disableHorizontalScroll: !interactive,
        overScrollMode: OverScrollMode.NEVER,
      ),
      onWebViewCreated: (controller) {
        controller
          ..addJavaScriptHandler(
            handlerName: 'assistantMermaidRendered',
            callback: (List<dynamic> arguments) {
              final rawHeight = arguments.isEmpty
                  ? null
                  : arguments.first as num?;
              if (rawHeight != null) {
                onRenderedHeight?.call(rawHeight.toDouble());
              }
            },
          )
          ..addJavaScriptHandler(
            handlerName: 'assistantMermaidReady',
            callback: (List<dynamic> arguments) async {
              await onDiagramReady?.call();
            },
          )
          ..addJavaScriptHandler(
            handlerName: 'assistantMermaidError',
            callback: (List<dynamic> arguments) {
              final message = arguments.isEmpty
                  ? context.l10n.assistantMermaidRenderError
                  : arguments.first.toString();
              onRenderError?.call(message);
            },
          );
        onControllerReady?.call(controller);
      },
    );
  }
}

class _AssistantMermaidErrorState extends StatelessWidget {
  const _AssistantMermaidErrorState({required this.error});

  final String error;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              Icons.error_outline_rounded,
              color: theme.colorScheme.error,
              size: 28,
            ),
            const SizedBox(height: 10),
            Text(
              context.l10n.assistantMermaidRenderError,
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w700,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 6),
            Text(
              error,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

String _buildHtml({
  required String definition,
  required String mermaidScript,
  required Brightness brightness,
  required Color backgroundColor,
  required Color foregroundColor,
  required bool interactive,
}) {
  final escapedScript = mermaidScript.replaceAll('</script', r'<\/script');
  final backgroundHex = _colorToCss(backgroundColor);
  final foregroundHex = _colorToCss(foregroundColor);
  final themeName = brightness == Brightness.dark ? 'dark' : 'default';
  final maxScale = interactive ? '5.0' : '1.0';
  final userScalable = interactive ? 'yes' : 'no';
  final definitionJson = jsonEncode(definition);
  final themeJson = jsonEncode(themeName);

  return '''
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=$maxScale, user-scalable=$userScalable"
    />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        background: $backgroundHex;
        color: $foregroundHex;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        overflow: ${interactive ? 'auto' : 'hidden'};
      }

      #stage {
        box-sizing: border-box;
        min-height: 100vh;
        padding: ${interactive ? '24px' : '16px'};
      }

      #diagram {
        display: flex;
        justify-content: center;
      }

      #diagram svg {
        max-width: 100%;
        height: auto;
      }

      #error {
        display: none;
        padding: 16px;
        color: #b3261e;
        font-size: 14px;
        line-height: 1.45;
      }
    </style>
    <script>$escapedScript</script>
  </head>
  <body>
    <div id="stage">
      <div id="diagram"></div>
      <div id="error"></div>
    </div>
    <script>
      const definition = $definitionJson;
      const mermaidTheme = $themeJson;
      const diagram = document.getElementById('diagram');
      const errorNode = document.getElementById('error');
      const stage = document.getElementById('stage');

      function reportRendered() {
        const height = Math.max(
          stage.scrollHeight || 0,
          diagram.scrollHeight || 0,
          document.body.scrollHeight || 0,
          160
        );
        window.flutter_inappwebview?.callHandler(
          'assistantMermaidRendered',
          height
        );
      }

      function reportError(message) {
        window.flutter_inappwebview?.callHandler(
          'assistantMermaidError',
          message
        );
      }

      function reportReady() {
        window.flutter_inappwebview?.callHandler('assistantMermaidReady');
      }

      function applyZoom(scale) {
        const svg = diagram.querySelector('svg');
        if (!svg) {
          return;
        }

        const clampedScale = Math.min(Math.max(scale, 0.6), 4);
        const baseWidth =
          window.assistantMermaidBaseWidth ||
          svg.viewBox?.baseVal?.width ||
          svg.getBoundingClientRect().width ||
          1200;
        window.assistantMermaidScale = clampedScale;
        svg.style.width = `\${baseWidth * clampedScale}px`;
        svg.style.maxWidth = 'none';
        svg.style.height = 'auto';
        reportRendered();
      }

      window.assistantMermaidZoomIn = function () {
        applyZoom((window.assistantMermaidScale || 1) * 1.2);
      };

      window.assistantMermaidZoomOut = function () {
        applyZoom((window.assistantMermaidScale || 1) / 1.2);
      };

      window.assistantMermaidResetZoom = function () {
        applyZoom(1);
      };

      async function renderMermaid() {
        try {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: mermaidTheme,
          });
          const renderResult = await mermaid.render(
            'assistant-mermaid-diagram',
            definition
          );
          diagram.innerHTML = renderResult.svg;
          if (typeof renderResult.bindFunctions === 'function') {
            renderResult.bindFunctions(diagram);
          }
          const svg = diagram.querySelector('svg');
          if (svg) {
            svg.style.height = 'auto';
            if (${interactive ? 'true' : 'false'}) {
              svg.style.width = '100%';
              svg.style.maxWidth = '100%';
              requestAnimationFrame(() => {
                window.assistantMermaidBaseWidth =
                  svg.getBoundingClientRect().width ||
                  stage.clientWidth ||
                  320;
                window.assistantMermaidScale = 1;
                reportReady();
                reportRendered();
              });
              return;
            }
            svg.style.width = '100%';
            svg.style.maxWidth = '100%';
          }
          reportReady();
          reportRendered();
        } catch (error) {
          const message = String(error);
          errorNode.style.display = 'block';
          errorNode.textContent = message;
          reportError(message);
        }
      }

      window.addEventListener('load', renderMermaid);
    </script>
  </body>
</html>
''';
}

String _colorToCss(Color color) {
  final alpha = color.a;
  final red = color.r;
  final green = color.g;
  final blue = color.b;
  return 'rgba(${(red * 255).round()}, ${(green * 255).round()}, '
      '${(blue * 255).round()}, ${alpha.toStringAsFixed(3)})';
}
