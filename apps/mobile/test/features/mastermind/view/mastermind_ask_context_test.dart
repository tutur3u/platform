import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/components/app_button.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/presentation/display_names.dart';
import 'package:mobile/features/mastermind/presentation/home_model.dart';
import 'package:mobile/features/mastermind/presentation/inbox_model.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_outcome.dart';
import 'package:mobile/features/mastermind/view/inbox/inbox_item_tile.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_inbox_page.dart';
import 'package:mobile/features/mastermind/view/inbox/mastermind_item_page.dart';
import 'package:mobile/features/mastermind/view/mastermind_home_page.dart';
import 'package:mobile/l10n/gen/app_localizations_en.dart';

import '../../../helpers/helpers.dart';
import '../../../helpers/mastermind_home_fixture.dart';
import '../../../helpers/mastermind_replies_fixture.dart';
import '../../../helpers/mastermind_ship_pump.dart';
import '../../../helpers/mastermind_view_harness.dart';
import '../../../helpers/mastermind_work_pump.dart';

const _id = 'item-f23ae309c10a83c168e3';
const _ask =
    'Approve the release window?\n'
    'The deployment is ready.\nKeep the rollback available.';
Map<String, dynamic> _fixture({bool generic = false}) {
  final json =
      jsonDecode(
            File(
              'test/fixtures/mastermind/forge_v1_redacted.json',
            ).readAsStringSync(),
          )
          as Map<String, dynamic>;
  json['generated_at'] = testNow.toIso8601String().replaceFirst('Z', '+00:00');
  final now = json['now'] as Map<String, dynamic>;
  for (final row in [
    ...now['needs_you'] as List,
    ...json['decisions'] as List,
  ]) {
    if (row is Map && row['id'] == _id) {
      row['title'] = generic
          ? 'Mastermind · hub · decision'
          : 'Choose the release window';
      row['ask_text'] = _ask;
      row['options'] = ['Ship tonight', 'Wait until tomorrow'];
      row['recommended_option'] = 'Ship tonight';
      row['created_at'] = testNow
          .subtract(const Duration(hours: 2))
          .toIso8601String();
      row['product'] = 'Tuturuuu';
    }
  }
  return json;
}

