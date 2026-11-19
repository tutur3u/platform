import 'dart:async';

import 'package:flutter/material.dart' hide AppBar, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
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
import 'package:mobile/widgets/nova_refresh_indicator.dart';

part 'chat_page_surface.dart';
part 'chat_page_filters.dart';

class ChatPage extends StatefulWidget {
  const ChatPage({super.key, this.cubitFactory});

  final ChatCubit Function(String? actorId)? cubitFactory;

  @override
  State<ChatPage> createState() => _ChatLifetimeState();
}

class _ChatLifetimeState extends State<ChatPage> {
  int _actorGeneration = 0;

  @override
  Widget build(BuildContext context) {
    final auth = context.read<AuthCubit>();
    final actorId = context.select<AuthCubit, String?>((c) => c.state.user?.id);
    return BlocListener<AuthCubit, AuthState>(
      listenWhen: (previous, current) => previous.user?.id != current.user?.id,
      listener: (_, _) => setState(() => ++_actorGeneration),
      child: _ChatActorHost(
        key: ValueKey((actorId, _actorGeneration)),
        actorId: actorId,
        currentUserId: () => auth.state.user?.id,
        cubitFactory: widget.cubitFactory,
      ),
    );
  }
}

class _ChatActorHost extends StatefulWidget {
  const _ChatActorHost({
    required this.actorId,
    required this.currentUserId,
    required this.cubitFactory,
    super.key,
  });
  final String? actorId;
  final String? Function() currentUserId;
  final ChatCubit Function(String? actorId)? cubitFactory;
  @override
  State<_ChatActorHost> createState() => _ChatPageState();
}

class _ChatPageState extends State<_ChatActorHost> {
  late final ChatCubit _chatCubit =
      widget.cubitFactory?.call(widget.actorId) ??
      ChatCubit(currentUserId: widget.currentUserId);
  final TextEditingController _searchController = TextEditingController();
  bool _searchVisible = false;
  String? _loadedWorkspaceId;
  String? _openedInitialConversationId;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncWorkspace();
  }

  @override
  void dispose() {
    _searchController.dispose();
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
                  AppStateMessage(
                    icon: LucideIcons.messagesSquare,
                    title: l10n.chatTitle,
                    message: l10n.chatNoWorkspace,
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
                  const AppLoadingIndicator.page(),
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
                  AppStateMessage(
                    icon: isForbidden ? LucideIcons.lock : AppIcons.error,
                    tone: isForbidden ? AppTone.neutral : AppTone.destructive,
                    title: isForbidden
                        ? l10n.chatNoAccessTitle
                        : l10n.commonSomethingWentWrong,
                    message: isForbidden
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
                if (_searchVisible)
                  ChatSearchResults(
                    state: state,
                    onSelect: (conversationId) {
                      unawaited(
                        _chatCubit.selectConversation(
                          conversationId,
                          forceRefresh: true,
                        ),
                      );
                      _closeSearch();
                    },
                  )
                else
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
      deepLinkBackRoute: state.selectedConversationId == null
          ? Routes.apps
          : null,
      items: [
        ShellMiniNavItemSpec(
          id: 'workspace',
          icon: LucideIcons.building2,
          label: l10n.chatWorkspace,
          selected: state.scope == ChatScope.workspaces,
          onPressed: _selectWorkspace,
        ),
        ShellMiniNavItemSpec(
          id: 'personal',
          icon: LucideIcons.user,
          label: l10n.chatPersonal,
          selected: state.scope == ChatScope.personal,
          onPressed: _selectPersonal,
        ),
        ShellMiniNavItemSpec(
          id: 'filters',
          icon: LucideIcons.listFilter,
          label: l10n.commonFilters,
          dropdown: true,
          onPressed: _openFilters,
        ),
      ],
    );
  }

  void _backFromChat() {
    if (_searchVisible) {
      _closeSearch();
      return;
    }
    if (_chatCubit.state.selectedConversationId != null) {
      _chatCubit.clearSelection();
      context.go(Routes.chat);
    }
  }

  Future<void> _handleChatBack() async => _backFromChat();

  void _selectWorkspace() => _selectScope(ChatScope.workspaces);

  void _selectPersonal() => _selectScope(ChatScope.personal);

  void _openFilters() => unawaited(_showFilters(context));

  void _closeSearch() {
    _searchController.clear();
    unawaited(_chatCubit.searchMessages(''));
    setState(() => _searchVisible = false);
  }

  void _selectScope(ChatScope scope) {
    _chatCubit.setScope(scope);
    if (_chatCubit.state.selectedConversationId != null) {
      _chatCubit.clearSelection();
      context.go(Routes.chat);
    }
  }

  Future<void> _showFilters(BuildContext context) => showAppSheet<void>(
    context: context,
    builder: (_) => BlocProvider.value(
      value: _chatCubit,
      child: BlocBuilder<ChatCubit, ChatState>(
        builder: (context, state) => AppSheetScaffold(
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
      onBack: _searchVisible || state.selectedConversationId != null
          ? _handleChatBack
          : null,
      actions: [
        ShellActionSpec.search(
          id: 'chat-search',
          active: _searchVisible,
          tooltip: l10n.chatSearch,
          controller: _searchController,
          searchHint: l10n.chatSearch,
          onSearchChanged: (query) =>
              unawaited(_chatCubit.searchMessages(query)),
          onCloseSearch: _closeSearch,
          onPressed: () {
            if (_searchVisible) {
              _closeSearch();
            } else {
              setState(() => _searchVisible = true);
            }
          },
        ),
        ShellActionSpec(
          id: 'chat-new',
          icon: LucideIcons.messageSquarePlus,
          tooltip: l10n.chatNew,
          onPressed: () => unawaited(
            showChatCreateConversationSheet(
              context: context,
              cubit: _chatCubit,
            ),
          ),
        ),
        ShellActionSpec(
          id: 'chat-directory',
          icon: LucideIcons.contact,
          tooltip: l10n.chatDirectory,
          onPressed: () => unawaited(
            showChatDirectorySheet(context: context, cubit: _chatCubit),
          ),
        ),
        if (state.selectedConversation != null &&
            !state.selectedConversation!.isReadOnlyAgent)
          ShellActionSpec(
            id: 'chat-pin',
            icon: state.selectedConversation!.isPinned
                ? LucideIcons.pinOff
                : LucideIcons.pin,
            tooltip: state.selectedConversation!.isPinned
                ? l10n.chatUnpin
                : l10n.chatPin,
            highlighted: state.selectedConversation!.isPinned,
            onPressed: () =>
                unawaited(_chatCubit.togglePin(state.selectedConversation!)),
          ),
        if (state.selectedConversationId != null)
          ShellActionSpec(
            id: 'chat-details',
            icon: LucideIcons.panelRight,
            tooltip: l10n.chatDetails,
            onPressed: () => unawaited(
              showChatDetailsSheet(context: context, cubit: _chatCubit),
            ),
          ),
      ],
    );
  }

  void _syncWorkspace() {
    if (widget.actorId == null) return;
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
