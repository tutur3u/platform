import 'dart:async';
import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/api_exception.dart';
import 'package:mobile/features/assistant/data/assistant_memory_edit.dart';
import 'package:mobile/features/assistant/widgets/assistant_personal_settings_section.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
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
    for (final operation in ['load', 'save', 'review']) {
      testWidgets('actual $scope change cancels modal during held '
          '$operation, ABA cannot revive', (tester) async {
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
        final repository = SettingsRepository();
        await tester.pumpApp(
          MultiBlocProvider(
            providers: [
              BlocProvider<AuthCubit>.value(value: auth),
              BlocProvider<WorkspaceCubit>.value(value: workspaces),
            ],
            child: AssistantPersonalSettingsSection(
              workspaceId: 'workspace-a',
              isScopeCurrent: () =>
                  workspaces.state.currentWorkspace?.id == 'workspace-a',
              currentUserId: () => auth.state.user?.id,
              repository: repository,
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('Memory'));
        await tester.pumpAndSettle();
        final read = Completer<EditableAssistantMemory>();
        final write = Completer<AssistantMemoryEditReceipt>();
        if (operation == 'load') repository.readEdit = () => read.future;
        await tester.tap(find.text('Synthetic preference'));
        await tester.pump();
        await tester.pump(const Duration(milliseconds: 500));
        if (operation != 'load') {
          await tester.pumpAndSettle();
          await tester.enterText(
            find.byType(TextFormField),
            'Private late edit',
          );
          repository.updateEdit = operation == 'save'
              ? (_, _) => write.future
              : (_, _) => Future.error(
                  const ApiException(
                    message: 'Synthetic conflict',
                    statusCode: 409,
                  ),
                );
          await tester.pump();
          await tester.ensureVisible(find.text('Save'));
          await tester.tap(find.text('Save'));
          await tester.pump();
          if (operation == 'review') {
            await tester.pumpAndSettle();
            repository.readEdit = () => read.future;
            await tester.ensureVisible(find.text('Review latest version'));
            await tester.tap(find.text('Review latest version'));
            await tester.pump();
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
          const EditableAssistantMemory(
            id: 'memory-a',
            content: 'Private stale source',
            revision: 'v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
          ),
        );
        write.complete(
          const AssistantMemoryEditReceipt(
            memory: EditableAssistantMemory(
              id: 'memory-a',
              content: 'Private late edit',
              revision: 'v1:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
            ),
            auditRecorded: true,
          ),
        );
        await tester.pumpAndSettle();
        expect(find.byType(TextFormField), findsNothing);
        expect(find.text('Private stale source'), findsNothing);
        expect(find.text('Private late edit'), findsNothing);
        expect(find.text('Synthetic preference'), findsOneWidget);
        await tester.pumpWidget(const SizedBox.shrink());
      });
    }
  }
}
