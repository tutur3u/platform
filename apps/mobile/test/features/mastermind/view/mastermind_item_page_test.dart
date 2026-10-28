import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/mastermind/data/hub_capabilities.dart';
import 'package:mobile/features/mastermind/data/mastermind_snapshot_source.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';
import 'package:mobile/features/mastermind/replies/reply_outbox_store.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_item_page.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

void _surface(WidgetTester tester) {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = const Size(430, 3000);
  addTearDown(() {
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
  });
}

final class _Page {
  _Page(this.harness, this.replies, this.transport, this.auth);
  final MastermindViewHarness harness;
  final MastermindRepliesCubit replies;
  final FakeReplyTransport transport;
  final _MockAuthCubit auth;

  void publish(Map<String, dynamic> json) {
    harness.source.bytes = snapshotBytes(json);
  }
}

Future<_Page> _pump(
  WidgetTester tester, {
  List<Map<String, dynamic>>? items,
  int id = 1,
  List<ReplyOutcome> outcomes = const [ReplyAccepted()],
  bool replies = true,
  DateTime Function()? clock,
  MastermindOutboxStore? store,
}) async {
  _surface(tester);
  final transport = FakeReplyTransport(outcomes);
  late final MastermindViewHarness harness;
  final cubit = repliesCubit(
    clock: clock,
    store: store,
    transport: transport,
    fetchCapabilities: capabilities(replies: replies),
    refreshSnapshot: () => harness.snapshot.refresh(),
  );
  harness = MastermindViewHarness(
    source: FakeHubSource(
      bytes: snapshotBytes(inboxJson(items ?? [inboxItem(1)])),
    ),
    replies: cubit,
  );
  addTearDown(harness.dispose);
  final auth = _MockAuthCubit();
  when(auth.signOut).thenAnswer((_) async {});
  await harness.setAccess(TestAccess.enabled);
  await tester.pumpApp(
    BlocProvider<AuthCubit>.value(
      value: auth,
      child: harness.wrap(MastermindItemPage(itemId: inboxItemId(id))),
    ),
  );
  await tester.pumpAndSettle();
  return _Page(harness, cubit, transport, auth);
}

Finder get _send => find.widgetWithText(AppButton, 'Send reply');

Future<void> _confirm(WidgetTester tester) async {
  await tester.tap(_send);
  await tester.pumpAndSettle();
  expect(find.text('Send this reply?'), findsOneWidget);
  await tester.tap(find.widgetWithText(AppButton, 'Send reply').last);
  await tester.pumpAndSettle();
}

bool _enabled(WidgetTester tester, Finder finder) =>
    tester.widget<AppButton>(finder).onPressed != null;

