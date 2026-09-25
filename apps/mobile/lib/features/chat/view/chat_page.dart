import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/chat/cubit/chat_cubit.dart';
import 'package:mobile/features/chat/models/chat_models.dart';
import 'package:mobile/features/chat/widgets/chat_conversation_list.dart';
import 'package:mobile/features/chat/widgets/chat_sheets.dart';
import 'package:mobile/features/chat/widgets/chat_thread_view.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/app_dialog_scaffold.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'chat_page_surface.dart';
part 'chat_page_filters.dart';

class ChatPage extends StatefulWidget {
  const ChatPage({super.key});

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  late final ChatCubit _chatCubit = ChatCubit();
  String? _loadedWorkspaceId;
  String? _openedInitialConversationId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncWorkspace();
  }

  @override
  void dispose() {
    unawaited(_chatCubit.close());
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<WorkspaceCubit, WorkspaceState>(
      listenWhen: (previous, current) =>
          previous.currentWorkspace?.id != current.currentWorkspace?.id,
      listener: (_, _) => _syncWorkspace(),
      child: BlocProvider.value(
        value: _chatCubit,
        child: BlocConsumer<ChatCubit, ChatState>(
          listenWhen: (previous, current) =>
              previous.selectedConversationId != current.selectedConversationId,
          listener: (context, state) {
            final selectedId = state.selectedConversationId;
            if (selectedId == null) return;

            final uri = GoRouterState.of(context).uri;
            if (uri.queryParameters['conversationId'] == selectedId) return;

            context.go(Routes.chatConversationPath(selectedId));
          },
          builder: (context, state) {
            final l10n = context.l10n;
            final workspace = context.select<WorkspaceCubit, WorkspaceState>(
              (cubit) => cubit.state,
            );
            final shellActions = _buildShellActions(context, state);
            final miniNav = _buildChatMiniNav(context, state);

            if (workspace.currentWorkspace == null) {
              return Stack(
                children: [
                  shellActions,
                  miniNav,
                  _CenteredMessage(
                    title: l10n.chatTitle,
                    description: l10n.chatNoWorkspace,
                  ),
                ],
              );
            }

            if (state.status == ChatStatus.loading &&
                state.conversations.isEmpty) {
              return Stack(
                children: [
                  shellActions,
                  miniNav,
                  const Center(child: NovaLoadingIndicator()),
                ],
              );
            }

            if (state.status == ChatStatus.error &&
                state.conversations.isEmpty) {
              final isForbidden =
                  state.error?.toLowerCase().contains('permission') ?? false;
              return Stack(
                children: [
                  shellActions,
                  miniNav,
                  _CenteredMessage(
                    title: isForbidden
                        ? l10n.chatNoAccessTitle
                        : l10n.commonSomethingWentWrong,
                    description: isForbidden
                        ? l10n.chatNoAccessDescription
                        : (state.error ?? l10n.commonSomethingWentWrong),
                    actionLabel: l10n.chatRetry,
                    onAction: () => unawaited(_chatCubit.refresh()),
                  ),
                ],
              );
            }

            return Stack(
              children: [
                shellActions,
                miniNav,
                _ChatSurface(state: state),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildChatMiniNav(BuildContext context, ChatState state) {
    final l10n = context.l10n;
    return ShellMiniNav(
      ownerId: 'chat-navigation',
      locations: const {Routes.chat},
      items: [
        ShellMiniNavItemSpec(
          id: 'back',
          icon: Icons.chevron_left,
          label: l10n.navBack,
          onPressed: _backFromChat,
        ),
        ShellMiniNavItemSpec(
          id: 'workspace',
          icon: shad.LucideIcons.building2,
          label: l10n.chatWorkspace,
          selected: state.scope == ChatScope.workspaces,
          onPressed: _selectWorkspace,
        ),
        ShellMiniNavItemSpec(
          id: 'personal',
          icon: shad.LucideIcons.user,
          label: l10n.chatPersonal,
          selected: state.scope == ChatScope.personal,
          onPressed: _selectPersonal,
        ),
        ShellMiniNavItemSpec(
          id: 'filters',
          icon: shad.LucideIcons.listFilter,
          label: l10n.commonFilters,
          dropdown: true,
          onPressed: _openFilters,
        ),
      ],
    );
  }

  void _backFromChat() {
    if (_chatCubit.state.selectedConversationId != null &&
        MediaQuery.sizeOf(context).width < 700) {
      _chatCubit.clearSelection();
      context.go(Routes.chat);
    } else {
      context.go(Routes.apps);
    }
  }

  void _selectWorkspace() => _selectScope(ChatScope.workspaces);

  void _selectPersonal() => _selectScope(ChatScope.personal);

  void _openFilters() => unawaited(_showFilters(context));

  void _selectScope(ChatScope scope) {
    _chatCubit.setScope(scope);
    if (_chatCubit.state.selectedConversationId != null) {
      _chatCubit.clearSelection();
      context.go(Routes.chat);
    }
  }

  Future<void> _showFilters(BuildContext context) => showAdaptiveSheet<void>(
    context: context,
    useRootNavigator: true,
    backgroundColor: Colors.transparent,
    builder: (_) => BlocProvider.value(
      value: _chatCubit,
      child: BlocBuilder<ChatCubit, ChatState>(
        builder: (context, state) => AppDialogScaffold(
          title: context.l10n.commonFilters,
          child: _ChatFilters(state: state),
        ),
      ),
    ),
  );

  ShellChromeActions _buildShellActions(BuildContext context, ChatState state) {
    final l10n = context.l10n;
    return ShellChromeActions(
      ownerId: 'chat-root',
      locations: const {Routes.chat},
      actions: [
        ShellActionSpec(
          id: 'chat-new',
          icon: shad.LucideIcons.messageSquarePlus,
          tooltip: l10n.chatNew,
          onPressed: () => unawaited(
            showChatCreateConversationSheet(
              context: context,
              cubit: _chatCubit,
            ),
          ),
        ),
        ShellActionSpec(
          id: 'chat-search',
          icon: shad.LucideIcons.search,
          tooltip: l10n.chatSearch,
          onPressed: () => unawaited(
            showChatSearchSheet(context: context, cubit: _chatCubit),
          ),
        ),
        ShellActionSpec(
          id: 'chat-directory',
          icon: shad.LucideIcons.contact,
          tooltip: l10n.chatDirectory,
          onPressed: () => unawaited(
            showChatDirectorySheet(context: context, cubit: _chatCubit),
          ),
        ),
        if (state.selectedConversationId != null)
          ShellActionSpec(
            id: 'chat-details',
            icon: shad.LucideIcons.panelRight,
            tooltip: l10n.chatDetails,
            onPressed: () => unawaited(
              showChatDetailsSheet(context: context, cubit: _chatCubit),
            ),
          ),
      ],
    );
  }

  void _syncWorkspace() {
    final workspace = context.read<WorkspaceCubit>().state.currentWorkspace;
    final wsId = workspace?.id;
    if (wsId == null) return;

    final requestedConversationId = GoRouterState.of(
      context,
    ).uri.queryParameters['conversationId'];
    if (wsId == _loadedWorkspaceId) {
      if (requestedConversationId == null &&
          _openedInitialConversationId != null) {
        _openedInitialConversationId = null;
        _chatCubit.clearSelection();
      }
      if (requestedConversationId != null &&
          requestedConversationId != _openedInitialConversationId) {
        _openedInitialConversationId = requestedConversationId;
        unawaited(_chatCubit.selectConversation(requestedConversationId));
      }
      return;
    }

    _loadedWorkspaceId = wsId;
    _openedInitialConversationId = requestedConversationId;
    unawaited(
      _chatCubit.setWorkspace(
        wsId,
        initialConversationId: _openedInitialConversationId,
      ),
    );
  }
}
