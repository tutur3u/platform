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
class MailRenderedDocuments {
  MailRenderedDocuments({this.capacity = 12});

  final int capacity;
  final Map<_DocumentKey, String> _documents = {};
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

  void clear() {
    _documents.clear();
    _heights.clear();
  }

  void dispose() {
    _disposed = true;
    clear();
  }
}
