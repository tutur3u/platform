import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/preview/fleet_mockup_html.dart';

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#design-review-asks
void main() {
  group('sandbox policy', () {
    test('a trusted prefix closes the head before any supplied byte', () {
      for (final html in [
        '<!DOCTYPE html><html><head><title>x</title></head></html>',
        '\u00A0<!doctype html><img src="https://evil.example/p.png">',
        '<!-- note --><!doctype html><p>x',
        '<html><body>hi</body></html>',
        'plain text first',
      ]) {
        final out = fleetSandboxMockup(html);
        final csp = out.indexOf('Content-Security-Policy');
        final headEnd = out.indexOf('</head>');
        expect(out.startsWith('<!doctype html><html><head><meta'), isTrue);
        expect(csp, greaterThan(0), reason: html);
        expect(csp, lessThan(headEnd), reason: html);
        expect(out.substring(headEnd + '</head>'.length), html, reason: html);
      }
      expect(
        fleetSandboxMockup('<p>x'),
        contains('name="referrer" content="no-referrer"'),
      );
    });

    test('DNS prefetching is off and supplied bytes stay as written', () {
      const html = '<textarea><link rel="stylesheet"></textarea>';
      final out = fleetSandboxMockup(html);
      expect(
        out,
        contains('http-equiv="x-dns-prefetch-control" content="off"'),
      );
      expect(out.endsWith('</head>$html'), isTrue);
    });

    test('nothing loads from the network', () {
      for (final directive in [
        "default-src 'none'",
        "script-src 'none'",
        "connect-src 'none'",
        "frame-src 'none'",
        "object-src 'none'",
        "form-action 'none'",
        "base-uri 'none'",
        'img-src data: blob:;',
        'font-src data:;',
      ]) {
        expect(fleetMockupCsp, contains(directive));
      }
      expect(fleetMockupCsp, isNot(contains('http')));
      expect(fleetMockupCsp, isNot(contains('unsafe-eval')));
    });
  });

  group('document bytes', () {
    Uint8List bytes(String text) => Uint8List.fromList(utf8.encode(text));

    test('accepts UTF-8 HTML with a BOM or leading space', () {
      expect(fleetDecodeMockup(bytes('<!doctype html><p>x')), isNotNull);
      expect(fleetDecodeMockup(bytes('﻿  <HTML><p>x')), isNotNull);
    });

    test('refuses anything else', () {
      expect(fleetDecodeMockup(bytes('{"not":"html"}')), isNull);
      expect(fleetDecodeMockup(Uint8List.fromList([0xff, 0xfe, 0x00])), isNull);
    });

    test('refuses a document that names a link, whatever the context', () {
      for (final body in [
        '<link rel="preconnect" href="https://evil.example">',
        '<LINK\trel=dns-prefetch href=//evil.example>',
        '<svg><style></svg><link/>',
        '<select><style></select><link></style>',
        '<textarea><link rel="stylesheet"></textarea>',
        '<p>ends with <link',
      ]) {
        expect(
          fleetDecodeMockup(bytes('<!doctype html>$body')),
          isNull,
          reason: body,
        );
      }
      // Other tag names that merely start with the same letters are fine.
      for (final body in [
        '<link-card>x</link-card>',
        '<linker>',
        '&lt;link>',
      ]) {
        expect(
          fleetDecodeMockup(bytes('<!doctype html>$body')),
          isNotNull,
          reason: body,
        );
      }
    });
  });

  test('navigation stays on the document and its anchors', () {
    expect(fleetMockupNavigationAllowed(Uri.parse('about:blank')), isTrue);
    expect(fleetMockupNavigationAllowed(Uri.parse('about:blank#top')), isTrue);
    for (final url in [
      'https://tuturuuu.com/',
      'https://claude.ai/artifact/abc',
      'http://evil.example/',
      'javascript:alert(1)',
      'file:///etc/hosts',
      'data:text/html,<p>x',
    ]) {
      expect(
        fleetMockupNavigationAllowed(Uri.parse(url)),
        isFalse,
        reason: url,
      );
    }
    expect(fleetMockupNavigationAllowed(null), isFalse);
  });

  group('review document', () {
    final id = 'a' * 64;
    Map<String, dynamic> review(Object? document, {String? mockupUrl}) => {
      'mockupUrl':
          mockupUrl ??
          'https://tuturuuu.com/api/v1/mastermind/fleet/review-assets/$id',
      'document': document,
    };

    test('parses an owner-only HTML asset', () {
      final parsed = FleetReview.parse(
        review({'source': 'asset', 'assetId': id, 'contentType': 'text/html'}),
      );
      expect(parsed?.document?.assetId, id);
      expect(parsed?.linkIsDocument, isTrue);
    });

    test('drops a malformed document and keeps the review', () {
      for (final document in [
        {'source': 'hosted', 'assetId': id, 'contentType': 'text/html'},
        {'source': 'asset', 'assetId': 'nope', 'contentType': 'text/html'},
        {'source': 'asset', 'assetId': id, 'contentType': 'image/png'},
        'text',
      ]) {
        final parsed = FleetReview.parse(
          review(document, mockupUrl: 'https://claude.ai/artifact/abc'),
        );
        expect(parsed, isNotNull, reason: '$document');
        expect(parsed!.document, isNull, reason: '$document');
        expect(parsed.linkIsDocument, isFalse);
      }
    });
  });

  test('options carry an optional description', () {
    final option = FleetOption.parse({
      'id': 'a',
      'label': 'Approve',
      'description': 'Ships tonight.',
    });
    expect(option?.description, 'Ships tonight.');
    expect(
      FleetOption.parse({'id': 'b', 'label': 'Hold'})?.description,
      isNull,
    );
    expect(
      FleetOption.parse({
        'id': 'c',
        'label': 'X',
        'description': '  ',
      })?.description,
      isNull,
    );
  });
}
