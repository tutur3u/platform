import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';

/// Read the live session owner without assuming bootstrap has completed.
/// An absent auth client or signed-out session never supplies a fallback ID.
String? currentPersonalProfileUserId() {
  try {
    return supabase.auth.currentUser?.id;
  } on Object {
    return null;
  }
}

/// Only canonical memberships belonging to the live authenticated actor
/// qualify.
/// Neither an active team nor a guessed user/workspace ID is a fallback.
Workspace? verifiedPersonalProfileWorkspace({
  required String? userId,
  required String? cacheUserId,
  required WorkspaceCubit workspaces,
}) {
  if (userId == null ||
      userId != cacheUserId ||
      !workspaces.hasAuthenticatedActor) {
    return null;
  }
  final personal = workspaces.state.workspaces
      .where((workspace) => workspace.personal)
      .toList(growable: false);
  return personal.length == 1 ? personal.single : null;
}
