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
