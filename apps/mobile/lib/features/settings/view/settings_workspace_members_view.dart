import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/features/settings/view/workspace_admin_widgets.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

/// Members, pending invitations and invite links of one workspace.
///
/// Pure presentation: the page owns loading, permissions and mutations.
class WorkspaceMembersView extends StatelessWidget {
  const WorkspaceMembersView({
    required this.workspaceId,
    required this.loading,
    required this.canManage,
    required this.members,
    required this.inviteLinks,
    required this.onRetry,
    required this.onOpenMember,
    required this.onRevokeInvite,
    required this.onCopyLink,
    required this.onDeleteLink,
    required this.onCreateLink,
    this.error,
    this.query = '',
    super.key,
  });

  final String workspaceId;
  final bool loading;
  final bool canManage;
  final String? error;
  final String query;
  final List<WorkspaceMemberListItem> members;
  final List<WorkspaceInviteLink> inviteLinks;
  final VoidCallback onRetry;
  final ValueChanged<WorkspaceMemberListItem> onOpenMember;
  final ValueChanged<WorkspaceMemberListItem> onRevokeInvite;
  final ValueChanged<WorkspaceInviteLink> onCopyLink;
  final ValueChanged<WorkspaceInviteLink> onDeleteLink;
  final VoidCallback onCreateLink;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (loading) {
      return AppGroupedSection(
        caption: l10n.settingsWorkspaceMembersTitle,
        children: const [AppSkeletonRows(count: 4)],
      );
    }
    if (error case final error?) {
      return AppStateMessage(
        icon: LucideIcons.circleAlert,
        tone: AppTone.destructive,
        title: l10n.commonSomethingWentWrong,
        message: error,
        actionLabel: l10n.commonRetry,
        onAction: onRetry,
      );
    }
    if (!canManage) {
      return AppStateMessage(
        icon: LucideIcons.lock,
        title: l10n.settingsWorkspaceMembersAccessDenied,
      );
    }

    final filtered = filterWorkspaceMembers(members, query);
    final active = filtered.where((member) => !member.pending).toList();
    final pending = filtered.where((member) => member.pending).toList();
    final searching = query.trim().isNotEmpty;

    if (searching && filtered.isEmpty) {
      return AppStateMessage(
        icon: LucideIcons.searchX,
        title: l10n.commonNoSearchResults,
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppGroupedSection.spaced(
          caption: l10n.settingsWorkspaceMembersActiveSection(active.length),
          children: active.isEmpty
              ? [
                  AppStateMessage.inline(
                    icon: LucideIcons.users,
                    title: l10n.settingsWorkspaceMembersEmpty,
                  ),
                ]
              : [
                  for (final member in active)
                    _frame(
                      member.id,
                      [?member.email],
                      _MemberRow(
                        member: member,
                        onTap: () => onOpenMember(member),
                      ),
                    ),
                ],
        ),
        if (pending.isNotEmpty)
          AppGroupedSection.spaced(
            caption: l10n.settingsWorkspaceMembersPendingSection(
              pending.length,
            ),
            children: [
              for (final member in pending)
                _frame(
                  member.id,
                  [?member.email],
                  _PendingInviteRow(
                    member: member,
                    onRevoke: () => onRevokeInvite(member),
                  ),
                ),
            ],
          ),
        if (!searching)
          AppGroupedSection(
            caption: l10n.settingsWorkspaceMembersLinksSection,
            children: [
              for (final link in inviteLinks)
                _frame(
                  link.id,
                  const [],
                  _InviteLinkRow(
                    link: link,
                    onCopy: () => onCopyLink(link),
                    onDelete: () => onDeleteLink(link),
                  ),
                ),
              AppGroupedRow(
                key: const ValueKey('workspace-members-create-link'),
                leading: const AppIconTile(
                  icon: LucideIcons.link,
                  tone: AppTone.primary,
                ),
                title: Text(l10n.settingsWorkspaceMembersLinkAction),
                onTap: onCreateLink,
              ),
            ],
          ),
      ],
    );
  }

  Widget _frame(String entityId, List<String> related, Widget child) =>
      PendingSyncFrame(
        workspaceId: workspaceId,
        entityId: entityId,
        feature: 'workspace-management',
        relatedEntityIds: related,
        child: child,
      );
}

