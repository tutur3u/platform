import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/cubit/assistant_chat_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_ui_state.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

class AssistantComposerDock extends StatelessWidget {
  const AssistantComposerDock({
    required this.chatState,
    required this.liveState,
    required this.liveUiState,
    required this.creditSource,
    required this.isFullscreen,
    required this.bottomInset,
    required this.isPersonalWorkspace,
    required this.thinkingMode,
    required this.onOpenCreditSourceSheet,
    required this.onThinkingModeChanged,
    required this.controller,
    required this.focusNode,
    required this.onOpenAttachments,
    required this.onToggleFullscreen,
    required this.onMicrophoneTap,
    required this.onSend,
    required this.onRemoveAttachment,
    super.key,
  });

  final AssistantChatState chatState;
  final AssistantLiveState liveState;
  final AssistantLiveUiState liveUiState;
  final AssistantCreditSource creditSource;
  final bool isFullscreen;
  final double bottomInset;
  final bool isPersonalWorkspace;
  final AssistantThinkingMode thinkingMode;
  final Future<void> Function() onOpenCreditSourceSheet;
  final Future<void> Function(AssistantThinkingMode mode) onThinkingModeChanged;
  final TextEditingController controller;
  final FocusNode focusNode;
  final Future<void> Function() onOpenAttachments;
  final Future<void> Function() onToggleFullscreen;
  final Future<void> Function() onMicrophoneTap;
  final Future<void> Function() onSend;
  final Future<void> Function(String attachmentId) onRemoveAttachment;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final navSurface = shad.Theme.of(context).colorScheme.background;
    final separatorColor = theme.colorScheme.outlineVariant.withValues(
      alpha: 0.28,
    );

