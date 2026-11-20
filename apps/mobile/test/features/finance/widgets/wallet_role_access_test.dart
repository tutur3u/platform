import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/repositories/finance_wallet_roles_repository.dart';
import 'package:mobile/features/finance/view/wallet_role_access_sheet.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../helpers/design_render_harness.dart';
import '../view/finance_scenes.dart';

class _Roles extends FinanceWalletRolesRepository {
  _Roles(this.rows);

  final List<WalletRoleAccess> rows;
  final calls = <String>[];

  @override
  Future<List<WalletRoleAccess>> list(
    String wsId,
    String walletId, {
    bool forceRefresh = false,
  }) async => rows;

  @override
  Future<List<WorkspaceRoleListItem>> workspaceRoles(String wsId) async =>
      const [
        WorkspaceRoleListItem(id: 'teachers', name: 'Teachers'),
        WorkspaceRoleListItem(id: 'accountants', name: 'Accountants'),
        WorkspaceRoleListItem(id: 'assistants', name: 'Assistants'),
      ];

  @override
  Future<void> grant(
    String wsId,
    String walletId, {
    required String roleId,
    required WalletRoleWindow window,
    int? customDays,
  }) async => calls.add('grant:$roleId:${window.wire}:$customDays');

  @override
  Future<void> update(
    String wsId,
    String walletId, {
    required String roleId,
    required WalletRoleWindow window,
    int? customDays,
  }) async => calls.add('update:$roleId:${window.wire}:$customDays');

  @override
  Future<void> revoke(String wsId, String walletId, String roleId) async =>
      calls.add('revoke:$roleId');
}

const _granted = [
  WalletRoleAccess(
    roleId: 'teachers',
    roleName: 'Teachers',
    window: WalletRoleWindow.sevenDays,
  ),
  WalletRoleAccess(
    roleId: 'accountants',
    roleName: 'Accountants',
    window: WalletRoleWindow.custom,
    customDays: 45,
  ),
];

void main() {
  test('role access parses the joined role and window', () {
    final access = WalletRoleAccess.fromJson(const {
      'role_id': 'r',
      'viewing_window': '1_quarter',
      'workspace_roles': {'id': 'r', 'name': 'Staff'},
    });
    expect(access.roleName, 'Staff');
    expect(access.window, WalletRoleWindow.oneQuarter);
    expect(WalletRoleWindow.parse('bogus'), WalletRoleWindow.oneMonth);
  });

  group('sheet', () {
    setUpAll(() async {
      SharedPreferences.setMockInitialValues({});
      await Supabase.initialize(
        url: 'https://example.supabase.co',
        publishableKey: 'test-anon-key',
      );
      await seedFinanceSceneCache();
      await DesignRender.loadFonts();
    });

    Future<_Roles> pump(
      WidgetTester tester, {
      Brightness brightness = Brightness.light,
    }) async {
      final repository = _Roles(_granted);
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await tester.pumpWidget(
        DesignRenderApp(
          settings: DesignRender.themes[brightness.name]!.$1,
          brightness: brightness,
          child: FinanceScreenScene(
            scene: FinanceScene.walletDetail,
            page: Builder(
              builder: (context) => Center(
                child: TextButton(
                  onPressed: () => showWalletRoleAccess(
                    context,
                    workspaceId: 'ws',
                    walletId: 'wallet-vnd',
                    repository: repository,
                  ),
                  child: const Text('Open role access'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open role access'));
      await tester.pumpAndSettle();
      return repository;
    }

    for (final brightness in Brightness.values) {
      testWidgets('lists roles with their window in ${brightness.name}', (
        tester,
      ) async {
        await pump(tester, brightness: brightness);
        expect(find.text('Last 7 days'), findsOneWidget);
        expect(find.text('Last 45 days'), findsOneWidget);
        await DesignRender.capture(
          tester,
          'finance-wallet-roles-${brightness.name}',
        );
      });
    }

    testWidgets('grants a role only from the ungranted ones', (tester) async {
      final repository = await pump(tester);
      await tester.tap(find.byKey(const ValueKey('wallet-role-grant')));
      await tester.pumpAndSettle();
      expect(find.text('Assistants'), findsOneWidget);
      expect(find.text('Teachers'), findsOneWidget, reason: 'Behind sheet');
      await tester.tap(find.text('Assistants'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Last quarter'));
      await tester.pumpAndSettle();
      expect(repository.calls, ['grant:assistants:1_quarter:null']);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('a custom window needs 1 to 365 days', (tester) async {
      final repository = await pump(tester);
      await tester.tap(find.text('Teachers'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Custom'));
      await tester.pumpAndSettle();
      final field = find.descendant(
        of: find.byKey(const ValueKey('wallet-role-days')),
        matching: find.byType(EditableText),
      );
      await tester.enterText(field, '400');
      await tester.tap(find.byKey(const ValueKey('wallet-role-days-save')));
      await tester.pumpAndSettle();
      expect(find.text('Enter 1 to 365 days'), findsOneWidget);
      await tester.enterText(field, '90');
      await tester.tap(find.byKey(const ValueKey('wallet-role-days-save')));
      await tester.pumpAndSettle();
      expect(repository.calls, ['update:teachers:custom:90']);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('revokes after confirming', (tester) async {
      final repository = await pump(tester);
      await tester.tap(find.byTooltip('Revoke access').first);
      await tester.pumpAndSettle();
      expect(find.text('Revoke Teachers?'), findsOneWidget);
      await tester.tap(find.text('Revoke access').last);
      await tester.pumpAndSettle();
      expect(repository.calls, ['revoke:teachers']);
      await tester.pump(const Duration(seconds: 5));
    });
  });
}
