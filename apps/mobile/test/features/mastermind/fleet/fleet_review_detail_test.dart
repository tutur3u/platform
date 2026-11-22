import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/mastermind/fleet/cubit/fleet_cubit.dart';
import 'package:mobile/features/mastermind/fleet/data/fleet_models.dart';
import 'package:mobile/features/mastermind/fleet/view/fleet_review_preview.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/fleet_router_harness.dart';
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

const _html = '<!doctype html><html><body><h1>Inbox</h1></body></html>';
final String _documentId = 'd' * 64;

// Product rule: apps/docs/platform/features/mobile-mastermind.mdx#design-review-asks
void main() {
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

  Future<void> pumpDetail(
    WidgetTester tester, {
    String id = 'review-inbox',
    Future<Uint8List> Function(String id)? assets,
  }) async {
    await pumpFleetRoutes(
      tester,
      harness,
      now: () => fleetTestNow,
      initial: Routes.mastermindFleetDecisionPath(id),
      launch: (uri, mode) async {
        launched.add(uri);
        return true;
      },
      assets:
          assets ??
          (id) async {
            loaded.add(id);
            return id == _documentId
                ? Uint8List.fromList(utf8.encode(_html))
                : _png;
          },
    );
    await tester.pump();
  }

  Map<String, dynamic> documentReview() => {
    ...fleetReviewJson(id: 'review-doc', preview: null),
    'review': {
      'mockupUrl':
          'https://tuturuuu.com/api/v1/mastermind/fleet/review-assets/'
          '$_documentId',
      'document': {
        'source': 'asset',
        'assetId': _documentId,
        'contentType': 'text/html',
      },
    },
  };

  testWidgets('a review lists as a design review needing the owner', (
    tester,
  ) async {
    await pumpFleetRoutes(tester, harness, now: () => fleetTestNow);
    expect(find.text('Needs you 1'), findsOneWidget);
    expect(find.text('Design review'), findsOneWidget);
    expect(find.text('Review the Inbox redesign'), findsOneWidget);
    expect(find.text('Approve or request changes'), findsOneWidget);
  });

  testWidgets('the detail shows the owner-only preview and opens the link', (
    tester,
  ) async {
    await pumpDetail(tester);
    expect(loaded, [assetId]);
    expect(find.byType(FleetReviewPreviewImage), findsOneWidget);
    await tester.tap(find.byType(FleetReviewPreviewImage));
    await tester.pump();
    await tester.tap(find.text('Open full mockup'));
    await tester.pump();
    expect(launched.map((u) => u.toString()), [
      'https://claude.ai/artifact/abc-123',
      'https://claude.ai/artifact/abc-123',
    ]);
  });

  testWidgets('a private HTML mockup renders natively and full screen', (
    tester,
  ) async {
    source.json = fleetSampleJson(decisions: [documentReview()]);
    await pumpDetail(tester, id: 'review-doc');
    expect(loaded, [_documentId]);
    expect(find.text('MOCKUP · PRIVATE TO YOU'), findsOneWidget);
    expect(find.text('mockup still ${_html.length}'), findsOneWidget);
    // The asset route is never opened in a browser.
    expect(find.text('Open full mockup'), findsNothing);
    await tester.tap(find.text('Open full screen'));
    await tester.pumpAndSettle();
    expect(find.text('mockup live ${_html.length}'), findsOneWidget);
    expect(
      find.text(
        'Loaded with your account from a private link. Links inside stay '
        'here.',
      ),
      findsOneWidget,
    );
    await tester.tap(find.byTooltip('Close preview'));
    await tester.pumpAndSettle();
    expect(find.text('mockup live ${_html.length}'), findsNothing);
    expect(launched, isEmpty);
  });

  testWidgets('a document that is not HTML shows a quiet placeholder', (
    tester,
  ) async {
    source.json = fleetSampleJson(decisions: [documentReview()]);
    await pumpDetail(tester, id: 'review-doc', assets: (_) async => _png);
    expect(find.text('Preview unavailable'), findsOneWidget);
    expect(find.text('Approve'), findsOneWidget);
  });

  testWidgets('a document that names a link is not rendered', (tester) async {
    source.json = fleetSampleJson(decisions: [documentReview()]);
    await pumpDetail(
      tester,
      id: 'review-doc',
      assets: (_) async => Uint8List.fromList(
        utf8.encode(
          '<!doctype html><link rel="preconnect" href="https://x.example">',
        ),
      ),
    );
    expect(find.text('Preview unavailable'), findsOneWidget);
    expect(find.textContaining('mockup still'), findsNothing);
  });

  testWidgets('a document that fails to load falls back to its own link', (
    tester,
  ) async {
    final review = documentReview();
    source.json = fleetSampleJson(
      decisions: [
        {
          ...review,
          'review': {
            ...review['review'] as Map<String, dynamic>,
            'mockupUrl': 'https://claude.ai/artifact/abc-123',
          },
        },
      ],
    );
    await pumpDetail(
      tester,
      id: 'review-doc',
      assets: (_) async => throw Exception('offline'),
    );
    expect(find.text('Preview unavailable'), findsOneWidget);
    expect(find.text('Open full screen'), findsNothing);
    await tester.tap(find.text('Open full mockup'));
    await tester.pump();
    expect(launched.map((u) => u.toString()), [
      'https://claude.ai/artifact/abc-123',
    ]);
  });

  testWidgets('Approve confirms in place, then sends approve', (tester) async {
    await pumpDetail(tester);
    await tester.scrollUntilVisible(
      find.text('Choose this option').first,
      200,
      scrollable: fleetPageScrollable(),
    );
    await tester.tap(find.text('Choose this option').first);
    await tester.pump();
    await tester.tap(find.text('Send to Iris'));
    await tester.pumpAndSettle();
    expect(source.answers.single['action'], FleetAnswerAction.approve);
    expect(source.answers.single['decisionId'], 'review-inbox');
  });

  testWidgets('Request changes asks for notes and sends them', (tester) async {
    await pumpDetail(tester);
    await tester.scrollUntilVisible(
      find.text('Choose this option').first,
      200,
      scrollable: fleetPageScrollable(),
    );
    await tester.drag(find.byType(PageView), const Offset(-400, 0));
    await tester.pumpAndSettle();
    expect(find.text('Request changes'), findsOneWidget);
    await tester.tap(find.text('Choose this option').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(EditableText).last, 'Tighten the rows');
    await tester.pump();
    await tester.tap(find.text('Send'));
    await tester.pumpAndSettle();
    expect(source.answers.single['action'], FleetAnswerAction.requestChanges);
    expect(source.answers.single['text'], 'Tighten the rows');
    expect(source.answers.single['key'], 'key-1');
  });

  testWidgets('a review with options keeps them in order', (tester) async {
    source.json = fleetSampleJson(
      decisions: [
        {
          ...fleetReviewJson(),
          'options': [
            {'id': 'all', 'label': 'Approve all'},
            {'id': 'auto', 'label': 'Approve with auto-advance'},
          ],
          'recommendedOptionId': 'auto',
        },
      ],
    );
    await pumpDetail(tester);
    await tester.scrollUntilVisible(
      find.text('Approve all'),
      200,
      scrollable: fleetPageScrollable(),
    );
    expect(find.text('1 of 3'), findsOneWidget);
  });

  testWidgets('an FYI-urgency review still needs the owner', (tester) async {
    source.json = fleetSampleJson(
      decisions: [
        {...fleetReviewJson(), 'urgency': 'fyi'},
      ],
    );
    await pumpFleetRoutes(tester, harness, now: () => fleetTestNow);
    expect(find.text('Needs you 1'), findsOneWidget);
    expect(find.text('Review the Inbox redesign'), findsOneWidget);
  });
}
