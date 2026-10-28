import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/threads/history/thread_history_models.dart';

import '../../../../helpers/mastermind_thread_history_fixture.dart';

void main() {
  group('capabilities', () {
    test('reads the closed body', () {
      final caps = parseThreadsCapabilities(jsonBytes(capsJson(pageMax: 20)));
      expect(caps?.read, isTrue);
      expect(caps?.pageMax, 20);
    });

    test('refuses drift instead of guessing', () {
      for (final bad in [
        capsJson()..['extra'] = true,
        capsJson()..remove('send'),
        capsJson()..['schema'] = 'threads-2',
        capsJson()..['read'] = 'true',
        capsJson()..['limits'] = {'page_max': 50},
        capsJson()
          ..['limits'] = {'text_max': 1000, 'lines_max': 20, 'page_max': 500},
      ]) {
        expect(parseThreadsCapabilities(jsonBytes(bad)), isNull);
      }
    });
  });

  group('index', () {
    test('reads a good row', () {
      final rows = parseThreadIndex(jsonBytes(indexJson([indexRow()])))!;
      expect(rows.single.ref, threadRef(1));
      expect(rows.single.title, '[Ops] Release Desk');
      expect(rows.single.history, ThreadHistoryTier.redacted);
      expect(rows.single.digest, digestOf('a'));
      expect(rows.single.readable, isTrue);
    });

    test('a none-tier row is not readable', () {
      final rows = parseThreadIndex(
        jsonBytes(indexJson([indexRow(history: 'none')])),
      )!;
      expect(rows.single.readable, isFalse);
    });

    test('skips bad rows and keeps the good ones', () {
      final rows = parseThreadIndex(
        jsonBytes(
          indexJson([
            indexRow()..['unknown'] = 'x',
            indexRow(i: 2, title: 'T' * 101),
            indexRow(i: 3)..['preview'] = 'p' * 121,
            indexRow(i: 4)..['thread_ref'] = 'thread-raw-uuid',
            indexRow(i: 5)..['state'] = 'sleeping',
            indexRow(i: 6)..remove('history_digest'),
            indexRow(i: 7)..['history_digest'] = 'not-a-digest',
            indexRow(i: 8)..['allowed_models'] = ['a', 'a'],
            indexRow(i: 9),
          ]),
        ),
      )!;
      expect(rows.map((r) => r.ref), [threadRef(9)]);
    });

    test('refuses a drifting envelope or an oversized body', () {
      for (final bad in [
        indexJson([indexRow()])..['extra'] = 1,
        indexJson([indexRow()])..remove('models'),
        indexJson([indexRow()])..['schema'] = 'threads-0',
        indexJson([indexRow()])..['generated_at'] = '2026-02-30T00:00:00Z',
        indexJson([for (var i = 0; i < 201; i++) indexRow(i: i)]),
      ]) {
        expect(parseThreadIndex(jsonBytes(bad)), isNull);
      }
      final huge = indexJson([indexRow(title: 'x' * 90)])
        ..['models'] = <Object>[];
      final padded = Uint8List(threadsIndexMaxBytes + 1)
        ..setAll(0, jsonBytes(huge));
      expect(parseThreadIndex(padded), isNull);
    });
  });

  group('history page', () {
    test('reads messages, cursor and activity', () {
      final page = parseThreadHistoryPage(
        jsonBytes(
          pageJson(
            messages: [
              messageJson(1, author: 'owner_mac'),
              messageJson(
                2,
                activity: {
                  'commands': 4,
                  'edits': 2,
                  'searches': 0,
                  'subagents': 0,
                },
              ),
            ],
            nextBefore: msgRef(1),
          ),
        ),
      )!;
      expect(page.ref, threadRef(1));
      expect(page.messages.map((m) => m.ref), [msgRef(1), msgRef(2)]);
      expect(page.messages.first.author, ThreadAuthor.ownerMac);
      expect(page.messages.first.createdAt, DateTime.utc(2026, 10, 28, 7, 1));
      expect(page.messages.last.activity?.commands, 4);
      expect(page.nextBefore, msgRef(1));
    });

    test('skips bad messages and keeps the good ones', () {
      final page = parseThreadHistoryPage(
        jsonBytes(
          pageJson(
            messages: [
              messageJson(1)..['html'] = '<b>x</b>',
              messageJson(2, text: 'x' * 2001),
              messageJson(3)..['author'] = 'browser',
              messageJson(4)..['created_at'] = '2026-10-28 07:04',
              messageJson(5)..['msg_ref'] = 'raw-id',
              messageJson(6)..['redactions'] = {'path': 1},
              messageJson(7)..['activity'] = {'commands': -1},
              messageJson(8, label: 'L' * 41),
              messageJson(9, text: '✓' * 2000),
            ],
          ),
        ),
      )!;
      expect(page.messages.map((m) => m.ref), [msgRef(9)]);
    });

    test('refuses a drifting envelope', () {
      for (final bad in [
        pageJson()..['extra'] = true,
        pageJson()..['more'] = true,
        pageJson(nextBefore: msgRef(1))..['more'] = false,
        pageJson()..['history_digest'] = 'short',
        pageJson()..['thread_ref'] = '../../v1/snapshot',
        pageJson(messages: [for (var i = 0; i < 51; i++) messageJson(i)]),
      ]) {
        expect(parseThreadHistoryPage(jsonBytes(bad)), isNull);
      }
    });

    test('never throws on garbage', () {
      for (final bytes in [
        Uint8List.fromList([0xff, 0xfe, 0x00]),
        jsonBytes([1, 2, 3]),
        jsonBytes('text'),
        jsonBytes({'messages': null}),
        Uint8List(0),
      ]) {
        expect(parseThreadHistoryPage(bytes), isNull);
        expect(parseThreadIndex(bytes), isNull);
        expect(parseThreadsCapabilities(bytes), isNull);
      }
    });
  });
}
