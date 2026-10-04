import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/settings/view/settings_scoped_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show User;

import '../../helpers/pump_app.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

User _user(String id) => User(
  id: id,
  appMetadata: {},
  userMetadata: {},
  aud: 'authenticated',
  createdAt: '2026-01-01T00:00:00Z',
);

void main() {
  for (final actorChange in [true, false]) {
    final dimension = actorChange ? 'actor' : 'workspace';
    testWidgets('settings scope invalidates on $dimension ABA', (tester) async {
      final auth = _Auth();
      final workspace = _Workspace();
      final actorStream = StreamController<AuthState>.broadcast();
      final workspaceStream = StreamController<WorkspaceState>.broadcast();
      final initialActor = AuthState.authenticated(_user('actor'));
      const initialWorkspace = WorkspaceState(
        currentWorkspace: Workspace(id: 'ws', name: 'Synthetic'),
      );
      whenListen(auth, actorStream.stream, initialState: initialActor);
      whenListen(
        workspace,
        workspaceStream.stream,
        initialState: initialWorkspace,
      );
      late bool Function() isCurrent;
      await tester.pumpApp(
        MultiBlocProvider(
          providers: [
            BlocProvider<AuthCubit>.value(value: auth),
            BlocProvider<WorkspaceCubit>.value(value: workspace),
          ],
          child: Builder(
            builder: (context) => TextButton(
              onPressed: () => unawaited(
                pushScopedSettingsPage(
                  context,
                  builder: (_, current) {
                    isCurrent = current;
                    return const Scaffold(body: Text('Scoped settings'));
                  },
                ),
              ),
              child: const Text('Open'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('Open'));
      await tester.pumpAndSettle();
      expect(isCurrent(), isTrue);
      if (actorChange) {
        actorStream
          ..add(AuthState.authenticated(_user('other')))
          ..add(initialActor);
      } else {
        workspaceStream
          ..add(
            const WorkspaceState(
              currentWorkspace: Workspace(id: 'other', name: 'Other'),
            ),
          )
          ..add(initialWorkspace);
      }
      await tester.pumpAndSettle();
      expect(isCurrent(), isFalse);
      expect(find.text('Scoped settings'), findsNothing);
      await tester.pumpWidget(const SizedBox.shrink());
      await actorStream.close();
      await workspaceStream.close();
      await auth.close();
      await workspace.close();
    });
  }
}
