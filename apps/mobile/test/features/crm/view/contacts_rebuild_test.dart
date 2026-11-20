import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/crm/view/contact_list_row.dart';
import 'package:mobile/features/crm/view/contact_merge_sheet.dart';
import 'package:mobile/features/crm/view/crm_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/design_render_harness.dart';
import '../../../helpers/pump_app.dart';

class _Permissions extends Mock implements WorkspacePermissionsRepository {
  Set<String> allowed = {'view_users_public_info'};

  @override
  Future<WorkspacePermissions> getPermissions({
    required String wsId,
    String? userId,
  }) async => WorkspacePermissions(permissions: allowed, isCreator: false);
}

class _Repository extends Mock implements CrmRepository {
  final requests = <String>[];

  @override
  int get groupDirectoryCount => 0;

  @override
  int get tagDirectoryCount => 0;

  @override
  Future<CrmAuditResult> getAuditLogs(
    String wsId, {
    required String start,
    required String end,
    String? eventKind,
    String? source,
    String? affectedUserQuery,
    String? actorQuery,
    int offset = 0,
    int limit = 100,
  }) async => const CrmAuditResult(
    count: 1,
    items: [
      CrmAuditEvent(
        auditRecordId: 1,
        eventKind: 'updated',
        summary: 'Raw summary',
        changedFields: ['display_name', 'phone'],
        fieldChanges: [
          CrmAuditFieldChange(
            field: 'display_name',
            label: 'Display name',
            before: 'Ada',
            after: 'Ada Lovelace',
          ),
          CrmAuditFieldChange(field: 'phone', label: 'Phone'),
        ],
        affectedUser: CrmAuditAffectedUser(id: 'contact', name: 'Ada Lovelace'),
        actor: CrmAuditActor(name: 'Grace Hopper'),
        occurredAt: '2026-11-20T12:00:00Z',
        source: 'live',
      ),
    ],
  );

  @override
  Future<List<CrmGroup>> getGroups(
    String wsId, {
    List<String>? ids,
    int page = 1,
    int pageSize = 200,
  }) async => const [];

  @override
  Future<List<CrmGroupTag>> getGroupTags(
    String wsId, {
    int page = 1,
    int pageSize = 100,
  }) async => const [];

  @override
  Future<CrmUsersResult> getUsers(
    String wsId, {
    String query = '',
    int page = 1,
    int pageSize = 20,
    List<String> includedGroups = const [],
    List<String> excludedGroups = const [],
    String status = 'active',
    String linkStatus = 'all',
    String requireAttention = 'all',
    String groupMembership = 'all',
    bool withPromotions = false,
  }) async {
    requests.add(query);
    final name = query.isEmpty ? 'Customer' : 'Ada Lovelace';
    return CrmUsersResult(
      users: [
        CrmUser(
          id: name,
          workspaceId: 'ws',
          fullName: name,
          email: query.isEmpty ? null : 'ada@example.com',
          phone: '+84 901 234 567 890',
        ),
      ],
      count: 1,
      permissions: const CrmUserPermissions(
        hasPrivateInfo: false,
        hasPublicInfo: true,
        canCheckUserAttendance: false,
      ),
    );
  }
}

