import 'package:flutter/material.dart';
import 'package:mobile/core/ui/tokens/app_tokens.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/workspace_presentation.dart';

/// Identity tile of a workspace: its avatar image, or initials on the
/// workspace's brand colour ([workspaceAccent]).
///
/// The colour comes from the workspace id, so a workspace keeps one
/// recognisable colour across renames, devices and appearance themes. The
/// internal root workspace shows the Tuturuuu logo. The tile is decorative;
/// rows announce the workspace name.
class WorkspaceAvatar extends StatelessWidget {
  const WorkspaceAvatar({required this.workspace, this.radius = 18, super.key});

  final Workspace workspace;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    final accent = workspaceAccent(workspace);
    final size = radius * 2;
    final borderRadius = BorderRadius.circular(radius * 0.64);
    final initials = workspaceInitials(
      displayWorkspacePickerName(context, workspace),
    );
    final fallback = ColoredBox(
      color: accent.fill(c.brightness),
      child: Center(
        child: Text(
          initials,
          maxLines: 1,
          textScaler: TextScaler.noScaling,
          style: tokens.typography.small.copyWith(
            color: accent.onFill(c.brightness),
            fontSize: radius * (initials.length > 1 ? 0.72 : 0.86),
            fontWeight: FontWeight.w700,
            height: 1,
            letterSpacing: 0.2,
          ),
        ),
      ),
    );

    final Widget content;
    if (isSystemWorkspace(workspace)) {
      content = ColoredBox(
        color: c.card,
        child: Padding(
          padding: EdgeInsets.all(radius * 0.32),
          child: Image.asset(
            'assets/logos/transparent.png',
            fit: BoxFit.contain,
            errorBuilder: (_, _, _) => fallback,
          ),
        ),
      );
    } else if (workspace.avatarUrl case final url? when url.isNotEmpty) {
      content = Image.network(
        url,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => fallback,
        loadingBuilder: (_, child, progress) =>
            progress == null ? child : fallback,
      );
    } else {
      content = fallback;
    }

    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          borderRadius: borderRadius,
          border: Border.all(
            color: c.border.withValues(alpha: 0.5),
            width: 0.5,
          ),
        ),
        clipBehavior: Clip.antiAlias,
        child: content,
      ),
    );
  }
}
