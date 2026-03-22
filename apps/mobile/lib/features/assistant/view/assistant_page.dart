// Assistant page - completely redesigned for modern UX
// ignore_for_file: directives_ordering, lines_longer_than_80_chars, discarded_futures, avoid_types_on_closure_parameters, avoid_redundant_argument_values

import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart' hide Badge, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:url_launcher/url_launcher.dart';

import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';

import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantPage extends StatefulWidget {
  const AssistantPage({super.key});

  @override
  State<AssistantPage> createState() => _AssistantPageState();
}

class _AssistantPageState extends State<AssistantPage> {
  final _repository = AssistantRepository();
  final _preferences = AssistantPreferences();
  final _inputController = TextEditingController();
  final _inputFocusNode = FocusNode();
  final _renameController = TextEditingController();
  final _scrollController = ScrollController();

  late final AssistantShellCubit _shellCubit = AssistantShellCubit(
    repository: _repository,
    preferences: _preferences,
  );
  late final AssistantChatCubit _chatCubit = AssistantChatCubit(
    repository: _repository,
    preferences: _preferences,
    onWorkspaceContextChanged: (workspaceContextId) =>
        _shellCubit.setWorkspaceContextId(workspaceContextId),
    onSoulRefreshRequested: _shellCubit.refreshSoul,
    onImmersiveModeChanged: _shellCubit.setImmersiveMode,
    onChatRestored: (modelId) async {
      if (modelId == null) return;
      final current = _shellCubit.state.availableModels.where(
        (model) => model.value == modelId || model.value.endsWith('/$modelId'),
      );
      if (current.isNotEmpty) {
        await _shellCubit.setSelectedModel(current.first);
      }
    },
  );

  String? _loadedWorkspaceId;

