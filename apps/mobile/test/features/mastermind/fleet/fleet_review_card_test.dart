import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_inbox_page.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_review_preview.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/mastermind_fleet_fixture.dart';
import '../../../helpers/mastermind_view_harness.dart';
import 'fleet_review_contract_test.dart' show assetId, fleetReviewJson;

// A 1x1 transparent PNG.
final _png = Uint8List.fromList([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, //
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, //
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, //
  0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, //
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, //
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#design-review-asks
void main() {
  setUpAll(() => DesignRender.loadFonts(forGoldens: true));

  late FakeFleetSource source;
  late MastermindViewHarness harness;
  final launched = <Uri>[];
  final loaded = <String>[];

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    launched.clear();
    loaded.clear();
    source = FakeFleetSource(
      json: fleetSampleJson(decisions: [fleetReviewJson()]),
    );
    harness = MastermindViewHarness(
      fleet: FleetCubit(
        source: source,
        newKey: () => 'key-1',
        timer: inertFleetTimer,
      ),
    );
    await harness.setAccess(TestAccess.enabled);
  });

  tearDown(() => harness.dispose());

  Future<void> pump(WidgetTester tester, {String theme = 'light'}) async {
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    final (settings, brightness) = DesignRender.themes[theme]!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: harness.wrap(
          FleetInboxPage(
            now: () => fleetTestNow,
            launch: (uri, mode) async {
              launched.add(uri);
              return true;
            },
            reviewAssets: (id) async {
              loaded.add(id);
              return _png;
            },
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  testWidgets('a review shows its summary and an owner-only preview', (
    tester,
  ) async {
    await pump(tester);
    expect(find.text('Needs you 1'), findsOneWidget);
    expect(find.text('Design review'), findsOneWidget);
    expect(find.text('Review the Inbox redesign'), findsOneWidget);
    expect(
      find.text('Two lanes, numbered options and inline replies.'),
      findsOneWidget,
    );
    expect(loaded, [assetId]);
    expect(find.byType(FleetReviewPreviewImage), findsOneWidget);
    final frame = tester.widget<AspectRatio>(
      find.descendant(
        of: find.byType(FleetReviewPreviewImage),
        matching: find.byType(AspectRatio),
      ),
    );
    expect(frame.aspectRatio, 16 / 10);
  });

  testWidgets('the preview and Open full mockup open the checked link', (
    tester,
  ) async {
    await pump(tester);
    await tester.tap(find.byType(FleetReviewPreviewImage));
    await tester.pump();
    await tester.tap(find.text('Open full mockup'));
    await tester.pump();
    expect(launched.map((u) => u.toString()), [
      'https://claude.ai/artifact/abc-123',
      'https://claude.ai/artifact/abc-123',
    ]);
  });

  testWidgets('Approve sends approve', (tester) async {
    await pump(tester);
    await tester.tap(find.text('Approve'));
    await tester.pump();
    await tester.pump();
    expect(source.answers.single['action'], FleetAnswerAction.approve);
    expect(source.answers.single['decisionId'], 'review-inbox');
  });

  testWidgets('Request changes needs notes and goes through the outbox', (
    tester,
  ) async {
    await pump(tester);
    expect(find.text('What should change?'), findsNothing);
    await tester.tap(find.text('Request changes'));
    await tester.pump();
    expect(find.text('What should change?'), findsOneWidget);
    final send = find.byTooltip('Send and next');
    await tester.tap(send);
    await tester.pump();
    expect(source.answers, isEmpty);

    await tester.enterText(find.byType(EditableText), 'Tighten the FYI rows');
    await tester.pump();
    await tester.tap(send);
    await tester.pump();
    await tester.pump();
    expect(source.answers.single['action'], FleetAnswerAction.requestChanges);
    expect(source.answers.single['text'], 'Tighten the FYI rows');
    expect(source.answers.single['key'], 'key-1');
  });

  testWidgets('a preview that cannot load leaves the review answerable', (
    tester,
  ) async {
    source.json = fleetSampleJson(
      decisions: [
        fleetReviewJson(
          id: 'review-2',
          preview: {
            'source': 'asset',
            'assetId': 'f' * 64,
            'contentType': 'image/png',
          },
        ),
      ],
    );
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    final (settings, brightness) = DesignRender.themes['light']!;
    await tester.pumpWidget(
      DesignRenderApp(
        settings: settings,
        brightness: brightness,
        child: harness.wrap(
          FleetInboxPage(
            now: () => fleetTestNow,
            reviewAssets: (_) async => throw Exception('offline'),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Preview unavailable'), findsOneWidget);
    expect(find.text('Approve'), findsOneWidget);
  });

  testWidgets('asks and reviews fit 320 px at 2x text in Vietnamese', (
    tester,
  ) async {
    tester.view
      ..physicalSize = const Size(320, 720)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    source.json = fleetSampleJson(
      decisions: [
        fleetReviewJson(),
        ...(fleetSampleJson()['state'] as Map<String, dynamic>)['decisions']
            as List<Map<String, dynamic>>,
      ],
    );
    final (settings, brightness) = DesignRender.themes['light']!;
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(
          size: Size(320, 720),
          textScaler: TextScaler.linear(2),
        ),
        child: DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: harness.wrap(
            Builder(
              builder: (context) => Localizations.override(
                context: context,
                locale: const Locale('vi'),
                child: FleetInboxPage(
                  now: () => fleetTestNow,
                  reviewAssets: (_) async => _png,
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.text('Cần bạn 3'), findsOneWidget);
    final page = find
        .byWidgetPredicate(
          (w) => w is Scrollable && w.axisDirection == AxisDirection.down,
        )
        .first;
    for (final text in ['Yêu cầu chỉnh sửa', 'Ship now', 'Tạm giữ']) {
      await tester.scrollUntilVisible(find.text(text), 200, scrollable: page);
      expect(tester.takeException(), isNull, reason: text);
    }
  });

  for (final theme in ['light', 'dark']) {
    testWidgets('renders a review in $theme', (tester) async {
      await pump(tester, theme: theme);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'mastermind-fleet/review-$theme');
    });
  }

  testWidgets('an FYI-urgency review still needs the owner', (tester) async {
    source = FakeFleetSource(
      json: fleetSampleJson(
        decisions: [
          {...fleetReviewJson(), 'urgency': 'fyi'},
        ],
      ),
    );
    final previous = harness;
    addTearDown(previous.dispose);
    harness = MastermindViewHarness(
      fleet: FleetCubit(
        source: source,
        newKey: () => 'key-1',
        timer: inertFleetTimer,
      ),
    );
    await harness.setAccess(TestAccess.enabled);
    await pump(tester);
    expect(find.text('Needs you 1'), findsOneWidget);
    expect(find.text('Review the Inbox redesign'), findsOneWidget);
  });
}
