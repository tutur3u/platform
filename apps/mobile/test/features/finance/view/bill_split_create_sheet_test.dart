import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/view/bill_split_create_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/design_render_harness.dart';

const _workspace = 'test-workspace';
const _splitPath = '/api/v1/workspaces/$_workspace/finance/bill-splits';

void main() {
  testWidgets('validates custom shares and saves the previewed allocation', (
    tester,
  ) async {
    final api = _SplitApi();
    await tester.runAsync(() async {
      SharedPreferences.setMockInitialValues({});
      await FinanceRepository(
        apiClient: api,
      ).getWorkspaceDefaultCurrency(_workspace);
    });
    String? savedId;
    DesignRender.setSize(tester, DesignRender.sizes['phone']!);
    await tester.pumpWidget(
      DesignRenderApp(
        settings: DesignRender.themes['light']!.$1,
        brightness: Brightness.light,
        child: Center(
          child: Builder(
            builder: (context) => AppButton.primary(
              onPressed: () async {
                savedId = await showAppSheet<String>(
                  context: context,
                  size: AppSheetSize.large,
                  builder: (_) =>
                      BillSplitCreateSheet(workspaceId: _workspace, api: api),
                );
              },
              child: const Text('Open bill editor'),
            ),
          ),
        ),
      ),
    );
    await _tapText(tester, 'Open bill editor');
    await _enter(tester, 'Bill name', 'Dinner');
    await _enter(tester, 'Total (USD)', '1,25');

    for (final name in ['Linh', 'Minh']) {
      await _tapText(tester, 'Add a person');
      final search = find.byWidgetPredicate(
        (widget) =>
            widget is TextField && widget.decoration?.hintText == 'Search',
      );
      await tester.enterText(search, name.substring(0, 2));
      await tester.pump(const Duration(milliseconds: 350));
      await tester.pumpAndSettle();
      await _tapText(tester, name);
    }
    expect(find.text('Equal shares'), findsOneWidget);
    await _tapText(tester, 'Preview split');
    expect(api.paths, ['$_splitPath?preview=1']);
    expect(api.allocation['kind'], 'equal');
    final [linh, minh] = (api.allocation['participantIds']! as List)
        .cast<String>();

    await _tapText(tester, 'Equal shares');
    await _tapText(tester, 'Exact amounts');
    expect(find.text('Save'), findsNothing);
    await _enter(tester, 'Share for Linh (USD)', '0');
    await _enter(tester, 'Share for Minh (USD)', '1.24');
    await _tapText(tester, 'Preview split');
    expect(
      find.text(
        'Enter a share for each attendee that adds up to the bill total.',
      ),
      findsOneWidget,
    );
    expect(api.paths, hasLength(1));

    await _enter(tester, 'Share for Minh (USD)', '1.25');
    await _tapText(tester, 'Preview split');
    expect(api.allocation, {
      'kind': 'exact',
      'shares': [
        {'participantId': linh, 'amountMinor': 0},
        {'participantId': minh, 'amountMinor': 125},
      ],
    });

    await _tapText(tester, 'Exact amounts');
    await _tapText(tester, 'Percentages');
    expect(find.text('Save'), findsNothing);
    await _enter(tester, 'Share for Linh (%)', '25,25');
    await _enter(tester, 'Share for Minh (%)', '74.74');
    await _tapText(tester, 'Preview split');
    expect(
      find.text('Enter a percentage for each attendee that adds up to 100%.'),
      findsOneWidget,
    );
    expect(api.paths, hasLength(2));

    await _enter(tester, 'Share for Minh (%)', '74.75');
    await _tapText(tester, 'Preview split');
    expect(api.allocation, {
      'kind': 'percentage',
      'shares': [
        {'participantId': linh, 'basisPoints': 2525},
        {'participantId': minh, 'basisPoints': 7475},
      ],
    });

    await _tapText(tester, 'Save');
    expect(api.paths, [
      for (var i = 0; i < 3; i++) '$_splitPath?preview=1',
      _splitPath,
    ]);
    expect(api.bodies.last, api.bodies[2]);
    expect(savedId, 'saved-split');
  });
}

Future<void> _tapText(WidgetTester tester, String text) async {
  final target = find.text(text);
  expect(target, findsOneWidget, reason: text);
  await tester.ensureVisible(target);
  await tester.tap(target);
  await tester.pumpAndSettle();
}

Future<void> _enter(WidgetTester tester, String label, String text) async {
  final target = find.byWidgetPredicate(
    (widget) =>
        widget is AppTextField &&
        (widget.label == label || widget.placeholder == label),
  );
  expect(target, findsOneWidget, reason: label);
  await tester.ensureVisible(target);
  await tester.enterText(
    find.descendant(of: target, matching: find.byType(TextField)),
    text,
  );
  await tester.pumpAndSettle();
}

class _SplitApi extends Fake implements ApiClient {
  final paths = <String>[];
  final bodies = <Map<String, dynamic>>[];

  Map<String, Object?> get allocation {
    final expense = (bodies.last['expenses'] as List).single as Map;
    final line = (expense['lines'] as List).single as Map;
    return (line['allocation'] as Map).cast<String, Object?>();
  }

  @override
  Future<Map<String, dynamic>> getJson(
    String path, {
    bool requiresAuth = true,
  }) async => {'value': 'USD'};

  @override
  Future<List<dynamic>> getJsonList(
    String path, {
    bool requiresAuth = true,
  }) async {
    final query = Uri.parse(path).queryParameters['q']!;
    return [
      for (final name in ['Linh', 'Minh'])
        if (name.startsWith(query))
          {'kind': 'member', 'id': name, 'displayName': name},
    ];
  }

  @override
  Future<Map<String, dynamic>> postJson(
    String path,
    Object? body, {
    bool requiresAuth = true,
    Duration timeout = const Duration(seconds: 30),
  }) async {
    paths.add(path);
    bodies.add(body! as Map<String, dynamic>);
    return {
      'id': 'saved-split',
      'ledger': {'balances': <Map<String, dynamic>>[]},
    };
  }
}
