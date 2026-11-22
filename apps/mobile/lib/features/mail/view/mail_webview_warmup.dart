import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';

/// Starts the platform WebView engine once per app run, ahead of the first
/// reader.
///
/// The first WebView of a process blocks the platform thread while its engine
/// loads and its first view is created, and no frame is produced meanwhile.
/// A message body is usually rendered before its reader opens, so that work
/// would land ahead of the reader's first visible frame. Started here, while
/// the inbox is idle, it is over before the first open.
abstract final class MailWebViewWarmup {
  /// The platform work that loads the engine. Tests replace it.
  @visibleForTesting
  static Future<void> Function() engine = _loadBlankPage;

  static Future<void>? _run;

  static Future<void> start() => _run ??= _start();

  static Future<void> _start() async {
    try {
      await engine();
    } on Object {
      // No platform WebView here; the first reader loads the engine itself.
    }
  }

  /// Creates one off-screen view, lets an empty page load and disposes it:
  /// the engine and its page process stay loaded for the views that follow.
  static Future<void> _loadBlankPage() async {
    final loaded = Completer<void>();
    final view = HeadlessInAppWebView(
      initialData: InAppWebViewInitialData(data: '<!doctype html>'),
      onLoadStop: (_, _) {
        if (!loaded.isCompleted) loaded.complete();
      },
    );
    try {
      await view.run();
      await loaded.future.timeout(const Duration(seconds: 5), onTimeout: () {});
    } finally {
      await view.dispose();
    }
  }

  @visibleForTesting
  static void reset() => _run = null;
}
