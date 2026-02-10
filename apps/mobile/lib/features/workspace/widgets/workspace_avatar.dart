import 'package:flutter/material.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// A widget that displays a workspace avatar with initials.
///
/// For personal workspaces, shows 'P' with primary background color.
/// For regular workspaces, shows the first letter of the name or 'W' as fallback.
class WorkspaceAvatar extends StatelessWidget {
  const WorkspaceAvatar({
    super.key,
    required this.workspace,
  });

  final Workspace workspace;

  @override
  Widget build(BuildContext context) {
    final initials = workspace.personal
        ? 'P'
        : (workspace.name != null && workspace.name!.isNotEmpty
            ? workspace.name![0].toUpperCase()
            : 'W');

    final backgroundColor = workspace.personal
        ? shad.Theme.of(context).colorScheme.primary
        : null;

    return shad.Avatar(
      initials: initials,
      backgroundColor: backgroundColor,
    );
  }
}
