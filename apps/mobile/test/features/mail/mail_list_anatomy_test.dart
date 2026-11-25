import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_message_date.dart';
import 'package:mobile/features/mail/view/mail_message_tile.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_quick_filter.dart';
import 'package:mobile/features/mail/view/mail_row_parts.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/phone_surface.dart';
import '../../helpers/pump_app.dart';

class _Repository extends Mock implements MailRepository {}

final _now = DateTime(2026, 11, 25, 15, 30);

Map<String, dynamic> _thread({
  bool unread = false,
  List<Map<String, dynamic>> labels = const [],
  String lastMessageAt = '2026-11-25T09:05:00',
}) => {
  'id': 'thread-1',
  'subject': 'Quarterly plan',
  'latestSnippet': 'The draft is ready for review',
  'unreadCount': unread ? 1 : 0,
  'messageCount': 3,
  'hasAttachments': true,
  'starred': true,
  'lastMessageAt': lastMessageAt,
  'participants': [
    {'address': 'ada.lovelace@example.test', 'displayName': 'Ada Lovelace'},
    {'address': 'grace@example.test', 'displayName': 'Grace'},
  ],
  'labels': labels,
};

Future<void> _pumpTile(WidgetTester tester, Map<String, dynamic> item) =>
    tester.pumpApp(
      Material(
        child: MailMessageTile(
          item: item,
          thread: true,
          selected: false,
          onTap: () {},
          onSelect: () {},
          workspaceId: 'ws',
          now: _now,
        ),
      ),
    );

FontWeight? _weight(WidgetTester tester, String text) {
  final rich = tester.widget<RichText>(
    find.descendant(
      of: find.textContaining(text),
      matching: find.byType(RichText),
    ),
  );
  return rich.text.style?.fontWeight;
}

