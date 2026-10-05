import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/crm/view/crm_page.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/pump_app.dart';

class Permissions extends Mock implements WorkspacePermissionsRepository {
  Set<String> allowed = {'view_users_public_info'};
  @override
  Future<WorkspacePermissions> getPermissions({
    required String wsId,
    String? userId,
  }) async => WorkspacePermissions(permissions: allowed, isCreator: false);
}

class Repository extends Mock implements CrmRepository {
  final requests = <(String, int, String)>[];
  Future<CrmUsersResult> Function(String, int, String)? read;
  Future<List<CrmGroup>> Function()? readGroups;
  @override
  Future<List<CrmGroup>> getGroups(
    String wsId, {
    List<String>? ids,
    int page = 1,
    int pageSize = 200,
  }) async => await (readGroups?.call() ?? Future.value(<CrmGroup>[]));
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
    requests.add((wsId, page, query));
    return await (read?.call(wsId, page, query) ??
        Future.value(rows('Customer')));
  }
}

CrmUsersResult rows(String name, {int count = 1, bool privateInfo = false}) =>
    CrmUsersResult(
      users: [
        CrmUser(
          id: name,
          workspaceId: 'ws',
          fullName: name,
          email: 'synthetic@example.invalid',
        ),
      ],
      count: count,
      permissions: CrmUserPermissions(
        hasPrivateInfo: privateInfo,
        hasPublicInfo: true,
        canCheckUserAttendance: false,
      ),
    );

