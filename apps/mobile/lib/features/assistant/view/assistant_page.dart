// Assistant page - completely redesigned for modern UX
// ignore_for_file: directives_ordering, lines_longer_than_80_chars, discarded_futures, avoid_types_on_closure_parameters, avoid_redundant_argument_values

import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart' hide Badge, Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
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
  bool _isNearBottom = true;
  bool _pendingAutoScroll = false;
  bool _isAnimatingToBottom = false;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_handleScrollChanged);
  }

  @override
  void dispose() {
    _inputController.dispose();
    _inputFocusNode.dispose();
    _renameController.dispose();
    _scrollController
      ..removeListener(_handleScrollChanged)
      ..dispose();
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
            return Center(child: Text(context.l10n.assistantSelectWorkspace));
          }

          return BlocBuilder<AssistantShellCubit, AssistantShellState>(
            builder: (context, shellState) {
              return MultiBlocListener(
                listeners: [
                  BlocListener<AssistantChatCubit, AssistantChatState>(
                    listenWhen: (prev, curr) {
                      final countChanged =
                          prev.messages.length != curr.messages.length;
                      final streamUpdate =
                          curr.status == AssistantChatStatus.streaming &&
                          prev.messages != curr.messages;
                      final queueChanged =
                          prev.queuedMessages != curr.queuedMessages;
                      final statusChanged = prev.status != curr.status;
                      return countChanged ||
                          streamUpdate ||
                          queueChanged ||
                          statusChanged;
                    },
                    listener: (context, state) {
                      if (state.messages.isNotEmpty ||
                          state.queuedMessages.isNotEmpty) {
                        _scheduleScrollToBottom(
                          animated:
                              state.status != AssistantChatStatus.streaming,
                        );
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
                        _scheduleScrollToBottom(force: true);
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
                    final theme = Theme.of(context);
                    final showBackdropOrbs =
                        theme.brightness == Brightness.dark;
                    final hasConversation =
                        chatState.messages.isNotEmpty ||
                        chatState.queuedMessages.isNotEmpty ||
                        chatState.status == AssistantChatStatus.submitting;
                    final composerInset = shellState.isViewOnly
                        ? 0.0
                        : hasConversation
                        ? _composerDockHeight(chatState)
                        : 0.0;

                    return DecoratedBox(
                      decoration: _buildPageDecoration(theme),
                      child: Stack(
                        children: [
                          if (showBackdropOrbs) ...[
                            const Positioned(
                              top: -72,
                              right: -40,
                              child: _BackdropOrb(
                                size: 220,
                                color: Color(0xFF7C3AED),
                              ),
                            ),
                            const Positioned(
                              top: 116,
                              left: -54,
                              child: _BackdropOrb(
                                size: 176,
                                color: Color(0xFF0EA5E9),
                              ),
                            ),
                            const Positioned(
                              bottom: 110,
                              right: -36,
                              child: _BackdropOrb(
                                size: 188,
                                color: Color(0xFFF97316),
                              ),
                            ),
                          ],
                          SafeArea(
                            top: false,
                            bottom: isFullscreen,
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
                                child: Stack(
                                  children: [
                                    Positioned.fill(
                                      child: Padding(
                                        padding: EdgeInsets.only(
                                          bottom: hasConversation
                                              ? composerInset
                                              : 0,
                                        ),
                                        child: _buildConversation(
                                          context,
                                          currentWorkspace,
                                          shellState,
                                          chatState,
                                        ),
                                      ),
                                    ),
                                    if (!shellState.isViewOnly)
                                      Positioned(
                                        left: 0,
                                        right: 0,
                                        bottom: 8,
                                        child: _buildComposer(
                                          context,
                                          currentWorkspace.id,
                                          shellState,
                                          chatState,
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        ],
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
        chatState.queuedMessages.isEmpty &&
        chatState.status != AssistantChatStatus.submitting) {
      return _buildEmptyState(
        context,
        workspace,
        shellState,
        bottomInset: shellState.isViewOnly ? 0 : _composerDockHeight(chatState),
      );
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

    final showQueue = chatState.queuedMessages.isNotEmpty;
    final showTyping = chatState.isBusy;
    final extraItems = (showQueue ? 1 : 0) + (showTyping ? 1 : 0);

    return ListView.builder(
      controller: _scrollController,
      physics: const ClampingScrollPhysics(),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.fromLTRB(0, 16, 0, 20),
      cacheExtent: 480,
      itemCount: validMessages.length + extraItems,
      itemBuilder: (context, index) {
        if (index < validMessages.length) {
          final message = validMessages[index];
          final attachments =
              chatState.attachmentsByMessageId[message.id] ?? const [];

          return KeyedSubtree(
            key: ValueKey('message_${message.id}'),
            child: _buildMessageBubble(
              context,
              workspace.id,
              shellState,
              message,
              attachments,
            ),
          );
        }

        final footerIndex = index - validMessages.length;
        if (showQueue && footerIndex == 0) {
          return _buildQueuedMessages(context, chatState.queuedMessages);
        }

        return _buildTypingIndicator(context, chatState: chatState);
      },
    );
  }

  Widget _buildMessageBubble(
    BuildContext context,
    String wsId,
    AssistantShellState shellState,
    AssistantMessage message,
    List<AssistantAttachment> attachments,
  ) {
    final isUser = message.role == 'user';
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bubbleAccent = isUser
        ? theme.colorScheme.primary
        : const Color(0xFF06B6D4);

    final bubbleDecoration = BoxDecoration(
      gradient: LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: isUser
            ? [
                bubbleAccent.withValues(alpha: isDark ? 0.54 : 0.3),
                theme.colorScheme.primaryContainer.withValues(
                  alpha: isDark ? 0.92 : 0.98,
                ),
              ]
            : [
                Color.alphaBlend(
                  bubbleAccent.withValues(alpha: isDark ? 0.2 : 0.1),
                  theme.colorScheme.surfaceContainerHigh,
                ),
                theme.colorScheme.surfaceContainerHighest,
              ],
      ),
      borderRadius: BorderRadius.only(
        topLeft: const Radius.circular(20),
        topRight: const Radius.circular(20),
        bottomLeft: Radius.circular(isUser ? 20 : 6),
        bottomRight: Radius.circular(isUser ? 6 : 20),
      ),
      border: Border.all(
        color: bubbleAccent.withValues(alpha: isUser ? 0.36 : 0.24),
      ),
      boxShadow: [
        BoxShadow(
          color: bubbleAccent.withValues(alpha: isDark ? 0.22 : 0.12),
          blurRadius: 14,
          offset: const Offset(0, 6),
        ),
      ],
    );

    final timeLabel = DateFormat.Hm().format(
      message.createdAt ?? DateTime.now(),
    );

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: isUser
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,
        children: [
          if (!isUser)
            _MessageAvatar(
              icon: Icons.auto_awesome_rounded,
              color: bubbleAccent,
            ),
          if (!isUser) const SizedBox(width: 10),
          Flexible(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 860),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: bubbleDecoration,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Align(
                      alignment: Alignment.centerRight,
                      child: Text(
                        timeLabel,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant.withValues(
                            alpha: isUser ? 0.86 : 0.74,
                          ),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    if (attachments.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: attachments
                            .map(
                              (attachment) => _AttachmentChip(
                                attachment: attachment,
                                onTap: () =>
                                    _openAttachment(attachment.signedUrl),
                              ),
                            )
                            .toList(),
                      ),
                      const SizedBox(height: 12),
                    ],
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
            ),
          ),
          if (isUser) const SizedBox(width: 10),
          if (isUser)
            _MessageAvatar(
              icon: Icons.person_rounded,
              color: theme.colorScheme.primary,
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

  Widget _buildTypingIndicator(
    BuildContext context, {
    required AssistantChatState chatState,
  }) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    const accent = Color(0xFF06B6D4);
    final queuedCount = chatState.queuedMessages.length;

    final phaseLabel = context.l10n.assistantThinkingStatus;

    return Container(
      margin: const EdgeInsets.only(right: 52, left: 44, bottom: 16),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.alphaBlend(
              accent.withValues(alpha: isDark ? 0.26 : 0.14),
              theme.colorScheme.surfaceContainerHigh,
            ),
            theme.colorScheme.surfaceContainerHighest,
          ],
        ),
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(20),
          topRight: Radius.circular(20),
          bottomLeft: Radius.circular(6),
          bottomRight: Radius.circular(20),
        ),
        border: Border.all(
          color: accent.withValues(alpha: isDark ? 0.46 : 0.28),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const _MessageAvatar(
                icon: Icons.auto_awesome_rounded,
                color: accent,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  phaseLabel,
                  style: theme.textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
              if (queuedCount > 0)
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 3,
                  ),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primaryContainer.withValues(
                      alpha: 0.58,
                    ),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    '${context.l10n.assistantQueuedPrefix} $queuedCount',
                    style: theme.textTheme.labelSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 12),
          const _AssistantLoadingSkeleton(lineFractions: [0.94, 0.78, 0.56]),
        ],
      ),
    );
  }

  Widget _buildQueuedMessages(
    BuildContext context,
    List<String> queuedMessages,
  ) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    const queueColor = Color(0xFFF59E0B);
    final visible = queuedMessages.take(3).toList(growable: false);
    final remaining = queuedMessages.length - visible.length;

    return Container(
      margin: const EdgeInsets.only(right: 52, left: 44, bottom: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.alphaBlend(
              queueColor.withValues(alpha: isDark ? 0.3 : 0.16),
              theme.colorScheme.surfaceContainerHigh,
            ),
            theme.colorScheme.surfaceContainerHighest,
          ],
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: queueColor.withValues(alpha: 0.34)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(
                Icons.schedule_send_rounded,
                size: 16,
                color: queueColor,
              ),
              const SizedBox(width: 8),
              Text(
                context.l10n.assistantQueuedPrefix,
                style: theme.textTheme.labelLarge?.copyWith(
                  color: queueColor,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          for (final queued in visible) ...[
            _QueuedMessageLine(message: queued),
            if (queued != visible.last) const SizedBox(height: 6),
          ],
          if (remaining > 0) ...[
            const SizedBox(height: 6),
            Text(
              '+$remaining',
              style: theme.textTheme.labelMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildEmptyState(
    BuildContext context,
    Workspace workspace,
    AssistantShellState shellState, {
    required double bottomInset,
  }) {
    final l10n = context.l10n;
    final workspaceLabel = workspace.name?.trim().isNotEmpty == true
        ? workspace.name!.trim()
        : l10n.assistantPersonalWorkspace;
    final prompts = [
      _PromptDescriptor(
        label: l10n.assistantQuickPromptCalendar,
        badge: l10n.assistantCalendarLabel,
        icon: Icons.calendar_month_rounded,
        color: const Color(0xFF0EA5E9),
      ),
      _PromptDescriptor(
        label: l10n.assistantQuickPromptTasks,
        badge: l10n.assistantTasksLabel,
        icon: Icons.task_alt_rounded,
        color: const Color(0xFFA78BFA),
      ),
      _PromptDescriptor(
        label: l10n.assistantQuickPromptFocus,
        badge: l10n.assistantModeThinking,
        icon: Icons.center_focus_strong_rounded,
        color: const Color(0xFFF97316),
      ),
      _PromptDescriptor(
        label: l10n.assistantQuickPromptExpense,
        badge: l10n.assistantActionsTitle,
        icon: Icons.receipt_long_rounded,
        color: const Color(0xFF10B981),
      ),
    ];
    final nextEvent = _nextCalendarEvent(shellState);
    final topTask = _topPriorityTask(shellState);

    return Align(
      alignment: Alignment.topCenter,
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(0, 20, 0, 28 + bottomInset),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _AssistantHero(
              assistantName: shellState.soul.name,
              title: 'What can I help you with?',
              description: l10n.assistantWorkspaceAwareDescription,
              workspaceLabel: workspaceLabel,
              thinkingModeLabel: _thinkingModeLabel(context, shellState),
              creditsLabel: _creditsSummaryLabel(context, shellState),
              tasksTotal: shellState.tasksInsight.total,
              completedToday: shellState.tasksInsight.completedToday,
              overdueTotal: shellState.tasksInsight.overdue.length,
              upcomingEvents: shellState.calendarInsight.events.length,
            ),
            const SizedBox(height: 16),
            LayoutBuilder(
              builder: (context, constraints) {
                final stacked = constraints.maxWidth < 620;
                final taskCard = _InsightSpotlightCard(
                  icon: Icons.priority_high_rounded,
                  color: const Color(0xFFA78BFA),
                  title: topTask?.name ?? l10n.assistantQuickPromptTasks,
                  subtitle: topTask != null
                      ? _taskSubtitle(context, topTask)
                      : '${shellState.tasksInsight.total} ${l10n.assistantTasksLabel} • ${shellState.tasksInsight.overdue.length} ${l10n.assistantActiveLabel}',
                  onTap: () => _submitText(
                    workspace.id,
                    shellState,
                    l10n.assistantQuickPromptTasks,
                  ),
                );
                final eventCard = _InsightSpotlightCard(
                  icon: Icons.event_available_rounded,
                  color: const Color(0xFF0EA5E9),
                  title: nextEvent?.title ?? l10n.assistantQuickPromptCalendar,
                  subtitle: nextEvent != null
                      ? _calendarSubtitle(context, nextEvent)
                      : '${shellState.calendarInsight.events.length} ${l10n.assistantUpcomingLabel} • ${l10n.assistantCalendarLabel}',
                  onTap: () => _submitText(
                    workspace.id,
                    shellState,
                    l10n.assistantQuickPromptCalendar,
                  ),
                );

                if (stacked) {
                  return Column(
                    children: [
                      taskCard,
                      const SizedBox(height: 12),
                      eventCard,
                    ],
                  );
                }

                return Row(
                  children: [
                    Expanded(child: taskCard),
                    const SizedBox(width: 12),
                    Expanded(child: eventCard),
                  ],
                );
              },
            ),
            const SizedBox(height: 16),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              itemCount: prompts.length,
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 260,
                mainAxisExtent: 108,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
              ),
              itemBuilder: (context, index) {
                final prompt = prompts[index];
                return _PromptChip(
                  prompt: prompt,
                  onTap: () => _submitText(
                    workspace.id,
                    shellState,
                    prompt.label,
                  ),
                );
              },
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
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.alphaBlend(
              const Color(0xFFA78BFA).withValues(alpha: isDark ? 0.14 : 0.05),
              theme.colorScheme.surface,
            ),
            Color.alphaBlend(
              const Color(0xFF0EA5E9).withValues(alpha: isDark ? 0.12 : 0.04),
              theme.colorScheme.surface,
            ),
          ],
        ),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0F172A).withValues(
              alpha: isDark ? 0.18 : 0.08,
            ),
            blurRadius: 22,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _ComposerContextChip(
                    icon: Icons.model_training_outlined,
                    label: shellState.selectedModel.label,
                    color: const Color(0xFFA78BFA),
                  ),
                  const SizedBox(width: 8),
                  _ComposerContextChip(
                    icon: Icons.bolt_rounded,
                    label: _thinkingModeLabel(context, shellState),
                    color: const Color(0xFF0EA5E9),
                  ),
                  const SizedBox(width: 8),
                  _ComposerContextChip(
                    icon: Icons.account_balance_wallet_outlined,
                    label: _creditSourceLabel(context, shellState),
                    color: const Color(0xFFF97316),
                  ),
                ],
              ),
            ),
          ),
          if (chatState.composerAttachments.isNotEmpty)
            Container(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
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
            padding: const EdgeInsets.all(10),
            child: Container(
              decoration: BoxDecoration(
                color: theme.colorScheme.surface.withValues(
                  alpha: isDark ? 0.68 : 0.78,
                ),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(
                  color: theme.colorScheme.outlineVariant.withValues(
                    alpha: isDark ? 0.34 : 0.4,
                  ),
                ),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(8, 8, 0, 8),
                    child: _ComposerActionButton(
                      icon: Icons.add_rounded,
                      onPressed: () => _showComposerMenu(
                        context,
                        wsId,
                        shellState,
                        chatState,
                      ),
                    ),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _inputController,
                      focusNode: _inputFocusNode,
                      minLines: 1,
                      maxLines: 6,
                      decoration: InputDecoration(
                        hintText: context.l10n.assistantAskPlaceholder,
                        hintStyle: TextStyle(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                        border: InputBorder.none,
                        isDense: true,
                        contentPadding: const EdgeInsets.symmetric(
                          vertical: 16,
                          horizontal: 14,
                        ),
                      ),
                      onSubmitted: (_) => _submitCurrentInput(wsId, shellState),
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(0, 8, 8, 8),
                    child: chatState.isBusy
                        ? _ComposerActionButton(
                            icon: Icons.stop_rounded,
                            isDestructive: true,
                            onPressed: _chatCubit.stopStreaming,
                          )
                        : _SendButton(
                            onPressed: () =>
                                _submitCurrentInput(wsId, shellState),
                          ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _thinkingModeLabel(
    BuildContext context,
    AssistantShellState shellState,
  ) => shellState.thinkingMode == AssistantThinkingMode.fast
      ? context.l10n.assistantModeFast
      : context.l10n.assistantModeThinking;

  String _creditSourceLabel(
    BuildContext context,
    AssistantShellState shellState,
  ) => shellState.creditSource == AssistantCreditSource.personal
      ? context.l10n.assistantPersonalCredits
      : context.l10n.assistantWorkspaceCredits;

  String _creditsSummaryLabel(
    BuildContext context,
    AssistantShellState shellState,
  ) {
    return context.l10n.assistantCreditsSummary(
      shellState.activeCredits.remaining.toInt(),
      shellState.activeCredits.tier,
    );
  }

  AssistantTaskInsight? _topPriorityTask(AssistantShellState shellState) {
    if (shellState.tasksInsight.overdue.isNotEmpty) {
      return shellState.tasksInsight.overdue.first;
    }
    if (shellState.tasksInsight.today.isNotEmpty) {
      return shellState.tasksInsight.today.first;
    }
    if (shellState.tasksInsight.upcoming.isNotEmpty) {
      return shellState.tasksInsight.upcoming.first;
    }

    return null;
  }

  AssistantCalendarEvent? _nextCalendarEvent(AssistantShellState shellState) {
    final now = DateTime.now();
    final events = [...shellState.calendarInsight.events]
      ..sort((left, right) {
        final leftTime =
            left.startAt ??
            left.endAt ??
            DateTime.fromMillisecondsSinceEpoch(0);
        final rightTime =
            right.startAt ??
            right.endAt ??
            DateTime.fromMillisecondsSinceEpoch(0);
        return leftTime.compareTo(rightTime);
      });

    for (final event in events) {
      final eventTime = event.endAt ?? event.startAt;
      if (eventTime == null || eventTime.isAfter(now)) {
        return event;
      }
    }

    return events.isEmpty ? null : events.first;
  }

  String _taskSubtitle(
    BuildContext context,
    AssistantTaskInsight? task,
  ) {
    if (task == null) {
      return context.l10n.assistantWorkspaceAwareDescription;
    }

    final segments = <String>[
      if ((task.boardName ?? '').trim().isNotEmpty) task.boardName!.trim(),
      if ((task.listName ?? '').trim().isNotEmpty) task.listName!.trim(),
      if (task.endDate != null)
        DateFormat('EEE, MMM d • HH:mm').format(task.endDate!),
    ];

    if (segments.isEmpty) {
      return context.l10n.assistantTasksLabel;
    }

    return segments.join(' • ');
  }

  String _calendarSubtitle(
    BuildContext context,
    AssistantCalendarEvent? event,
  ) {
    if (event == null) {
      return context.l10n.assistantWorkspaceAwareDescription;
    }

    final segments = <String>[
      if (event.startAt != null)
        DateFormat('EEE, MMM d • HH:mm').format(event.startAt!),
      if ((event.location ?? '').trim().isNotEmpty) event.location!.trim(),
    ];

    if (segments.isEmpty) {
      return context.l10n.assistantCalendarLabel;
    }

    return segments.join(' • ');
  }

  BoxDecoration _buildPageDecoration(ThemeData theme) {
    final isDark = theme.brightness == Brightness.dark;

    return BoxDecoration(
      color: isDark ? const Color(0xFF09090C) : const Color(0xFFFAFAF7),
    );
  }

  double _composerDockHeight(AssistantChatState chatState) {
    return chatState.composerAttachments.isNotEmpty ? 204 : 154;
  }

  Future<void> _submitCurrentInput(
    String wsId,
    AssistantShellState shellState,
  ) async {
    final text = _inputController.text.trim();
    if (text.isEmpty) return;

    _inputController.clear();
    _scheduleScrollToBottom(force: true, animated: false);
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

  void _handleScrollChanged() {
    if (!_scrollController.hasClients || _isAnimatingToBottom) return;

    final position = _scrollController.position;
    final remaining = position.maxScrollExtent - position.pixels;
    _isNearBottom = remaining <= 84;
  }

  void _scheduleScrollToBottom({bool force = false, bool animated = true}) {
    if (!force && !_isNearBottom) return;
    if (_pendingAutoScroll) return;

    _pendingAutoScroll = true;
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      _pendingAutoScroll = false;
      if (!_scrollController.hasClients) return;

      final position = _scrollController.position;
      final target = position.maxScrollExtent;
      final delta = (target - position.pixels).abs();
      if (delta <= 2) {
        _isNearBottom = true;
        return;
      }

      if (animated && delta <= 560) {
        _isAnimatingToBottom = true;
        try {
          await _scrollController.animateTo(
            target,
            duration: const Duration(milliseconds: 220),
            curve: Curves.easeOutCubic,
          );
        } on Exception catch (_) {
          // Ignore race conditions when list metrics change mid-animation.
        } finally {
          _isAnimatingToBottom = false;
        }
      } else {
        _scrollController.jumpTo(target);
      }

      _isNearBottom = true;
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
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => Padding(
        padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        child: Container(
          decoration: BoxDecoration(
            color: Theme.of(sheetContext).colorScheme.surface,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: Theme.of(
                sheetContext,
              ).colorScheme.outlineVariant.withValues(alpha: 0.42),
            ),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const _SheetHandle(),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Text(
                        l10n.assistantActionsTitle,
                        style: Theme.of(sheetContext).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _SheetActionTile(
                    icon: Icons.add_comment_rounded,
                    label: l10n.assistantNewConversation,
                    color: const Color(0xFF8B5CF6),
                    onTap: () async {
                      Navigator.of(sheetContext).pop();
                      await _chatCubit.resetConversation(wsId);
                    },
                  ),
                  _SheetActionTile(
                    icon: Icons.attach_file_rounded,
                    label: l10n.assistantAttachFilesAction,
                    color: const Color(0xFF0EA5E9),
                    onTap: () async {
                      Navigator.of(sheetContext).pop();
                      await _pickFiles(wsId);
                    },
                  ),
                  _SheetActionTile(
                    icon: Icons.fullscreen_rounded,
                    label: isFullscreen
                        ? l10n.assistantExitFullscreenAction
                        : l10n.assistantEnterFullscreenAction,
                    color: const Color(0xFF10B981),
                    onTap: () {
                      Navigator.of(sheetContext).pop();
                      _setFullscreen(
                        !isFullscreen,
                        focusInput: true,
                      );
                    },
                  ),
                  _SheetActionTile(
                    icon: Icons.history_rounded,
                    label: l10n.assistantHistoryTitle,
                    color: const Color(0xFFF59E0B),
                    onTap: () {
                      Navigator.of(sheetContext).pop();
                      _showHistorySheet(context, wsId);
                    },
                  ),
                  _SheetActionTile(
                    icon: Icons.tune_rounded,
                    label: l10n.assistantSettingsTitle,
                    color: const Color(0xFF3B82F6),
                    onTap: () {
                      Navigator.of(sheetContext).pop();
                      _showSettingsSheet(context);
                    },
                  ),
                  if (chatState.messages.isNotEmpty)
                    _SheetActionTile(
                      icon: Icons.ios_share_rounded,
                      label: l10n.assistantExportChat,
                      color: const Color(0xFFEC4899),
                      onTap: () {
                        Navigator.of(sheetContext).pop();
                        _exportChat(context, wsId, shellState, chatState);
                      },
                    ),
                ],
              ),
            ),
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
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) {
        return BlocProvider.value(
          value: _chatCubit,
          child: BlocBuilder<AssistantChatCubit, AssistantChatState>(
            builder: (context, state) {
              return Padding(
                padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                child: Container(
                  decoration: BoxDecoration(
                    color: Theme.of(context).colorScheme.surface,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(
                      color: Theme.of(
                        context,
                      ).colorScheme.outlineVariant.withValues(alpha: 0.42),
                    ),
                  ),
                  child: ListView(
                    padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                    children: [
                      const _SheetHandle(),
                      const SizedBox(height: 8),
                      Text(
                        context.l10n.assistantHistoryTitle,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 12),
                      if (state.history.isEmpty)
                        Container(
                          padding: const EdgeInsets.all(14),
                          decoration: BoxDecoration(
                            color: Theme.of(
                              context,
                            ).colorScheme.surfaceContainerLow,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: Theme.of(context)
                                  .colorScheme
                                  .outlineVariant
                                  .withValues(alpha: 0.3),
                            ),
                          ),
                          child: Text(
                            context.l10n.assistantUntitledChat,
                            style: Theme.of(context).textTheme.bodyMedium
                                ?.copyWith(
                                  color: Theme.of(
                                    context,
                                  ).colorScheme.onSurfaceVariant,
                                ),
                          ),
                        ),
                      for (final chat in state.history)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _HistoryChatTile(
                            title:
                                chat.title ??
                                context.l10n.assistantUntitledChat,
                            subtitle: chat.model ?? '',
                            isActive: chat.id == state.chat?.id,
                            createdAt: chat.createdAt,
                            onTap: () async {
                              Navigator.of(sheetContext).pop();
                              await _chatCubit.openChat(wsId, chat);
                            },
                          ),
                        ),
                    ],
                  ),
                ),
              );
            },
          ),
        );
      },
    );
  }

  Future<void> _showSettingsSheet(BuildContext context) async {
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (sheetContext) => BlocProvider.value(
        value: _shellCubit,
        child: BlocBuilder<AssistantShellCubit, AssistantShellState>(
          builder: (context, state) {
            final l10n = context.l10n;
            final modeOptions = [
              (
                value: AssistantThinkingMode.fast,
                label: l10n.assistantModeFast,
              ),
              (
                value: AssistantThinkingMode.thinking,
                label: l10n.assistantModeThinking,
              ),
            ];
            final sourceOptions = [
              (
                value: AssistantCreditSource.personal,
                label: l10n.assistantPersonalCredits,
              ),
              (
                value: AssistantCreditSource.workspace,
                label: l10n.assistantWorkspaceCredits,
              ),
            ];

            return Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Container(
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(
                    color: Theme.of(
                      context,
                    ).colorScheme.outlineVariant.withValues(alpha: 0.42),
                  ),
                ),
                child: SingleChildScrollView(
                  padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const _SheetHandle(),
                      const SizedBox(height: 8),
                      Text(
                        l10n.assistantSettingsTitle,
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Theme.of(
                            context,
                          ).colorScheme.surfaceContainerLow,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: Theme.of(
                              context,
                            ).colorScheme.outlineVariant.withValues(alpha: 0.3),
                          ),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.model_training_outlined, size: 18),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                '${l10n.assistantModelLabel}: ${state.selectedModel.label}',
                                style: Theme.of(context).textTheme.bodyMedium,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: modeOptions
                            .map(
                              (option) => _SettingsChoiceChip(
                                label: option.label,
                                selected: state.thinkingMode == option.value,
                                onTap: () => _shellCubit.setThinkingMode(
                                  option.value,
                                ),
                              ),
                            )
                            .toList(),
                      ),
                      const SizedBox(height: 12),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: sourceOptions
                            .map(
                              (option) => _SettingsChoiceChip(
                                label: option.label,
                                selected: state.creditSource == option.value,
                                enabled:
                                    !state.workspaceCreditLocked ||
                                    option.value ==
                                        AssistantCreditSource.personal,
                                onTap: () => _shellCubit.setCreditSource(
                                  option.value,
                                ),
                              ),
                            )
                            .toList(),
                      ),
                      const SizedBox(height: 12),
                      SwitchListTile.adaptive(
                        value: state.isViewOnly,
                        onChanged: _shellCubit.setViewOnly,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 6,
                        ),
                        title: Text(l10n.assistantViewOnlyLabel),
                        subtitle: Text(
                          state.isViewOnly
                              ? l10n.assistantViewOnlyLabel
                              : l10n.assistantEditableLabel,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
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

class _PromptDescriptor {
  const _PromptDescriptor({
    required this.label,
    required this.badge,
    required this.icon,
    required this.color,
  });

  final String label;
  final String badge;
  final IconData icon;
  final Color color;
}

class _BackdropOrb extends StatelessWidget {
  const _BackdropOrb({
    required this.size,
    required this.color,
  });

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            colors: [
              color.withValues(alpha: 0.18),
              color.withValues(alpha: 0.04),
              Colors.transparent,
            ],
          ),
        ),
      ),
    );
  }
}

class _AssistantHero extends StatelessWidget {
  const _AssistantHero({
    required this.assistantName,
    required this.title,
    required this.description,
    required this.workspaceLabel,
    required this.thinkingModeLabel,
    required this.creditsLabel,
    required this.tasksTotal,
    required this.completedToday,
    required this.overdueTotal,
    required this.upcomingEvents,
  });

  final String assistantName;
  final String title;
  final String description;
  final String workspaceLabel;
  final String thinkingModeLabel;
  final String creditsLabel;
  final int tasksTotal;
  final int completedToday;
  final int overdueTotal;
  final int upcomingEvents;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final l10n = context.l10n;
    const accentPurple = Color(0xFFA78BFA);

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color.alphaBlend(
              accentPurple.withValues(alpha: 0.1),
              theme.colorScheme.surface,
            ),
            Color.alphaBlend(
              const Color(0xFF0EA5E9).withValues(alpha: 0.1),
              theme.colorScheme.surface,
            ),
            Color.alphaBlend(
              const Color(0xFFF59E0B).withValues(alpha: 0.08),
              theme.colorScheme.surface,
            ),
          ],
        ),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.46),
        ),
        boxShadow: [
          BoxShadow(
            color: accentPurple.withValues(alpha: 0.08),
            blurRadius: 20,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const _AnimatedAssistantIcon(size: 56),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        assistantName,
                        style: theme.textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.2,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        title,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          height: 1.05,
                          letterSpacing: -0.6,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                _SurfaceTag(
                  icon: Icons.workspaces_rounded,
                  label: workspaceLabel,
                  color: const Color(0xFF0EA5E9),
                ),
                _SurfaceTag(
                  icon: Icons.bolt_rounded,
                  label: thinkingModeLabel,
                  color: accentPurple,
                ),
                _SurfaceTag(
                  icon: Icons.toll_rounded,
                  label: creditsLabel,
                  color: const Color(0xFFF97316),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              description,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
                height: 1.4,
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _OverviewMetricTile(
                    icon: Icons.task_alt_rounded,
                    label: l10n.assistantTasksLabel,
                    value: '$tasksTotal',
                    detail: '$completedToday ${l10n.assistantDoneTodayLabel}',
                    color: accentPurple,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _OverviewMetricTile(
                    icon: Icons.warning_amber_rounded,
                    label: l10n.assistantActiveLabel,
                    value: '$overdueTotal',
                    detail: l10n.assistantTasksLabel,
                    color: const Color(0xFFF97316),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _OverviewMetricTile(
                    icon: Icons.calendar_month_rounded,
                    label: l10n.assistantUpcomingLabel,
                    value: '$upcomingEvents',
                    detail: l10n.assistantCalendarLabel,
                    color: const Color(0xFF0EA5E9),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SurfaceTag extends StatelessWidget {
  const _SurfaceTag({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 8),
          Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onSurface,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _OverviewMetricTile extends StatelessWidget {
  const _OverviewMetricTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.detail,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final String detail;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withValues(alpha: 0.8),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(height: 10),
          Text(
            value,
            style: theme.textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w800,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 1),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w700,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            detail,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              height: 1.15,
            ),
          ),
        ],
      ),
    );
  }
}

class _InsightSpotlightCard extends StatelessWidget {
  const _InsightSpotlightCard({
    required this.icon,
    required this.color,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: theme.colorScheme.surface.withValues(alpha: 0.74),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: color.withValues(alpha: 0.22)),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, color: color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        height: 1.15,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AssistantLoadingSkeleton extends StatefulWidget {
  const _AssistantLoadingSkeleton({
    required this.lineFractions,
  });

  final List<double> lineFractions;

  @override
  State<_AssistantLoadingSkeleton> createState() =>
      _AssistantLoadingSkeletonState();
}

class _AssistantLoadingSkeletonState extends State<_AssistantLoadingSkeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1450),
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
    final theme = Theme.of(context);
    final base = theme.colorScheme.surfaceContainerHighest;
    final highlight = Color.alphaBlend(
      theme.colorScheme.primary.withValues(alpha: 0.32),
      base,
    );

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        final progress = _controller.value;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            for (var i = 0; i < widget.lineFractions.length; i++) ...[
              Builder(
                builder: (_) {
                  final wave = (progress + (i * 0.22)) % 1;
                  final opacity = 0.5 + (0.4 * (1 - (wave - 0.5).abs() * 2));
                  return FractionallySizedBox(
                    widthFactor: widget.lineFractions[i],
                    child: Container(
                      height: i == 0 ? 10 : 8,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(999),
                        gradient: LinearGradient(
                          begin: Alignment.centerLeft,
                          end: Alignment.centerRight,
                          colors: [
                            base.withValues(alpha: opacity * 0.86),
                            highlight.withValues(alpha: opacity),
                            base.withValues(alpha: opacity * 0.86),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
              if (i != widget.lineFractions.length - 1)
                const SizedBox(height: 8),
            ],
          ],
        );
      },
    );
  }
}

class _AnimatedAssistantIcon extends StatefulWidget {
  const _AnimatedAssistantIcon({this.size = 80});

  final double size;

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
        final iconSize = widget.size * 0.5;
        final theme = Theme.of(context);
        final isDark = theme.brightness == Brightness.dark;
        final accent = isDark
            ? theme.colorScheme.primary
            : const Color(0xFF9F8BFF);

        return Container(
          width: widget.size,
          height: widget.size,
          decoration: BoxDecoration(
            gradient: SweepGradient(
              colors: [
                accent.withValues(alpha: isDark ? 0.2 : 0.18),
                accent.withValues(alpha: isDark ? 0.5 : 0.38),
                accent.withValues(alpha: isDark ? 0.2 : 0.18),
              ],
              transform: GradientRotation(_controller.value * 2 * 3.14159),
            ),
            borderRadius: BorderRadius.circular(widget.size * 0.3),
          ),
          child: Center(
            child: Icon(
              Icons.auto_awesome_rounded,
              size: iconSize,
              color: accent,
            ),
          ),
        );
      },
    );
  }
}

class _PromptChip extends StatelessWidget {
  const _PromptChip({required this.prompt, required this.onTap});
  final _PromptDescriptor prompt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(20),
        child: Ink(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color.alphaBlend(
                  prompt.color.withValues(alpha: 0.14),
                  theme.colorScheme.surfaceContainerLow,
                ),
                Color.alphaBlend(
                  prompt.color.withValues(alpha: 0.04),
                  theme.colorScheme.surface,
                ),
              ],
            ),
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: prompt.color.withValues(alpha: 0.24)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: BoxDecoration(
                      color: prompt.color.withValues(alpha: 0.13),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(prompt.icon, size: 16, color: prompt.color),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Align(
                      alignment: Alignment.topRight,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.surface.withValues(
                            alpha: 0.72,
                          ),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          prompt.badge,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                            fontWeight: FontWeight.w700,
                            fontSize: 10.5,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                prompt.label,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: theme.colorScheme.onSurface,
                  fontWeight: FontWeight.w800,
                  height: 1.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ComposerContextChip extends StatelessWidget {
  const _ComposerContextChip({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.18)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 8),
          Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: theme.colorScheme.onSurface,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _SheetHandle extends StatelessWidget {
  const _SheetHandle();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Container(
        width: 44,
        height: 4,
        decoration: BoxDecoration(
          color: Theme.of(
            context,
          ).colorScheme.outlineVariant.withValues(alpha: 0.65),
          borderRadius: BorderRadius.circular(999),
        ),
      ),
    );
  }
}

class _SheetActionTile extends StatelessWidget {
  const _SheetActionTile({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(14),
          child: Ink(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Color.alphaBlend(
                    color.withValues(alpha: isDark ? 0.3 : 0.16),
                    theme.colorScheme.surfaceContainerHigh,
                  ),
                  theme.colorScheme.surfaceContainerHighest,
                ],
              ),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: color.withValues(alpha: isDark ? 0.52 : 0.3),
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: color.withValues(alpha: isDark ? 0.35 : 0.2),
                  ),
                  child: Icon(icon, size: 16, color: color),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    label,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Icon(
                  Icons.arrow_forward_ios_rounded,
                  size: 13,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _HistoryChatTile extends StatelessWidget {
  const _HistoryChatTile({
    required this.title,
    required this.subtitle,
    required this.isActive,
    required this.onTap,
    this.createdAt,
  });

  final String title;
  final String subtitle;
  final bool isActive;
  final DateTime? createdAt;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = isActive ? const Color(0xFF8B5CF6) : const Color(0xFF0EA5E9);
    final isDark = theme.brightness == Brightness.dark;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Ink(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                Color.alphaBlend(
                  accent.withValues(alpha: isDark ? 0.28 : 0.12),
                  theme.colorScheme.surfaceContainerLow,
                ),
                theme.colorScheme.surfaceContainerHighest,
              ],
            ),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: accent.withValues(alpha: isActive ? 0.5 : 0.24),
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: accent.withValues(alpha: isDark ? 0.32 : 0.2),
                ),
                child: Icon(
                  isActive ? Icons.chat_rounded : Icons.history_rounded,
                  size: 16,
                  color: accent,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      createdAt == null
                          ? subtitle
                          : [
                              if (subtitle.isNotEmpty) subtitle,
                              DateFormat('MMM d • HH:mm').format(createdAt!),
                            ].join(' • '),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SettingsChoiceChip extends StatelessWidget {
  const _SettingsChoiceChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.enabled = true,
  });

  final String label;
  final bool selected;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent = selected ? const Color(0xFF8B5CF6) : const Color(0xFF3B82F6);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(999),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: selected
                ? accent.withValues(alpha: 0.18)
                : theme.colorScheme.surfaceContainerHighest,
            border: Border.all(
              color: selected
                  ? accent.withValues(alpha: 0.48)
                  : theme.colorScheme.outlineVariant.withValues(alpha: 0.4),
            ),
          ),
          child: Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: enabled
                  ? theme.colorScheme.onSurface
                  : theme.colorScheme.onSurfaceVariant.withValues(alpha: 0.6),
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

class _MessageAvatar extends StatelessWidget {
  const _MessageAvatar({
    required this.icon,
    required this.color,
  });

  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color.withValues(alpha: isDark ? 0.3 : 0.18),
        border: Border.all(
          color: color.withValues(alpha: isDark ? 0.52 : 0.3),
        ),
      ),
      child: Icon(
        icon,
        size: 15,
        color: color.withValues(alpha: isDark ? 0.92 : 0.78),
      ),
    );
  }
}

class _QueuedMessageLine extends StatelessWidget {
  const _QueuedMessageLine({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          Icons.circle,
          size: 8,
          color: Theme.of(context).colorScheme.onSurfaceVariant,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            message,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              color: Theme.of(context).colorScheme.onSurfaceVariant,
              height: 1.35,
            ),
          ),
        ),
      ],
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
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: isDestructive
                  ? [
                      theme.colorScheme.errorContainer,
                      theme.colorScheme.error.withValues(alpha: 0.16),
                    ]
                  : [
                      theme.colorScheme.surfaceContainerHighest,
                      theme.colorScheme.surfaceContainerLow,
                    ],
            ),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(
              color: isDestructive
                  ? theme.colorScheme.error.withValues(alpha: 0.24)
                  : theme.colorScheme.outlineVariant.withValues(alpha: 0.36),
            ),
          ),
          child: Icon(
            icon,
            size: 20,
            color: isDestructive
                ? theme.colorScheme.error
                : theme.colorScheme.onSurfaceVariant,
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
    final theme = Theme.of(context);

    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                theme.colorScheme.primary,
                Color.alphaBlend(
                  const Color(0xFF0EA5E9).withValues(alpha: 0.28),
                  theme.colorScheme.primary,
                ),
              ],
            ),
            borderRadius: BorderRadius.circular(18),
            boxShadow: [
              BoxShadow(
                color: theme.colorScheme.primary.withValues(alpha: 0.24),
                blurRadius: 14,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Icon(
            Icons.arrow_upward_rounded,
            size: 20,
            color: theme.colorScheme.onPrimary,
          ),
        ),
      ),
    );
  }
}
