import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/deep_links.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_inbox_page.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

void _surface(WidgetTester tester) {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(430, 4000);
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

final List<Map<String, dynamic>> _mixed = [
  inboxItem(
    1,
    kind: 'fyi',
    title: 'Fyi note',
    options: ['Reply on Mac'],
    recommended: null,
  ),
  inboxItem(2, kind: 'action', title: 'Action item'),
  inboxItem(3, title: 'First decision'),
  inboxItem(
    4,
    title: 'Second decision',
    product: 'Mastermind',
    recommended: 'Defer',
  ),
];

Future<MastermindViewHarness> _pump(
  WidgetTester tester,
  Map<String, dynamic> json, {
  MastermindRepliesCubit? replies,
  GoRouter? router,
}) async {
  _surface(tester);
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(json)),
    replies: replies,
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  if (router == null) {
    await tester.pumpApp(harness.wrap(const MastermindInboxPage()));
  } else {
    await tester.pumpAppRouter(router, wrap: harness.wrap);
  }
  await tester.pumpAndSettle();
  return harness;
}

double _top(WidgetTester tester, String text) =>
    tester.getTopLeft(find.text(text)).dy;

Iterable<String> _allText(WidgetTester tester) =>
    tester.widgetList<Text>(find.byType(Text)).map((t) => t.data ?? '');