  @override
  void dispose() {
    _inputController.dispose();
    _inputFocusNode.dispose();
    _renameController.dispose();
    _scrollController.dispose();
    _shellCubit.close();
    _chatCubit.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final workspace = context.select(
      (WorkspaceCubit cubit) => cubit.state.personalWorkspaceOrCurrent,
    );

    if (workspace != null && workspace.id != _loadedWorkspaceId) {
      _loadedWorkspaceId = workspace.id;
      _shellCubit
        ..loadWorkspace(workspace)
        ..setImmersiveMode(false);
      _chatCubit.loadWorkspace(workspace.id);
    }

    return MultiBlocProvider(
      providers: [
        BlocProvider.value(value: _shellCubit),
        BlocProvider.value(value: _chatCubit),
      ],
      child: BlocBuilder<WorkspaceCubit, WorkspaceState>(
        builder: (context, workspaceState) {
          final currentWorkspace = workspaceState.personalWorkspaceOrCurrent;
          if (currentWorkspace == null) {
            return shad.Scaffold(
              child: Center(child: Text(context.l10n.assistantSelectWorkspace)),
            );
          }

          return BlocBuilder<AssistantShellCubit, AssistantShellState>(
            builder: (context, shellState) {
              return MultiBlocListener(
                listeners: [
                  BlocListener<AssistantChatCubit, AssistantChatState>(
                    listenWhen: (prev, curr) {
                      // Only scroll when a new message is added, not on content changes
                      return prev.messages.length != curr.messages.length;
                    },
                    listener: (context, state) {
                      if (state.messages.isNotEmpty) {
                        _scheduleScrollToBottom();
                      }
                    },
                  ),
                  BlocListener<AssistantChromeCubit, AssistantChromeState>(
                    listenWhen: (previous, current) =>
                        previous.isFullscreen != current.isFullscreen,
                    listener: (context, chromeState) {
                      if (_shellCubit.state.isImmersive !=
                          chromeState.isFullscreen) {
                        _shellCubit.setImmersiveMode(chromeState.isFullscreen);
                      }
                      if (chromeState.isFullscreen) {
                        _scheduleScrollToBottom();
                      }
                    },
                  ),
                  BlocListener<AssistantShellCubit, AssistantShellState>(
                    listenWhen: (previous, current) =>
                        previous.isImmersive != current.isImmersive,
                    listener: (context, nextShellState) {
                      final chromeCubit = context.read<AssistantChromeCubit>();
                      if (chromeCubit.state.isFullscreen !=
                          nextShellState.isImmersive) {
                        chromeCubit.setFullscreen(
                          value: nextShellState.isImmersive,
                        );
                      }
                    },
                  ),
                ],
                child: BlocBuilder<AssistantChatCubit, AssistantChatState>(
                  builder: (context, chatState) {
                    final isFullscreen = context.select(
                      (AssistantChromeCubit cubit) => cubit.state.isFullscreen,
                    );

                    return shad.Scaffold(
                      child: SafeArea(
                        top: false,
                        bottom: isFullscreen,
                        child: AnimatedPadding(
                          duration: const Duration(milliseconds: 180),
                          curve: Curves.easeOut,
                          padding: EdgeInsets.only(
                            bottom: MediaQuery.viewInsetsOf(context).bottom,
                          ),
                          child: ResponsiveWrapper(
                            maxWidth: ResponsivePadding.maxContentWidth(
                              context.deviceClass,
                            ),
                            child: Padding(
                              padding: EdgeInsets.fromLTRB(
                                ResponsivePadding.horizontal(
                                  context.deviceClass,
                                ),
                                0,
                                ResponsivePadding.horizontal(
                                  context.deviceClass,
                                ),
                                isFullscreen ? 4 : 0,
                              ),
                              child: Column(
                                children: [
                                  Expanded(
                                    child: _buildConversation(
                                      context,
                                      currentWorkspace,
                                      shellState,
                                      chatState,
                                    ),
                                  ),
                                  if (!shellState.isViewOnly) const shad.Gap(8),
                                  if (!shellState.isViewOnly)
                                    _buildComposer(
                                      context,
                                      currentWorkspace.id,
                                      shellState,
                                      chatState,
                                    ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }

  Widget _buildConversation(
    BuildContext context,
    Workspace workspace,
    AssistantShellState shellState,
    AssistantChatState chatState,
  ) {
    // Show empty state only when truly empty and not submitting
    if (chatState.messages.isEmpty &&
        chatState.status != AssistantChatStatus.submitting) {
      return _buildEmptyState(context, workspace.id, shellState);
    }

    // Filter out empty messages
    final validMessages = chatState.messages.where((msg) {
      final hasContent = msg.parts.any((part) {
        if (part.type == 'text' || part.type == 'reasoning') {
          return part.text?.trim().isNotEmpty ?? false;
        }
        return true; // non-text parts always count
      });
      return hasContent ||
          msg.role == 'user'; // Keep user messages even if empty
    }).toList();

    return ListView.builder(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(
        parent: BouncingScrollPhysics(),
      ),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.symmetric(vertical: 16),
      itemCount: validMessages.length + (chatState.isBusy ? 1 : 0),
      itemBuilder: (context, index) {
        // Show typing indicator at the end when assistant is responding
        if (index == validMessages.length) {
          return _buildTypingIndicator(context);
        }

        final message = validMessages[index];
        final attachments =
            chatState.attachmentsByMessageId[message.id] ?? const [];

        return _buildMessageBubble(
          context,
          workspace.id,
          shellState,
          message,
          attachments,
          isLatest: index == validMessages.length - 1,
        );
      },
    );
  }

  Widget _buildMessageBubble(
    BuildContext context,
    String wsId,
    AssistantShellState shellState,
    AssistantMessage message,
    List<AssistantAttachment> attachments, {
    required bool isLatest,
  }) {
    final isUser = message.role == 'user';
    final theme = Theme.of(context);

    return Container(
      margin: EdgeInsets.only(
        left: isUser ? 48 : 0,
        right: isUser ? 0 : 48,
        bottom: 16,
      ),
      child: Column(
        crossAxisAlignment: isUser
            ? CrossAxisAlignment.end
            : CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isUser
                  ? theme.colorScheme.primaryContainer
                  : theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(20),
                topRight: const Radius.circular(20),
                bottomLeft: Radius.circular(isUser ? 20 : 4),
                bottomRight: Radius.circular(isUser ? 4 : 20),
              ),
              boxShadow: [
                BoxShadow(
                  color: theme.colorScheme.shadow.withValues(alpha: 0.05),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (attachments.isNotEmpty)
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: attachments
                        .map(
                          (attachment) => _AttachmentChip(
                            attachment: attachment,
                            onTap: () => _openAttachment(attachment.signedUrl),
                          ),
                        )
                        .toList(),
                  ),
                if (attachments.isNotEmpty) const SizedBox(height: 12),
                ..._buildMessageContent(
                  context,
                  wsId,
                  shellState,
                  message,
                  isUser: isUser,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _buildMessageContent(
    BuildContext context,
    String wsId,
    AssistantShellState shellState,
    AssistantMessage message, {
    required bool isUser,
  }) {
    final widgets = <Widget>[];

    for (final part in message.parts) {
      switch (part.type) {
        case 'text':
          // Skip empty text parts
          final text = part.text?.trim() ?? '';
          if (text.isEmpty) continue;

          if (isUser) {
            widgets.add(
              SelectableText(
                part.text ?? '',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Theme.of(context).colorScheme.onPrimaryContainer,
                  height: 1.5,
                ),
              ),
            );
          } else {
            widgets.add(
              MarkdownBody(
                data: part.text ?? '',
                styleSheet: _markdownStyleSheet(context),
                selectable: true,
              ),
            );
          }
        case 'reasoning':
          final text = part.text?.trim() ?? '';
          if (text.isEmpty) continue;

          widgets.add(
            Container(
              margin: const EdgeInsets.only(top: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Theme.of(
                  context,
                ).colorScheme.surfaceContainerLow.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.psychology_outlined,
                        size: 16,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        context.l10n.assistantReasoningLabel,
                        style: Theme.of(context).textTheme.labelMedium
                            ?.copyWith(
                              color: Theme.of(context).colorScheme.primary,
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  MarkdownBody(
                    data: part.text ?? '',
                    styleSheet: _markdownStyleSheet(context),
                  ),
                ],
              ),
            ),
          );
        case 'source-url':
          widgets.add(
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: _SourceLink(
                title: part.title,
                url: part.url,
                onTap: () => _openAttachment(part.url),
              ),
            ),
          );
        case 'dynamic-tool':
          // Tools are collected and rendered as a single consolidated element at the end
          break;
      }
    }

    // Consolidate all tool parts into a single collapsible element at the end
    final toolParts = message.parts
        .where((p) => p.type == 'dynamic-tool')
        .toList();
    if (toolParts.isNotEmpty) {
      widgets.add(
        Padding(
          padding: const EdgeInsets.only(top: 12),
          child: _ConsolidatedTools(
            toolParts: toolParts,
          ),
        ),
      );
    }

    return widgets;
  }

  Widget _buildTypingIndicator(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 48, bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(20),
          topRight: Radius.circular(20),
          bottomLeft: Radius.circular(4),
          bottomRight: Radius.circular(20),
        ),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _AnimatedDot(delay: 0),
          SizedBox(width: 4),
          _AnimatedDot(delay: 200),
          SizedBox(width: 4),
          _AnimatedDot(delay: 400),
        ],
      ),
    );
  }

  Widget _buildEmptyState(
    BuildContext context,
    String wsId,
    AssistantShellState shellState,
  ) {
    final prompts = [
      context.l10n.assistantQuickPromptCalendar,
      context.l10n.assistantQuickPromptTasks,
      context.l10n.assistantQuickPromptFocus,
    ];

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Animated assistant icon
            _AnimatedAssistantIcon(),
            const SizedBox(height: 24),
            Text(
              'What can I help you with?',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w600,
                color: Theme.of(context).colorScheme.onSurface,
              ),
            ),
            const SizedBox(height: 12),
            Text(
              context.l10n.assistantWorkspaceAwareDescription,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                height: 1.5,
              ),
            ),
            const SizedBox(height: 32),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              alignment: WrapAlignment.center,
              children: prompts
                  .map(
                    (prompt) => _PromptChip(
                      prompt: prompt,
                      onTap: () => _submitText(wsId, shellState, prompt),
                    ),
                  )
                  .toList(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildComposer(
    BuildContext context,
    String wsId,
    AssistantShellState shellState,
    AssistantChatState chatState,
  ) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: Theme.of(
            context,
          ).colorScheme.outlineVariant.withValues(alpha: 0.5),
        ),
        boxShadow: [
          BoxShadow(
            color: Theme.of(context).colorScheme.shadow.withValues(alpha: 0.08),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (chatState.composerAttachments.isNotEmpty)
            Container(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: chatState.composerAttachments
                      .map(
                        (attachment) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: _AttachmentInputChip(
                            attachment: attachment,
                            onDelete: () => _chatCubit.removeComposerAttachment(
                              wsId: wsId,
                              attachmentId: attachment.id,
                            ),
                          ),
                        ),
                      )
                      .toList(),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.all(8),
            child: Row(
              children: [
                _ComposerActionButton(
                  icon: Icons.add_rounded,
                  onPressed: () =>
                      _showComposerMenu(context, wsId, shellState, chatState),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: TextField(
                    controller: _inputController,
                    focusNode: _inputFocusNode,
                    minLines: 1,
                    maxLines: 6,
                    decoration: InputDecoration(
                      hintText: context.l10n.assistantAskPlaceholder,
                      hintStyle: TextStyle(
                        color: Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(
                        vertical: 12,
                        horizontal: 4,
                      ),
                    ),
                    onSubmitted: (_) => _submitCurrentInput(wsId, shellState),
                  ),
                ),
                const SizedBox(width: 8),
                if (chatState.isBusy)
                  _ComposerActionButton(
                    icon: Icons.stop_rounded,
                    isDestructive: true,
                    onPressed: _chatCubit.stopStreaming,
                  )
                else
                  _SendButton(
                    onPressed: () => _submitCurrentInput(wsId, shellState),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _submitCurrentInput(
    String wsId,
    AssistantShellState shellState,
  ) async {
    final text = _inputController.text.trim();
    if (text.isEmpty) return;

    _inputController.clear();
    await _submitText(wsId, shellState, text);
  }

  Future<void> _submitText(
    String wsId,
    AssistantShellState shellState,
    String text,
  ) {
    return _chatCubit.submit(
      wsId: wsId,
      message: text,
      modelId: shellState.selectedModel.value,
      thinkingMode: shellState.thinkingMode,
      creditSource: shellState.creditSource,
      workspaceContextId: shellState.workspaceContextId,
      timezone: DateTime.now().timeZoneName,
      creditWsId: shellState.creditSource == AssistantCreditSource.personal
          ? shellState.personalWorkspaceId
          : shellState.workspace?.id,
    );
  }

  void _scheduleScrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!_scrollController.hasClients) return;
      final target = _scrollController.position.maxScrollExtent + 100;
      await _scrollController.animateTo(
        target,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
      );
    });
  }

  // ... rest of helper methods
  MarkdownStyleSheet _markdownStyleSheet(BuildContext context) {
    final theme = Theme.of(context);
    return MarkdownStyleSheet(
      p: theme.textTheme.bodyLarge?.copyWith(height: 1.6),
      code: theme.textTheme.bodyMedium?.copyWith(
        fontFamily: 'monospace',
        backgroundColor: theme.colorScheme.surfaceContainerHighest,
      ),
      codeblockDecoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
      ),
    );
  }

  Future<void> _openAttachment(String? url) async {
    if (url == null || url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _showComposerMenu(
    BuildContext context,
    String wsId,
    AssistantShellState shellState,
    AssistantChatState chatState,
  ) {
    // Capture values before opening bottom sheet
    final isFullscreen = context
        .read<AssistantChromeCubit>()
        .state
        .isFullscreen;
    final l10n = context.l10n;

    showModalBottomSheet<void>(
      context: context,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              ListTile(
                leading: const Icon(Icons.add_comment_rounded),
                title: const Text('New chat'),
                onTap: () async {
                  Navigator.of(sheetContext).pop();
                  await _chatCubit.resetConversation(wsId);
                },
              ),
              const Divider(),
              ListTile(
                leading: const Icon(Icons.attach_file_rounded),
                title: Text(l10n.assistantAttachFilesAction),
                onTap: () async {
                  Navigator.of(sheetContext).pop();
                  await _pickFiles(wsId);
                },
              ),
              ListTile(
                leading: const Icon(Icons.fullscreen_rounded),
                title: Text(
                  isFullscreen
                      ? l10n.assistantExitFullscreenAction
                      : l10n.assistantEnterFullscreenAction,
                ),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _setFullscreen(
                    !isFullscreen,
                    focusInput: true,
                  );
                },
              ),
              ListTile(
                leading: const Icon(Icons.history_rounded),
                title: Text(l10n.assistantHistoryTitle),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _showHistorySheet(context, wsId);
                },
              ),
              ListTile(
                leading: const Icon(Icons.tune_rounded),
                title: Text(l10n.assistantSettingsTitle),
                onTap: () {
                  Navigator.of(sheetContext).pop();
                  _showSettingsDialog(context, wsId);
                },
              ),
              if (chatState.messages.isNotEmpty)
                ListTile(
                  leading: const Icon(Icons.ios_share_rounded),
                  title: Text(l10n.assistantExportChat),
                  onTap: () {
                    Navigator.of(sheetContext).pop();
                    _exportChat(context, wsId, shellState, chatState);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _pickFiles(String wsId) async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.any,
    );
    if (result == null || result.files.isEmpty) return;

    await _chatCubit.addComposerAttachments(
      wsId: wsId,
      files: result.files,
    );
  }

  void _setFullscreen(bool value, {bool focusInput = false}) {
    final chromeCubit = context.read<AssistantChromeCubit>();
    if (chromeCubit.state.isFullscreen != value) {
      chromeCubit.setFullscreen(value: value);
    }
    if (_shellCubit.state.isImmersive != value) {
      _shellCubit.setImmersiveMode(value);
    }
    if (!value) {
      FocusManager.instance.primaryFocus?.unfocus();
    }
    if (value && focusInput) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _inputFocusNode.requestFocus();
      });
    }
  }

  Future<void> _showHistorySheet(BuildContext context, String wsId) async {
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      builder: (sheetContext) {
        return BlocProvider.value(
          value: _chatCubit,
          child: BlocBuilder<AssistantChatCubit, AssistantChatState>(
            builder: (context, state) {
              return ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  Text(
                    context.l10n.assistantHistoryTitle,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                  const SizedBox(height: 12),
                  for (final chat in state.history)
                    ListTile(
                      title: Text(
                        chat.title ?? context.l10n.assistantUntitledChat,
                      ),
                      subtitle: Text(chat.model ?? ''),
                      onTap: () async {
                        Navigator.of(sheetContext).pop();
                        await _chatCubit.openChat(wsId, chat);
                      },
                    ),
                ],
              );
            },
          ),
        );
      },
    );
  }

  Future<void> _showSettingsDialog(BuildContext context, String wsId) async {
    await showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(context.l10n.assistantSettingsTitle),
        content: const Text('Settings dialog content'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: Text(context.l10n.assistantCancelAction),
          ),
        ],
      ),
    );
  }

  Future<void> _exportChat(
    BuildContext context,
    String wsId,
    AssistantShellState shellState,
    AssistantChatState chatState,
  ) async {
    final buffer = StringBuffer()
      ..writeln('# ${context.l10n.assistantExportShareText}')
      ..writeln('');
    for (final message in chatState.messages) {
      buffer.writeln('## ${message.role.toUpperCase()}');
      for (final part in message.parts) {
        if (part.text?.isNotEmpty == true) {
          buffer.writeln(part.text);
        }
      }
      buffer.writeln('');
    }

    final tempDir = await getTemporaryDirectory();
    final file = File('${tempDir.path}/chat_export.md');
    await file.writeAsString(buffer.toString());

    if (!context.mounted) return;
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path)],
        subject: context.l10n.assistantExportShareText,
      ),
    );
  }
}

// New widget classes for the redesigned UI

class _AnimatedDot extends StatefulWidget {
  const _AnimatedDot({required this.delay});
  final int delay;

  @override
  State<_AnimatedDot> createState() => _AnimatedDotState();
}

class _AnimatedDotState extends State<_AnimatedDot>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    );
    _animation = Tween<double>(begin: 0.3, end: 1).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _controller.repeat(reverse: true);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _animation,
      child: Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.primary,
          borderRadius: BorderRadius.circular(4),
        ),
      ),
    );
  }
}

