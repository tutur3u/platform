import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/settings/cubit/experimental_apps_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

import '../../features/assistant/view/background_reply_harness.dart';
import 'store_team.dart';

/// The studio workspace, loaded, with no network behind it.
class StoreStudioWorkspace extends Cubit<WorkspaceState>
    implements WorkspaceCubit {
  StoreStudioWorkspace({String id = StoreTeam.workspaceId})
    : super(
        WorkspaceState(
          status: WorkspaceStatus.loaded,
          currentWorkspace: Workspace(
            id: id,
            name: StoreTeam.workspaceName,
            tier: workspaceTierPro,
          ),
        ),
      );

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

ShellProfileCubit _profile() {
  final profile = _Profile();
  whenListen(
    profile,
    const Stream<ShellProfileState>.empty(),
    initialState: ShellProfileState(
      userId: StoreTeam.me.id,
      profile: UserProfile(
        id: StoreTeam.me.id,
        displayName: StoreTeam.me.firstName,
        fullName: StoreTeam.me.name,
      ),
    ),
  );
  return profile;
}

void _mockShellChannels() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
    ..setMockMethodCallHandler(
      const MethodChannel('mobile/shell_back'),
      (call) async => null,
    )
    ..setMockMethodCallHandler(
      const MethodChannel('flutter_timezone'),
      (call) async => 'Asia/Ho_Chi_Minh',
    );
}

/// The app's real shell (header, dock or rail, chrome actions) around
/// [child] at [location], signed in as Linh in the studio workspace. Root
/// tabs (Home, Assistant) ignore [child]; pass their page builders instead.
Widget storeShellFrame({
  required String location,
  required Widget child,
  ReplyAuth? auth,
  Widget Function(int replayToken)? assistantPageBuilder,
  Widget Function(int replayToken)? homePageBuilder,
  List<BlocProvider> providers = const [],
  String workspaceId = StoreTeam.workspaceId,
}) {
  _mockShellChannels();
  final settings = SettingsRepository();
  return MultiBlocProvider(
    providers: [
      BlocProvider<AuthCubit>.value(value: auth ?? ReplyAuth()),
      BlocProvider<WorkspaceCubit>(
        create: (_) => StoreStudioWorkspace(id: workspaceId),
      ),
      BlocProvider<ShellProfileCubit>.value(value: _profile()),
      BlocProvider(create: (_) => ShellTitleOverrideCubit()),
      BlocProvider(create: (_) => ShellChromeActionsCubit()),
      BlocProvider(create: (_) => ShellMiniNavCubit()),
      BlocProvider(create: (_) => AssistantChromeCubit()),
      BlocProvider(create: (_) => AppTabCubit(settingsRepository: settings)),
      BlocProvider(
        create: (_) {
          final experiments = ExperimentalAppsCubit(
            settingsRepository: settings,
          );
          unawaited(experiments.load());
          return experiments;
        },
      ),
      ...providers,
    ],
    child: ShellPage(
      matchedLocation: location,
      enableDebugLogs: false,
      assistantPageBuilder: assistantPageBuilder,
      homePageBuilder: homePageBuilder,
      child: child,
    ),
  );
}