void main() {
  late Repository repository;
  late Permissions permissions;
  setUp(() {
    repository = Repository();
    permissions = Permissions();
  });
  Widget page({String actor = 'actor', String workspace = 'ws'}) =>
      CrmWorkspace(
        key: ValueKey('$actor:$workspace'),
        actorId: actor,
        workspaceId: workspace,
        repository: repository,
        permissionsRepository: permissions,
      );

  testWidgets('public-only detail does not reveal private fields', (
    tester,
  ) async {
    await tester.pumpApp(page());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Customer'));
    await tester.pumpAndSettle();
    expect(find.byType(SelectableText), findsNothing);
    expect(repository.requests, [('ws', 1, '')]);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'authorized private detail supports enlarged text without inner navbar',
    (tester) async {
      permissions.allowed.add('view_users_private_info');
      repository.read = (_, _, _) async => rows('Customer', privateInfo: true);
      await tester.pumpApp(
        MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(1.8)),
          child: page(),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Customer'));
      await tester.pumpAndSettle();
      expect(
        find.widgetWithText(SelectableText, 'synthetic@example.invalid'),
        findsOneWidget,
      );
      expect(find.byType(AppBar), findsNothing);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('switching workspace rejects an old deferred response', (
    tester,
  ) async {
    final old = Completer<CrmUsersResult>();
    repository.read = (ws, _, _) =>
        ws == 'ws' ? old.future : Future.value(rows('New scope'));
    await tester.pumpApp(page());
    await tester.pump(const Duration(milliseconds: 1));
    await tester.pumpApp(page(workspace: 'new-ws'));
    await tester.pumpAndSettle();
    old.complete(rows('Old scope'));
    await tester.pumpAndSettle();
    expect(find.text('New scope'), findsOneWidget);
    expect(find.text('Old scope'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('account switch closes only the old session edit sheet', (
    tester,
  ) async {
    permissions.allowed = {'view_users_public_info', 'update_users'};
    final actor = ValueNotifier('actor');
    addTearDown(actor.dispose);
    await tester.pumpApp(
      ValueListenableBuilder<String>(
        valueListenable: actor,
        builder: (_, value, _) => page(actor: value),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byType(PopupMenuButton<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit'));
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsWidgets);
    actor.value = 'new-actor';
    await tester.pumpAndSettle();
    expect(find.byType(TextField), findsNothing);
    expect(find.text('Customer'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('cold customer load reserves three rows and announces loading', (
    tester,
  ) async {
    final pending = Completer<CrmUsersResult>();
    repository.read = (_, _, _) => pending.future;
    await tester.pumpApp(page());
    await tester.pump(const Duration(milliseconds: 1));
    expect(find.byKey(const ValueKey('crm-skeleton-0')), findsOneWidget);
    expect(find.byKey(const ValueKey('crm-skeleton-2')), findsOneWidget);
    pending.complete(rows('Customer'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('crm-skeleton-0')), findsNothing);
  });

  testWidgets(
    'revoked private permission redacts an older cached row immediately',
    (tester) async {
      permissions.allowed.add('view_users_private_info');
      repository.read = (_, _, _) async => rows('Customer', privateInfo: true);
      await tester.pumpApp(page());
      await tester.pumpAndSettle();
      expect(find.text('synthetic@example.invalid'), findsOneWidget);
      permissions.allowed.remove('view_users_private_info');
      await tester.drag(find.byType(ListView).first, const Offset(0, 400));
      await tester.pumpAndSettle();
      expect(find.text('synthetic@example.invalid'), findsNothing);
      await tester.tap(find.text('Customer'));
      await tester.pumpAndSettle();
      expect(find.byType(SelectableText), findsNothing);
    },
  );

  testWidgets(
    'customer snapshot renders while optional group data is pending',
    (tester) async {
      permissions.allowed.add('view_user_groups');
      final pending = Completer<List<CrmGroup>>();
      repository.readGroups = () => pending.future;
      await tester.pumpApp(page());
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.text('Customer'), findsOneWidget);
      pending.complete([]);
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
    },
  );

  for (final challenge in [
    const ApiException(
      message: 'Synthetic verification challenge',
      statusCode: 403,
      isVerificationRequired: true,
    ),
    const ApiException(
      message: 'Synthetic MFA challenge',
      statusCode: 403,
      code: 'MFA_REQUIRED',
    ),
  ]) {
    testWidgets('${challenge.message} retains rows on refresh', (tester) async {
      await tester.pumpApp(page());
      await tester.pumpAndSettle();
      repository.read = (_, _, _) async => throw challenge;
      await tester.drag(find.byType(ListView).first, const Offset(0, 400));
      await tester.pumpAndSettle();
      expect(find.text('Customer'), findsOneWidget);
      await tester.drainShadToastTimers();
    });
    testWidgets('${challenge.message} retains rows on paging', (tester) async {
      repository.read = (_, page, _) async =>
          page == 1 ? rows('Customer', count: 20) : throw challenge;
      await tester.pumpApp(page());
      await tester.pumpAndSettle();
      expect(find.text('Customer'), findsOneWidget);
      expect(repository.requests.length, 2);
      await tester.drainShadToastTimers();
    });
    testWidgets(
      '${challenge.message} from groups does not suppress customers',
      (tester) async {
        permissions.allowed.add('view_user_groups');
        repository.readGroups = () async => throw challenge;
        await tester.pumpApp(page());
        await tester.pumpAndSettle();
        expect(find.text('Customer'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.drainShadToastTimers();
      },
    );
  }

  testWidgets('late page permission redaction updates the open detail row', (
    tester,
  ) async {
    permissions.allowed.add('view_users_private_info');
    final pending = Completer<CrmUsersResult>();
    repository.read = (_, page, _) => page == 1
        ? Future.value(rows('Customer', count: 20, privateInfo: true))
        : pending.future;
    await tester.pumpApp(page());
    await tester.pump(const Duration(milliseconds: 1));
    await tester.pump(const Duration(milliseconds: 1));
    await tester.tap(find.text('Customer'));
    await tester.pumpAndSettle();
    pending.complete(
      const CrmUsersResult(
        users: [
          CrmUser(
            id: 'Customer',
            workspaceId: 'ws',
            fullName: 'Customer',
            email: 'synthetic@example.invalid',
          ),
        ],
        count: 1,
        permissions: CrmUserPermissions(
          hasPrivateInfo: true,
          hasPublicInfo: false,
          canCheckUserAttendance: false,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Customer'), findsNothing);
    expect(
      find.widgetWithText(SelectableText, 'synthetic@example.invalid'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('permission denial does not request customers or audit', (
    tester,
  ) async {
    permissions.allowed = {};
    await tester.pumpApp(page());
    await tester.pumpAndSettle();
    expect(repository.requests, isEmpty);
    expect(find.text('Customer'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('short viewport auto-pages and deduplicates overlapping IDs', (
    tester,
  ) async {
    repository.read = (_, page, _) async => page == 1
        ? rows('Customer', count: 2)
        : const CrmUsersResult(
            users: [
              CrmUser(id: 'Customer', workspaceId: 'ws', fullName: 'Updated'),
              CrmUser(id: 'Second', workspaceId: 'ws', fullName: 'Second'),
            ],
            count: 2,
            permissions: CrmUserPermissions(
              hasPrivateInfo: false,
              hasPublicInfo: true,
              canCheckUserAttendance: false,
            ),
          );
    await tester.pumpApp(page());
    await tester.pumpAndSettle();
    expect(repository.requests.map((request) => request.$2), [1, 2]);
    expect(find.text('Updated'), findsOneWidget);
    expect(find.text('Second'), findsOneWidget);
    expect(find.text('Customer'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'empty page terminates automatic pagination despite a stale total',
    (tester) async {
      repository.read = (_, page, _) async => page == 1
          ? rows('Customer', count: 20)
          : const CrmUsersResult(users: [], count: 20);
      await tester.pumpApp(page());
      await tester.pumpAndSettle();
      expect(repository.requests.map((request) => request.$2), [1, 2]);
      await tester.pump(const Duration(seconds: 1));
      expect(repository.requests.length, 2);
    },
  );

  testWidgets('temporary refresh retains rows, definitive denial clears them', (
    tester,
  ) async {
    await tester.pumpApp(page());
    await tester.pumpAndSettle();
    repository.read = (_, _, _) async =>
        throw const ApiException.transport(message: 'Offline');
    await tester.drag(find.byType(ListView).first, const Offset(0, 400));
    await tester.pumpAndSettle();
    expect(find.text('Customer'), findsOneWidget);
    repository.read = (_, _, _) async =>
        throw const ApiException(message: 'Denied', statusCode: 403);
    await tester.drag(find.byType(ListView).first, const Offset(0, 400));
    await tester.pumpAndSettle();
    expect(find.text('Customer'), findsNothing);
    expect(tester.takeException(), isNull);
    await tester.drainShadToastTimers();
  });
}