void main() {
  // Date formatting reads locale data that no earlier test may have loaded
  // when the suite runs on its own or in a different shard.
  setUpAll(initializeDateFormatting);

  group('row anatomy', () {
    usePhoneSurface();

    testWidgets('an unread row is bold with a dot, avatar and "+N"', (
      tester,
    ) async {
      await _pumpTile(tester, _thread(unread: true));
      await tester.pumpAndSettle();

      expect(find.text('AL'), findsOneWidget);
      expect(find.textContaining('Ada Lovelace +1'), findsOneWidget);
      expect(find.text('3'), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp(r'\bUnread\b')), findsOneWidget);
      expect(find.byKey(const ValueKey('mail-row-attachment')), findsOneWidget);
      expect(find.byKey(const ValueKey('mail-row-star')), findsOneWidget);
      expect(_weight(tester, 'Ada Lovelace'), FontWeight.w600);
      expect(_weight(tester, 'Quarterly plan'), FontWeight.w600);
    });

    testWidgets('a read row uses regular, muted text and no dot', (
      tester,
    ) async {
      await _pumpTile(tester, _thread());
      await tester.pumpAndSettle();

      expect(find.bySemanticsLabel(RegExp(r'\bUnread\b')), findsNothing);
      expect(_weight(tester, 'Ada Lovelace'), FontWeight.w400);
      expect(_weight(tester, 'Quarterly plan'), FontWeight.w400);
    });

    testWidgets('two labels show by name; more collapse into "N tags"', (
      tester,
    ) async {
      final labels = [
        {'id': 'a', 'name': 'Finance', 'color': '#22C55E'},
        {'id': 'b', 'name': 'Urgent', 'color': '#EF4444'},
        {'id': 'c', 'name': 'Travel'},
      ];
      await _pumpTile(tester, _thread(labels: labels.take(2).toList()));
      await tester.pumpAndSettle();
      expect(find.text('Finance'), findsOneWidget);
      expect(find.text('Urgent'), findsOneWidget);
      expect(find.byKey(const ValueKey('mail-label-count')), findsNothing);

      await _pumpTile(tester, _thread(labels: labels));
      await tester.pumpAndSettle();
      expect(find.text('3 tags'), findsOneWidget);
      expect(find.text('Finance'), findsNothing);
    });

    testWidgets('a folder hides its own system label', (tester) async {
      expect(
        visibleMailLabels([
          {'id': 's', 'kind': 'system', 'slug': 'inbox', 'name': 'Inbox'},
          {'id': 'c', 'kind': 'custom', 'slug': 'inbox', 'name': 'Mine'},
        ], 'inbox').map((label) => label['id']),
        ['c'],
      );
    });

    testWidgets('the row shows the time for mail received today', (
      tester,
    ) async {
      await _pumpTile(tester, _thread());
      await tester.pumpAndSettle();
      expect(
        tester.widget<Text>(find.byKey(const ValueKey('mail-row-date'))).data,
        '9:05\u202FAM',
      );
    });

    test('dates use the time today, the day this year, the year before', () {
      String format(DateTime date) => formatMailThreadDate(
        date,
        locale: 'en',
        use24HourFormat: false,
        now: _now,
      );
      expect(format(DateTime(2026, 11, 25, 9, 5)), '9:05\u202FAM');
      expect(format(DateTime(2026, 3, 4, 9, 5)), 'Mar 4');
      expect(format(DateTime(2024, 3, 4, 9, 5)), 'Mar 4, 2024');
      expect(
        formatMailThreadDateTitle(
          DateTime(2024, 3, 4, 9, 5),
          locale: 'en',
          use24HourFormat: false,
        ),
        'Mar 4, 2024 9:05\u202FAM',
      );
      expect(mailParticipantInitials(null, 'grace.hopper@x.test'), 'GH');
      expect(mailParticipantInitials('  ', ''), '?');
    });
  });

  group('quick filter chips', () {
    usePhoneSurface(size: const Size(360, 740));

    for (final scale in [1.0, 1.3]) {
      testWidgets('never clip at 360dp (text scale $scale)', (tester) async {
        await tester.pumpApp(
          MediaQuery.withClampedTextScaling(
            minScaleFactor: scale,
            maxScaleFactor: scale,
            child: Material(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: MailQuickFilterBar(
                  value: MailQuickFilter.all,
                  onChanged: (_) {},
                ),
              ),
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        for (final filter in MailQuickFilter.values) {
          final chip = find.byKey(ValueKey('mail-quick-filter-${filter.name}'));
          final rect = tester.getRect(chip);
          expect(rect.left, greaterThanOrEqualTo(16));
          expect(rect.right, lessThanOrEqualTo(344));
          final paragraph = tester.renderObject<RenderParagraph>(
            find.descendant(of: chip, matching: find.byType(RichText)).last,
          );
          expect(paragraph.didExceedMaxLines, isFalse);
        }
        expect(find.text('Attachments'), findsOneWidget);
      });
    }
  });

  group('list header', () {
    usePhoneSurface();
    late _Repository repository;

    setUp(() {
      SharedPreferences.setMockInitialValues({});
      repository = _Repository();
      when(() => repository.savedView(any())).thenAnswer((_) async => null);
      when(() => repository.saveView(any(), any())).thenAnswer((_) async {});
      when(() => repository.denyAccess(any())).thenAnswer((_) async {});
      when(
        () => repository.cachedThread(any(), any(), any()),
      ).thenAnswer((_) async => null);
      when(
        () => repository.organization('ws', 'box'),
      ).thenAnswer((_) async => {});
      when(() => repository.bootstrap('ws')).thenAnswer(
        (_) async => {
          'mailboxes': [
            {'id': 'box', 'address': 'me@example.test', 'role': 'owner'},
          ],
        },
      );
      when(
        () => repository.markFolderRead('ws', 'box', 'inbox'),
      ).thenAnswer((_) async {});
      when(
        () => repository.list(
          'ws',
          'box',
          folder: any(named: 'folder'),
          query: any(named: 'query'),
          page: any(named: 'page'),
          label: any(named: 'label'),
          folderId: any(named: 'folderId'),
          forceRefresh: any(named: 'forceRefresh'),
        ),
      ).thenAnswer(
        (_) async => {
          'threads': [_thread(unread: true)],
          'pagination': {'hasMore': false},
        },
      );
    });

    testWidgets('shows the folder and mailbox, and marks the folder read', (
      tester,
    ) async {
      await tester.pumpApp(
        MailWorkspace(workspaceId: 'ws', repository: repository),
      );
      await tester.pumpAndSettle();

      expect(
        tester.widget<Text>(find.byKey(const ValueKey('mail-list-title'))).data,
        'Inbox',
      );
      expect(
        tester
            .widget<Text>(find.byKey(const ValueKey('mail-list-address')))
            .data,
        'me@example.test',
      );
      expect(find.byKey(const ValueKey('mail-sync-synced')), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('mail-mark-folder-read')));
      await tester.pumpAndSettle();
      verify(() => repository.markFolderRead('ws', 'box', 'inbox')).called(1);
      expect(tester.takeException(), isNull);
    });
  });
}
