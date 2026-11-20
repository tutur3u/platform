import 'package:flutter/material.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/core/widgets/network_avatar.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/l10n/l10n.dart';

/// Server message for a failed workspace-admin request, or the generic
/// fallback when the server sent none.
String describeWorkspaceAdminError(BuildContext context, Object error) {
  if (error is ApiException && error.message.trim().isNotEmpty) {
    return error.message.trim();
  }
  return context.l10n.commonSomethingWentWrong;
}

/// Shows a workspace-admin failure as a destructive toast.
void showWorkspaceAdminError(BuildContext context, Object error) {
  showAppToast(
    context,
    message: describeWorkspaceAdminError(context, error),
    variant: AppAlertVariant.destructive,
  );
}

/// Round avatar with initials for a person row.
class WorkspacePersonAvatar extends StatelessWidget {
  const WorkspacePersonAvatar({
    required this.label,
    this.avatarUrl,
    this.size = AppLayout.rowLeadingSize,
    super.key,
  });

  final String label;
  final String? avatarUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final tokens = AppTokens.of(context);
    final c = tokens.colorScheme;
    return NetworkAvatar(
      avatarUrl: avatarUrl,
      radius: size / 2,
      backgroundColor: c.muted,
      child: Text(
        workspacePersonInitials(label),
        style: tokens.typography.small.copyWith(
          color: c.mutedForeground,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// One or two initials from a display label, email or handle.
String workspacePersonInitials(String label) {
  final cleaned = label.replaceFirst(RegExp('^@'), '').split('@').first.trim();
  if (cleaned.isEmpty) return '?';
  final words = cleaned
      .split(RegExp(r'[\s._-]+'))
      .where((word) => word.isNotEmpty)
      .toList(growable: false);
  if (words.length >= 2) {
    return '${words.first.characters.first}${words.last.characters.first}'
        .toUpperCase();
  }
  return words.first.characters.first.toUpperCase();
}

/// Compact role badges: the owner badge first, then up to [maxVisible] role
/// names and a "+n" badge for the rest.
class WorkspaceRoleBadges extends StatelessWidget {
  const WorkspaceRoleBadges({
    required this.roles,
    this.owner = false,
    this.pending = false,
    this.maxVisible = 2,
    super.key,
  });

  final List<String> roles;
  final bool owner;
  final bool pending;
  final int maxVisible;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final visible = roles.take(maxVisible).toList(growable: false);
    final hidden = roles.length - visible.length;
    return Wrap(
      spacing: AppSpacing.xs,
      runSpacing: AppSpacing.xs,
      children: [
        if (owner)
          AppBadge(
            variant: AppBadgeVariant.primary,
            child: Text(l10n.settingsWorkspaceMembersCreatorChip),
          ),
        if (pending)
          AppBadge(
            variant: AppBadgeVariant.warning,
            child: Text(l10n.settingsWorkspaceMembersPendingChip),
          ),
        for (final role in visible) AppBadge(child: Text(role)),
        if (hidden > 0) AppBadge.outline(child: Text('+$hidden')),
      ],
    );
  }
}
