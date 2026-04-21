import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/workspace_management.dart';
import 'package:mobile/data/repositories/workspace_management_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/async_delete_confirmation_dialog.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class SettingsWorkspaceMembersPage extends StatelessWidget {
  const SettingsWorkspaceMembersPage({super.key});

  @override
  Widget build(BuildContext context) {
    return RepositoryProvider(
      create: (_) => WorkspaceManagementRepository(),
      child: const _SettingsWorkspaceMembersView(),
    );
  }
}

class _SettingsWorkspaceMembersView extends StatefulWidget {
  const _SettingsWorkspaceMembersView();

  @override
  State<_SettingsWorkspaceMembersView> createState() =>
      _SettingsWorkspaceMembersViewState();
}

class _SettingsWorkspaceMembersViewState
    extends State<_SettingsWorkspaceMembersView> {
  late final WorkspacePermissionsRepository _permissionsRepository;

  bool _loading = true;
  bool _canManageMembers = false;
  String? _error;
  List<WorkspaceMemberListItem> _members = const [];
  List<WorkspaceInviteLink> _inviteLinks = const [];

  @override
  void initState() {
    super.initState();
    _permissionsRepository = WorkspacePermissionsRepository();
    unawaited(_loadData());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final horizontalPadding = ResponsivePadding.horizontal(
      context.deviceClass,
    );
    final activeMembers = _members.where((member) => !member.pending).toList();
    final pendingMembers = _members.where((member) => member.pending).toList();

    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (context, state) => unawaited(_loadData()),
      child: shad.Scaffold(
        child: RefreshIndicator.adaptive(
          onRefresh: _loadData,
          child: ResponsiveWrapper(
            maxWidth: ResponsivePadding.maxContentWidth(context.deviceClass),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(
                parent: BouncingScrollPhysics(),
              ),
              padding: EdgeInsets.fromLTRB(
                horizontalPadding,
                20,
                horizontalPadding,
                32,
              ),
              children: [
                FinancePanel(
                  radius: 26,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          FinanceStatChip(
                            label: l10n.settingsWorkspaceMembersTitle,
                            value: '${activeMembers.length}',
                            icon: Icons.group_outlined,
                          ),
                          FinanceStatChip(
                            label: l10n.settingsWorkspaceMembersPendingChip,
                            value: '${pendingMembers.length}',
                            icon: Icons.mark_email_unread_outlined,
                          ),
                          FinanceStatChip(
                            label: l10n.settingsWorkspaceMembersLinksSection,
                            value: '${_inviteLinks.length}',
                            icon: Icons.link_rounded,
                          ),
                        ],
                      ),
                      const shad.Gap(14),
                      Wrap(
                        spacing: 10,
                        runSpacing: 10,
                        children: [
                          shad.OutlineButton(
                            onPressed: !_canManageMembers || _loading
                                ? null
                                : _onCreateInviteLink,
                            child: Text(
                              l10n.settingsWorkspaceMembersLinkAction,
                            ),
                          ),
                          shad.PrimaryButton(
                            onPressed: !_canManageMembers || _loading
                                ? null
                                : _onInviteMember,
                            child: Text(
                              l10n.settingsWorkspaceMembersInviteAction,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const shad.Gap(16),
                if (_loading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 48),
                    child: Center(child: shad.CircularProgressIndicator()),
                  )
                else if (_error != null)
                  _MembersStatePanel(
                    message: _error!,
                    actionLabel: l10n.commonRetry,
                    onPressed: _loadData,
                  )
                else if (!_canManageMembers)
                  _MembersStatePanel(
                    message: l10n.settingsWorkspaceMembersAccessDenied,
                  )
                else ...[
                  FinanceSectionHeader(
                    title: l10n.settingsWorkspaceMembersActiveSection(
                      activeMembers.length,
                    ),
                  ),
                  const shad.Gap(10),
                  if (activeMembers.isEmpty)
                    _MembersStatePanel(
                      message: l10n.settingsWorkspaceMembersEmpty,
                    )
                  else
                    ...activeMembers.map(
                      (member) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _MemberCard(
                          member: member,
                          onRemove: member.isCreator
                              ? null
                              : () => _onRemoveMember(member),
                        ),
                      ),
                    ),
                  const shad.Gap(18),
                  FinanceSectionHeader(
                    title: l10n.settingsWorkspaceMembersPendingSection(
                      pendingMembers.length,
                    ),
                  ),
                  const shad.Gap(10),
                  if (pendingMembers.isEmpty)
                    _MembersStatePanel(
                      message: l10n.settingsWorkspaceMembersPendingEmpty,
                    )
                  else
                    ...pendingMembers.map(
                      (member) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _MemberCard(
                          member: member,
                          onRemove: () => _onRemoveMember(member),
                        ),
                      ),
                    ),
                  const shad.Gap(18),
                  FinanceSectionHeader(
                    title: l10n.settingsWorkspaceMembersLinksSection,
                  ),
                  const shad.Gap(10),
                  if (_inviteLinks.isEmpty)
                    _MembersStatePanel(
                      message: l10n.settingsWorkspaceMembersLinksEmpty,
                    )
                  else
                    ..._inviteLinks.map(
                      (link) => Padding(
                        padding: const EdgeInsets.only(bottom: 12),
                        child: _InviteLinkCard(
                          link: link,
                          onCopy: () => _copyLink(link),
                          onRemove: () => _onRemoveInviteLink(link),
                        ),
                      ),
                    ),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _loadData() async {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    final wsId = workspace?.id;
    if (wsId == null || wsId.isEmpty) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _canManageMembers = false;
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final repository = context.read<WorkspaceManagementRepository>();
      final permissions = await _permissionsRepository.getPermissions(
        wsId: wsId,
      );
      final canManageMembers =
          workspace?.personal == false &&
          permissions.containsPermission('manage_workspace_members');

      if (!canManageMembers) {
        if (!mounted) return;
        setState(() {
          _loading = false;
          _canManageMembers = false;
          _members = const [];
          _inviteLinks = const [];
        });
        return;
      }

      final results = await Future.wait<dynamic>([
        repository.getMembers(wsId),
        repository.getInviteLinks(wsId),
      ]);

      if (!mounted) return;
      setState(() {
        _loading = false;
        _canManageMembers = true;
        _members = results[0] as List<WorkspaceMemberListItem>;
        _inviteLinks = results[1] as List<WorkspaceInviteLink>;
      });
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = error.message;
      });
    } on Exception catch (_) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = context.l10n.commonSomethingWentWrong;
      });
    }
  }

  Future<void> _onInviteMember() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final repository = context.read<WorkspaceManagementRepository>();
    final changed = await showFinanceFullscreenModal<bool>(
      context: context,
      builder: (_) => RepositoryProvider.value(
        value: repository,
        child: _InviteMemberEditorPage(wsId: wsId),
      ),
    );
    if (changed == true && mounted) {
      await _loadData();
    }
  }

  Future<void> _onCreateInviteLink() async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final repository = context.read<WorkspaceManagementRepository>();
    final changed = await showFinanceFullscreenModal<bool>(
      context: context,
      builder: (_) => RepositoryProvider.value(
        value: repository,
        child: _InviteLinkEditorPage(wsId: wsId),
      ),
    );
    if (changed == true && mounted) {
      await _loadData();
    }
  }

  Future<void> _copyLink(WorkspaceInviteLink link) async {
    final url = '${ApiConfig.baseUrl}/invite/${link.code}';
    await Clipboard.setData(ClipboardData(text: url));
    if (!mounted) return;
    shad.showToast(
      context: context,
      builder: (_, overlay) => shad.Alert(
        content: Text(context.l10n.settingsWorkspaceMembersLinkCopied),
      ),
    );
  }

  Future<void> _onRemoveMember(WorkspaceMemberListItem member) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final deleted =
        await shad.showDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: context.l10n.settingsWorkspaceMembersRemoveTitle,
            message: context.l10n.settingsWorkspaceMembersRemoveMessage(
              member.label,
            ),
            cancelLabel: context.l10n.commonCancel,
            confirmLabel: context.l10n.settingsWorkspaceMembersRemoveTitle,
            toastContext: Navigator.of(context, rootNavigator: true).context,
            onConfirm: () =>
                context.read<WorkspaceManagementRepository>().removeMember(
                  wsId: wsId,
                  userId: member.pending ? null : member.id,
                  email: member.pending ? member.email : null,
                ),
          ),
        ) ??
        false;
    if (!deleted || !mounted) return;
    await _loadData();
  }

  Future<void> _onRemoveInviteLink(WorkspaceInviteLink link) async {
    final wsId = context.read<WorkspaceCubit>().state.currentWorkspace?.id;
    if (wsId == null) return;
    final deleted =
        await shad.showDialog<bool>(
          context: context,
          builder: (_) => AsyncDeleteConfirmationDialog(
            title: context.l10n.settingsWorkspaceMembersLinkDeleteTitle,
            message: context.l10n.settingsWorkspaceMembersLinkDeleteMessage,
            cancelLabel: context.l10n.commonCancel,
            confirmLabel: context.l10n.settingsWorkspaceMembersLinkDeleteTitle,
            toastContext: Navigator.of(context, rootNavigator: true).context,
            onConfirm: () => context
                .read<WorkspaceManagementRepository>()
                .deleteInviteLink(wsId: wsId, linkId: link.id),
          ),
        ) ??
        false;
    if (!deleted || !mounted) return;
    await _loadData();
  }
}