class _AnimatedAssistantIcon extends StatefulWidget {
  @override
  State<_AnimatedAssistantIcon> createState() => _AnimatedAssistantIconState();
}

class _AnimatedAssistantIconState extends State<_AnimatedAssistantIcon>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(seconds: 3),
      vsync: this,
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            gradient: SweepGradient(
              colors: [
                Theme.of(context).colorScheme.primary.withValues(alpha: 0.2),
                Theme.of(context).colorScheme.primary.withValues(alpha: 0.5),
                Theme.of(context).colorScheme.primary.withValues(alpha: 0.2),
              ],
              transform: GradientRotation(_controller.value * 2 * 3.14159),
            ),
            borderRadius: BorderRadius.circular(24),
          ),
          child: Center(
            child: Icon(
              Icons.auto_awesome_rounded,
              size: 40,
              color: Theme.of(context).colorScheme.primary,
            ),
          ),
        );
      },
    );
  }
}

class _PromptChip extends StatelessWidget {
  const _PromptChip({required this.prompt, required this.onTap});
  final String prompt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: Theme.of(
                context,
              ).colorScheme.outlineVariant.withValues(alpha: 0.3),
            ),
          ),
          child: Text(
            prompt,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ),
    );
  }
}

class _ConsolidatedTools extends StatefulWidget {
  const _ConsolidatedTools({required this.toolParts});
  final List<AssistantMessagePart> toolParts;

