import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_chip.dart';
import 'package:mobile/features/mastermind/presentation/inbox_paging.dart';
import 'package:mobile/features/mastermind/presentation/inbox_segment.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_item_tile.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_inbox_page.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_segmented_control.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

const _phone = Size(430, 800);
const _endMarker = "That's every ask";
const _loadFailed = "Couldn't load more asks.";

/// [count] open decisions, alternating between two products.
Map<String, dynamic> _asks(int count, {bool security = false}) => inboxJson([
  for (var i = 1; i <= count; i++)
    inboxItem(
      i,
      title: 'Decision $i',
      product: i.isOdd ? 'Mastermind' : 'Tuturuuu',
    ),
], security: security);

Future<MastermindViewHarness> _pump(
  WidgetTester tester,
  Map<String, dynamic> json, {
  InboxPageLoader? loader,
  Size size = _phone,
  double textScale = 1,
  MastermindRepliesCubit? replies,
  ShellChromeActionsCubit? chrome,
  Locale locale = const Locale('en'),
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.resetDevicePixelRatio);
  addTearDown(tester.view.resetPhysicalSize);
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(json)),
    replies: replies,
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  await tester.pumpApp(
    harness.wrap(
      BlocProvider(
        create: (_) => chrome ?? ShellChromeActionsCubit(),
        child: Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(textScale)),
            child: Localizations.override(
              context: context,
              locale: locale,
              child: MastermindInboxPage(pageLoader: loader),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return harness;
}

Finder get _scrollable => find
    .descendant(
      of: find.byType(CustomScrollView),
      matching: find.byType(Scrollable),
    )
    .first;

/// Drag the list until [target] is built, a page at a time like a thumb.
Future<void> _scrollTo(WidgetTester tester, Finder target) => tester
    .scrollUntilVisible(target, 500, scrollable: _scrollable, maxScrolls: 400);

Future<void> _toTop(WidgetTester tester) async {
  for (var i = 0; i < 80; i++) {
    await tester.drag(_scrollable, const Offset(0, 1500));
    await tester.pump();
  }
  await tester.pumpAndSettle();
}

void main() {
  group('every ask, no toggle', () {
    testWidgets('525 asks are all reachable and nothing says Show all', (
      tester,
    ) async {
      await _pump(tester, _asks(525));
      expect(find.textContaining('Show all'), findsNothing);
      expect(find.text('525'), findsOneWidget); // the group count
      await _scrollTo(tester, find.text('Decision 525'));
      await _scrollTo(tester, find.text(_endMarker));
      expect(find.text('Decision 525'), findsOneWidget);
      expect(find.textContaining('Show all'), findsNothing);
    });

    testWidgets('only the rows near the viewport are built', (tester) async {
      await _pump(tester, _asks(525));
      expect(find.byType(InboxItemTile).evaluate().length, lessThan(15));
      expect(find.text('Decision 1'), findsOneWidget);
      expect(find.text('Decision 60'), findsNothing);
    });
  });

  group('the next page', () {
    testWidgets('loads once the last rows are in reach, and not before', (
      tester,
    ) async {
      final calls = <(int, int)>[];
      var gate = Completer<void>();
      await _pump(
        tester,
        _asks(100),
        loader: (loaded, limit) {
          calls.add((loaded, limit));
          return gate.future;
        },
      );
      expect(calls, isEmpty);
      expect(find.byType(CircularProgressIndicator), findsNothing);

      // Reading through the first page asks for the second only near its end.
      await _scrollTo(tester, find.text('Decision 15'));
      expect(calls, isEmpty);
      await _scrollTo(tester, find.text('Decision 20'));
      expect(calls, [(inboxPageSize, inboxPageSize)]);

      // The bottom shows it is loading; the page is not yet in.
      await _scrollTo(tester, find.byType(CircularProgressIndicator));
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      expect(find.text('Decision 21'), findsNothing);
      expect(calls, hasLength(1));

      gate.complete();
      gate = Completer<void>();
      await tester.pump();
      await tester.pump();
      await _scrollTo(tester, find.text('Decision 21'));
      expect(find.text('Decision 21'), findsOneWidget);
    });

    testWidgets('a failed page shows an error row with Retry, never a toast', (
      tester,
    ) async {
      var calls = 0;
      await _pump(
        tester,
        _asks(100),
        loader: (_, _) {
          calls++;
          return calls == 1
              ? Future.error(StateError('offline'))
              : Future.value();
        },
      );
      await _scrollTo(tester, find.text(_loadFailed));
      expect(find.text('Retry'), findsOneWidget);
      expect(find.byType(SnackBar), findsNothing);
      expect(find.byType(CircularProgressIndicator), findsNothing);
      // It waits for the person: no silent retry loop.
      await tester.pump(const Duration(seconds: 5));
      expect(calls, 1);

      await tester.tap(find.text('Retry'));
      await tester.pump();
      expect(calls, 2);
    });

    testWidgets('Retry loads the page and the error row goes away', (
      tester,
    ) async {
      var calls = 0;
      await _pump(
        tester,
        _asks(100),
        loader: (_, _) {
          calls++;
          return calls == 1
              ? Future.error(StateError('offline'))
              : Future.value();
        },
      );
      await _scrollTo(tester, find.text(_loadFailed));
      // Built is not on screen: nudge the row into the viewport first.
      for (var i = 0; i < 20; i++) {
        if (tester.getCenter(find.text('Retry')).dy < 700) break;
        await tester.drag(_scrollable, const Offset(0, -200));
        await tester.pump();
      }
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.text(_loadFailed), findsNothing);
      await _scrollTo(tester, find.text('Decision 21'));
    });

    testWidgets('the end of a paged list says so, then Security follows', (
      tester,
    ) async {
      await _pump(tester, _asks(45, security: true));
      expect(find.text('Security'), findsNothing);
      expect(find.text(_endMarker), findsNothing);
      await _scrollTo(tester, find.text(_endMarker));
      expect(find.text('Security'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });

    testWidgets('a short list has no end marker and no spinner', (
      tester,
    ) async {
      await _pump(tester, _asks(3, security: true));
      await _scrollTo(tester, find.text('Security'));
      expect(find.text(_endMarker), findsNothing);
      expect(find.byType(CircularProgressIndicator), findsNothing);
    });
  });

  group('refresh and filters', () {
    testWidgets('a pull to refresh starts over from the first page', (
      tester,
    ) async {
      final calls = <int>[];
      await _pump(
        tester,
        _asks(100),
        loader: (loaded, _) {
          calls.add(loaded);
          return Future.value();
        },
      );
      await _scrollTo(tester, find.text('Decision 40'));
      expect(calls, containsAllInOrder([20, 40]));
      final before = calls.length;

      await _toTop(tester);
      await tester.drag(_scrollable, const Offset(0, 400));
      await tester.pumpAndSettle();
      expect(find.text('Decision 1'), findsOneWidget);

      // Reading on again asks for the second page, not the third.
      await _scrollTo(tester, find.text('Decision 20'));
      expect(calls.skip(before).first, inboxPageSize);
    });

    testWidgets('a product filter restarts paging over the matches', (
      tester,
    ) async {
      final calls = <int>[];
      await _pump(
        tester,
        _asks(100),
        loader: (loaded, _) {
          calls.add(loaded);
          return Future.value();
        },
      );
      await _scrollTo(tester, find.text('Decision 40'));
      await _toTop(tester);
      calls.clear();

      await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
      await tester.pumpAndSettle();
      expect(find.text('50'), findsOneWidget);
      expect(find.text('Decision 2'), findsNothing);

      await _scrollTo(tester, find.text(_endMarker));
      expect(calls.first, inboxPageSize);
      expect(find.text('Decision 99'), findsOneWidget);
      expect(find.text('Decision 100'), findsNothing);
    });
  });

  testWidgets('search, product and segment changes restart paging', (
    tester,
  ) async {
    final calls = <int>[];
    final chrome = ShellChromeActionsCubit();
    await _pump(
      tester,
      _asks(100),
      chrome: chrome,
      loader: (loaded, _) async {
        calls.add(loaded);
      },
    );
    await _scrollTo(tester, find.text('Decision 40'));
    await _toTop(tester);
    chrome.state
        .resolveForLocation(Routes.mastermindInbox)
        .singleWhere((a) => a.id == 'mastermind-inbox-search')
        .onPressed!();
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Decision 9');
    await tester.pumpAndSettle();
    expect(find.widgetWithText(InboxItemTile, 'Decision 9'), findsOneWidget);
    await tester.tap(find.widgetWithText(AppChip, 'Mastermind'));
    await tester.pumpAndSettle();
    expect(find.text('Decision 90'), findsNothing);
    expect(find.text('Decision 91'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'no such ask');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Clear search and filters'));
    await tester.pumpAndSettle();
    calls.clear();
    await _scrollTo(tester, find.text('Decision 20'));
    expect(calls.first, 20);
    await _toTop(tester);
    final segmented = find.byType(MastermindSegmentedControl<InboxSegment>);
    await tester.tap(
      find.descendant(of: segmented, matching: find.text('Resolved')),
    );
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(of: segmented, matching: find.text('Needs you')),
    );
    await tester.pumpAndSettle();
    calls.clear();
    await _scrollTo(tester, find.text('Decision 20'));
    expect(calls.first, 20);
  });

  testWidgets('one tap beyond page one queues an answer and Undo cancels it', (
    tester,
  ) async {
    final transport = FakeReplyTransport();
    final replies = repliesCubit(transport: transport);
    await _pump(tester, _asks(45), replies: replies);
    await _scrollTo(tester, find.text('Decision 25'));
    final tile = find.ancestor(
      of: find.text('Decision 25'),
      matching: find.byType(InboxItemTile),
    );
    final approve = find.descendant(of: tile, matching: find.text('Approve'));
    // Lazy rows above can still change height as they build; settle, then
    // bring the option into view again before tapping it.
    await tester.ensureVisible(approve);
    await tester.pump();
    await tester.ensureVisible(approve);
    await tester.pump();
    await tester.tap(approve);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
    expect(transport.sent, isEmpty);
    final undo = find.text('Undo');
    await tester.ensureVisible(undo.last);
    await tester.tap(undo.last);
    await tester.pumpAndSettle();
    await tester.pump(const Duration(seconds: 10));
    expect(transport.sent, isEmpty);
    expect(
      find.descendant(of: tile, matching: find.text('Approve')),
      findsOneWidget,
    );
  });

  testWidgets('Vietnamese narrow enlarged list reaches Security', (
    tester,
  ) async {
    await _pump(
      tester,
      _asks(45, security: true),
      size: const Size(320, 800),
      textScale: 2,
      locale: const Locale('vi'),
    );
    await _scrollTo(tester, find.text('Đó là tất cả yêu cầu'));
    expect(tester.takeException(), isNull);
  });

  group('large text and a narrow screen', () {
    testWidgets('2x text at 320 px pages through every ask', (tester) async {
      await _pump(
        tester,
        _asks(45, security: true),
        size: const Size(320, 800),
        textScale: 2,
      );
      expect(tester.takeException(), isNull);
      await _scrollTo(tester, find.text(_endMarker));
      await _scrollTo(tester, find.text('Security'));
      expect(tester.takeException(), isNull);
      await _toTop(tester);
      expect(find.text('Decision 1'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });
}
