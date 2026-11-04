import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/features/mastermind/asks/ask_detail_source.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_item_page.dart';

import 'package:mobile/features/mastermind/view/widgets/mastermind_list_row.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_ask_details_fixture.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

final class _Page {
  _Page(this.harness, this.replies, this.opened);
  final MastermindViewHarness harness;
  final MastermindRepliesCubit replies;
  final List<Uri> opened;
}

Map<String, dynamic> _lane({required String waitingOn}) => {
  'id': inboxItemId(99),
  'title': 'Synthetic lane',
  'role': 'Synthetic role',
  'state': 'waiting',
  'provider_model': 'claude / claude-opus-4-1',
  'age_seconds': 1,
  'eta_seconds': 1,
  'waiting_on_ask_id': waitingOn,
};

Future<_Page> _pump(
  WidgetTester tester, {
  required int id,
  List<Map<String, dynamic>>? items,
  MastermindAskDetailSource? askDetails,
  List<Map<String, dynamic>> lanes = const [],
  Size size = const Size(430, 4000),
  double scale = 1,
  Locale locale = const Locale('en'),
}) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final cubit = repliesCubit(
    transport: FakeReplyTransport(),
    fetchCapabilities: capabilities(),
  );
  final json = inboxJson(items ?? [inboxItem(id)]);
  (json['lanes'] as List<dynamic>).addAll(lanes);
  final harness = MastermindViewHarness(
    source: FakeHubSource(bytes: snapshotBytes(json)),
    replies: cubit,
    askDetails: askDetails,
  );
  addTearDown(harness.dispose);
  await harness.setAccess(TestAccess.enabled);
  final opened = <Uri>[];
  await tester.pumpApp(
    harness.wrap(
      Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(textScaler: TextScaler.linear(scale)),
          child: Localizations.override(
            context: context,
            locale: locale,
            child: MastermindItemPage(
              itemId: inboxItemId(id),
              openLink: (url) async => opened.add(url),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
  return _Page(harness, cubit, opened);
}

Finder _option(String label) => find.ancestor(
  of: find.text(label),
  matching: find.byType(MastermindOptionRow),
);

void main() {
  group('snapshot only (flag off)', () {
    testWidgets('shows deadline, urgency and the recommended option first', (
      tester,
    ) async {
      await _pump(
        tester,
        id: 1,
        items: [
          {
            ...inboxItem(1, options: ['Defer', 'Approve']),
            'deadline': 'tonight',
            'urgency': 'urgent',
          },
        ],
      );
      expect(find.text('Answer tonight'), findsOneWidget);
      expect(find.text('Urgent'), findsOneWidget);
      expect(find.byType(SelectionArea), findsWidgets);
      final approve = tester.getTopLeft(_option('Approve').first);
      final defer = tester.getTopLeft(_option('Defer').first);
      expect(approve.dy, lessThan(defer.dy));
      expect(find.text('Why recommended'), findsNothing);
      expect(find.text('Links'), findsNothing);
    });

    testWidgets('unknown snapshot timing values are absent, not fatal', (
      tester,
    ) async {
      await _pump(
        tester,
        id: 1,
        items: [
          {...inboxItem(1), 'deadline': 'someday', 'urgency': 'whenever'},
        ],
      );
      expect(find.text('Choose a plan'), findsOneWidget);
      expect(find.textContaining('Answer '), findsNothing);
    });

    testWidgets(
      'selection waits for sticky Send and preserves canonical index',
      (tester) async {
        final page = await _pump(
          tester,
          id: 1,
          items: [
            inboxItem(1, options: ['Defer', 'Approve']),
          ],
        );
        await tester.tap(_option('Approve').first);
        await tester.pump();
        expect(
          page.replies.state.pendingOptionFor(inboxItemId(1), inboxHash('a')),
          isNull,
        );
        await tester.tap(find.widgetWithText(AppButton, 'Send “Approve”'));
        await tester.pump();
        expect(
          page.replies.state
              .pendingOptionFor(inboxItemId(1), inboxHash('a'))
              ?.optionIndex,
          1,
        );
        expect(
          page.replies.state.pendingOptionFor(inboxItemId(1), inboxHash('a')),
          isNotNull,
        );
        expect(find.text('Undo'), findsOneWidget);
        // Undo restores the choices without a send and ends the window.
        await tester.tap(find.text('Undo'));
        await tester.pumpAndSettle();
        expect(
          page.replies.state.pendingOptionFor(inboxItemId(1), inboxHash('a')),
          isNull,
        );
      },
    );

    testWidgets('links the lane waiting on this ask', (tester) async {
      await _pump(tester, id: 1, lanes: [_lane(waitingOn: inboxItemId(1))]);
      expect(find.text('Lane ⟶'), findsOneWidget);
      expect(find.text('Synthetic lane'), findsOneWidget);
    });
  });

  for (final outcome in [
    const AskDetailWithheld(),
    const AskDetailUnavailable(),
  ]) {
    testWidgets('obsolete $outcome cannot replace a new version', (
      tester,
    ) async {
      final source = _DelayedSource();
      final page = await _pump(tester, id: 1, askDetails: source);
      expect(source.requests.length, 1);
      page.harness.source.bytes = snapshotBytes(
        inboxJson([inboxItem(1, hash: 'b')]),
      );
      await page.harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(source.requests.length, 2);
      source.requests[1].complete(const AskDetailUnavailable());
      await tester.pumpAndSettle();
      source.requests[0].complete(outcome);
      await tester.pumpAndSettle();
      expect(find.text('A short question for the owner.'), findsOneWidget);
      expect(_option('Approve'), findsOneWidget);
      expect(find.text('Full details are on the Mac'), findsNothing);
    });
  }

  group('optional full ask (flag on)', () {
    testWidgets('renders reason, fallback, facts and allowlisted links', (
      tester,
    ) async {
      final source = FixtureAskDetailSource();
      final page = await _pump(tester, id: 1, askDetails: source);
      expect(source.requested, [inboxItemId(1)]);
      expect(find.textContaining('Full synthetic ask'), findsOneWidget);
      expect(find.text('Answer here'), findsOneWidget);
      expect(find.text('Why recommended'), findsOneWidget);
      expect(find.text('If no answer: Defer'), findsOneWidget);
      expect(find.text('Risk: Low'), findsOneWidget);
      expect(find.text('Blocks 2 lanes'), findsOneWidget);
      expect(find.text('Synthetic plan'), findsOneWidget);
      expect(find.text('Synthetic run'), findsOneWidget);
      expect(find.text('Off allowlist'), findsNothing);
      expect(find.text('Lookalike'), findsNothing);
      expect(find.text('Cleartext'), findsNothing);
      await tester.tap(find.text('Synthetic plan'));
      await tester.pump();
      expect(page.opened, [Uri.parse('https://tuturuuu.com/synthetic/plan')]);
      // Answers stay on the snapshot item.
      expect(_option('Approve'), findsWidgets);
    });

    testWidgets('run on Mac shows the disabled reminder', (tester) async {
      await _pump(tester, id: 2, askDetails: FixtureAskDetailSource());
      expect(find.text('Run at your Mac'), findsOneWidget);
      expect(find.text('Coming soon'), findsOneWidget);
      final remind = tester.widget<AppButton>(
        find.widgetWithText(AppButton, 'Remind me at Mac'),
      );
      expect(remind.onPressed, isNull);
      expect(find.text('If no answer: Done'), findsNothing);
    });

    testWidgets('physical and fyi kinds', (tester) async {
      await _pump(tester, id: 3, askDetails: FixtureAskDetailSource());
      expect(find.text('Needs a physical step'), findsOneWidget);
      expect(find.text("Can't be undone"), findsOneWidget);
    });

    testWidgets('fyi with unknown answered_via reads elsewhere', (
      tester,
    ) async {
      await _pump(tester, id: 4, askDetails: FixtureAskDetailSource());
      expect(find.text('For your information'), findsOneWidget);
      expect(find.text('Answered elsewhere'), findsOneWidget);
    });

    testWidgets('a 404 shows the neutral card with no options or reply', (
      tester,
    ) async {
      await _pump(
        tester,
        id: 5,
        items: [
          {
            ...inboxItem(5),
            'by': 'Synthetic owner',
            'created_at': '2026-01-31T10:00:00Z',
          },
        ],
        askDetails: FixtureAskDetailSource(),
      );
      expect(find.text('Full details are on the Mac'), findsOneWidget);
      expect(find.textContaining('Synthetic owner'), findsOneWidget);
      expect(find.text('Choose a plan'), findsNothing);
      expect(find.text('A short question for the owner.'), findsNothing);
      expect(_option('Approve'), findsNothing);
      expect(
        find
            .byType(AppButton)
            .evaluate()
            .where(
              (e) =>
                  e.widget is AppButton &&
                  (e.widget as AppButton).onPressed != null,
            ),
        isEmpty,
      );
    });

    testWidgets('a failed read keeps the snapshot view', (tester) async {
      await _pump(tester, id: 6, askDetails: FixtureAskDetailSource());
      expect(find.text('A short question for the owner.'), findsOneWidget);
      expect(_option('Approve'), findsWidgets);
    });

    testWidgets('a payload for another version is ignored', (tester) async {
      await _pump(
        tester,
        id: 1,
        items: [inboxItem(1, hash: 'b')],
        askDetails: FixtureAskDetailSource(),
      );
      expect(find.textContaining('Full synthetic ask'), findsNothing);
      expect(find.text('Why recommended'), findsNothing);
    });

    for (final locale in [const Locale('en'), const Locale('vi')]) {
      for (final id in [1, 2, 5]) {
        testWidgets('item $id $locale fits 320px at 2.0x text', (tester) async {
          await _pump(
            tester,
            id: id,
            askDetails: FixtureAskDetailSource(),
            lanes: [_lane(waitingOn: inboxItemId(id))],
            size: const Size(320, 640),
            locale: locale,
            items: [
              {...inboxItem(id), 'deadline': 'tonight', 'urgency': 'urgent'},
            ],
            scale: 2,
          );
          expect(tester.takeException(), isNull);
          await tester.drag(
            find.byType(Scrollable).first,
            const Offset(0, -1800),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        });
      }
    }
  });
}

final class _DelayedSource implements MastermindAskDetailSource {
  final requests = <Completer<AskDetailFetch>>[];
  @override
  Future<AskDetailFetch> fetch(String id) {
    final request = Completer<AskDetailFetch>();
    requests.add(request);
    return request.future;
  }
}
