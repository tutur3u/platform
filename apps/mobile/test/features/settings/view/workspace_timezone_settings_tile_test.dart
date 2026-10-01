import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/settings/cubit/timezone_settings_cubit.dart';
import 'package:mobile/features/settings/view/timezone_settings_tile.dart';
import 'package:mobile/features/settings/view/workspace_timezone_settings_tile.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Cubit extends MockCubit<TimezoneSettingsState>
    implements TimezoneSettingsCubit {}

class _Permissions extends Mock implements WorkspacePermissionsRepository {}

void main() {
  late _Cubit cubit;
  late _Permissions repository;
  late ValueNotifier<(String, String, int)> scope;
  var mounted = false;
  setUp(() {
    cubit = _Cubit();
    repository = _Permissions();
    scope = ValueNotifier(('user', 'ws', 0));
    mounted = false;
    addTearDown(scope.dispose);
    addTearDown(cubit.close);
    const state = TimezoneSettingsState(loading: false, resolved: true);
    when(() => cubit.state).thenReturn(state);
    whenListen(
      cubit,
      const Stream<TimezoneSettingsState>.empty(),
      initialState: state,
    );
    when(
      () => cubit.load(
        userId: any(named: 'userId'),
        workspaceId: any(named: 'workspaceId'),
      ),
    ).thenAnswer((_) async {});
  });

  Future<void> pump(WidgetTester tester, String user, String workspace) async {
    scope.value = (user, workspace, scope.value.$3);
    if (mounted) {
      await tester.pump();
      return;
    }
    mounted = true;
    await tester.pumpApp(
      BlocProvider<TimezoneSettingsCubit>.value(
        value: cubit,
        child: ValueListenableBuilder<(String, String, int)>(
          valueListenable: scope,
          builder: (context, value, _) => WorkspaceTimezoneSettingsTile(
            userId: value.$1,
            workspaceId: value.$2,
            permissionsRepository: repository,
            refreshRevision: value.$3,
          ),
        ),
      ),
    );
  }

  for (final sample in [
    (
      'denied',
      const WorkspacePermissions(permissions: {}, isCreator: false),
      false,
    ),
    (
      'settings role',
      const WorkspacePermissions(
        permissions: {manageWorkspaceSettingsPermission},
        isCreator: false,
      ),
      true,
    ),
    (
      'admin',
      const WorkspacePermissions(permissions: {'admin'}, isCreator: false),
      true,
    ),
    (
      'creator',
      const WorkspacePermissions(permissions: {}, isCreator: true),
      true,
    ),
  ]) {
    testWidgets('workspace timezone permission: ${sample.$1}', (tester) async {
      when(
        () => repository.getPermissions(wsId: 'ws', userId: 'user'),
      ).thenAnswer((_) async => sample.$2);
      await pump(tester, 'user', 'ws');
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<TimezoneSettingsTile>(find.byType(TimezoneSettingsTile))
            .canManageWorkspace,
        sample.$3,
      );
      verify(
        () => repository.getPermissions(wsId: 'ws', userId: 'user'),
      ).called(1);
    });
  }

  for (final switchAccount in [false, true]) {
    testWidgets('stale ${switchAccount ? 'account' : 'workspace'} permission '
        'cannot enable editing', (tester) async {
      final old = Completer<WorkspacePermissions>();
      final current = Completer<WorkspacePermissions>();
      when(
        () => repository.getPermissions(wsId: 'ws', userId: 'user'),
      ).thenAnswer((_) => old.future);
      final newUser = switchAccount ? 'next-user' : 'user';
      final newWorkspace = switchAccount ? 'ws' : 'next-ws';
      when(
        () => repository.getPermissions(wsId: newWorkspace, userId: newUser),
      ).thenAnswer((_) => current.future);
      await pump(tester, 'user', 'ws');
      await tester.pump();
      await pump(tester, newUser, newWorkspace);
      await tester.pump();
      bool allowed() => tester
          .widget<TimezoneSettingsTile>(find.byType(TimezoneSettingsTile))
          .canManageWorkspace;
      expect(allowed(), isFalse);
      old.complete(
        const WorkspacePermissions(permissions: {'admin'}, isCreator: false),
      );
      await tester.pump();
      expect(allowed(), isFalse);
      current.complete(
        const WorkspacePermissions(permissions: {}, isCreator: false),
      );
      await tester.pumpAndSettle();
      expect(allowed(), isFalse);
    });
  }

  testWidgets('switching scope immediately clears an allowed editor', (
    tester,
  ) async {
    final next = Completer<WorkspacePermissions>();
    when(
      () => repository.getPermissions(wsId: 'ws', userId: 'user'),
    ).thenAnswer(
      (_) async => const WorkspacePermissions(
        permissions: {manageWorkspaceSettingsPermission},
        isCreator: false,
      ),
    );
    when(
      () => repository.getPermissions(wsId: 'next', userId: 'user'),
    ).thenAnswer((_) => next.future);
    await pump(tester, 'user', 'ws');
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<TimezoneSettingsTile>(find.byType(TimezoneSettingsTile))
          .canManageWorkspace,
      isTrue,
    );
    await pump(tester, 'user', 'next');
    expect(
      tester
          .widget<TimezoneSettingsTile>(find.byType(TimezoneSettingsTile))
          .canManageWorkspace,
      isFalse,
    );
    next.complete(
      const WorkspacePermissions(permissions: {}, isCreator: false),
    );
    await tester.pumpAndSettle();
  });

  testWidgets('refresh revalidates revoked workspace permission', (
    tester,
  ) async {
    var calls = 0;
    when(
      () => repository.getPermissions(wsId: 'ws', userId: 'user'),
    ).thenAnswer(
      (_) async => WorkspacePermissions(
        permissions: calls++ == 0 ? {'admin'} : {},
        isCreator: false,
      ),
    );
    await pump(tester, 'user', 'ws');
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<TimezoneSettingsTile>(find.byType(TimezoneSettingsTile))
          .canManageWorkspace,
      isTrue,
    );
    scope.value = ('user', 'ws', 1);
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<TimezoneSettingsTile>(find.byType(TimezoneSettingsTile))
          .canManageWorkspace,
      isFalse,
    );
    verify(
      () => repository.getPermissions(wsId: 'ws', userId: 'user'),
    ).called(2);
  });

  testWidgets('failed permissions keep workspace timezone read-only', (
    tester,
  ) async {
    when(
      () => repository.getPermissions(wsId: 'ws', userId: 'user'),
    ).thenThrow(Exception('unavailable'));
    await pump(tester, 'user', 'ws');
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<TimezoneSettingsTile>(find.byType(TimezoneSettingsTile))
          .canManageWorkspace,
      isFalse,
    );
  });
}