void main() {
  Future<MastermindViewHarness> pump(
    WidgetTester tester,
    Widget page,
    Map<String, dynamic> json, {
    FakeReplyTransport? transport,
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 2400);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final harness = MastermindViewHarness(
      source: FakeHubSource(bytes: snapshotBytes(json)),
      replies: repliesCubit(
        transport: transport ?? FakeReplyTransport(const [ReplyAccepted()]),
      ),
    );
    addTearDown(harness.dispose);
    await harness.setAccess(TestAccess.enabled);
    await tester.pumpApp(harness.wrap(page));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    return harness;
  }

  test('real titles win; redacted titles use the first ask line', () {
    for (final generic in [false, true]) {
      final item = parsedSnapshot(
        _fixture(generic: generic),
      ).now.needsYou.whereType<NeedsYou>().firstWhere((item) => item.id == _id);
      expect(
        itemDisplayTitle(AppLocalizationsEn(), item),
        generic ? 'Approve the release window?' : 'Choose the release window',
      );
      expect(item.createdAt, testNow.subtract(const Duration(hours: 2)));
    }
  });

  for (final home in [false, true]) {
    testWidgets('${home ? 'Home' : 'Inbox'} shows ask context and metadata', (
      tester,
    ) async {
      await pump(
        tester,
        home ? const MastermindHomePage() : const MastermindInboxPage(),
        _fixture(generic: true),
      );
      expect(find.byKey(const ValueKey('ask-title-$_id')), findsOneWidget);
      final preview = tester.widget<Text>(
        find.byKey(const ValueKey('ask-preview-$_id')),
      );
      // The first line is the title, so the preview starts after it.
      expect(preview.data, _ask.split('\n').skip(1).join('\n'));
      expect(preview.maxLines, 2);
      final row = find.ancestor(
        of: find.byKey(const ValueKey('ask-title-$_id')),
        matching: find.byType(InboxItemTile),
      );
      expect(
        find.descendant(of: row, matching: find.text('Tuturuuu')),
        findsOneWidget,
      );
      expect(
        find.descendant(of: row, matching: find.textContaining('2 h ago')),
        findsOneWidget,
      );
      expect(find.text('Mastermind · hub · decision'), findsNothing);
    });
  }

  testWidgets(
    'detail keeps full ask and sends option once with retry identity',
    (tester) async {
      final transport = FakeReplyTransport(const [
        ReplyUnavailable(),
        ReplyAccepted(),
      ]);
      final harness = await pump(
        tester,
        const MastermindItemPage(itemId: _id),
        _fixture(),
        transport: transport,
      );
      expect(tester.widget<Text>(find.text(_ask)).maxLines, isNull);
      expect(find.text('Recommended'), findsOneWidget);
      final option = find.widgetWithText(AppButton, 'Ship tonight');
      expect(tester.getSize(option).height, greaterThanOrEqualTo(44));
      await tester.tap(option);
      await tester.pump(MastermindRepliesCubit.defaultOptionUndoWindow);
      await tester.pumpAndSettle();
      expect(transport.sent.single.optionIndex, 0);
      expect(transport.sent.single.optionLabel, 'Ship tonight');
      final first = transport.sent.single;
      await harness.runtime.replies.retry(first.itemId, first.versionHash);
      await tester.pumpAndSettle();
      expect(transport.sent.length, 2);
      expect(transport.sent.last.idempotencyKey, first.idempotencyKey);
      expect(find.text('Sent · waiting for Mastermind'), findsOneWidget);
    },
  );

  for (final options in <List<String>>[
    [],
    ['Reply on Mac'],
  ]) {
    testWidgets('no option buttons for $options; text remains', (tester) async {
      final json = _fixture();
      for (final row in [
        ...(json['now'] as Map)['needs_you'] as List,
        ...json['decisions'] as List,
      ]) {
        if (row is Map && row['id'] == _id) {
          row['options'] = options;
          row['recommended_option'] = null;
        }
      }
      await pump(tester, const MastermindItemPage(itemId: _id), json);
      expect(find.widgetWithText(AppButton, 'Ship tonight'), findsNothing);
      expect(find.widgetWithText(AppButton, 'Reply on Mac'), findsNothing);
      expect(find.byType(TextField), findsOneWidget);
    });
  }

  testWidgets('Home See all opens Inbox Needs you', (tester) async {
    final json = _fixture();
    ((json['now'] as Map)['needs_you'] as List).addAll([
      for (var i = 200; i < 203; i++) inboxItem(i),
    ]);
    final router = workRouter(Routes.mastermind);
    await pumpShip(tester, json, router: router);
    await tester.tap(find.text('Show all 5').first);
    await tester.pumpAndSettle();
    expect(workUri(router).path, Routes.mastermindInbox);
    expect(workUri(router).queryParameters['segment'], isNull);
    expect(find.byType(MastermindInboxPage), findsOneWidget);
  });

  test('duplicate ids collapse and answered asks never enter Needs you', () {
    final json = _fixture();
    final now = json['now'] as Map<String, dynamic>;
    final rows = now['needs_you'] as List;
    final original = Map<String, dynamic>.from(
      rows.firstWhere((row) => row is Map && row['id'] == _id) as Map,
    );
    rows.add(original);
    var snapshot = parsedSnapshot(json);
    expect(
      MastermindHomeModel.from(
        snapshot,
      ).needsYou.where((item) => item.id == _id),
      hasLength(1),
    );
    expect(
      MastermindInboxModel.from(
        snapshot,
      ).groups.expand((group) => group.items).where((item) => item.id == _id),
      hasLength(1),
    );
    (json['decisions_resolved'] as List).add({
      ...original,
      'status': 'resolved',
      'resolution': 'Ship tonight',
    });
    snapshot = parsedSnapshot(json);
    expect(
      MastermindHomeModel.from(
        snapshot,
      ).needsYou.where((item) => item.id == _id),
      isEmpty,
    );
    expect(openNeedsYouById(snapshot, _id), isNull);
    expect(
      MastermindInboxModel.from(
        snapshot,
      ).groups.expand((group) => group.items).where((item) => item.id == _id),
      isEmpty,
    );
  });
}
