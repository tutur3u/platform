part of 'chat_sheets.dart';

class _AiSettingsSection extends StatefulWidget {
  const _AiSettingsSection({required this.settings});

  final ChatAiSettings? settings;

  @override
  State<_AiSettingsSection> createState() => _AiSettingsSectionState();
}

class _AiSettingsSectionState extends State<_AiSettingsSection> {
  final TextEditingController _modelController = TextEditingController();
  final TextEditingController _promptController = TextEditingController();
  ChatAiThinkingMode _thinkingMode = ChatAiThinkingMode.fast;

  @override
  void didUpdateWidget(covariant _AiSettingsSection oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncFromSettings();
  }

  @override
  void initState() {
    super.initState();
    _syncFromSettings();
  }

  @override
  void dispose() {
    _modelController.dispose();
    _promptController.dispose();
    super.dispose();
  }

  void _syncFromSettings() {
    final settings = widget.settings;
    if (settings == null) return;
    _modelController.text = settings.modelId ?? '';
    _promptController.text = settings.systemPrompt ?? '';
    _thinkingMode = settings.thinkingMode;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (widget.settings == null) {
      return AppPanel(
        title: l10n.chatAiSettings,
        child: const AppLoadingIndicator(),
      );
    }
    return AppPanel(
      title: l10n.chatAiSettings,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppTextField(
            selectionControls: platformTextSelectionControls(),
            contextMenuBuilder: platformTextContextMenuBuilder(),
            controller: _modelController,
            label: l10n.chatAiModel,
            placeholder: l10n.chatAiModel,
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            selectionControls: platformTextSelectionControls(),
            contextMenuBuilder: platformTextContextMenuBuilder(),
            controller: _promptController,
            label: l10n.chatSystemPrompt,
            placeholder: l10n.chatSystemPrompt,
            minLines: 2,
            maxLines: 5,
          ),
          const SizedBox(height: AppSpacing.md),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final mode in ChatAiThinkingMode.values)
                AppChip(
                  label: Text(
                    mode == ChatAiThinkingMode.fast
                        ? l10n.assistantModeFast
                        : l10n.assistantModeThinking,
                  ),
                  selected: _thinkingMode == mode,
                  inMutuallyExclusiveGroup: true,
                  onSelected: (_) => setState(() => _thinkingMode = mode),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          AppButton.primary(
            onPressed: () => unawaited(
              context.read<ChatCubit>().updateAiSettings(
                modelId: _modelController.text.trim().isEmpty
                    ? null
                    : _modelController.text.trim(),
                systemPrompt: _promptController.text.trim(),
                thinkingMode: _thinkingMode,
              ),
            ),
            child: Text(l10n.chatSaveSettings),
          ),
        ],
      ),
    );
  }
}

class _AiObservabilitySection extends StatelessWidget {
  const _AiObservabilitySection({required this.observability});

  final ChatAiObservability? observability;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final data = observability;
    if (data == null) {
      return AppPanel(
        title: l10n.chatObservability,
        child: const AppLoadingIndicator(),
      );
    }
    final tokens = AppTokens.of(context);
    return AppPanel(
      title: l10n.chatObservability,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('${l10n.chatTokens}: ${data.totals.totalTokens}'),
          Text('${l10n.chatCost}: \$${data.totals.costUsd.toStringAsFixed(4)}'),
          const SizedBox(height: AppSpacing.sm),
          for (final message in data.messages.take(5))
            Text(
              '${message.role}: ${message.usage.totalTokens} '
              '${l10n.chatTokens}',
              style: tokens.typography.small,
            ),
        ],
      ),
    );
  }
}
