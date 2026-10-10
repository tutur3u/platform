import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/data/assistant_personal_settings_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_personal_settings_section.dart';
import 'package:mobile/features/assistant/widgets/assistant_personality_field_editor.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/settings_scoped_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../../helpers/pump_app.dart';
import '../assistant_personal_settings_harness.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

AuthState _actor(String id) => AuthState.authenticated(
  User(
    id: id,
    appMetadata: const {},
    userMetadata: const {},
    aud: 'authenticated',
    createdAt: '2026-01-01T00:00:00Z',
  ),
);
WorkspaceState _workspace(String id) => WorkspaceState(
  status: WorkspaceStatus.loaded,
  currentWorkspace: Workspace(id: id),
);

void main() {
  for (final scope in ['actor', 'logout', 'workspace']) {
    for (final operation in ['load', 'save', 'covered save']) {
      testWidgets('scoped personality $operation cancels on $scope ABA', (
        tester,
      ) async {
        final accounts = StreamController<AuthState>.broadcast();
        final scopes = StreamController<WorkspaceState>.broadcast();
        final auth = _Auth();
        final workspaces = _Workspaces();
        whenListen(auth, accounts.stream, initialState: _actor('actor-a'));
        whenListen(
          workspaces,
          scopes.stream,
          initialState: _workspace('workspace-a'),
        );
        addTearDown(accounts.close);
        addTearDown(scopes.close);
        final read = Completer<AssistantPersonalSettingsSnapshot>();
        final write = Completer<AssistantSoul>();
        final repository = SettingsRepository();
        if (operation == 'load') repository.read = () => read.future;
        await tester.pumpApp(
          MultiBlocProvider(
            providers: [
              BlocProvider<AuthCubit>.value(value: auth),
              BlocProvider<WorkspaceCubit>.value(value: workspaces),
            ],
            child: Builder(
              builder: (context) => TextButton(
                onPressed: () => unawaited(
                  pushScopedSettingsPage(
                    context,
                    rootNavigator: true,
                    builder: (_, isCurrent) => SingleChildScrollView(
                      child: AssistantPersonalSettingsSection(
                        workspaceId: 'workspace-a',
                        isScopeCurrent: isCurrent,
                        currentUserId: () => auth.state.user?.id,
                        repository: repository,
                      ),
                    ),
                  ),
                ),
                child: const Text('Open settings'),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Open settings'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
        NavigatorState? navigator;
        if (operation != 'load') {
          await tester.pumpAndSettle();
          await tester.tap(find.text('Personality'));
          await tester.pumpAndSettle();
          await tester.tap(
            find.byKey(const ValueKey('assistant-personality-name')),
          );
          await tester.pumpAndSettle();
          await tester.enterText(
            find.byType(TextFormField),
            'Synthetic late name',
          );
          repository.write = (_) => write.future;
          await tester.tap(find.widgetWithText(FilledButton, 'Save'));
          await tester.pump();
          if (operation == 'covered save') {
            navigator = Navigator.of(
              tester.element(find.byType(AssistantPersonalityFieldEditor)),
            );
            unawaited(
              navigator.push<void>(
                MaterialPageRoute<void>(
                  builder: (_) =>
                      const Material(child: Text('Unrelated covering route')),
                ),
              ),
            );
            await tester.pumpAndSettle();
          }
        }
        if (scope == 'workspace') {
          scopes
            ..add(_workspace('workspace-b'))
            ..add(_workspace('workspace-a'));
        } else {
          accounts
            ..add(
              scope == 'logout'
                  ? const AuthState.unauthenticated()
                  : _actor('actor-b'),
            )
            ..add(_actor('actor-a'));
        }
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
        read.complete(
          const AssistantPersonalSettingsSnapshot(
            soul: AssistantSoul(name: 'Synthetic stale load'),
            memoryEnabled: false,
            memories: [],
          ),
        );
        write.complete(const AssistantSoul(name: 'Synthetic late name'));
        await tester.pumpAndSettle();
        expect(
          find.byType(AssistantPersonalSettingsSection, skipOffstage: false),
          findsNothing,
        );
        expect(
          find.byType(AssistantPersonalityFieldEditor, skipOffstage: false),
          findsNothing,
        );
        expect(find.text('Synthetic stale load'), findsNothing);
        expect(find.text('Synthetic late name'), findsNothing);
        if (operation == 'covered save') {
          expect(find.text('Unrelated covering route'), findsOneWidget);
          navigator!.pop();
          await tester.pumpAndSettle();
        }
        expect(find.text('Open settings'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }
}