  @override
  State<_ConsolidatedTools> createState() => _ConsolidatedToolsState();
}

class _ConsolidatedToolsState extends State<_ConsolidatedTools> {
  bool _expanded = false;

  String _getToolStatus(AssistantMessagePart part) {
    if (part.state == 'error') return 'Error';
    if (part.state == 'completed' ||
        part.state == 'output-available' ||
        part.state == 'input-available') {
      return 'Done';
    }
    if (part.state == 'input-streaming' ||
        part.state == 'input-start' ||
        part.state == 'output-streaming' ||
        part.state == 'output-start') {
      return 'Running...';
    }
    // Default to done for unknown states
    return 'Done';
  }

  IconData _getToolIcon(String? toolName) {
    switch (toolName) {
      case 'render_ui':
        return Icons.dashboard_customize_outlined;
      case 'select_tools':
        return Icons.tune_outlined;
      case 'set_workspace_context':
        return Icons.workspaces_outlined;
      case 'update_my_settings':
        return Icons.settings_suggest_outlined;
      case 'set_immersive_mode':
        return Icons.fullscreen_outlined;
      default:
        return Icons.memory_outlined;
    }
  }

  String _humanizeToolName(String? toolName) {
    if (toolName == null || toolName.isEmpty) return 'Tool';
    return toolName
        .split('_')
        .map(
          (word) => word.isEmpty
              ? ''
              : '${word[0].toUpperCase()}${word.substring(1)}',
        )
        .join(' ');
  }

