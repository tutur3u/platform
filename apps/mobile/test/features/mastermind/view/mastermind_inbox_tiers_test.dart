import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/view/inbox/ask_card_options.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_inbox_page.dart';
import 'package:mobile/features/mastermind/view/inbox/reply_undo_bar.dart';
import 'package:mobile/features/mastermind/view/inbox/tier_header.dart';
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

/// [text] inside a tier heading, not its count tile.
Finder _heading(String text) => find.descendant(
  of: find.byType(MastermindTierHeader),
  matching: find.text(text),
);

double _top(WidgetTester tester, String text) =>
    tester.getTopLeft(_heading(text)).dy;

/// [urgent] Urgent asks, then [fyi] FYI asks.
Map<String, dynamic> _long({int urgent = 12, int fyi = 3}) => inboxJson([
  for (var i = 1; i <= urgent; i++) _ask(i, 'Hot $i', urgency: 'urgent'),
  for (var i = 1; i <= fyi; i++) _ask(100 + i, 'Fyi $i', kind: 'fyi'),
], security: false);

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
    await _pump(
      tester,
      _long(),
      size: const Size(430, 700),
      tier: InboxTier.fyi,
    );
    expect(_heading('For your information'), findsOneWidget);
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
    expect(_heading('Needs a decision'), findsNothing);
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
    expect(_heading('Needs a decision'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tier headings are semantic headers with icon, label, count', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    await _pump(tester, _small);
    for (final label in [
      'Urgent, 1 ask',
      'Needs a decision, 1 ask',
      'For your information, 1 ask',
    ]) {
      final heading = find.descendant(
        of: find.byType(MastermindTierHeader),
        matching: find.bySemanticsLabel(label),
      );
      expect(tester.getSemantics(heading), isSemantics(isHeader: true));
    }
    expect(
      find.descendant(
        of: find.byType(MastermindTierHeader).first,
        matching: find.byIcon(LucideIcons.flame),
      ),
      findsOneWidget,
    );
    // Five or fewer FYI asks never collapse.
    expect(find.byKey(const ValueKey('tier-toggle-fyi')), findsNothing);
    semantics.dispose();
  });

  testWidgets('FYI above five asks starts collapsed and toggles', (
    tester,
  ) async {
    await _pump(tester, _long(urgent: 1, fyi: 6));
    expect(find.text('Show all (6)'), findsOneWidget);
    expect(find.text('Fyi 1'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('tier-toggle-fyi')));
    await tester.pumpAndSettle();
    expect(find.text('Fyi 1'), findsOneWidget);
    expect(find.text('Fyi 6'), findsOneWidget);
    await tester.tap(find.text('Show less'));
    await tester.pumpAndSettle();
    expect(find.text('Fyi 1'), findsNothing);
  });

  testWidgets('a count tile scrolls to its tier; an empty tile is inert', (
    tester,
  ) async {
    await _pump(tester, _long(fyi: 6), size: const Size(430, 700));
    expect(find.text('Fyi 1'), findsNothing);
    final empty = find.byKey(const ValueKey('tier-tile-decision'));
    expect(
      tester
          .widget<InkWell>(
            find.descendant(of: empty, matching: find.byType(InkWell)),
          )
          .onTap,
      isNull,
    );
    await tester.tap(find.byKey(const ValueKey('tier-tile-fyi')));
    await tester.pumpAndSettle();
    expect(_top(tester, 'For your information'), lessThan(300));
    // The tile opens a collapsed FYI.
    expect(find.text('Fyi 1'), findsOneWidget);
    expect(find.text('Hot 1'), findsNothing);
  });

  testWidgets('a tier heading stays pinned while its rows scroll', (
    tester,
  ) async {
    await _pump(tester, _long(urgent: 20, fyi: 0), size: const Size(430, 700));
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -900));
    await tester.pumpAndSettle();
    expect(find.text('Hot 1'), findsNothing);
    expect(_heading('Urgent'), findsOneWidget);
    expect(_top(tester, 'Urgent'), lessThan(60));
  });

  testWidgets('tiles and a collapsible FYI fit dark mode at 2x text', (
    tester,
  ) async {
    await _pump(
      tester,
      _long(urgent: 2, fyi: 6),
      size: const Size(320, 4000),
      textScale: 2,
      themeMode: ThemeMode.dark,
    );
    expect(find.byKey(const ValueKey('tier-tile-urgent')), findsOneWidget);
    expect(find.byKey(const ValueKey('tier-toggle-fyi')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
