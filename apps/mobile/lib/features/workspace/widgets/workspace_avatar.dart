import 'package:flutter/material.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';
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
    final isSystem = isSystemWorkspace(workspace);
    final size = radius * 2;
    final borderRadius = BorderRadius.circular(radius * 0.72);
    final initials = workspace.personal
        ? 'P'
        : isSystem
        ? 'S'
        : (workspace.name != null && workspace.name!.isNotEmpty
              ? workspace.name![0].toUpperCase()
              : 'W');

    final backgroundColor = workspace.personal
        ? theme.colorScheme.primary
        : _colorFromId(workspace.id);
    final imageProvider = isSystem
        ? const AssetImage('assets/logos/light.png') as ImageProvider<Object>
        : workspace.avatarUrl != null
        ? NetworkImage(workspace.avatarUrl!) as ImageProvider<Object>
        : null;
    final fallback = Center(
      child: Text(
        initials,
        style: theme.typography.small.copyWith(
          color: Colors.white,
          fontWeight: FontWeight.w700,
        ),
      ),
    );

    return ClipRRect(
      borderRadius: borderRadius,
      child: Container(
        width: size,
        height: size,
        color: backgroundColor,
        child: imageProvider != null
            ? Image(
                image: imageProvider,
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => fallback,
              )
            : fallback,
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
