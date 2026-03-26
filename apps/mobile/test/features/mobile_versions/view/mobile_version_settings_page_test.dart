import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/mobile_version_policy.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/mobile_version_policy_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/features/mobile_versions/view/mobile_version_settings_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockMobileVersionPolicyRepository extends Mock
    implements MobileVersionPolicyRepository {}

class _MockWorkspacePermissionsRepository extends Mock
    implements WorkspacePermissionsRepository {}

void main() {
  setUpAll(() {
    registerFallbackValue(
      const MobileVersionPolicies(
        ios: MobilePlatformVersionPolicy(),
        android: MobilePlatformVersionPolicy(),
      ),
    );
  });

  group('MobileVersionSettingsPage', () {
    late _MockWorkspaceCubit workspaceCubit;
    late _MockMobileVersionPolicyRepository policyRepository;
    late _MockWorkspacePermissionsRepository permissionsRepository;

    setUp(() {
      workspaceCubit = _MockWorkspaceCubit();
      policyRepository = _MockMobileVersionPolicyRepository();
      permissionsRepository = _MockWorkspacePermissionsRepository();
    });

    testWidgets('shows the access-required state when permission is missing', (
      tester,
    ) async {
      const workspace = Workspace(id: rootWorkspaceId, name: 'Platform');
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: workspace,
        workspaces: [workspace],
      );

      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );
      when(
        () => permissionsRepository.getPermissions(wsId: rootWorkspaceId),
      ).thenAnswer(
        (_) async => const WorkspacePermissions(
          permissions: <String>{},
          isCreator: false,
        ),
      );

      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: MobileVersionSettingsPage(
            policyRepository: policyRepository,
            permissionsRepository: permissionsRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Access required'), findsOneWidget);
      verifyNever(() => policyRepository.getPolicies());
    });

    testWidgets('loads and saves policies for authorized internal admins', (
      tester,
    ) async {
      const workspace = Workspace(id: rootWorkspaceId, name: 'Platform');
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        currentWorkspace: workspace,
        workspaces: [workspace],
      );
      const initialPolicies = MobileVersionPolicies(
        ios: MobilePlatformVersionPolicy(
          effectiveVersion: '1.4.0',
          minimumVersion: '1.2.0',
          storeUrl: 'https://apps.apple.com/app/id1',
        ),
        android: MobilePlatformVersionPolicy(
          effectiveVersion: '1.3.0',
          minimumVersion: '1.1.0',
          storeUrl: 'https://play.google.com/store/apps/details?id=example.app',
        ),
      );

      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );
      when(
        () => permissionsRepository.getPermissions(wsId: rootWorkspaceId),
      ).thenAnswer(
        (_) async => const WorkspacePermissions(
          permissions: {manageWorkspaceRolesPermission},
          isCreator: false,
        ),
      );
      when(() => policyRepository.getPolicies()).thenAnswer(
        (_) async => initialPolicies,
      );
      when(() => policyRepository.updatePolicies(any())).thenAnswer(
        (invocation) async =>
            (invocation.positionalArguments.first as MobileVersionPolicies)
                .normalized(),
      );

      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: MobileVersionSettingsPage(
            policyRepository: policyRepository,
            permissionsRepository: permissionsRepository,
          ),
        ),
      );
      await tester.pumpAndSettle();

      await tester.enterText(
        find.byKey(const Key('ios.effectiveVersion')),
        ' 1.5.0 ',
      );
      await tester.pump();
      await tester.scrollUntilVisible(
        find.byKey(const Key('mobileVersionsSaveButton')),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      await tester.tap(find.byKey(const Key('mobileVersionsSaveButton')));
      await tester.pump();
      await tester.pumpAndSettle();

      verify(
        () => policyRepository.updatePolicies(
          const MobileVersionPolicies(
            ios: MobilePlatformVersionPolicy(
              effectiveVersion: '1.5.0',
              minimumVersion: '1.2.0',
              storeUrl: 'https://apps.apple.com/app/id1',
            ),
            android: MobilePlatformVersionPolicy(
              effectiveVersion: '1.3.0',
              minimumVersion: '1.1.0',
              storeUrl:
                  'https://play.google.com/store/apps/details?id=example.app',
            ),
          ),
        ),
      ).called(1);
      expect(find.text('Mobile version policy saved.'), findsOneWidget);
      await tester.drainShadToastTimers();
    });
  });
}
