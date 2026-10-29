import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/mastermind/cubit/mastermind_snapshot_cubit.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/option_labels.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_item_page.dart';
import 'package:mobile/features/mastermind/view/widgets/linkified_text.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_group.dart';
import 'package:mobile/features/mastermind/view/widgets/mastermind_list_row.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';
import 'mastermind_reply_test_actions.dart';

const _dock = 120.0;

const _ask =
    'Pick the company and privacy contact named in the policies.\n'
    '- entity_phuc: the company, with you as contact for now\n'
    '- entity_staff - a staff member as contact\n'
    'Details: https://example.com/privacy-draft.';

Future<FakeReplyTransport> _pump(
  WidgetTester tester, {
  Map<String, dynamic>? item,
  Size size = const Size(390, 844),
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size
    // The shell publishes the floating dock's clearance as bottom padding.
    ..padding = const FakeViewPadding(bottom: _dock);
  addTearDown(tester.view.reset);
  final transport = FakeReplyTransport();
  final harness = MastermindViewHarness(
    source: FakeHubSource(
      bytes: snapshotBytes(
        inboxJson([
          item ??
              inboxItem(
                1,
                title: 'Who is the data controller',
                body: _ask,
                options: const ['entity_phuc', 'entity_staff', 'entity lawyer'],
                recommended: 'entity_phuc',
              ),
        ]),
      ),
    ),
    replies: repliesCubit(transport: transport),
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  await tester.pumpApp(
    harness.wrap(MastermindItemPage(itemId: inboxItemId(1))),
  );
  await tester.pumpAndSettle();
  return transport;
}

Iterable<String> _texts(WidgetTester tester) => tester
    .widgetList<Text>(find.byType(Text))
    .map((t) => t.data ?? t.textSpan?.toPlainText() ?? '');

void main() {
  group('option rows', () {
    testWidgets('show plain-language labels, never raw keywords', (
      tester,
    ) async {
      await _pump(tester);
      expect(find.byType(MastermindOptionRow), findsNWidgets(3));
      expect(
        find.text('The company, with you as contact for now'),
        findsOneWidget,
      );
      expect(find.text('A staff member as contact'), findsOneWidget);
      expect(find.text('Entity lawyer'), findsOneWidget);
      for (final text in _texts(tester)) {
        expect(text, isNot(anyOf('entity_phuc', 'entity_staff')));
        expect(text, isNot('entity lawyer'));
      }
    });

    testWidgets('mark only the recommended option, with a word and a star', (
      tester,
    ) async {
      await _pump(tester);
      expect(find.text('Recommended'), findsOneWidget);
      final recommended = find.widgetWithText(
        MastermindOptionRow,
        'The company, with you as contact for now',
      );
      expect(
        find.descendant(of: recommended, matching: find.text('Recommended')),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: recommended,
          matching: find.byIcon(LucideIcons.star),
        ),
        findsOneWidget,
      );
      expect(
        find.bySemanticsLabel(
          'The company, with you as contact for now · Recommended',
        ),
        findsOneWidget,
      );
    });

    testWidgets('tapping checks one radio row; the others stay unchecked', (
      tester,
    ) async {
      final semantics = tester.ensureSemantics();
      final transport = await _pump(tester);
      expect(find.text('Send reply'), findsOneWidget);
      Matcher radio({required String label, required bool checked}) =>
          matchesSemantics(
            label: label,
            hasCheckedState: true,
            isChecked: checked,
            isInMutuallyExclusiveGroup: true,
            isEnabled: true,
            hasEnabledState: true,
            hasTapAction: true,
          );
      expect(
        tester.getSemantics(find.text('A staff member as contact')),
        radio(label: 'A staff member as contact', checked: false),
      );
      await tapVisible(tester, find.text('A staff member as contact'));
      expect(
        tester.getSemantics(find.text('A staff member as contact')),
        radio(label: 'A staff member as contact', checked: true),
      );
      expect(
        tester.getSemantics(
          find.text('The company, with you as contact for now'),
        ),
        radio(
          label: 'The company, with you as contact for now · Recommended',
          checked: false,
        ),
      );
      final selected = tester
          .widgetList<MastermindOptionRow>(find.byType(MastermindOptionRow))
          .where((row) => row.selected);
      expect(selected.single.label, 'A staff member as contact');
      // Choosing alone sends nothing; the sticky action names the choice.
      expect(transport.sent, isEmpty);
      expect(sendOptionButton('A staff member as contact'), findsOneWidget);

      await tapVisible(tester, find.text('Entity lawyer'));
      expect(
        tester
            .widgetList<MastermindOptionRow>(find.byType(MastermindOptionRow))
            .where((row) => row.selected)
            .single
            .label,
        'Entity lawyer',
      );
      semantics.dispose();
    });

    testWidgets('the sticky action sends the chosen option index', (
      tester,
    ) async {
      final transport = await _pump(tester);
      await chooseAndSend(tester, 'A staff member as contact');
      await tester.pump(MastermindRepliesCubit.defaultOptionUndoWindow);
      await tester.pumpAndSettle();
      expect(transport.sent.single.optionIndex, 1);
      expect(transport.sent.single.text, isNull);
    });
  });

  group('layout', () {
    testWidgets('one surface level: the ask is flat, options share a surface', (
      tester,
    ) async {
      await _pump(tester);
      expect(find.byType(MastermindSurface), findsOneWidget);
      expect(
        find.ancestor(
          of: find.text('Who is the data controller'),
          matching: find.byType(MastermindSurface),
        ),
        findsNothing,
      );
      for (final row in find.byType(MastermindOptionRow).evaluate()) {
        expect(
          find.ancestor(
            of: find.byWidget(row.widget),
            matching: find.byType(MastermindSurface),
          ),
          findsOneWidget,
        );
      }
      expect(find.byType(AppBar), findsNothing);
    });

    testWidgets('shows the full ask with a tappable link and when it was '
        'asked', (tester) async {
      await _pump(tester);
      final ask = tester.widget<Text>(find.text(_ask));
      expect(ask.maxLines, isNull);
      final spans = <InlineSpan>[];
      ask.textSpan!.visitChildren((span) {
        spans.add(span);
        return true;
      });
      final link = spans.whereType<TextSpan>().singleWhere(
        (span) => span.recognizer != null,
      );
      expect(link.text, 'https://example.com/privacy-draft');
    });

    testWidgets('free text is collapsed behind "Write your own"', (
      tester,
    ) async {
      await _pump(tester);
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Write your own'), findsOneWidget);
      await openWriteYourOwn(tester);
      expect(find.byType(TextField), findsOneWidget);
      expect(find.text('0/500'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Use the company');
      await tester.pump();
      expect(find.widgetWithText(AppButton, 'Send reply'), findsOneWidget);
      expect(
        tester
            .widget<AppButton>(find.widgetWithText(AppButton, 'Send reply'))
            .onPressed,
        isNotNull,
      );
    });

    testWidgets('typing clears a chosen option, so the latest intent wins', (
      tester,
    ) async {
      await _pump(tester);
      await tapVisible(tester, find.text('Entity lawyer'));
      expect(sendOptionButton('Entity lawyer'), findsOneWidget);
      await openWriteYourOwn(tester);
      await tester.enterText(find.byType(TextField), 'Something else');
      await tester.pump();
      expect(sendOptionButton('Entity lawyer'), findsNothing);
      expect(find.widgetWithText(AppButton, 'Send reply'), findsOneWidget);
    });

    testWidgets('the primary action is sticky above the dock clearance', (
      tester,
    ) async {
      await _pump(tester, size: const Size(390, 600));
      final send = find.widgetWithText(AppButton, 'Send reply');
      expect(send, findsOneWidget);
      expect(
        tester.widget<AppButton>(send).onPressed,
        isNull,
        reason: 'nothing chosen yet',
      );
      final before = tester.getRect(send);
      expect(before.bottom, lessThanOrEqualTo(600 - _dock));
      await tester.drag(find.byType(CustomScrollView), const Offset(0, -2000));
      await tester.pumpAndSettle();
      expect(tester.getRect(send), before);
      // The scroll content ends above the bar, so the last row is reachable.
      final lastRow = tester.getRect(find.text('Write your own'));
      expect(lastRow.bottom, lessThanOrEqualTo(before.top));
    });
  });

  group('plainOptionLabel', () {
    NeedsYou item(List<String> options, String body, {List<String>? hub}) =>
        NeedsYou(
          id: inboxItemId(1),
          title: 'T',
          body: body,
          options: options,
          recommendedOption: null,
          state: ItemState.open,
          versionHash: inboxHash('a'),
          hubOptions: hub,
        );

    test('prefers the hub label', () {
      expect(
        plainOptionLabel(item(['entity_phuc'], '', hub: ['The company']), 0),
        'The company',
      );
    });

    test('keeps real option text untouched', () {
      expect(plainOptionLabel(item(['Approve'], ''), 0), 'Approve');
      expect(plainOptionLabel(item(['Ship it, now.'], ''), 0), 'Ship it, now.');
    });

    test('explains a keyword from the ask, else reads it as words', () {
      final ask = item([
        'entity-phuc',
        'yes',
      ], '1. `entity-phuc` = the company\nOther text');
      expect(plainOptionLabel(ask, 0), 'The company');
      expect(plainOptionLabel(ask, 1), 'Yes');
    });

    test('matches upper and mixed case keys to their explanation', () {
      final ask = item(
        ['ENTITY_PHUC', 'entity_Staff', 'entityLawyer'],
        '- entity_phuc: the company\n'
        '- ENTITY-STAFF - a staff member\n'
        '- entity lawyer: an outside lawyer',
      );
      expect(plainOptionLabel(ask, 0), 'The company');
      expect(plainOptionLabel(ask, 1), 'A staff member');
      expect(plainOptionLabel(ask, 2), 'An outside lawyer');
    });

    test('humanizes upper and mixed case keys with no label anywhere', () {
      final ask = item(
        ['ENTITY_PHUC', 'entity_Staff', 'Entity-LAWYER', 'entityOwner'],
        'Pick one.',
        hub: ['', '', '', ''],
      );
      expect(
        [for (var i = 0; i < 4; i++) plainOptionLabel(ask, i)],
        ['Entity phuc', 'Entity staff', 'Entity lawyer', 'Entity owner'],
      );
    });

    test('never returns a raw key, but leaves words and initialisms', () {
      for (final key in ['ENTITY_PHUC', 'entity_Phuc', 'a-b', 'NOPE_x']) {
        final label = plainOptionLabel(item([key], ''), 0);
        expect(label, isNot(key));
        expect(label, isNot(contains('_')));
      }
      expect(plainOptionLabel(item(['OK'], ''), 0), 'OK');
      expect(plainOptionLabel(item(['Ship tonight'], ''), 0), 'Ship tonight');
    });
  });

  group('linkRuns', () {
    Uri? only(String text) =>
        linkRuns(text).where((run) => run.uri != null).single.uri;

    test('keeps balanced parentheses inside a link', () {
      expect(
        only('See https://en.wikipedia.org/wiki/Privacy_(disambiguation).'),
        Uri.parse('https://en.wikipedia.org/wiki/Privacy_(disambiguation)'),
      );
      expect(
        only('(see https://en.wikipedia.org/wiki/Privacy_(disambiguation))'),
        Uri.parse('https://en.wikipedia.org/wiki/Privacy_(disambiguation)'),
      );
    });

    test('trims sentence punctuation and a wrapping parenthesis', () {
      expect(
        only('Details: https://example.com/privacy-draft.'),
        Uri.parse('https://example.com/privacy-draft'),
      );
      expect(
        only('Read it (https://example.com/a), then reply!'),
        Uri.parse('https://example.com/a'),
      );
      final runs = linkRuns('Go to https://example.com/x?');
      expect(runs.last.text, '?');
    });
  });

  group('refresh', () {
    for (final (name, options) in [
      ('changed', ['Approve', 'Escalate']),
      ('reordered', ['Defer', 'Approve']),
      ('removed', ['Approve']),
    ]) {
      testWidgets('an unsent selection clears when options are $name', (
        tester,
      ) async {
        final page = await _pumpRefreshable(tester);
        await tapVisible(tester, find.text('Defer'));
        expect(sendOptionButton('Defer'), findsOneWidget);
        for (final hash in ['a', 'b']) {
          // Same version, then a new one: either way the choice is dropped.
          page.publish(inboxJson([inboxItem(1, options: options, hash: hash)]));
          await page.snapshot.refresh();
          await tester.pumpAndSettle();
          expect(
            tester
                .widgetList<MastermindOptionRow>(
                  find.byType(MastermindOptionRow),
                )
                .where((row) => row.selected),
            isEmpty,
          );
          final send = find.widgetWithText(AppButton, 'Send reply');
          expect(send, findsOneWidget);
          expect(tester.widget<AppButton>(send).onPressed, isNull);
          expect(page.transport.sent, isEmpty);
          await tapVisible(tester, find.text('Approve'));
        }
      });
    }
  });
}

final class _Refreshable {
  _Refreshable(this.harness, this.transport);
  final MastermindViewHarness harness;
  final FakeReplyTransport transport;

  MastermindSnapshotCubit get snapshot => harness.snapshot;

  void publish(Map<String, dynamic> json) =>
      harness.source.bytes = snapshotBytes(json);
}

Future<_Refreshable> _pumpRefreshable(WidgetTester tester) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(390, 1400)
    ..padding = const FakeViewPadding(bottom: _dock);
  addTearDown(tester.view.reset);
  final transport = FakeReplyTransport();
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(inboxJson([inboxItem(1)]))),
    replies: repliesCubit(transport: transport),
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  await tester.pumpApp(
    harness.wrap(MastermindItemPage(itemId: inboxItemId(1))),
  );
  await tester.pumpAndSettle();
  return _Refreshable(harness, transport);
}
