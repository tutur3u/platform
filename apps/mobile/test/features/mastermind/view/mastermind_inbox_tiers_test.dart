import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/view/inbox/ask_card_options.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_inbox_page.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_undo_bar.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

Map<String, dynamic> _ask(
  int n,
  String title, {
  String? urgency,
  String? kind,
}) => {
  ...inboxItem(n, title: title, kind: kind ?? 'decision'),
  'urgency': ?urgency,
};

/// Synthetic asks: one Urgent, one plain decision, one FYI.
final Map<String, dynamic> _small = inboxJson([
  _ask(1, 'Plain ask'),
  _ask(2, 'Fyi ask', kind: 'fyi'),
  _ask(3, 'Hot ask', urgency: 'urgent'),
], security: false);

Future<MastermindViewHarness> _pump(
  WidgetTester tester,
  Map<String, dynamic> json, {
  InboxTier? tier,
  String? search,
  MastermindRepliesCubit? replies,
  Size size = const Size(430, 4000),
  ThemeMode? themeMode,
  double textScale = 1,
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(json)),
    replies: replies,
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  await tester.pumpApp(
    BlocProvider(
      create: (_) => ShellChromeActionsCubit(),
      child: harness.wrap(
        Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: TextScaler.linear(textScale)),
            child: MastermindInboxPage(
              initialTier: tier,
              initialSearch: search,
            ),
          ),
        ),
      ),
    ),
    themeMode: themeMode,
  );
  await tester.pumpAndSettle();
  return harness;
}

double _top(WidgetTester tester, String text) =>
    tester.getTopLeft(find.text(text).first).dy;

void main() {
  testWidgets('tier sections render in order with plain titles', (
    tester,
  ) async {
    await _pump(tester, _small);
    final tops = [
      _top(tester, 'Urgent'),
      _top(tester, 'Needs a decision'),
      _top(tester, 'For your information'),
    ];
    expect([...tops]..sort(), tops);
    expect(tops.toSet(), hasLength(3));
    expect(find.text('Decisions for you'), findsNothing);
  });

  testWidgets('?tier= scrolls the list to that tier', (tester) async {
    final many = inboxJson([
      for (var i = 1; i <= 12; i++) _ask(i, 'Hot $i', urgency: 'urgent'),
      for (var i = 20; i <= 22; i++) _ask(i, 'Fyi $i', kind: 'fyi'),
    ], security: false);
    await _pump(tester, many, size: const Size(430, 700), tier: InboxTier.fyi);
    final header = find.text('For your information');
    expect(header, findsOneWidget);
    expect(_top(tester, 'For your information'), lessThan(300));
    expect(find.text('Hot 1'), findsNothing);
  });

  testWidgets('no ?tier= leaves the list at the top', (tester) async {
    await _pump(tester, _small, size: const Size(430, 700));
    expect(_top(tester, 'Urgent'), lessThan(400));
  });

  testWidgets('?q= prefills the search and filters the asks', (tester) async {
    await _pump(tester, _small, search: 'hot');
    expect(find.byType(TextField), findsOneWidget);
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller?.text,
      'hot',
    );
    expect(find.text('Hot ask'), findsOneWidget);
    expect(find.text('Plain ask'), findsNothing);
    expect(find.text('Needs a decision'), findsNothing);
  });

  testWidgets('the undo-all bar is mounted and shows held replies', (
    tester,
  ) async {
    final replies = repliesCubit();
    await _pump(tester, _small, replies: replies);
    expect(find.byType(MastermindUndoAllBar), findsOneWidget);
    expect(find.textContaining('Undo ('), findsNothing);
    await tester.tap(
      find
          .descendant(
            of: find.byType(AskOptionTile),
            matching: find.text('Approve'),
          )
          .first,
    );
    await tester.pump();
    expect(find.textContaining('Undo (1)'), findsOneWidget);
    await tester.tap(find.textContaining('Undo (1)'));
    await tester.pump();
    expect(replies.state.pendingOptions, isEmpty);
    expect(find.textContaining('Undo ('), findsNothing);
  });

  testWidgets('renders in dark mode', (tester) async {
    await _pump(tester, _small, themeMode: ThemeMode.dark);
    expect(find.text('Urgent'), findsWidgets);
    expect(find.text('Hot ask'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('renders at 2x text scale without overflow', (tester) async {
    await _pump(
      tester,
      _small,
      size: const Size(320, 4000),
      textScale: 2,
      tier: InboxTier.decision,
    );
    expect(find.text('Needs a decision'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
