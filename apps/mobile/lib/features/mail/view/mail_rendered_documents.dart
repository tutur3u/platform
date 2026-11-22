import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';

typedef _DocumentKey = (
  String html,
  bool loadImages,
  MailMessageAppearance appearance,
  int? backgroundArgb,
);

/// Rendered HTML documents for one signed-in Mail workspace view, so
/// reopening a body (or moving it between a split pane and a pushed reader)
/// skips another isolate round trip.
///
/// The Mail workspace owns one instance and disposes it with the view, which
/// is keyed by account and workspace; access denial clears it. Keys hold the
/// exact HTML and rendering options, so a lookup only succeeds for the same
/// message content. Bodies with inline images are never memoized.
///
/// [render] shares one isolate run between every caller of the same
/// document, and [warm] renders ahead of the reader (the row under the
/// finger, the next conversation), so an open finds the body ready.
class MailRenderedDocuments {
  MailRenderedDocuments({
    this.capacity = 12,
    Future<String> Function(MailDocumentRequest request)? renderer,
  }) : _renderer = renderer ?? _renderInIsolate;

  static Future<String> _renderInIsolate(MailDocumentRequest request) =>
      compute<MailDocumentRequest, String>(renderMailDocument, request);

  /// Most documents rendering at once; further warm-ups wait their turn.
  static const int maxConcurrentWarmups = 2;

  /// Warm-ups kept waiting; older ones are dropped for newer ones.
  static const int maxQueuedWarmups = 3;

  final int capacity;
  final Future<String> Function(MailDocumentRequest request) _renderer;
  final Map<_DocumentKey, String> _documents = {};
  final Map<_DocumentKey, (Object, Future<String>)> _rendering = {};
  final List<MailDocumentRequest> _warmQueue = [];

  /// Bumped by [clear]: a render started before it never stores its result
  /// and can no longer be joined, so cleared content cannot come back.
  int _generation = 0;
  bool _disposed = false;
  final Map<(_DocumentKey, int, double), double> _heights = {};

  (_DocumentKey, int, double) _heightKey(
    MailDocumentRequest request,
    double width,
  ) => (
    (
      request.html,
      request.loadImages,
      request.appearance,
      request.backgroundArgb,
    ),
    Object.hashAllUnordered(
      request.inlineImages.entries.map(
        (entry) => Object.hash(entry.key, entry.value),
      ),
    ),
    width,
  );

  double? lookupHeight(MailDocumentRequest request, double width) =>
      _disposed ? null : _heights[_heightKey(request, width)];

  void storeHeight(MailDocumentRequest request, double width, double height) {
    if (_disposed ||
        !width.isFinite ||
        width <= 0 ||
        !height.isFinite ||
        height < 80 ||
        height > 30000) {
      return;
    }
    final key = _heightKey(request, width);
    _heights
      ..remove(key)
      ..[key] = height;
    while (_heights.length > capacity) {
      _heights.remove(_heights.keys.first);
    }
  }

  static _DocumentKey? _keyFor(MailDocumentRequest request) =>
      request.inlineImages.isEmpty
      ? (
          request.html,
          request.loadImages,
          request.appearance,
          request.backgroundArgb,
        )
      : null;

  int get length => _documents.length;

  String? lookup(MailDocumentRequest request) {
    final key = _keyFor(request);
    if (_disposed || key == null) return null;
    final document = _documents.remove(key);
    if (document != null) _documents[key] = document;
    return document;
  }

  /// Ignored after [clear]-on-dispose, so a render that completes after the
  /// view closed cannot repopulate the memo.
  void store(MailDocumentRequest request, String document) {
    final key = _keyFor(request);
    if (_disposed || key == null) return;
    _documents
      ..remove(key)
      ..[key] = document;
    while (_documents.length > capacity) {
      _documents.remove(_documents.keys.first);
    }
  }

  /// Renders [request], or joins the render already running for it. The
  /// result is memoized for the next [lookup].
  Future<String> render(MailDocumentRequest request) {
    final key = _keyFor(request);
    if (_disposed || key == null) return _renderer(request);
    final memo = lookup(request);
    if (memo != null) return Future.value(memo);
    final running = _rendering[key];
    if (running != null) return running.$2;
    final generation = _generation;
    final token = Object();
    final flight = () async {
      try {
        // Future.sync keeps a renderer that throws at once asynchronous, so
        // the run is registered before its cleanup below.
        final document = await Future.sync(() => _renderer(request));
        if (generation == _generation) store(request, document);
        return document;
      } finally {
        // Each run removes only itself; a newer run may own the key.
        if (identical(_rendering[key]?.$1, token)) _rendering.remove(key);
        _pumpWarmups();
      }
    }();
    _rendering[key] = (token, flight);
    return flight;
  }

  /// Renders [request] in the background unless it is ready or running.
  /// Failures are ignored: the reader renders again and reports them.
  void warm(MailDocumentRequest request) {
    final key = _keyFor(request);
    if (_disposed ||
        key == null ||
        _documents.containsKey(key) ||
        _rendering.containsKey(key) ||
        _warmQueue.any((queued) => _keyFor(queued) == key)) {
      return;
    }
    _warmQueue.add(request);
    while (_warmQueue.length > maxQueuedWarmups) {
      _warmQueue.removeAt(0);
    }
    _pumpWarmups();
  }

  void _pumpWarmups() {
    while (!_disposed &&
        _rendering.length < maxConcurrentWarmups &&
        _warmQueue.isNotEmpty) {
      unawaited(
        render(_warmQueue.removeAt(0)).then<void>((_) {}, onError: (_) {}),
      );
    }
  }

  void clear() {
    _generation++;
    _documents.clear();
    _heights.clear();
    _warmQueue.clear();
    _rendering.clear();
  }

  void dispose() {
    _disposed = true;
    clear();
  }
}
