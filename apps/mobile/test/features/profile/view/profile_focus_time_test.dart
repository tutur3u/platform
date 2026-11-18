import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/time_tracking/stats.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/profile/view/profile_focus_time_card.dart';
import 'package:mobile/features/profile/view/profile_focus_time_section.dart';
import 'package:mobile/features/profile/view/profile_identity_header.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';
import 'package:supabase_flutter/supabase_flutter.dart' as supa;

import '../../../helpers/helpers.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

const _stats = TimeTrackerStats(
  todayTime: 45 * 60,
  weekTime: 2 * 3600,
  monthTime: 3600 + 5 * 60,
);

void main() {
  testWidgets('Focus Time shows today, week and month; See all opens stats', (
    tester,
  ) async {
    var seeAll = 0;
    await tester.pumpApp(
      ProfileFocusTimeCard(stats: _stats, onSeeAll: () => seeAll++),
    );
    expect(find.text('Focus Time'), findsOneWidget);
    for (final value in ['45m', '2h', '1h 5m']) {
      expect(find.text(value), findsOneWidget, reason: value);
    }
    await tester.tap(find.text('See all'));
    expect(seeAll, 1);
  });

  testWidgets('dock re-select reloads Focus Time', (tester) async {
    final auth = _Auth();
    final workspace = _Workspace();
    when(() => auth.state).thenReturn(
      const AuthState.authenticated(
        supa.User(
          id: 'owner',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '',
        ),
      ),
    );
    when(() => workspace.state).thenReturn(
      const WorkspaceState(
        workspaces: [Workspace(id: 'personal', personal: true)],
        currentWorkspace: Workspace(id: 'personal', personal: true),
      ),
    );
    when(() => workspace.hasAuthenticatedActor).thenReturn(true);
    final requests = <String>[];
    final replay = ValueNotifier(0);
    await tester.pumpApp(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
        ],
        child: ValueListenableBuilder<int>(
          valueListenable: replay,
          builder: (_, token, _) => ProfileFocusTimeSection(
            replayToken: token,
            cacheUserId: () => 'owner',
            timezoneLoader: () async => 'Asia/Ho_Chi_Minh',
            statsLoader: (ws, user, timezone, {required personal}) async {
              requests.add('$ws:$user:$personal');
              return _stats;
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(requests, ['personal:owner:true']);
    expect(find.text('2h'), findsOneWidget);
    replay.value++;
    await tester.pumpAndSettle();
    expect(requests, hasLength(2));
    replay.dispose();
    await auth.close();
    await workspace.close();
  });

  testWidgets('identity header shows the bio under the name', (tester) async {
    await tester.pumpApp(
      const ProfileIdentityHeader(
        profile: UserProfile(
          id: 'owner',
          email: 'linh@example.test',
          displayName: 'Linh',
          bio: '  Designs calm tools.  ',
        ),
        loading: false,
      ),
    );
    expect(find.text('Designs calm tools.'), findsOneWidget);
    expect(
      tester.getTopLeft(find.text('Designs calm tools.')).dy,
      greaterThan(tester.getTopLeft(find.text('Linh')).dy),
    );
  });
}
