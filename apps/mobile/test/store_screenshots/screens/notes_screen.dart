import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/notes/notes_page.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

import '../fixtures/notes_fixture.dart';
import '../fixtures/store_team.dart';
import '../store_screenshot_app.dart';

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

/// Notes: the studio's launch-week notes with the design review recap open,
/// its follow-ups linked to board tasks.
const notesStoreScreen = StoreScreen(
  id: 'notes',
  order: 8,
  shellLocation: Routes.notes,
  build: _build,
  prepare: _openReview,
);

const _studio = Workspace(
  id: StoreTeam.workspaceId,
  name: StoreTeam.workspaceName,
  tier: workspaceTierPro,
);

/// The voice-note recorder registers with its plugin when the page mounts;
/// a test binding has no audio plugin, so answer it like an idle recorder.
void _stubRecorderPlugin() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
        const MethodChannel('com.llfbandit.record/messages'),
        (call) async => switch (call.method) {
          'hasPermission' ||
          'isRecording' ||
          'isPaused' ||
          'isEncoderSupported' => false,
          _ => null,
        },
      );
}

Widget _build(StoreLocale l) {
  _stubRecorderPlugin();
  final workspaces = _Workspaces();
  whenListen(
    workspaces,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: _studio,
      workspaces: [_studio],
    ),
  );
  return MultiBlocProvider(
    providers: [
      BlocProvider<WorkspaceCubit>.value(value: workspaces),
      BlocProvider(create: (_) => ShellChromeActionsCubit()),
    ],
    child: NotesPage(repository: StoreNoteRepository(l)),
  );
}

/// Phones keep the grouped list; wider layouts open the review recap beside
/// it, as a reader would by tapping it.
Future<void> _openReview(WidgetTester tester, StoreLocale l) async {
  final view = tester.view;
  final width = view.physicalSize.width / view.devicePixelRatio;
  if (Breakpoints.fromWidth(width) == DeviceClass.compact) return;
  await tester.tap(find.text(StoreNotes.reviewTitle(l)).first);
}
