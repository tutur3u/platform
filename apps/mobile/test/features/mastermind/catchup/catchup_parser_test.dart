import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/catchup/catchup_link_policy.dart';
import 'package:mobile/features/mastermind/catchup/catchup_models.dart';
import 'package:mobile/features/mastermind/catchup/catchup_parser.dart';
import 'package:mobile/features/mastermind/parse/snapshot_parser.dart';

import '../../../helpers/mastermind_catchup_fixture.dart';
import '../../../helpers/mastermind_home_fixture.dart';

CatchupItem _item(CatchupDigest digest, String id) =>
    digest.allItems.firstWhere((item) => item.id == id);

void main() {
  group('parseCatchup', () {
    final digest = parseCatchup(catchupDigestJson())!;

    test('reads every section, kind and the header fields', () {
      expect(digest.coverage, CatchupCoverage.partial);
      expect(digest.generatedAt, DateTime.utc(2026, 1, 31, 17, 30));
      expect(digest.windowStart, DateTime.utc(2026, 1, 30, 17, 30));
      expect(digest.counts!.needsYou, 3);
      expect(digest.productName('upskii'), 'Upskii');
      // No product entry: the slug is the name.
      expect(digest.productName('vector-strike'), 'vector-strike');
      expect(
        digest.sections.map((s) => s.key),
        containsAll([
          CatchupSectionKey.needsYou,
          CatchupSectionKey.shipped,
          CatchupSectionKey.blocked,
          CatchupSectionKey.changed,
          CatchupSectionKey.usageHealth,
        ]),
      );
      expect(
        digest.allItems.map((item) => item.kind).toSet(),
        containsAll(
          CatchupItemKind.values.where((k) => k != CatchupItemKind.unknown),
        ),
      );
    });

    test('a neutral item keeps only its kind, time and importance', () {
      final neutral = _item(digest, 'n3');
      expect(neutral.neutral, isTrue);
      expect(neutral.title, isEmpty);
      expect(neutral.productSlug, isNull);
      expect(neutral.link, isNull);
      expect(neutral.entity, isNull);
      expect(neutral.at, DateTime.utc(2026, 1, 31, 16, 40));
    });

    test('a link outside tuturuuu.com is dropped, a subdomain is kept', () {
      expect(_item(digest, 's1').link, isNull);
      expect(
        _item(digest, 'n2').link!.uri.toString(),
        'https://mastermind.tuturuuu.com/asks/n2',
      );
      expect(_item(digest, 'n1').link, isNotNull);
    });

    test('an item with no link and no entity is kept as plain text', () {
      final plain = _item(digest, 'b2');
      expect(plain.link, isNull);
      expect(plain.entity, isNull);
      expect(plain.reason, 'Runner queue is saturated');
    });

    test('unknown enum values are tolerated', () {
      final odd = _item(digest, 'x1');
      expect(odd.kind, CatchupItemKind.unknown);
      expect(odd.importance, CatchupImportance.normal);
      expect(odd.entity, isNull);
      expect(digest.sections.last.key, CatchupSectionKey.unknown);
    });

    test('reads blocked reasons and owners', () {
      final blocked = _item(digest, 'b1');
      expect(blocked.reason, 'pgTAP caller-scope check fails');
      expect(blocked.ownerName, 'Forge');
      expect(blocked.entity!.kind, CatchupEntityKind.lane);
    });

    test('never throws on malformed input', () {
      expect(parseCatchup(null), isNull);
      expect(parseCatchup('nope'), isNull);
      expect(parseCatchup(<String, dynamic>{}), isNotNull);
      final odd = parseCatchup({
        'sections': [
          'x',
          {'key': 5, 'items': 'x'},
          {
            'key': 'shipped',
            'items': [
              {'title': 5},
              {'id': 1, 'title': 'ok', 'at': 'not a date'},
            ],
          },
        ],
        'counts': {'needs_you': 'many'},
        'products': [
          {'slug': 3},
        ],
      })!;
      expect(odd.allItems.single.title, 'ok');
      expect(odd.allItems.single.at, isNull);
      expect(odd.products, isEmpty);
    });

    test('caps 20 per section and 100 in all, and 80 characters of title', () {
      List<Map<String, dynamic>> items(int n) => [
        for (var i = 0; i < n; i++) {'id': 'i$i', 'title': 'T$i'},
      ];
      final big = parseCatchup({
        'sections': [
          for (final key in [
            'needs_you',
            'shipped',
            'blocked',
            'changed',
            'usage_health',
            'x',
          ])
            {'key': key, 'items': items(30)},
        ],
      })!;
      expect(big.sections.first.items, hasLength(20));
      expect(big.allItems.length, 100);
      final long = parseCatchup({
        'sections': [
          {
            'key': 'changed',
            'items': [
              {'id': 'a', 'title': 'x' * 200},
            ],
          },
        ],
      })!;
      expect(long.allItems.single.title.runes.length, 80);
    });
  });

  group('safeCatchupUri', () {
    test('allows https on tuturuuu.com and its subdomains', () {
      for (final url in [
        'https://tuturuuu.com',
        'https://tuturuuu.com/a?b=1',
        'https://upskii.tuturuuu.com/x',
        'https://TUTURUUU.com/x',
        'https://a.b.tuturuuu.com:443/x',
      ]) {
        expect(safeCatchupUri(url), isNotNull, reason: url);
      }
    });

    test('drops everything else', () {
      for (final url in [
        'http://tuturuuu.com',
        'https://nottuturuuu.com',
        'https://tuturuuu.com.evil.example',
        'https://evil.example/tuturuuu.com',
        'https://tuturuuu.com@evil.example',
        'https://tuturuuu.com:8443/x',
        'javascript:alert(1)',
        'tuturuuu.com',
        'https://github.com/tutur3u/platform',
        '',
      ]) {
        expect(safeCatchupUri(url), isNull, reason: url);
      }
      expect(safeCatchupUri(null), isNull);
      expect(safeCatchupUri(5), isNull);
    });
  });

  test('the snapshot carries the digest, and its absence is fine', () {
    ParseAccepted parse(Map<String, dynamic> json) =>
        parseMastermindSnapshot(
              Uint8List.fromList(utf8.encode(jsonEncode(json))),
            )
            as ParseAccepted;
    expect(parse(homeWithCatchup()).snapshot.catchup!.allItems, isNotEmpty);
    expect(
      parse(homeWithCatchup(digest: {'sections': 'bad'})).snapshot.catchup,
      isNotNull,
    );
    expect(parse(homeJson()).snapshot.catchup, isNull);
  });
}
