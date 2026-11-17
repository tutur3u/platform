import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mail/view/mail_html_document.dart';
import 'package:mobile/features/mail/view/mail_rendered_documents.dart';

MailDocumentRequest _request(
  String html, {
  bool loadImages = false,
  Map<String, String> inlineImages = const {},
}) => MailDocumentRequest(
  html: html,
  loadImages: loadImages,
  inlineImages: inlineImages,
);

void main() {
  test('height follows content, width and inline bytes', () {
    final documents = MailRenderedDocuments();
    final request = _request('body', inlineImages: {'cat': 'data:one'});
    documents.storeHeight(request, 390, 640);
    expect(
      documents.lookupHeight(
        _request('body', inlineImages: {'cat': 'data:one'}),
        390,
      ),
      640,
    );
    expect(documents.lookupHeight(request, 840), isNull);
    expect(documents.lookupHeight(_request('other'), 390), isNull);
    expect(
      documents.lookupHeight(
        _request('body', inlineImages: {'cat': 'data:two'}),
        390,
      ),
      isNull,
    );
    documents.clear();
    expect(documents.lookupHeight(request, 390), isNull);
    documents
      ..dispose()
      ..storeHeight(request, 390, 800);
    expect(documents.lookupHeight(request, 390), isNull);
  });

  test('height memo bounds entries and rejects nonfinite geometry', () {
    final documents = MailRenderedDocuments(capacity: 1)
      ..storeHeight(_request('a'), 390, 500)
      ..storeHeight(_request('b'), 390, 600);
    expect(documents.lookupHeight(_request('a'), 390), isNull);
    documents
      ..storeHeight(_request('b'), double.infinity, 700)
      ..storeHeight(_request('b'), 390, double.nan);
    expect(documents.lookupHeight(_request('b'), 390), 600);
  });

  test('returns a document only for the same HTML and options', () {
    final documents = MailRenderedDocuments()
      ..store(_request('<p>a</p>'), 'doc-a');
    expect(documents.lookup(_request('<p>a</p>')), 'doc-a');
    expect(documents.lookup(_request('<p>b</p>')), isNull);
    expect(documents.lookup(_request('<p>a</p>', loadImages: true)), isNull);
  });

  test('never memoizes bodies with inline images', () {
    final documents = MailRenderedDocuments();
    final request = _request('<p>a</p>', inlineImages: {'cid': 'data:'});
    documents.store(request, 'doc');
    expect(documents.lookup(request), isNull);
    expect(documents.length, 0);
  });

  test('evicts the least recently used document past its capacity', () {
    final documents = MailRenderedDocuments(capacity: 2)
      ..store(_request('1'), 'one')
      ..store(_request('2'), 'two');
    expect(documents.lookup(_request('1')), 'one');
    documents.store(_request('3'), 'three');
    expect(documents.lookup(_request('2')), isNull);
    expect(documents.lookup(_request('1')), 'one');
    expect(documents.length, 2);
  });

  test('clearing and disposal drop documents and fence late renders', () {
    final documents = MailRenderedDocuments()
      ..store(_request('a'), 'doc')
      ..clear();
    expect(documents.lookup(_request('a')), isNull);
    documents
      ..store(_request('a'), 'doc')
      ..dispose();
    expect(documents.length, 0);
    // A render that completes after the Mail view closed is discarded.
    documents.store(_request('a'), 'late');
    expect(documents.lookup(_request('a')), isNull);
    expect(documents.length, 0);
  });
}