  @override
  Widget build(BuildContext context) {
    // Group tools by name
    final groupedTools = <String, List<AssistantMessagePart>>{};
    for (final part in widget.toolParts) {
      final name = part.toolName ?? 'Unknown';
      groupedTools.putIfAbsent(name, () => []).add(part);
    }

    // Check if all tools are complete
    final allDone = widget.toolParts.every(
      (p) =>
          p.state == 'completed' ||
          p.state == 'error' ||
          p.state == 'output-available' ||
          p.state == 'input-available',
    );
    final anyRunning = widget.toolParts.any(
      (p) =>
          p.state == 'input-streaming' ||
          p.state == 'input-start' ||
          p.state == 'output-streaming' ||
          p.state == 'output-start',
    );
    final anyError = widget.toolParts.any((p) => p.state == 'error');

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: Theme.of(
            context,
          ).colorScheme.outlineVariant.withValues(alpha: 0.3),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row - always visible
          InkWell(
            onTap: () => setState(() => _expanded = !_expanded),
            borderRadius: BorderRadius.circular(8),
            child: Row(
              children: [
                Icon(
                  Icons.memory,
                  size: 16,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
                const SizedBox(width: 8),
                Text(
                  '${widget.toolParts.length} tool${widget.toolParts.length > 1 ? 's' : ''}',
                  style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(width: 8),
                if (anyRunning)
                  SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  )
                else if (anyError)
                  Icon(
                    Icons.error_outline,
                    size: 14,
                    color: Theme.of(context).colorScheme.error,
                  )
                else if (allDone)
                  Icon(
                    Icons.check_circle_outline,
                    size: 14,
                    color: Theme.of(context).colorScheme.primary,
                  ),
                const Spacer(),
                Icon(
                  _expanded ? Icons.expand_less : Icons.expand_more,
                  size: 18,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
              ],
            ),
          ),
          // Expanded content
          if (_expanded) ...[
            const SizedBox(height: 12),
            ...groupedTools.entries.map((entry) {
              final toolName = entry.key;
              final parts = entry.value;
              final latestPart = parts.last;
              final status = _getToolStatus(latestPart);

              return Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surfaceContainerHigh,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          _getToolIcon(toolName),
                          size: 14,
                          color: Theme.of(context).colorScheme.onSurfaceVariant,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _humanizeToolName(toolName),
                            style: Theme.of(context).textTheme.bodySmall
                                ?.copyWith(
                                  fontWeight: FontWeight.w500,
                                ),
                          ),
                        ),
                        if (parts.length > 1)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 6,
                              vertical: 2,
                            ),
                            decoration: BoxDecoration(
                              color: Theme.of(
                                context,
                              ).colorScheme.surfaceContainerHighest,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              '${parts.length}',
                              style: Theme.of(context).textTheme.labelSmall,
                            ),
                          ),
                        const SizedBox(width: 8),
                        Text(
                          status,
                          style: Theme.of(context).textTheme.labelSmall
                              ?.copyWith(
                                color: status == 'Error'
                                    ? Theme.of(context).colorScheme.error
                                    : status == 'Done'
                                    ? Theme.of(context).colorScheme.primary
                                    : Theme.of(
                                        context,
                                      ).colorScheme.onSurfaceVariant,
                              ),
                        ),
                      ],
                    ),
                  ],
                ),
              );
            }),
          ],
        ],
      ),
    );
  }
}

