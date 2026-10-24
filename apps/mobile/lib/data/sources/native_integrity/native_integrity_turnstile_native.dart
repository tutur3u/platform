import 'dart:async';
import 'dart:convert';

import 'package:desktop_webview_window/desktop_webview_window.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:mobile/data/sources/native_integrity/integrity_browser_lifecycle.dart';
import 'package:path_provider/path_provider.dart';

final _browsers = IntegrityBrowserLifecycle();

/// Reads only the top document, never a JavaScript-supplied message origin.
/// No Bearer credentials enter the browser.
Future<String> requestIntegrityTurnstile(Uri base, String hash) async {
  final url = base.replace(
    queryParameters: {...base.queryParameters, 'requestHash': hash},
  );
  final script =
      '''
JSON.stringify(
    location.origin === ${jsonEncode(base.origin)} &&
    location.pathname === ${jsonEncode(base.path)}
      ? window.__tuturuuuNativeIntegrityResult || null : null)
  ''';
  bool trusted(String value) {
    final uri = Uri.tryParse(value);
    return uri != null &&
        uri.hasAuthority &&
        uri.origin == base.origin &&
        uri.path == base.path;
  }

  Future<String> poll(
    Future<Object?> Function() read,
    bool Function() active,
  ) async {
    for (var attempt = 0; attempt < 80; attempt++) {
      if (!active()) throw TimeoutException('Integrity browser retired');
      final raw = await read();
      final data = raw is String ? jsonDecode(raw) : raw;
      if (data is Map && data['requestHash'] == hash) {
        if (data['error'] != null) {
          throw StateError('Integrity page unavailable');
        }
        final token = data['token'];
        if (token is String && token.isNotEmpty && token.length <= 4096) {
          return token;
        }
      }
      await Future<void>.delayed(const Duration(milliseconds: 250));
    }
    throw TimeoutException('Integrity page timed out');
  }

  if (defaultTargetPlatform == TargetPlatform.linux ||
      defaultTargetPlatform == TargetPlatform.windows ||
      defaultTargetPlatform == TargetPlatform.macOS) {
    return await _browsers.run<Webview>(
      create: () async {
        final support = await getApplicationSupportDirectory();
        return await WebviewWindow.create(
          configuration: CreateConfiguration(
            openHidden: true,
            windows: WindowsWebviewOptions(
              userDataFolder: '${support.path}/integrity-webview',
            ),
          ),
        );
      },
      use: (view, active) async {
        await view.setOnUrlRequestCallback(trusted);
        if (!active()) throw TimeoutException('Integrity browser retired');
        await view.launch(url.toString());
        return await poll(() => view.evaluateJavaScript(script), active);
      },
      close: (view) => view.close(),
    );
  }
  InAppWebViewController? controller;
  final view = HeadlessInAppWebView(
    initialUrlRequest: URLRequest(url: WebUri(url.toString())),
    initialSettings: InAppWebViewSettings(useShouldOverrideUrlLoading: true),
    onWebViewCreated: (value) {
      controller = value;
    },
    shouldOverrideUrlLoading: (_, action) async =>
        action.isForMainFrame && !trusted('${action.request.url}')
        ? NavigationActionPolicy.CANCEL
        : NavigationActionPolicy.ALLOW,
  );
  return await _browsers.run<HeadlessInAppWebView>(
    create: () async => view,
    use: (view, active) async {
      await view.run();
      return await poll(() async {
        final currentController = controller;
        if (currentController == null) return null;
        final current = await currentController.getUrl();
        if (!active()) throw TimeoutException('Integrity browser retired');
        if (current == null || !trusted(current.toString())) return null;
        return await currentController.evaluateJavascript(source: script);
      }, active);
    },
    close: (view) => view.dispose(),
  );
}