/// Members whose name, email, handle or role names contain [query].
List<WorkspaceMemberListItem> filterWorkspaceMembers(
  List<WorkspaceMemberListItem> members,
  String query,
) {
  final needle = query.trim().toLowerCase();
  final sorted = [...members]
    ..sort((a, b) {
      if (a.isCreator != b.isCreator) return a.isCreator ? -1 : 1;
      return a.label.toLowerCase().compareTo(b.label.toLowerCase());
    });
  if (needle.isEmpty) return sorted;
  return sorted
      .where(
        (member) => [
          member.label,
          member.email,
          member.handle,
          ...member.roles.map((role) => role.name),
        ].any((value) => value?.toLowerCase().contains(needle) ?? false),
      )
      .toList(growable: false);
}

class _MemberRow extends StatelessWidget {
  const _MemberRow({required this.member, required this.onTap});

  final WorkspaceMemberListItem member;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final email = member.email;
    final roles = member.roles.map((role) => role.name).toList();
    return AppGroupedRow(
      key: ValueKey('workspace-member-${member.id}'),
      leading: WorkspacePersonAvatar(
        label: member.label,
        avatarUrl: member.avatarUrl,
      ),
      title: Text(member.label),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (email != null && email != member.label)
            Text(email, maxLines: 1, overflow: TextOverflow.ellipsis),
          if (member.isCreator || roles.isNotEmpty) ...[
            const SizedBox(height: AppSpacing.xs),
            WorkspaceRoleBadges(roles: roles, owner: member.isCreator),
          ],
        ],
      ),
      showChevron: true,
      onTap: onTap,
    );
  }
}

class _PendingInviteRow extends StatelessWidget {
  const _PendingInviteRow({required this.member, required this.onRevoke});

  final WorkspaceMemberListItem member;
  final VoidCallback onRevoke;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return AppGroupedRow(
      key: ValueKey('workspace-invite-${member.email ?? member.id}'),
      leading: const AppIconTile(
        icon: LucideIcons.mailQuestionMark,
        tone: AppTone.warning,
      ),
      title: Text(member.email ?? member.label),
      subtitle: const WorkspaceRoleBadges(roles: [], pending: true),
      trailing: AppIconButton(
        tooltip: l10n.settingsWorkspaceMembersRevokeTitle,
        icon: const Icon(LucideIcons.x),
        onPressed: onRevoke,
      ),
    );
  }
}

class _InviteLinkRow extends StatelessWidget {
  const _InviteLinkRow({
    required this.link,
    required this.onCopy,
    required this.onDelete,
  });

  final WorkspaceInviteLink link;
  final VoidCallback onCopy;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final expiresAt = DateTime.tryParse(link.expiresAt ?? '')?.toLocal();
    final expiry = expiresAt == null
        ? l10n.settingsWorkspaceMembersLinkNever
        : l10n.settingsWorkspaceMembersLinkExpires(
            DateFormat.yMMMd(
              Localizations.localeOf(context).toLanguageTag(),
            ).format(expiresAt),
          );
    final uses = link.maxUses == null
        ? '${link.currentUses}'
        : '${link.currentUses}/${link.maxUses}';
    final usable = !link.isExpired && !link.isFull;
    final status = link.isExpired
        ? l10n.settingsWorkspaceMembersLinkExpired
        : link.isFull
        ? l10n.settingsWorkspaceMembersLinkFull
        : l10n.settingsWorkspaceMembersLinkActive;
    return AppGroupedRow(
      key: ValueKey('workspace-invite-link-${link.id}'),
      leading: AppIconTile(
        icon: LucideIcons.link2,
        tone: usable ? AppTone.success : AppTone.neutral,
      ),
      title: Text(link.code, maxLines: 1, overflow: TextOverflow.ellipsis),
      subtitle: Wrap(
        spacing: AppSpacing.xs,
        runSpacing: AppSpacing.xs,
        crossAxisAlignment: WrapCrossAlignment.center,
        children: [
          AppBadge(
            variant: usable
                ? AppBadgeVariant.success
                : AppBadgeVariant.secondary,
            child: Text(status),
          ),
          Text(l10n.settingsWorkspaceMembersLinkUsage(uses, expiry)),
        ],
      ),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (usable)
            AppIconButton(
              tooltip: l10n.settingsWorkspaceMembersLinkCopy,
              icon: const Icon(LucideIcons.copy),
              onPressed: onCopy,
            ),
          AppIconButton(
            tooltip: l10n.settingsWorkspaceMembersLinkDeleteTitle,
            icon: const Icon(LucideIcons.trash2),
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}
