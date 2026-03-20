import 'package:flutter/material.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

/// Displays a workspace avatar with initials and a consistent color.
///
/// Personal workspaces use the primary theme color with 'P' initial.
/// Team workspaces get a unique color derived from the workspace ID
/// so each workspace has a recognizable, stable visual identity.
class WorkspaceAvatar extends StatelessWidget {
  const WorkspaceAvatar({
    required this.workspace,
    this.radius = 18,
    super.key,
  });

  final Workspace workspace;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final initials = workspace.personal
        ? 'P'
        : (workspace.name != null && workspace.name!.isNotEmpty
              ? workspace.name![0].toUpperCase()
              : 'W');

    final backgroundColor = workspace.personal
        ? theme.colorScheme.primary
        : _colorFromId(workspace.id);

    return CircleAvatar(
      radius: radius,
      backgroundColor: backgroundColor,
      foregroundImage: workspace.avatarUrl != null
          ? NetworkImage(workspace.avatarUrl!)
          : null,
      child: Text(
        initials,
        style: theme.typography.small.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  /// Generates a stable HSL color from a workspace ID hash.
  static Color _colorFromId(String id) {
    final hash = id.hashCode.abs();
    final hue = (hash % 360).toDouble();
    return HSLColor.fromAHSL(1, hue, 0.45, 0.55).toColor();
  }
}