class _InviteMemberEditorPage extends StatefulWidget {
  const _InviteMemberEditorPage({required this.wsId});

  final String wsId;

  @override
  State<_InviteMemberEditorPage> createState() =>
      _InviteMemberEditorPageState();
}

class _InviteMemberEditorPageState extends State<_InviteMemberEditorPage> {
  late final TextEditingController _emailController;
  bool _saving = false;
  String? _emailError;

  @override
  void initState() {
    super.initState();
    _emailController = TextEditingController();
  }

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FinanceFullscreenFormScaffold(
      title: context.l10n.settingsWorkspaceMembersInviteAction,
      primaryActionLabel: context.l10n.settingsWorkspaceMembersInviteAction,
      isSaving: _saving,
      onPrimaryPressed: _save,
      child: ListView(
        children: [
          FinanceFormSection(
            title: context.l10n.settingsWorkspaceMembersEmailField,
            child: _MembersTextField(
              controller: _emailController,
              placeholder:
                  context.l10n.settingsWorkspaceMembersEmailPlaceholder,
              keyboardType: TextInputType.emailAddress,
              errorText: _emailError,
              onChanged: (_) {
                if (_emailError != null) {
                  setState(() => _emailError = null);
                }
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    final email = _emailController.text.trim();
    final emailRegex = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
    if (!emailRegex.hasMatch(email)) {
      setState(() {
        _emailError = context.l10n.settingsWorkspaceMembersEmailInvalid;
      });
      return;
    }

    setState(() => _saving = true);
    try {
      await context.read<WorkspaceManagementRepository>().inviteMember(
        wsId: widget.wsId,
        email: email,
      );
      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (_, overlay) => shad.Alert(
          content: Text(context.l10n.settingsWorkspaceMembersInviteSent),
        ),
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (_, overlay) =>
            shad.Alert.destructive(content: Text(error.message)),
      );
      setState(() => _saving = false);
    } on Exception catch (_) {
      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (_, overlay) => shad.Alert.destructive(
          content: Text(context.l10n.commonSomethingWentWrong),
        ),
      );
      setState(() => _saving = false);
    }
  }
}

class _InviteLinkEditorPage extends StatefulWidget {
  const _InviteLinkEditorPage({required this.wsId});

  final String wsId;

  @override
  State<_InviteLinkEditorPage> createState() => _InviteLinkEditorPageState();
}

class _InviteLinkEditorPageState extends State<_InviteLinkEditorPage> {
  late final TextEditingController _maxUsesController;
  bool _saving = false;
  String? _maxUsesError;

  @override
  void initState() {
    super.initState();
    _maxUsesController = TextEditingController();
  }

  @override
  void dispose() {
    _maxUsesController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FinanceFullscreenFormScaffold(
      title: context.l10n.settingsWorkspaceMembersLinkAction,
      primaryActionLabel: context.l10n.settingsWorkspaceMembersLinkAction,
      isSaving: _saving,
      onPrimaryPressed: _save,
      child: ListView(
        children: [
          FinanceFormSection(
            title: context.l10n.settingsWorkspaceMembersLinkLimitField,
            child: _MembersTextField(
              controller: _maxUsesController,
              placeholder:
                  context.l10n.settingsWorkspaceMembersLinkLimitPlaceholder,
              keyboardType: TextInputType.number,
              errorText: _maxUsesError,
              onChanged: (_) {
                if (_maxUsesError != null) {
                  setState(() => _maxUsesError = null);
                }
              },
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _save() async {
    final rawValue = _maxUsesController.text.trim();
    int? maxUses;
    if (rawValue.isNotEmpty) {
      maxUses = int.tryParse(rawValue);
      if (maxUses == null || maxUses <= 0) {
        setState(() {
          _maxUsesError = context.l10n.settingsWorkspaceMembersLinkLimitInvalid;
        });
        return;
      }
    }

    setState(() => _saving = true);
    try {
      await context.read<WorkspaceManagementRepository>().createInviteLink(
        wsId: widget.wsId,
        maxUses: maxUses,
      );
      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (_, overlay) => shad.Alert(
          content: Text(context.l10n.settingsWorkspaceMembersLinkCreated),
        ),
      );
      Navigator.of(context).pop(true);
    } on ApiException catch (error) {
      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (_, overlay) =>
            shad.Alert.destructive(content: Text(error.message)),
      );
      setState(() => _saving = false);
    } on Exception catch (_) {
      if (!mounted) return;
      shad.showToast(
        context: context,
        builder: (_, overlay) => shad.Alert.destructive(
          content: Text(context.l10n.commonSomethingWentWrong),
        ),
      );
      setState(() => _saving = false);
    }
  }
}

class _MemberCard extends StatelessWidget {
  const _MemberCard({
    required this.member,
    this.onRemove,
  });

  final WorkspaceMemberListItem member;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final roleText = member.roles.map((role) => role.name).join(', ');
    return FinancePanel(
      padding: const EdgeInsets.all(16),
      radius: 22,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        member.label,
                        style: shad.Theme.of(context).typography.small.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    if (member.isCreator)
                      _StatusChip(
                        label: context.l10n.settingsWorkspaceMembersCreatorChip,
                      ),
                    if (member.pending)
                      _StatusChip(
                        label: context.l10n.settingsWorkspaceMembersPendingChip,
                      ),
                  ],
                ),
                if (member.email != null && member.email != member.label) ...[
                  const shad.Gap(4),
                  Text(
                    member.email!,
                    style: shad.Theme.of(context).typography.textSmall.copyWith(
                      color: shad.Theme.of(context).colorScheme.mutedForeground,
                    ),
                  ),
                ],
                if (roleText.isNotEmpty) ...[
                  const shad.Gap(8),
                  Text(
                    roleText,
                    style: shad.Theme.of(context).typography.xSmall.copyWith(
                      color: shad.Theme.of(context).colorScheme.mutedForeground,
                    ),
                  ),
                ],
              ],
            ),
          ),
          if (onRemove != null) ...[
            const shad.Gap(12),
            shad.GhostButton(
              density: shad.ButtonDensity.compact,
              onPressed: onRemove,
              child: const Icon(Icons.delete_outline_rounded),
            ),
          ],
        ],
      ),
    );
  }
}

