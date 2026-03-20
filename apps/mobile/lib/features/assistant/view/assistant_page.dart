// Assistant feature parity module: the page coordinates several feature
// surfaces, so a few lints are intentionally deferred.
// ignore_for_file: directives_ordering, lines_longer_than_80_chars, discarded_futures, avoid_types_on_closure_parameters, avoid_redundant_argument_values, noop_primitive_operations, unnecessary_raw_strings

import 'dart:convert';
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
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/time_tracker_repository.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_shell_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_preferences.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_render_ui.dart';
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
  final _financeRepository = FinanceRepository();
  final _timeTrackerRepository = TimeTrackerRepository();
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
                    listenWhen: _shouldAutoScrollForState,
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
                    final theme = Theme.of(context);
                    final isFullscreen = context.select(
                      (AssistantChromeCubit cubit) => cubit.state.isFullscreen,
                    );

                    return shad.Scaffold(
                      child: DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              theme.colorScheme.surface,
                              theme.colorScheme.surfaceContainerLowest
                                  .withValues(alpha: 0.6),
                              theme.colorScheme.surface,
                            ],
                          ),
                        ),
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
                                      child: Stack(
                                        children: [
                                          Positioned.fill(
                                            child: _buildConversation(
                                              context,
                                              currentWorkspace,
                                              shellState,
                                              chatState,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                    if (!shellState.isViewOnly)
                                      const shad.Gap(8),
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
    final children = <Widget>[];

    if (chatState.status == AssistantChatStatus.restoring &&
        chatState.messages.isEmpty) {
      children.add(
        SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.45,
          child: const Center(child: CircularProgressIndicator()),
        ),
      );
    } else if (chatState.messages.isEmpty) {
      children.add(_buildEmptyState(context, workspace.id, shellState));
    } else {
      for (var index = 0; index < chatState.messages.length; index++) {
        children.add(
          _buildMessageCard(
            context,
            workspace.id,
            shellState,
            chatState.messages[index],
            chatState.attachmentsByMessageId[chatState.messages[index].id] ??
                const [],
          ),
        );
        if (index != chatState.messages.length - 1) {
          children.add(const SizedBox(height: 16));
        }
      }
    }

    return ListView(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(
        parent: BouncingScrollPhysics(),
      ),
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      padding: const EdgeInsets.only(bottom: 8),
      children: children,
    );
  }

  Widget _buildMessageCard(
    BuildContext context,
    String wsId,
    AssistantShellState shellState,
    AssistantMessage message,
    List<AssistantAttachment> attachments,
  ) {
    final isAssistant = message.role == 'assistant';
    final width = MediaQuery.sizeOf(context).width;

    return Align(
      alignment: isAssistant ? Alignment.centerLeft : Alignment.centerRight,
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxWidth: isAssistant ? 760 : width * 0.74,
        ),
        child: Container(
          decoration: BoxDecoration(
            color: isAssistant
                ? Theme.of(context).colorScheme.surfaceContainerHigh
                : Theme.of(context).colorScheme.primaryContainer,
            borderRadius: BorderRadius.circular(isAssistant ? 24 : 22),
            border: isAssistant
                ? Border.all(
                    color: Theme.of(context).colorScheme.outlineVariant,
                  )
                : null,
          ),
          child: Padding(
            padding: EdgeInsets.fromLTRB(
              14,
              isAssistant ? 12 : 14,
              14,
              isAssistant ? 12 : 14,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (isAssistant)
                  Row(
                    children: [
                      Container(
                        width: 24,
                        height: 24,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.primaryContainer,
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text(
                          shellState.soul.name.isEmpty
                              ? 'M'
                              : shellState.soul.name.characters.first
                                    .toUpperCase(),
                          style: Theme.of(context).textTheme.labelMedium
                              ?.copyWith(
                                color: Theme.of(
                                  context,
                                ).colorScheme.onPrimaryContainer,
                                fontWeight: FontWeight.w700,
                              ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        shellState.soul.name,
                        style: Theme.of(context).textTheme.labelLarge,
                      ),
                    ],
                  ),
                if (isAssistant) const SizedBox(height: 8),
                if (attachments.isNotEmpty)
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: attachments
                        .map(
                          (attachment) => ActionChip(
                            label: Text(attachment.name),
                            onPressed: () =>
                                _openAttachment(attachment.signedUrl),
                          ),
                        )
                        .toList(),
                  ),
                if (attachments.isNotEmpty) const SizedBox(height: 6),
                if (message.parts.isEmpty && isAssistant)
                  Text(context.l10n.assistantThinkingStatus)
                else
                  ..._buildMessageParts(
                    context,
                    wsId,
                    shellState,
                    message.parts,
                    isAssistant: isAssistant,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  List<Widget> _buildMessageParts(
    BuildContext context,
    String wsId,
    AssistantShellState shellState,
    List<AssistantMessagePart> parts, {
    required bool isAssistant,
  }) {
    final widgets = <Widget>[];
    for (final part in parts) {
      switch (part.type) {
        case 'reasoning':
          widgets.add(
            ExpansionTile(
              title: Text(context.l10n.assistantReasoningLabel),
              children: [
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: MarkdownBody(
                    data: part.text ?? '',
                    styleSheet: _markdownStyleSheet(context),
                  ),
                ),
              ],
            ),
          );
        case 'text':
          if (isAssistant) {
            widgets.add(
              MarkdownBody(
                data: part.text ?? '',
                styleSheet: _markdownStyleSheet(context),
              ),
            );
          } else {
            widgets.add(
              _ExpandableUserText(
                text: part.text ?? '',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: Theme.of(context).colorScheme.onPrimaryContainer,
                  height: 1.42,
                ),
              ),
            );
          }
        case 'source-url':
          widgets.add(
            TextButton(
              onPressed: () => _openAttachment(part.url),
              child: Text(
                part.title ?? part.url ?? context.l10n.assistantSourceLabel,
              ),
            ),
          );
        case 'dynamic-tool':
          final toolWidget = _buildToolPart(context, wsId, shellState, part);
          if (toolWidget != null) {
            widgets.add(
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: toolWidget,
              ),
            );
          }
        default:
          break;
      }
      widgets.add(const SizedBox(height: 8));
    }
    if (widgets.isNotEmpty) {
      widgets.removeLast();
    }
    return widgets;
  }

  Widget? _buildToolPart(
    BuildContext context,
    String wsId,
    AssistantShellState shellState,
    AssistantMessagePart part,
  ) {
    if (part.toolName == 'render_ui') {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildToolDisclosure(context, part),
          const SizedBox(height: 8),
          AssistantRenderUi(
            output: part.output,
            wsId: wsId,
            submitText: (text) => _submitText(wsId, shellState, text),
            financeRepository: _financeRepository,
            timeTrackerRepository: _timeTrackerRepository,
            tasksInsight: shellState.tasksInsight,
          ),
        ],
      );
    }

    return _buildToolDisclosure(context, part);
  }

  MarkdownStyleSheet _markdownStyleSheet(BuildContext context) {
    return MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
      p: Theme.of(context).textTheme.bodyLarge?.copyWith(height: 1.45),
      code: Theme.of(context).textTheme.bodyMedium?.copyWith(
        fontFamily: 'monospace',
      ),
      codeblockPadding: const EdgeInsets.all(12),
      codeblockDecoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      blockquotePadding: const EdgeInsets.symmetric(
        horizontal: 12,
        vertical: 8,
      ),
      blockquoteDecoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
    );
  }

  String? _toolStatusText(BuildContext context, AssistantMessagePart part) {
    switch (part.toolName) {
      case 'set_workspace_context':
        return context.l10n.assistantContextUpdatedLabel;
      case 'update_my_settings':
        return context.l10n.assistantPreferencesUpdatedLabel;
    }

    final output = part.output;
    if (output is Map<String, dynamic>) {
      for (final key in ['message', 'warning', 'error']) {
        final value = output[key];
        if (value is String && value.trim().isNotEmpty) {
          return value.trim();
        }
      }
    }
    return null;
  }

  Widget _buildToolDisclosure(
    BuildContext context,
    AssistantMessagePart part,
  ) {
    final statusText = _toolStatusText(context, part);
    final hasInput = part.input != null;
    final hasOutput = part.output != null;

    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(18),
      ),
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
        childrenPadding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
        dense: true,
        title: Row(
          children: [
            Icon(
              _toolIcon(part.toolName),
              size: 16,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                _humanizeToolName(part.toolName),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelLarge,
              ),
            ),
          ],
        ),
        subtitle: statusText == null
            ? null
            : Text(
                statusText,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
        children: [
          if (hasInput)
            _buildToolJsonBlock(
              context,
              context.l10n.assistantInputLabel,
              part.input,
            ),
          if (hasInput && hasOutput) const SizedBox(height: 8),
          if (hasOutput)
            _buildToolJsonBlock(
              context,
              context.l10n.assistantOutputLabel,
              part.output,
            ),
        ],
      ),
    );
  }

  Widget _buildToolJsonBlock(
    BuildContext context,
    String label,
    dynamic value,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.labelMedium),
        const SizedBox(height: 6),
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surfaceContainerHigh,
            borderRadius: BorderRadius.circular(14),
          ),
          child: SelectableText(
            const JsonEncoder.withIndent('  ').convert(value),
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              fontFamily: 'monospace',
            ),
          ),
        ),
      ],
    );
  }

  IconData _toolIcon(String? toolName) {
    switch (toolName) {
      case 'render_ui':
        return Icons.dashboard_customize_rounded;
      case 'select_tools':
        return Icons.tune_rounded;
      case 'set_workspace_context':
        return Icons.workspaces_outline;
      case 'update_my_settings':
        return Icons.settings_suggest_rounded;
      case 'set_immersive_mode':
        return Icons.fullscreen_rounded;
      default:
        return Icons.memory_rounded;
    }
  }

  String _humanizeToolName(String? toolName) {
    if (toolName == null || toolName.isEmpty) {
      return 'Tool';
    }
    return toolName
        .split('_')
        .where((part) => part.isNotEmpty)
        .map(
          (part) => '${part[0].toUpperCase()}${part.substring(1)}',
        )
        .join(' ');
  }

  bool _shouldAutoScrollForState(
    AssistantChatState previous,
    AssistantChatState current,
  ) {
    return _lastMessageSignature(previous.messages) !=
        _lastMessageSignature(current.messages);
  }

  String _lastMessageSignature(List<AssistantMessage> messages) {
    if (messages.isEmpty) return '';
    final last = messages.last;
    final lastPart = last.parts.isEmpty ? null : last.parts.last;
    final outputSignature = lastPart?.output is Map<String, dynamic>
        ? (lastPart!.output as Map<String, dynamic>).length.toString()
        : (lastPart?.output?.toString().length ?? 0).toString();
    return [
      last.id,
      last.parts.length.toString(),
      lastPart?.type ?? '',
      lastPart?.blockId ?? '',
      (lastPart?.text ?? '').length.toString(),
      lastPart?.state ?? '',
      lastPart?.toolCallId ?? '',
      outputSignature,
      last.createdAt?.millisecondsSinceEpoch.toString() ?? '',
    ].join('|');
  }

  void _scheduleScrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!_scrollController.hasClients) return;
      final target = _scrollController.position.maxScrollExtent + 120;
      await _scrollController.animateTo(
        target,
        duration: const Duration(milliseconds: 220),
        curve: Curves.easeOutCubic,
      );
    });
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
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 40),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 52,
                height: 52,
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: Icon(
                  Icons.auto_awesome_rounded,
                  color: Theme.of(context).colorScheme.onPrimaryContainer,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                shellState.soul.name,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                context.l10n.assistantWorkspaceAwareDescription,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  height: 1.35,
                ),
              ),
              const SizedBox(height: 16),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 8,
                runSpacing: 8,
                children: prompts
                    .map(
                      (prompt) => OutlinedButton(
                        onPressed: () => _submitText(wsId, shellState, prompt),
                        child: Text(prompt, textAlign: TextAlign.center),
                      ),
                    )
                    .toList(),
              ),
            ],
          ),
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
    return DecoratedBox(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainer,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
        child: Column(
          children: [
            if (chatState.composerAttachments.isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: chatState.composerAttachments
                        .map(
                          (attachment) => Padding(
                            padding: const EdgeInsets.only(right: 6),
                            child: InputChip(
                              label: Text(attachment.name),
                              visualDensity: VisualDensity.compact,
                              onDeleted: () =>
                                  _chatCubit.removeComposerAttachment(
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
            if (chatState.composerAttachments.isNotEmpty)
              const SizedBox(height: 6),
            if ((chatState.queuedPreview ?? '').isNotEmpty)
              Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  '${context.l10n.assistantQueuedPrefix} ${chatState.queuedPreview}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            if ((chatState.queuedPreview ?? '').isNotEmpty)
              const SizedBox(height: 8),
            Row(
              children: [
                PopupMenuButton<_AssistantQuickAction>(
                  tooltip: context.l10n.assistantActionsTitle,
                  onSelected: (value) => _handleQuickAction(
                    context,
                    value,
                    wsId,
                    shellState,
                    chatState,
                  ),
                  itemBuilder: (context) => [
                    PopupMenuItem(
                      value: _AssistantQuickAction.toggleFullscreen,
                      child: Row(
                        children: [
                          Icon(
                            context
                                    .read<AssistantChromeCubit>()
                                    .state
                                    .isFullscreen
                                ? Icons.fullscreen_exit_rounded
                                : Icons.fullscreen_rounded,
                            size: 18,
                          ),
                          const SizedBox(width: 10),
                          Text(
                            context
                                    .read<AssistantChromeCubit>()
                                    .state
                                    .isFullscreen
                                ? context.l10n.assistantExitFullscreenAction
                                : context.l10n.assistantEnterFullscreenAction,
                          ),
                        ],
                      ),
                    ),
                    if (shellState.selectedModel.supportsFileInput)
                      PopupMenuItem(
                        value: _AssistantQuickAction.attachFiles,
                        child: Row(
                          children: [
                            const Icon(Icons.attach_file_rounded, size: 18),
                            const SizedBox(width: 10),
                            Text(context.l10n.assistantAttachFilesAction),
                          ],
                        ),
                      ),
                    PopupMenuItem(
                      value: _AssistantQuickAction.history,
                      child: Row(
                        children: [
                          const Icon(Icons.history_rounded, size: 18),
                          const SizedBox(width: 10),
                          Text(context.l10n.assistantHistoryTitle),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: _AssistantQuickAction.settings,
                      child: Row(
                        children: [
                          const Icon(Icons.tune_rounded, size: 18),
                          const SizedBox(width: 10),
                          Text(context.l10n.assistantSettingsTitle),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      value: _AssistantQuickAction.newConversation,
                      child: Row(
                        children: [
                          const Icon(
                            Icons.chat_bubble_outline_rounded,
                            size: 18,
                          ),
                          const SizedBox(width: 10),
                          Text(context.l10n.assistantNewConversation),
                        ],
                      ),
                    ),
                    PopupMenuItem(
                      enabled: chatState.messages.isNotEmpty,
                      value: _AssistantQuickAction.export,
                      child: Row(
                        children: [
                          const Icon(Icons.ios_share_rounded, size: 18),
                          const SizedBox(width: 10),
                          Text(context.l10n.assistantExportChat),
                        ],
                      ),
                    ),
                  ],
                  child: Container(
                    width: 40,
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: Theme.of(
                        context,
                      ).colorScheme.surfaceContainerHighest,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(
                      context.read<AssistantChromeCubit>().state.isFullscreen
                          ? Icons.fullscreen_exit_rounded
                          : Icons.fullscreen_rounded,
                      size: 20,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    controller: _inputController,
                    focusNode: _inputFocusNode,
                    minLines: 1,
                    maxLines: 5,
                    decoration: InputDecoration(
                      hintText: context.l10n.assistantAskPlaceholder,
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                    onSubmitted: (_) => _submitCurrentInput(wsId, shellState),
                  ),
                ),
                if (chatState.isBusy)
                  IconButton.filledTonal(
                    onPressed: _chatCubit.stopStreaming,
                    icon: const Icon(Icons.stop_circle_outlined),
                  )
                else
                  IconButton.filled(
                    onPressed: () => _submitCurrentInput(wsId, shellState),
                    icon: const Icon(Icons.arrow_upward_rounded),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleQuickAction(
    BuildContext context,
    _AssistantQuickAction action,
    String wsId,
    AssistantShellState shellState,
    AssistantChatState chatState,
  ) async {
    switch (action) {
      case _AssistantQuickAction.toggleFullscreen:
        _setFullscreen(
          !context.read<AssistantChromeCubit>().state.isFullscreen,
          focusInput: true,
        );
      case _AssistantQuickAction.attachFiles:
        await _pickFiles(wsId);
      case _AssistantQuickAction.history:
        await _showHistorySheet(context, wsId);
      case _AssistantQuickAction.settings:
        await _showSettingsDialog(context, wsId);
      case _AssistantQuickAction.newConversation:
        await _chatCubit.resetConversation(wsId);
      case _AssistantQuickAction.export:
        await _exportChat(context, wsId, shellState, chatState);
    }
  }

  Future<void> _pickFiles(String wsId) async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      withData: false,
      type: FileType.any,
    );
    final files = result?.files ?? const <PlatformFile>[];
    if (files.isEmpty) return;
    await _chatCubit.addComposerAttachments(wsId: wsId, files: files);
  }

  Future<void> _submitCurrentInput(
    String wsId,
    AssistantShellState shellState,
  ) async {
    final text = _inputController.text;
    await _submitText(wsId, shellState, text);
    _inputController.clear();
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

  Future<void> _openAttachment(String? url) async {
    if (url == null || url.isEmpty) return;
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    await launchUrl(uri, mode: LaunchMode.externalApplication);
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

  Future<void> _exportChat(
    BuildContext context,
    String wsId,
    AssistantShellState shellState,
    AssistantChatState chatState,
  ) async {
    final payload = _chatCubit.buildExportPayload(
      wsId: wsId,
      model: shellState.selectedModel,
      thinkingMode: shellState.thinkingMode,
    );
    final shareText = context.l10n.assistantExportShareText;
    final dir = await getTemporaryDirectory();
    final chatId = chatState.chat?.id ?? chatState.fallbackChatId;
    final file = File(
      '${dir.path}/mira-chat-${wsId.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_')}-${chatId.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_')}.json',
    );
    await file.writeAsString(
      const JsonEncoder.withIndent('  ').convert(payload),
    );
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path)],
        text: shareText,
      ),
    );
  }

  Future<void> _showSettingsDialog(BuildContext context, String wsId) async {
    await showDialog<void>(
      context: context,
      useRootNavigator: false,
      builder: (dialogContext) {
        final theme = Theme.of(dialogContext);
        final maxHeight = MediaQuery.sizeOf(dialogContext).height * 0.82;

        return MultiBlocProvider(
          providers: [
            BlocProvider.value(value: _shellCubit),
            BlocProvider.value(value: _chatCubit),
          ],
          child: Dialog(
            insetPadding: const EdgeInsets.symmetric(
              horizontal: 16,
              vertical: 24,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(28),
            ),
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: 520, maxHeight: maxHeight),
              child: BlocBuilder<AssistantShellCubit, AssistantShellState>(
                builder: (context, shellState) {
                  return BlocBuilder<AssistantChatCubit, AssistantChatState>(
                    builder: (context, chatState) {
                      final isFullscreen = context
                          .read<AssistantChromeCubit>()
                          .state
                          .isFullscreen;

                      return ListView(
                        padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  context.l10n.assistantSettingsTitle,
                                  style: theme.textTheme.titleLarge?.copyWith(
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                              ),
                              IconButton(
                                onPressed: () =>
                                    Navigator.of(dialogContext).pop(),
                                icon: const Icon(Icons.close_rounded),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          _settingsCard(
                            context,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  context.l10n.assistantRenameTitle,
                                  style: theme.textTheme.labelLarge,
                                ),
                                const SizedBox(height: 10),
                                Row(
                                  children: [
                                    Expanded(
                                      child: Text(
                                        shellState.soul.name,
                                        style: theme.textTheme.titleMedium
                                            ?.copyWith(
                                              fontWeight: FontWeight.w700,
                                            ),
                                      ),
                                    ),
                                    OutlinedButton(
                                      onPressed: () async {
                                        await _showRenameDialog(
                                          context,
                                          shellState,
                                        );
                                      },
                                      child: Text(
                                        context.l10n.assistantRenameAction,
                                      ),
                                    ),
                                  ],
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  shellState.workspace?.name ??
                                      context.l10n.assistantPersonalWorkspace,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          _settingsCard(
                            context,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  context.l10n.assistantCreditsTitle,
                                  style: theme.textTheme.labelLarge,
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  context.l10n.assistantCreditsSummary(
                                    shellState.activeCredits.remaining.round(),
                                    shellState.activeCredits.tier,
                                  ),
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(height: 10),
                                LinearProgressIndicator(
                                  value:
                                      shellState.activeCredits.percentUsed == 0
                                      ? 0
                                      : (shellState.activeCredits.percentUsed /
                                                100)
                                            .toDouble()
                                            .clamp(0, 1),
                                  minHeight: 6,
                                ),
                                const SizedBox(height: 10),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    ChoiceChip(
                                      selected:
                                          shellState.creditSource ==
                                          AssistantCreditSource.workspace,
                                      label: Text(
                                        context.l10n.assistantWorkspaceCredits,
                                      ),
                                      onSelected:
                                          shellState.workspaceCreditLocked
                                          ? null
                                          : (_) => _shellCubit.setCreditSource(
                                              AssistantCreditSource.workspace,
                                            ),
                                    ),
                                    ChoiceChip(
                                      selected:
                                          shellState.creditSource ==
                                          AssistantCreditSource.personal,
                                      label: Text(
                                        context.l10n.assistantPersonalCredits,
                                      ),
                                      onSelected: (_) =>
                                          _shellCubit.setCreditSource(
                                            AssistantCreditSource.personal,
                                          ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          _settingsCard(
                            context,
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  context.l10n.assistantConversationTitle,
                                  style: theme.textTheme.labelLarge,
                                ),
                                const SizedBox(height: 10),
                                ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  title: Text(context.l10n.assistantModelLabel),
                                  subtitle: Text(
                                    shellState.selectedModel.label,
                                  ),
                                  trailing: const Icon(
                                    Icons.chevron_right_rounded,
                                  ),
                                  onTap: () async {
                                    Navigator.of(dialogContext).pop();
                                    await _showModelSheet(context, shellState);
                                  },
                                ),
                                const SizedBox(height: 6),
                                Wrap(
                                  spacing: 8,
                                  runSpacing: 8,
                                  children: [
                                    ChoiceChip(
                                      selected:
                                          shellState.thinkingMode ==
                                          AssistantThinkingMode.fast,
                                      label: Text(
                                        context.l10n.assistantModeFast,
                                      ),
                                      onSelected: (_) =>
                                          _shellCubit.setThinkingMode(
                                            AssistantThinkingMode.fast,
                                          ),
                                    ),
                                    ChoiceChip(
                                      selected:
                                          shellState.thinkingMode ==
                                          AssistantThinkingMode.thinking,
                                      label: Text(
                                        context.l10n.assistantModeThinking,
                                      ),
                                      onSelected: (_) =>
                                          _shellCubit.setThinkingMode(
                                            AssistantThinkingMode.thinking,
                                          ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          _settingsCard(
                            context,
                            child: Column(
                              children: [
                                SwitchListTile.adaptive(
                                  contentPadding: EdgeInsets.zero,
                                  title: Text(
                                    isFullscreen
                                        ? context.l10n.assistantImmersiveLabel
                                        : context.l10n.assistantStandardLabel,
                                  ),
                                  value: isFullscreen,
                                  onChanged: (_) =>
                                      _setFullscreen(!isFullscreen),
                                ),
                                SwitchListTile.adaptive(
                                  contentPadding: EdgeInsets.zero,
                                  title: Text(
                                    shellState.isViewOnly
                                        ? context.l10n.assistantViewOnlyLabel
                                        : context.l10n.assistantEditableLabel,
                                  ),
                                  value: shellState.isViewOnly,
                                  onChanged: (_) => _shellCubit.setViewOnly(
                                    !shellState.isViewOnly,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              OutlinedButton(
                                onPressed: () async {
                                  Navigator.of(dialogContext).pop();
                                  await _showHistorySheet(context, wsId);
                                },
                                child: Text(context.l10n.assistantHistoryTitle),
                              ),
                              OutlinedButton(
                                onPressed: () async {
                                  await _chatCubit.resetConversation(wsId);
                                  if (dialogContext.mounted) {
                                    Navigator.of(dialogContext).pop();
                                  }
                                },
                                child: Text(
                                  context.l10n.assistantNewConversation,
                                ),
                              ),
                              OutlinedButton(
                                onPressed: chatState.messages.isEmpty
                                    ? null
                                    : () async {
                                        Navigator.of(dialogContext).pop();
                                        await _exportChat(
                                          context,
                                          wsId,
                                          shellState,
                                          chatState,
                                        );
                                      },
                                child: Text(context.l10n.assistantExportChat),
                              ),
                            ],
                          ),
                        ],
                      );
                    },
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }

  Future<void> _showRenameDialog(
    BuildContext context,
    AssistantShellState shellState,
  ) async {
    _renameController.text = shellState.soul.name;

    await showDialog<void>(
      context: context,
      builder: (dialogContext) {
        return AlertDialog(
          title: Text(context.l10n.assistantRenameTitle),
          content: TextField(
            controller: _renameController,
            autofocus: true,
            decoration: InputDecoration(hintText: context.l10n.navAssistant),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(dialogContext).pop(),
              child: Text(context.l10n.assistantCancelAction),
            ),
            FilledButton(
              onPressed: () async {
                final nextName = _renameController.text.trim();
                if (nextName.isNotEmpty) {
                  await _shellCubit.renameAssistant(nextName);
                }
                if (dialogContext.mounted) {
                  Navigator.of(dialogContext).pop();
                }
              },
              child: Text(context.l10n.assistantSaveAction),
            ),
          ],
        );
      },
    );
  }

  Widget _settingsCard(BuildContext context, {required Widget child}) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Theme.of(context).colorScheme.outlineVariant),
      ),
      child: child,
    );
  }

  Future<void> _showModelSheet(
    BuildContext context,
    AssistantShellState shellState,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      useSafeArea: true,
      builder: (context) {
        return ListView(
          children: [
            ListTile(
              title: Text(context.l10n.assistantModelLabel),
            ),
            for (final model in shellState.availableModels)
              ListTile(
                selected: model.value == shellState.selectedModel.value,
                title: Text(model.label),
                subtitle: model.description == null
                    ? null
                    : Text(model.description!),
                trailing: model.value == shellState.selectedModel.value
                    ? const Icon(Icons.check)
                    : null,
                onTap: () async {
                  Navigator.of(context).pop();
                  await _shellCubit.setSelectedModel(model);
                },
              ),
          ],
        );
      },
    );
  }
}

enum _AssistantQuickAction {
  toggleFullscreen,
  attachFiles,
  history,
  settings,
  newConversation,
  export,
}

class _ExpandableUserText extends StatefulWidget {
  const _ExpandableUserText({required this.text, this.style});

  final String text;
  final TextStyle? style;

  @override
  State<_ExpandableUserText> createState() => _ExpandableUserTextState();
}

class _ExpandableUserTextState extends State<_ExpandableUserText> {
  static const _collapsedMaxLines = 3;

  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final effectiveStyle =
        widget.style ?? Theme.of(context).textTheme.bodyLarge;

    return LayoutBuilder(
      builder: (context, constraints) {
        final painter = TextPainter(
          text: TextSpan(text: widget.text, style: effectiveStyle),
          maxLines: _collapsedMaxLines,
          textDirection: Directionality.of(context),
        )..layout(maxWidth: constraints.maxWidth);

        final hasOverflow = painter.didExceedMaxLines;

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.text,
              style: effectiveStyle,
              maxLines: _expanded ? null : _collapsedMaxLines,
              overflow: _expanded ? TextOverflow.visible : TextOverflow.fade,
            ),
            if (hasOverflow || _expanded) ...[
              const SizedBox(height: 6),
              TextButton(
                style: TextButton.styleFrom(
                  minimumSize: Size.zero,
                  padding: EdgeInsets.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  visualDensity: VisualDensity.compact,
                  foregroundColor: Theme.of(
                    context,
                  ).colorScheme.onPrimaryContainer,
                ),
                onPressed: () => setState(() => _expanded = !_expanded),
                child: Text(
                  _expanded
                      ? context.l10n.assistantSeeLessLabel
                      : context.l10n.assistantSeeMoreLabel,
                ),
              ),
            ],
          ],
        );
      },
    );
  }
}