void main() {
  group('detail', () {
    testWidgets('shows the full question, not an ellipsized paragraph', (
      tester,
    ) async {
      // The longest body the schema allows (280 characters): many lines at
      // this width.
      final body = List.filled(30, 'sentence').join(' ');
      await _pump(
        tester,
        items: [inboxItem(1, body: body, title: 'Pick one')],
        replies: false,
      );
      expect(
        tester
            .widget<ShellTitleOverride>(find.byType(ShellTitleOverride))
            .title,
        'Pick one',
      );
      expect(find.text(body), findsOneWidget);
      final text = tester.widget<Text>(find.text(body));
      expect(text.maxLines, isNull);
      expect(text.overflow, isNull);
      final paragraph = tester.renderObject<RenderParagraph>(
        find.descendant(of: find.text(body), matching: find.byType(RichText)),
      );
      expect(paragraph.didExceedMaxLines, isFalse);
      // More than the two lines a grouped row would allow.
      expect(paragraph.size.height, greaterThan(60));
      expect(find.text('Decision'), findsOneWidget);
      expect(find.text('Tuturuuu'), findsOneWidget);
    });

    testWidgets('leads with the full title as a heading', (tester) async {
      final title = List.filled(20, 'Long').join(' ');
      await _pump(tester, items: [inboxItem(1, title: title)], replies: false);
      expect(find.text(title), findsOneWidget);
      final paragraph = tester.renderObject<RenderParagraph>(
        find.descendant(of: find.text(title), matching: find.byType(RichText)),
      );
      expect(paragraph.didExceedMaxLines, isFalse);
      final heading = tester.getTopLeft(find.text(title)).dy;
      expect(heading, lessThan(tester.getTopLeft(find.text('Decision')).dy));
    });

    testWidgets('never shows ids, hashes or severity', (tester) async {
      await _pump(tester, replies: false);
      final text = tester
          .widgetList<Text>(find.byType(Text))
          .map((t) => t.data ?? '')
          .join('\n')
          .toLowerCase();
      expect(text, isNot(contains('item-')));
      expect(text, isNot(contains(inboxHash('a'))));
      expect(text, isNot(contains('severity')));
    });

    testWidgets('an id that is not an open item says so, not an error', (
      tester,
    ) async {
      await _pump(tester, id: 9);
      expect(find.text('This item is no longer in Mastermind'), findsOneWidget);
      expect(find.text('Back to Inbox'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
    });

    testWidgets('an item that leaves the snapshot says it was answered', (
      tester,
    ) async {
      final page = await _pump(tester);
      expect(find.byType(TextField), findsOneWidget);
      page.publish(inboxJson([inboxItem(2)]));
      await page.harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(find.text('This was answered or withdrawn'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
    });

    testWidgets('a changed version shows the banner and keeps the words', (
      tester,
    ) async {
      final page = await _pump(tester);
      await tester.enterText(find.byType(TextField), 'my own words');
      await tester.pump();
      expect(find.text('This question was updated'), findsNothing);
      page.publish(inboxJson([inboxItem(1, hash: 'b')]));
      await page.harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(find.text('This question was updated'), findsOneWidget);
      expect(find.text('my own words'), findsOneWidget);
    });

    testWidgets('a changed version resets an option that moved', (
      tester,
    ) async {
      final page = await _pump(tester);
      await tester.tap(find.text('Defer'));
      await tester.pump();
      expect(_enabled(tester, _send), isTrue);
      page.publish(
        inboxJson([
          inboxItem(1, hash: 'b', options: ['Approve', 'Hold']),
        ]),
      );
      await page.harness.snapshot.refresh();
      await tester.pumpAndSettle();
      expect(_enabled(tester, _send), isFalse);
    });
  });

  group('capabilities gate', () {
    testWidgets('live hub replies:false hides the composer', (tester) async {
      await _pump(tester, replies: false);
      expect(find.byType(TextField), findsNothing);
      expect(_send, findsNothing);
      expect(find.text('Reply on your Mac'), findsOneWidget);
      expect(find.text('Approve · Recommended'), findsOneWidget);
    });

    testWidgets('replies on: the composer appears', (tester) async {
      await _pump(tester);
      expect(find.byType(TextField), findsOneWidget);
      expect(_send, findsOneWidget);
      expect(find.text('Reply on your Mac'), findsNothing);
    });

    testWidgets('an unreachable hub explains itself and can retry', (
      tester,
    ) async {
      _surface(tester);
      var up = false;
      final cubit = repliesCubit(
        fetchCapabilities: () => up
            ? capabilities()()
            : Future.value(
                const CapabilitiesFetchUnavailable(
                  SnapshotUnavailableKind.unavailable,
                ),
              ),
      );
      final harness = MastermindViewHarness(
        source: FakeHubSource(bytes: snapshotBytes(inboxJson([inboxItem(1)]))),
        replies: cubit,
      );
      addTearDown(harness.dispose);
      await harness.setAccess(TestAccess.enabled);
      await tester.pumpApp(
        harness.wrap(MastermindItemPage(itemId: inboxItemId(1))),
      );
      await tester.pumpAndSettle();
      expect(
        find.text("Couldn't check whether replies are available."),
        findsOneWidget,
      );
      expect(find.byType(TextField), findsNothing);
      up = true;
      await tester.tap(find.text('Retry'));
      await tester.pumpAndSettle();
      expect(find.byType(TextField), findsOneWidget);
    });
  });

  group('composer', () {
    testWidgets('has a placeholder and a 0/500 counter', (tester) async {
      await _pump(tester);
      expect(find.text('Write a reply for Mastermind'), findsOneWidget);
      expect(find.text('0/500'), findsOneWidget);
    });

    testWidgets('caps the text at 10 lines', (tester) async {
      await _pump(tester);
      await tester.enterText(
        find.byType(TextField),
        List.generate(12, (i) => 'line $i').join('\n'),
      );
      await tester.pump();
      final text = tester.widget<EditableText>(find.byType(EditableText));
      expect(text.controller.text.split('\n'), hasLength(10));
      expect(text.controller.text, endsWith('line 9'));
    });

    testWidgets('the counter has a spoken label', (tester) async {
      final handle = tester.ensureSemantics();
      await _pump(tester);
      expect(find.bySemanticsLabel('0 of 500 characters used'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Hello');
      await tester.pump();
      expect(find.bySemanticsLabel('5 of 500 characters used'), findsOneWidget);
      handle.dispose();
    });

    testWidgets('caps the text at 500 characters', (tester) async {
      await _pump(tester);
      await tester.enterText(find.byType(TextField), 'a' * 600);
      await tester.pump();
      expect(find.text('500/500'), findsOneWidget);
    });

    testWidgets('Send needs an option or text', (tester) async {
      await _pump(tester);
      expect(_enabled(tester, _send), isFalse);
      await tester.tap(find.text('Defer'));
      await tester.pump();
      expect(_enabled(tester, _send), isTrue);
    });

    testWidgets('an option and text exclude each other', (tester) async {
      await _pump(tester);
      await tester.tap(find.text('Defer'));
      await tester.pump();
      await tester.enterText(find.byType(TextField), 'something else');
      await tester.pump();
      await tester.tap(find.text('Approve'));
      await tester.pump();
      expect(find.text('something else'), findsNothing);
    });

    testWidgets('Use recommended picks it without preselecting', (
      tester,
    ) async {
      final page = await _pump(tester);
      expect(_enabled(tester, _send), isFalse);
      await tester.tap(find.text('Use recommended'));
      await tester.pump();
      expect(find.text('Use recommended'), findsNothing);
      await _confirm(tester);
      expect(page.transport.sent.single.optionIndex, 0);
    });

    testWidgets('the placeholder option is not offered', (tester) async {
      await _pump(
        tester,
        items: [
          inboxItem(1, options: ['Reply on Mac'], recommended: null),
        ],
      );
      expect(find.text('Reply on Mac'), findsNothing);
      expect(find.byType(TextField), findsOneWidget);
    });
  });

  group('sending', () {
    testWidgets('an option is confirmed, then sent as option_index', (
      tester,
    ) async {
      final page = await _pump(tester);
      await tester.tap(find.text('Defer'));
      await tester.pump();
      await _confirm(tester);
      expect(page.transport.sent.single.toRequestJson(), {
        'schema_version': '1.4',
        'item_id': inboxItemId(1),
        'version_hash': inboxHash('a'),
        'option_index': 1,
      });
      expect(find.text('Sent · waiting for Mastermind'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
    });

    testWidgets('cancelling the confirmation sends nothing', (tester) async {
      final page = await _pump(tester);
      await tester.tap(find.text('Defer'));
      await tester.pump();
      await tester.tap(_send);
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(AppButton, 'Cancel'));
      await tester.pumpAndSettle();
      expect(page.transport.sent, isEmpty);
      expect(find.byType(TextField), findsOneWidget);
    });

    testWidgets('text is sent as text with no option_index', (tester) async {
      final page = await _pump(tester);
      await tester.enterText(find.byType(TextField), 'Go ahead.');
      await tester.pump();
      await _confirm(tester);
      expect(page.transport.sent.single.toRequestJson().keys, [
        'schema_version',
        'item_id',
        'version_hash',
        'text',
      ]);
    });

    testWidgets('a 200 replay reads exactly like a 201', (tester) async {
      await _pump(tester, outcomes: const [ReplyAccepted(replayed: true)]);
      await tester.tap(find.text('Defer'));
      await tester.pump();
      await _confirm(tester);
      expect(find.text('Sent · waiting for Mastermind'), findsOneWidget);
    });
  });

  group('offline and retry', () {
    testWidgets('a failed send is queued and retried with the same key', (
      tester,
    ) async {
      final page = await _pump(
        tester,
        outcomes: const [ReplyUnavailable(), ReplyAccepted(replayed: true)],
      );
      await tester.tap(find.text('Defer'));
      await tester.pump();
      await _confirm(tester);
      expect(
        find.text(
          'Saved on this device. It will be sent when Mastermind is reachable.',
        ),
        findsOneWidget,
      );
      expect(find.text('Your reply: Defer'), findsOneWidget);
      await tester.tap(find.widgetWithText(AppButton, 'Try again'));
      await tester.pumpAndSettle();
      expect(page.transport.sent, hasLength(2));
      expect(
        page.transport.sent.map((e) => e.idempotencyKey).toSet(),
        hasLength(1),
      );
      expect(find.text('Sent · waiting for Mastermind'), findsOneWidget);
    });

    testWidgets('a queued reply can be discarded', (tester) async {
      final page = await _pump(tester, outcomes: const [ReplyUnavailable()]);
      await tester.enterText(find.byType(TextField), 'Hello');
      await tester.pump();
      await _confirm(tester);
      await tester.tap(find.widgetWithText(AppButton, 'Discard'));
      await tester.pumpAndSettle();
      expect(page.replies.state.outbox, isEmpty);
      expect(find.byType(TextField), findsOneWidget);
    });
  });

  group('status panel', () {
    testWidgets('the status line is a live region', (tester) async {
      await _pump(tester);
      await tester.enterText(find.byType(TextField), 'Hello');
      await tester.pump();
      await _confirm(tester);
      expect(
        find.ancestor(
          of: find.text('Sent · waiting for Mastermind'),
          matching: find.byWidgetPredicate(
            (w) => w is Semantics && w.properties.liveRegion == true,
          ),
        ),
        findsOneWidget,
      );
    });

    testWidgets("a queued reply to an older version is not this question's", (
      tester,
    ) async {
      final store = MemoryOutboxStore();
      OutboxEntry entry(String hash, String text) => OutboxEntry(
        idempotencyKey:
            '00000000-0000-4000-8000-00000000000${hash == 'a' ? 1 : 2}',
        itemId: inboxItemId(1),
        versionHash: inboxHash(hash),
        createdAt: DateTime.utc(2026, 1, 31, 17, 30),
        text: text,
      );
      await store.write([entry('b', 'old words'), entry('a', 'current words')]);
      await _pump(tester, outcomes: const [ReplyUnavailable()], store: store);
      expect(find.text('Your reply: current words'), findsOneWidget);
      expect(find.text('Your reply: old words'), findsNothing);
      expect(find.byType(TextField), findsNothing);
    });
  });

  group('409 stale_item', () {
    testWidgets('shows the refreshed question and keeps the draft', (
      tester,
    ) async {
      final page = await _pump(tester, outcomes: const [ReplyStale()]);
      page.publish(inboxJson([inboxItem(1, hash: 'b', title: 'Refreshed')]));
      await tester.enterText(find.byType(TextField), 'my draft');
      await tester.pump();
      await _confirm(tester);
      expect(
        find.text(
          'This question changed or was already answered. Review it again.',
        ),
        findsOneWidget,
      );
      expect(
        tester
            .widget<ShellTitleOverride>(find.byType(ShellTitleOverride))
            .title,
        'Refreshed',
      );
      expect(find.text('my draft'), findsOneWidget);
      expect(find.text('This question was updated'), findsOneWidget);
    });
  });

  group('errors', () {
    testWidgets('400 unsafe_text explains the text policy, keeps the text', (
      tester,
    ) async {
      await _pump(tester, outcomes: const [ReplyRejected(unsafeText: true)]);
      await tester.enterText(find.byType(TextField), 'see example');
      await tester.pump();
      await _confirm(tester);
      expect(find.textContaining("That text can't be sent"), findsOneWidget);
      expect(find.text('see example'), findsOneWidget);
    });

    testWidgets('413 is a local length message', (tester) async {
      await _pump(tester, outcomes: const [ReplyTooLarge()]);
      await tester.enterText(find.byType(TextField), 'Hello');
      await tester.pump();
      await _confirm(tester);
      expect(find.textContaining('too long'), findsOneWidget);
    });

    testWidgets('429 says when to try again and disables Retry', (
      tester,
    ) async {
      await _pump(
        tester,
        outcomes: const [ReplyRateLimited(retryAfter: Duration(minutes: 3))],
      );
      await tester.enterText(find.byType(TextField), 'Hello');
      await tester.pump();
      await _confirm(tester);
      expect(find.textContaining('Try again in 3 min'), findsOneWidget);
      expect(
        _enabled(tester, find.widgetWithText(AppButton, 'Try again')),
        isFalse,
      );
    });

    testWidgets('the 429 countdown ticks and re-enables Try again itself', (
      tester,
    ) async {
      var now = DateTime.utc(2026, 1, 31, 17, 32);
      await _pump(
        tester,
        outcomes: const [ReplyRateLimited(retryAfter: Duration(minutes: 2))],
        clock: () => now,
      );
      await tester.enterText(find.byType(TextField), 'Hello');
      await tester.pump();
      await _confirm(tester);
      final retry = find.widgetWithText(AppButton, 'Try again');
      expect(find.textContaining('Try again in 2 min'), findsOneWidget);
      expect(_enabled(tester, retry), isFalse);

      now = now.add(const Duration(minutes: 1));
      await tester.pump(const Duration(minutes: 1));
      expect(find.textContaining('Try again in 1 min'), findsOneWidget);
      expect(_enabled(tester, retry), isFalse);

      now = now.add(const Duration(minutes: 1));
      await tester.pump(const Duration(minutes: 1));
      expect(find.textContaining('Too many replies'), findsNothing);
      expect(
        find.text(
          'Saved on this device. It will be sent when Mastermind is reachable.',
        ),
        findsOneWidget,
      );
      expect(_enabled(tester, retry), isTrue);
    });

    testWidgets('403 replies_disabled hides the composer', (tester) async {
      await _pump(tester, outcomes: const [ReplyForbidden(disabled: true)]);
      await tester.enterText(find.byType(TextField), 'Hello');
      await tester.pump();
      await _confirm(tester);
      expect(find.byType(TextField), findsNothing);
      expect(find.text('Reply on your Mac'), findsOneWidget);
    });
  });

  group('401', () {
    testWidgets('offers Try again first, sign-in only after a repeat', (
      tester,
    ) async {
      final page = await _pump(
        tester,
        outcomes: const [
          ReplyUnauthorized(),
          ReplyUnauthorized(),
          ReplyAccepted(),
        ],
      );
      await tester.enterText(find.byType(TextField), 'Hello');
      await tester.pump();
      await _confirm(tester);
      expect(
        find.text("We couldn't confirm your session. Try again."),
        findsOneWidget,
      );
      expect(
        find.widgetWithText(AppButton, 'Sign out and sign in again'),
        findsNothing,
      );

      await tester.tap(find.widgetWithText(AppButton, 'Try again'));
      await tester.pumpAndSettle();
      expect(
        find.widgetWithText(AppButton, 'Sign out and sign in again'),
        findsOneWidget,
      );
      verifyNever(page.auth.signOut);

      await tester.tap(find.widgetWithText(AppButton, 'Try again'));
      await tester.pumpAndSettle();
      expect(find.text('Sent · waiting for Mastermind'), findsOneWidget);
      verifyNever(page.auth.signOut);
    });

    testWidgets('signs out only after a confirmation', (tester) async {
      final page = await _pump(tester, outcomes: const [ReplyUnauthorized()]);
      await tester.enterText(find.byType(TextField), 'Hello');
      await tester.pump();
      await _confirm(tester);
      await tester.tap(find.widgetWithText(AppButton, 'Try again'));
      await tester.pumpAndSettle();

      await tester.tap(
        find.widgetWithText(AppButton, 'Sign out and sign in again'),
      );
      await tester.pumpAndSettle();
      expect(find.text('Sign out of Tuturuuu?'), findsOneWidget);
      verifyNever(page.auth.signOut);
      await tester.tap(find.widgetWithText(AppButton, 'Cancel'));
      await tester.pumpAndSettle();
      verifyNever(page.auth.signOut);

      await tester.tap(
        find.widgetWithText(AppButton, 'Sign out and sign in again'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(AppButton, 'Sign out'));
      await tester.pumpAndSettle();
      verify(page.auth.signOut).called(1);
    });
  });
}