class _InviteLinkCard extends StatelessWidget {
  const _InviteLinkCard({
    required this.link,
    required this.onCopy,
    required this.onRemove,
  });

  final WorkspaceInviteLink link;
  final VoidCallback onCopy;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final expiresAt = link.expiresAt == null
        ? l10n.settingsWorkspaceMembersLinkNever
        : DateFormat.yMMMd().add_Hm().format(
            DateTime.parse(link.expiresAt!).toLocal(),
          );
    final uses = link.maxUses == null
        ? '${link.currentUses}'
        : '${link.currentUses}/${link.maxUses}';
    final status = link.isExpired
        ? l10n.settingsWorkspaceMembersLinkExpired
        : link.isFull
        ? l10n.settingsWorkspaceMembersLinkFull
        : l10n.settingsWorkspaceMembersLinkActive;

    return FinancePanel(
      padding: const EdgeInsets.all(16),
      radius: 22,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  link.code,
                  style: shad.Theme.of(context).typography.small.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
              _StatusChip(label: status),
            ],
          ),
          const shad.Gap(8),
          Text(
            '$uses · $expiresAt',
            style: shad.Theme.of(context).typography.textSmall.copyWith(
              color: shad.Theme.of(context).colorScheme.mutedForeground,
            ),
          ),
          const shad.Gap(12),
          Row(
            children: [
              shad.OutlineButton(
                density: shad.ButtonDensity.compact,
                onPressed: onCopy,
                child: Text(l10n.settingsWorkspaceMembersLinkCopy),
              ),
              const shad.Gap(8),
              shad.GhostButton(
                density: shad.ButtonDensity.compact,
                onPressed: onRemove,
                child: const Icon(Icons.delete_outline_rounded),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MembersTextField extends StatelessWidget {
  const _MembersTextField({
    required this.controller,
    required this.placeholder,
    required this.onChanged,
    this.keyboardType,
    this.errorText,
  });

  final TextEditingController controller;
  final String placeholder;
  final ValueChanged<String> onChanged;
  final TextInputType? keyboardType;
  final String? errorText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        shad.TextField(
          contextMenuBuilder: platformTextContextMenuBuilder(),
          controller: controller,
          keyboardType: keyboardType,
          placeholder: Text(placeholder),
          onChanged: onChanged,
        ),
        if (errorText != null) ...[
          const shad.Gap(6),
          Text(
            errorText!,
            style: shad.Theme.of(context).typography.xSmall.copyWith(
              color: shad.Theme.of(context).colorScheme.destructive,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ],
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: FinancePalette.of(context).accent.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: shad.Theme.of(context).typography.xSmall.copyWith(
          color: FinancePalette.of(context).accent,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}

class _MembersStatePanel extends StatelessWidget {
  const _MembersStatePanel({
    required this.message,
    this.actionLabel,
    this.onPressed,
  });

  final String message;
  final String? actionLabel;
  final Future<void> Function()? onPressed;

  @override
  Widget build(BuildContext context) {
    return FinancePanel(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          Text(
            message,
            textAlign: TextAlign.center,
            style: shad.Theme.of(context).typography.textSmall.copyWith(
              color: shad.Theme.of(context).colorScheme.mutedForeground,
            ),
          ),
          if (actionLabel != null && onPressed != null) ...[
            const shad.Gap(14),
            shad.OutlineButton(
              onPressed: () => unawaited(onPressed!.call()),
              child: Text(actionLabel!),
            ),
          ],
        ],
      ),
    );
  }
}
