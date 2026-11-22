import 'dart:async';

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
  test('render shares one run per document and memoizes the result', () async {
    final runs = <String>[];
    final gate = Completer<void>();
    final documents = MailRenderedDocuments(
      renderer: (request) async {
        runs.add(request.html);
        await gate.future;
        return 'doc:${request.html}';
      },
    );
    final first = documents.render(_request('<p>a</p>'));
    final second = documents.render(_request('<p>a</p>'));
    expect(runs, ['<p>a</p>']);
    gate.complete();
    expect(await first, 'doc:<p>a</p>');
    expect(await second, 'doc:<p>a</p>');
    expect(documents.lookup(_request('<p>a</p>')), 'doc:<p>a</p>');
    // A later open finds the memo without another run.
    expect(await documents.render(_request('<p>a</p>')), 'doc:<p>a</p>');
    expect(runs, hasLength(1));
  });

  test('a body opened during its warm-up joins that run', () async {
    final runs = <String>[];
    final gate = Completer<void>();
    final documents = MailRenderedDocuments(
      renderer: (request) async {
        runs.add(request.html);
        await gate.future;
        return 'doc';
      },
    )..warm(_request('<p>a</p>'));
    final opened = documents.render(_request('<p>a</p>'));
    gate.complete();
    expect(await opened, 'doc');
    expect(runs, hasLength(1));
  });

  test('warm-ups run two at a time, keep the newest three waiting and '
      'ignore failures', () async {
    final started = <String>[];
    final gates = <String, Completer<String>>{};
    final documents = MailRenderedDocuments(
      renderer: (request) {
        started.add(request.html);
        return (gates[request.html] = Completer<String>()).future;
      },
    );
    for (final html in ['a', 'b', 'c', 'd', 'e', 'f']) {
      documents.warm(_request(html));
    }
    // Repeats of a running or waiting document add nothing.
    documents
      ..warm(_request('a'))
      ..warm(_request('f'));
    expect(started, ['a', 'b']);
    gates['a']!.completeError(StateError('render failed'));
    gates['b']!.complete('doc-b');
    await pumpEventQueue();
    // 'c' was dropped for the newer 'd', 'e' and 'f'.
    expect(started, ['a', 'b', 'd', 'e']);
    expect(documents.lookup(_request('a')), isNull);
    expect(documents.lookup(_request('b')), 'doc-b');
    gates['d']!.complete('doc-d');
    gates['e']!.complete('doc-e');
    await pumpEventQueue();
    expect(started, ['a', 'b', 'd', 'e', 'f']);
    gates['f']!.complete('doc-f');
    await pumpEventQueue();
    expect(documents.lookup(_request('f')), 'doc-f');
  });

  test('bodies with inline images render alone and are never warmed', () async {
    var runs = 0;
    final documents = MailRenderedDocuments(
      renderer: (request) async {
        runs++;
        return 'doc';
      },
    );
    final inline = _request('<p>a</p>', inlineImages: {'cat': 'data:one'});
    documents.warm(inline);
    expect(runs, 0);
    await documents.render(inline);
    await documents.render(inline);
    expect(runs, 2);
    expect(documents.lookup(inline), isNull);
  });

  test('a disposed memo stores nothing from a late render', () async {
    final gate = Completer<String>();
    final documents = MailRenderedDocuments(renderer: (_) => gate.future);
    final pending = documents.render(_request('<p>a</p>'));
    documents.dispose();
    gate.complete('late');
    expect(await pending, 'late');
    expect(documents.length, 0);
    documents.warm(_request('<p>b</p>'));
    expect(documents.length, 0);
  });

  test('clear fences in-flight renders and drops their future', () async {
    final gates = <Completer<String>>[];
    final documents = MailRenderedDocuments(
      renderer: (_) {
        final gate = Completer<String>();
        gates.add(gate);
        return gate.future;
      },
    );
    final stale = documents.render(_request('<p>secret</p>'));
    documents.clear();

    // A render started after clear() starts its own flight, not the old one.
    final fresh = documents.render(_request('<p>secret</p>'));
    expect(gates, hasLength(2));

    gates[0].complete('stale-html');
    expect(await stale, 'stale-html');
    expect(documents.lookup(_request('<p>secret</p>')), isNull);

    gates[1].complete('fresh-html');
    expect(await fresh, 'fresh-html');
    expect(documents.lookup(_request('<p>secret</p>')), 'fresh-html');
  });
}