    return Container(
      padding: EdgeInsets.fromLTRB(12, 8, 12, 4 + bottomInset),
      decoration: BoxDecoration(
        color: navSurface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(
          top: BorderSide(
            color: separatorColor,
          ),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (chatState.composerAttachments.isNotEmpty) ...[
            _AttachmentStrip(
              attachments: chatState.composerAttachments,
              onRemoveAttachment: onRemoveAttachment,
            ),
            const SizedBox(height: 6),
          ],
          TextField(
            controller: controller,
            focusNode: focusNode,
            minLines: 1,
            maxLines: 4,
            textInputAction: TextInputAction.send,
            onSubmitted: (_) => onSend(),
            onTapOutside: (_) => focusNode.unfocus(),
            decoration: InputDecoration(
              hintText: context.l10n.assistantAskPlaceholder,
              border: InputBorder.none,
              isDense: true,
              contentPadding: const EdgeInsets.symmetric(
                horizontal: 2,
                vertical: 10,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _GhostActionButton(
                tooltip: context.l10n.assistantAttachFilesAction,
                onPressed: onOpenAttachments,
                icon: Icons.add_rounded,
              ),
              const SizedBox(width: 4),
              _GhostActionButton(
                tooltip: isFullscreen
                    ? context.l10n.assistantShowBottomNavLabel
                    : context.l10n.assistantEnterFullscreenAction,
                onPressed: onToggleFullscreen,
                icon: isFullscreen
                    ? Icons.fullscreen_exit_rounded
                    : Icons.fullscreen_rounded,
                isActive: isFullscreen,
              ),
              const SizedBox(width: 8),
              _ThinkingModeDropdown(
                thinkingMode: thinkingMode,
                onChanged: onThinkingModeChanged,
              ),
              const SizedBox(width: 6),
              _CreditSourceDropdown(
                creditSource: creditSource,
                onPressed: onOpenCreditSourceSheet,
              ),
              const Spacer(),
              ValueListenableBuilder<TextEditingValue>(
                valueListenable: controller,
                builder: (context, value, _) {
                  final hasPrompt = value.text.trim().isNotEmpty;
                  if (hasPrompt) {
                    return _GhostActionButton(
                      tooltip: context.l10n.assistantSendAction,
                      onPressed: onSend,
                      icon: Icons.arrow_upward_rounded,
                      isActive: true,
                    );
                  }

                  return _GhostActionButton(
                    tooltip: liveUiState.isEligible
                        ? liveState.isMicrophoneActive
                              ? context.l10n.assistantLiveMute
                              : context.l10n.assistantLiveListen
                        : context.l10n.assistantLiveTierRequired,
                    onPressed: onMicrophoneTap,
                    icon: liveState.isMicrophoneActive
                        ? Icons.mic_rounded
                        : Icons.mic_none_rounded,
                    isActive:
                        liveUiState.isEligible &&
                        (liveState.isMicrophoneActive ||
                            liveUiState.isVisibleLiveSession),
                  );
                },
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _AttachmentStrip extends StatelessWidget {
  const _AttachmentStrip({
    required this.attachments,
    required this.onRemoveAttachment,
  });

  final List<AssistantAttachment> attachments;
  final Future<void> Function(String attachmentId) onRemoveAttachment;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: attachments
            .map(
              (attachment) => Padding(
                padding: const EdgeInsets.only(right: 8),
                child: InputChip(
                  visualDensity: VisualDensity.compact,
                  avatar: Icon(
                    attachment.isImage
                        ? Icons.image_outlined
                        : Icons.attach_file_rounded,
                    size: 14,
                  ),
                  label: Text(attachment.name),
                  onDeleted: () => onRemoveAttachment(attachment.id),
                ),
              ),
            )
            .toList(growable: false),
      ),
    );
  }
}

class _GhostActionButton extends StatelessWidget {
  const _GhostActionButton({
    required this.tooltip,
    required this.onPressed,
    required this.icon,
    this.isActive = false,
  });

  final String tooltip;
  final Future<void> Function() onPressed;
  final IconData icon;
  final bool isActive;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return IconButton(
      tooltip: tooltip,
      visualDensity: VisualDensity.compact,
      constraints: const BoxConstraints.tightFor(width: 34, height: 34),
      padding: EdgeInsets.zero,
      style: IconButton.styleFrom(
        backgroundColor: isActive
            ? theme.colorScheme.primary.withValues(alpha: 0.12)
            : Colors.transparent,
        foregroundColor: isActive
            ? theme.colorScheme.primary
            : theme.colorScheme.onSurfaceVariant,
      ),
      onPressed: onPressed,
      icon: Icon(icon, size: 18),
    );
  }
}

class _ThinkingModeDropdown extends StatelessWidget {
  const _ThinkingModeDropdown({
    required this.thinkingMode,
    required this.onChanged,
  });

  final AssistantThinkingMode thinkingMode;
  final Future<void> Function(AssistantThinkingMode mode) onChanged;

  @override
  Widget build(BuildContext context) {
    final label = thinkingMode == AssistantThinkingMode.thinking
        ? context.l10n.assistantModeThinking
        : context.l10n.assistantModeFast;

    return PopupMenuButton<AssistantThinkingMode>(
      tooltip: context.l10n.assistantSettingsTitle,
      padding: EdgeInsets.zero,
      onSelected: onChanged,
      itemBuilder: (context) => [
        PopupMenuItem(
          value: AssistantThinkingMode.fast,
          child: Row(
            children: [
              const Icon(Icons.flash_on_rounded, size: 18),
              const SizedBox(width: 8),
              Text(context.l10n.assistantModeFast),
            ],
          ),
        ),
        PopupMenuItem(
          value: AssistantThinkingMode.thinking,
          child: Row(
            children: [
              const Icon(Icons.psychology_alt_rounded, size: 18),
              const SizedBox(width: 8),
              Text(context.l10n.assistantModeThinking),
            ],
          ),
        ),
      ],
      child: _LabeledDropdownGhostButton(
        icon: thinkingMode == AssistantThinkingMode.thinking
            ? Icons.psychology_alt_rounded
            : Icons.flash_on_rounded,
        label: label,
      ),
    );
  }
}

class _CreditSourceDropdown extends StatelessWidget {
  const _CreditSourceDropdown({
    required this.creditSource,
    required this.onPressed,
  });

  final AssistantCreditSource creditSource;
  final Future<void> Function() onPressed;

  @override
  Widget build(BuildContext context) {
    const sourceIcon = Icons.toll_rounded;
    final selectedTargetIcon = creditSource == AssistantCreditSource.personal
        ? Icons.person_rounded
        : Icons.apartment_rounded;

    return Tooltip(
      message: context.l10n.assistantSourceLabel,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: onPressed,
          child: _DropdownGhostButton(
            leadingIcon: sourceIcon,
            trailingIcon: selectedTargetIcon,
          ),
        ),
      ),
    );
  }
}

class _DropdownGhostButton extends StatelessWidget {
  const _DropdownGhostButton({
    required this.leadingIcon,
    required this.trailingIcon,
  });

  final IconData leadingIcon;
  final IconData trailingIcon;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final iconColor = theme.colorScheme.onSurfaceVariant;

    return Container(
      height: 34,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            leadingIcon,
            size: 16,
            color: iconColor,
          ),
          const SizedBox(width: 6),
          Icon(
            Icons.chevron_right_rounded,
            size: 16,
            color: iconColor,
          ),
          const SizedBox(width: 6),
          Icon(
            trailingIcon,
            size: 16,
            color: iconColor,
          ),
        ],
      ),
    );
  }
}

class _LabeledDropdownGhostButton extends StatelessWidget {
  const _LabeledDropdownGhostButton({
    required this.icon,
    required this.label,
  });

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      height: 34,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 16,
            color: theme.colorScheme.onSurfaceVariant,
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w600,
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          const SizedBox(width: 4),
          Icon(
            Icons.expand_more_rounded,
            size: 16,
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ],
      ),
    );
  }
}