class _AttachmentChip extends StatelessWidget {
  const _AttachmentChip({required this.attachment, required this.onTap});
  final AssistantAttachment attachment;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      avatar: const Icon(Icons.attach_file_rounded, size: 16),
      label: Text(attachment.name),
      onPressed: onTap,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerLow,
    );
  }
}

class _AttachmentInputChip extends StatelessWidget {
  const _AttachmentInputChip({
    required this.attachment,
    required this.onDelete,
  });
  final AssistantAttachment attachment;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Chip(
      avatar: const Icon(Icons.attach_file_rounded, size: 16),
      label: Text(attachment.name),
      deleteIcon: const Icon(Icons.close_rounded, size: 16),
      onDeleted: onDelete,
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerLow,
    );
  }
}

class _SourceLink extends StatelessWidget {
  const _SourceLink({required this.onTap, this.title, this.url});
  final String? title;
  final String? url;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Theme.of(
            context,
          ).colorScheme.primaryContainer.withValues(alpha: 0.3),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.link_rounded,
              size: 14,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                title ?? url ?? 'Source',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.primary,
                  decoration: TextDecoration.underline,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ComposerActionButton extends StatelessWidget {
  const _ComposerActionButton({
    required this.icon,
    required this.onPressed,
    this.isDestructive = false,
  });
  final IconData icon;
  final VoidCallback onPressed;
  final bool isDestructive;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(20),
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: isDestructive
                ? Theme.of(context).colorScheme.errorContainer
                : Theme.of(context).colorScheme.surfaceContainerHighest,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Icon(
            icon,
            size: 20,
            color: isDestructive
                ? Theme.of(context).colorScheme.error
                : Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

class _SendButton extends StatelessWidget {
  const _SendButton({required this.onPressed});
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Theme.of(context).colorScheme.primary,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(20),
        child: SizedBox(
          width: 40,
          height: 40,
          child: Icon(
            Icons.arrow_upward_rounded,
            size: 20,
            color: Theme.of(context).colorScheme.onPrimary,
          ),
        ),
      ),
    );
  }
}