void main() {
  group('grouping', () {
    testWidgets('groups by kind: decisions, actions, then information', (
      tester,
    ) async {
      await _pump(tester, inboxJson(_mixed));
      final order = [
        'Decisions for you',
        'Actions',
        'For your information',
        'Security',
      ];
      final tops = [for (final label in order) _top(tester, label)];
      expect([...tops]..sort(), tops, reason: order.join(' < '));
      expect(tops.toSet(), hasLength(order.length));
    });

    testWidgets('keeps publisher order inside a group', (tester) async {
      await _pump(tester, inboxJson(_mixed));
      expect(
        _top(tester, 'First decision') < _top(tester, 'Second decision'),
        isTrue,
      );
    });

    testWidgets('shows a count per group, normal items only', (tester) async {
      await _pump(tester, inboxJson(_mixed));
      expect(find.text('2'), findsOneWidget); // two decisions
      expect(find.text('1'), findsNWidgets(2)); // one action, one fyi
    });

    testWidgets('an item with a long body offers More, then Less', (
      tester,
    ) async {
      final body = List.filled(30, 'word').join(' ');
      await _pump(tester, inboxJson([inboxItem(1, body: body)]));
      expect(find.text('More'), findsOneWidget);
      await tester.tap(find.text('More'));
      await tester.pumpAndSettle();
      expect(find.text('Less'), findsOneWidget);
      expect(find.text('More'), findsNothing);
    });

    testWidgets('a short body has no More', (tester) async {
      await _pump(tester, inboxJson([inboxItem(1)]));
      expect(find.text('More'), findsNothing);
    });
  });

  group('options', () {
    testWidgets('are read-only chips, the recommended one labelled', (
      tester,
    ) async {
      await _pump(tester, inboxJson([inboxItem(1)]));
      expect(find.text('Approve · Recommended'), findsOneWidget);
      expect(find.text('Defer'), findsOneWidget);
      // A text label and a glyph, never colour alone.
      expect(find.byIcon(LucideIcons.star), findsOneWidget);
    });

    testWidgets('the Reply on Mac placeholder is not shown as an option', (
      tester,
    ) async {
      await _pump(tester, inboxJson(_mixed));
      expect(find.text('Reply on Mac'), findsNothing);
    });
  });

  group('security rows', () {
    testWidgets('render as one redacted line in a trailing group', (
      tester,
    ) async {
      await _pump(tester, inboxJson(_mixed));
      expect(find.text('Mastermind · security fix'), findsOneWidget);
      expect(find.text('Security'), findsOneWidget);
      expect(_top(tester, 'Security') > _top(tester, 'Fyi note'), isTrue);
    });

    testWidgets('have no severity, id, count or tap target', (tester) async {
      await _pump(tester, inboxJson(_mixed));
      final text = _allText(tester).join('\n').toLowerCase();
      expect(text, isNot(contains('severity')));
      expect(text, isNot(contains('critical')));
      expect(text, isNot(contains('security issue')));
      expect(text, isNot(contains('item-')));
      expect(
        find.ancestor(
          of: find.text('Mastermind · security fix'),
          matching: find.byType(InkWell),
        ),
        findsNothing,
      );
      expect(find.textContaining('Security ('), findsNothing);
    });

    testWidgets('are not counted, filtered or searched', (tester) async {
      await _pump(tester, inboxJson(_mixed));
      // 2 + 1 + 1 = 4 normal items; the security row adds nothing.
      expect(find.text('2'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'zzz-no-match');
      await tester.pumpAndSettle();
      expect(find.text('No matching items'), findsOneWidget);
      expect(find.text('Mastermind · security fix'), findsOneWidget);
    });

    testWidgets('alone, say nothing needs a reply and still list the line', (
      tester,
    ) async {
      await _pump(tester, inboxJson(const []));
      expect(find.text('Nothing needs a reply'), findsOneWidget);
      expect(find.text('Mastermind · security fix'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
    });
  });

  group('search and filters', () {
    testWidgets('the search field has a placeholder', (tester) async {
      await _pump(tester, inboxJson(_mixed));
      expect(find.text('Search Needs you'), findsOneWidget);
    });

    testWidgets('search narrows the list by title', (tester) async {
      await _pump(tester, inboxJson(_mixed));
      await tester.enterText(find.byType(TextField), 'first dec');
      await tester.pumpAndSettle();
      expect(find.text('First decision'), findsOneWidget);
      expect(find.text('Second decision'), findsNothing);
      expect(find.text('Actions'), findsNothing);
    });

    testWidgets('product chips filter the normal items', (tester) async {
      await _pump(tester, inboxJson(_mixed));
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      expect(find.text('Second decision'), findsOneWidget);
      expect(find.text('First decision'), findsNothing);
      await tester.tap(find.widgetWithText(AppChip, 'All'));
      await tester.pumpAndSettle();
      expect(find.text('First decision'), findsOneWidget);
    });

    testWidgets('search does not match the Reply on Mac placeholder', (
      tester,
    ) async {
      await _pump(tester, inboxJson(_mixed));
      await tester.enterText(find.byType(TextField), 'reply on');
      await tester.pumpAndSettle();
      expect(find.text('Fyi note'), findsNothing);
      expect(find.text('No matching items'), findsOneWidget);
    });

    testWidgets('a product filter is reset when its product leaves', (
      tester,
    ) async {
      final harness = await _pump(tester, inboxJson(_mixed));
      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      expect(find.text('First decision'), findsNothing);

      // The refresh drops the only Mastermind item, and with it the chips.
      harness.source.bytes = snapshotBytes(inboxJson(_mixed.sublist(0, 3)));
      await harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(find.byType(AppChip), findsNothing);
      expect(find.text('First decision'), findsOneWidget);
      expect(find.text('Action item'), findsOneWidget);
      expect(find.text('No matching items'), findsNothing);
    });

    testWidgets('no product chips when there is one product', (tester) async {
      await _pump(tester, inboxJson([inboxItem(1)]));
      expect(find.byType(AppChip), findsNothing);
    });
  });

  group('states', () {
    testWidgets('empty: nothing needs you', (tester) async {
      await _pump(tester, inboxJson(const [], security: false));
      expect(find.text('Nothing needs you'), findsOneWidget);
    });
  });

  group('pending replies', () {
    testWidgets('shows how many replies are waiting to send', (tester) async {
      final replies = repliesCubit(
        transport: FakeReplyTransport(const [ReplyUnavailable()]),
      );
      await replies.submit(item: parsedItem(inboxItem(1)), text: 'Hello');
      await _pump(tester, inboxJson([inboxItem(1)]), replies: replies);
      expect(find.text('1 reply waiting to send'), findsOneWidget);
    });

    testWidgets('one waiting reply opens its item; several do not', (
      tester,
    ) async {
      final router = GoRouter(
        initialLocation: Routes.mastermindInbox,
        routes: [
          GoRoute(
            path: Routes.mastermindInbox,
            builder: (_, _) => const MastermindInboxPage(),
          ),
          GoRoute(
            path: Routes.mastermindInboxItem,
            builder: (_, state) =>
                Text('detail ${state.pathParameters['itemId']}'),
          ),
        ],
      );
      addTearDown(router.dispose);
      final replies = repliesCubit(
        transport: FakeReplyTransport(const [ReplyUnavailable()]),
      );
      await replies.submit(item: parsedItem(inboxItem(7)), text: 'Hello');
      await _pump(
        tester,
        inboxJson([inboxItem(7), inboxItem(8)]),
        replies: replies,
        router: router,
      );
      await replies.submit(item: parsedItem(inboxItem(8)), text: 'Hello');
      await tester.pumpAndSettle();
      expect(find.text('2 replies waiting to send'), findsOneWidget);
      await tester.tap(find.text('2 replies waiting to send'));
      await tester.pumpAndSettle();
      expect(find.textContaining('detail'), findsNothing);

      await replies.discard(inboxItemId(8), inboxHash('a'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('1 reply waiting to send'));
      await tester.pumpAndSettle();
      expect(find.text('detail ${inboxItemId(7)}'), findsOneWidget);
    });

    testWidgets('shows nothing when none are waiting', (tester) async {
      await _pump(tester, inboxJson([inboxItem(1)]));
      expect(find.textContaining('waiting to send'), findsNothing);
    });
  });

  group('navigation', () {
    testWidgets('tapping an item opens its detail by opaque id', (
      tester,
    ) async {
      final router = GoRouter(
        initialLocation: Routes.mastermindInbox,
        routes: [
          GoRoute(
            path: Routes.mastermindInbox,
            builder: (_, _) => const MastermindInboxPage(),
          ),
          GoRoute(
            path: Routes.mastermindInboxItem,
            builder: (_, state) =>
                Text('detail ${state.pathParameters['itemId']}'),
          ),
        ],
      );
      addTearDown(router.dispose);
      await _pump(tester, inboxJson([inboxItem(7)]), router: router);
      await tester.tap(find.text('Choose a plan'));
      await tester.pumpAndSettle();
      expect(find.text('detail ${inboxItemId(7)}'), findsOneWidget);
    });
  });

  group('deep links', () {
    test('open the Inbox tab root and never carry an item id', () {
      for (final path in [
        'personal/mastermind/inbox',
        'personal/mastermind/inbox/item/${inboxItemId(1)}',
      ]) {
        final link = resolveMobileDeepLink(
          Uri.parse('https://tuturuuu.com/$path'),
        );
        expect(link?.location, Routes.mastermindInbox, reason: path);
        expect(link?.location, isNot(contains('item-')));
      }
    });
  });
}
