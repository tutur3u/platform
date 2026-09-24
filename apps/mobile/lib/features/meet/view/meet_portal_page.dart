import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/features/meet/data/meet_room_code.dart';
import 'package:mobile/features/meet/view/meet_native_room_page.dart';
import 'package:mobile/features/meet/view/meet_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

/// Keeps the public Meet route while rendering list and calls natively.
class MeetPortalPage extends StatelessWidget {
  const MeetPortalPage({super.key});

  @override
  Widget build(BuildContext context) {
    final workspaceId = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    if (workspaceId == null) return const SizedBox.shrink();
    final code = GoRouterState.of(context).uri.queryParameters['room'];
    final meetingId = code == null ? null : decodeMeetRoomCode(code);
    if (meetingId == null) return const MeetPage();
    return MeetNativeRoomPage(
      key: ValueKey((workspaceId, meetingId)),
      workspaceId: workspaceId,
      meetingId: meetingId,
    );
  }
}