void main() {
  for (final theme in ['light', 'dark']) {
    testWidgets('audit shows activity and changes in $theme mode', (
      tester,
    ) async {
      final nav = ShellMiniNavCubit();
      addTearDown(nav.close);
      DesignRender.setSize(tester, DesignRender.sizes['phone']!);
      await tester.runAsync(DesignRender.loadFonts);
      final (settings, brightness) = DesignRender.themes[theme]!;
      await tester.pumpWidget(
        DesignRenderApp(
          settings: settings,
          brightness: brightness,
          child: BlocProvider.value(
            value: nav,
            child: CrmWorkspace(
              actorId: 'actor',
              workspaceId: 'ws',
              repository: _Repository(),
              permissionsRepository: _Permissions()
                ..allowed.add('manage_workspace_audit_logs'),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      nav.state.resolveForLocation(Routes.contacts)!.items.last.onPressed!();
      await tester.pumpAndSettle();

      expect(find.text('Updated · Ada Lovelace'), findsOneWidget);
      expect(find.text('By Grace Hopper'), findsOneWidget);
      expect(find.textContaining('Nov 20, 2026'), findsOneWidget);
      expect(
        find.byWidgetPredicate(
          (widget) =>
              widget is Text && widget.semanticsLabel == 'Ada to Ada Lovelace',
        ),
        findsOneWidget,
      );
      expect(find.text('Something went wrong'), findsNothing);
      expect(find.text('Phone'), findsNothing);
      expect(find.textContaining('2026-11-20T'), findsNothing);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'contacts-audit-$theme');
    });
  }

  testWidgets('list row shows one name and does not wrap the phone', (
    tester,
  ) async {
    const user = CrmUser(
      id: '1',
      workspaceId: 'ws',
      displayName: 'Ada Lovelace   Ada Lovelace',
      fullName: 'Ada  Lovelace',
      phone: '+84 901 234 567 890 extra',
    );
    await tester.pumpThemedHome(const ContactListRow(user: user));
    await tester.pumpAndSettle();
    expect(find.text('Ada Lovelace'), findsOneWidget);
    expect(find.text('AL'), findsOneWidget);
    final phone = tester.widget<Text>(find.textContaining('+84'));
    expect(phone.maxLines, 1);
    expect(phone.softWrap, isNot(false));

    await tester.pumpThemedHome(
      const ContactListRow(user: user),
      brightness: Brightness.dark,
    );
    await tester.pumpAndSettle();
    expect(find.text('Ada Lovelace'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('search is the primary dock action and filters the list', (
    tester,
  ) async {
    final repository = _Repository();
    final permissions = _Permissions();
    final chrome = ShellChromeActionsCubit();
    final nav = ShellMiniNavCubit();
    addTearDown(chrome.close);
    addTearDown(nav.close);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider.value(value: chrome),
          BlocProvider.value(value: nav),
        ],
        child: CrmWorkspace(
          actorId: 'actor',
          workspaceId: 'ws',
          repository: repository,
          permissionsRepository: permissions,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Users'), findsNothing);
    expect(find.text('Back'), findsNothing);
    final items = nav.state.resolveForLocation(Routes.contacts)!.items;
    expect(items.map((item) => item.id), ['crm-users', 'crm-audit']);
    expect(items.map((item) => item.label), ['Contacts', 'Audit log']);

    final dock = chrome.state
        .resolveForLocation(Routes.contacts)
        .where((action) => action.inDock);
    expect(dock.first.id, 'crm-search');
    dock.first.onPressed!.call();
    await tester.pumpAndSettle();
    final search = chrome.state
        .resolveForLocation(Routes.contacts)
        .firstWhere((action) => action.id == 'crm-search');
    search.searchController!.text = 'Ada';
    search.onSearchChanged!('Ada');
    await tester.pump(const Duration(milliseconds: 350));
    await tester.pumpAndSettle();
    expect(repository.requests, contains('Ada'));
    expect(find.text('Ada Lovelace'), findsWidgets);
    expect(find.text('Customer'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('merge keeps one name and sends the other record', (
    tester,
  ) async {
    (String, String)? merged;
    await tester.pumpThemedHome(
      ContactMergeSheet(
        result: const CrmDuplicateDetectionResult(
          totalDuplicates: 1,
          clusters: [
            CrmDuplicateCluster(
              clusterId: 7,
              matchReason: 'email',
              suggestedTargetId: 'keep',
              users: [
                CrmDuplicateUser(
                  id: 'drop',
                  isLinked: false,
                  fullName: 'Ada Lovelace Ada Lovelace',
                  phone: '+84 901 234 567 890 extra',
                ),
                CrmDuplicateUser(
                  id: 'keep',
                  isLinked: true,
                  fullName: 'Ada Lovelace',
                  email: 'ada@example.com',
                ),
              ],
            ),
          ],
        ),
        onMerge: (sourceId, targetId) async {
          merged = (sourceId, targetId);
          return const CrmMergeResult(success: true, message: 'success');
        },
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Ada Lovelace Ada Lovelace'), findsNothing);
    expect(find.text('Ada Lovelace'), findsWidgets);
    final phone = tester.widget<Text>(find.textContaining('+84'));
    expect(phone.maxLines, 1);
    await tester.tap(find.byKey(const ValueKey('contact-merge-7')));
    await tester.pumpAndSettle();
    expect(merged, ('drop', 'keep'));
    expect(tester.takeException(), isNull);
  });
}
