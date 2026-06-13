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
    if (widget.settings == null) {
      return _Section(
        title: context.l10n.chatAiSettings,
        children: const [NovaLoadingIndicator(size: 28)],
      );
    }
    return _Section(
      title: context.l10n.chatAiSettings,
      children: [
        shad.TextField(
          contextMenuBuilder: platformTextContextMenuBuilder(),
          controller: _modelController,
          hintText: context.l10n.chatAiModel,
        ),
        const SizedBox(height: 10),
        shad.TextField(
          contextMenuBuilder: platformTextContextMenuBuilder(),
          controller: _promptController,
          hintText: context.l10n.chatSystemPrompt,
          minLines: 2,
          maxLines: 5,
        ),
        const SizedBox(height: 10),
        Wrap(
          spacing: 8,
          children: ChatAiThinkingMode.values
              .map(
                (mode) => ChoiceChip(
                  label: Text(
                    mode == ChatAiThinkingMode.fast
                        ? context.l10n.assistantModeFast
                        : context.l10n.assistantModeThinking,
                  ),
                  selected: _thinkingMode == mode,
                  onSelected: (_) => setState(() => _thinkingMode = mode),
                ),
              )
              .toList(growable: false),
        ),
        const SizedBox(height: 10),
        shad.PrimaryButton(
          onPressed: () => unawaited(
            context.read<ChatCubit>().updateAiSettings(
              modelId: _modelController.text.trim().isEmpty
                  ? null
                  : _modelController.text.trim(),
              systemPrompt: _promptController.text.trim(),
              thinkingMode: _thinkingMode,
            ),
          ),
          child: Text(context.l10n.chatSaveSettings),
        ),
      ],
    );
  }
}

class _AiObservabilitySection extends StatelessWidget {
  const _AiObservabilitySection({required this.observability});

  final ChatAiObservability? observability;

  @override
  Widget build(BuildContext context) {
    final data = observability;
    if (data == null) {
      return _Section(
        title: context.l10n.chatObservability,
        children: const [NovaLoadingIndicator(size: 28)],
      );
    }
    return _Section(
      title: context.l10n.chatObservability,
      children: [
        Text('${context.l10n.chatTokens}: ${data.totals.totalTokens}'),
        Text(
          '${context.l10n.chatCost}: '
          '\$${data.totals.costUsd.toStringAsFixed(4)}',
        ),
        const SizedBox(height: 8),
        ...data.messages
            .take(5)
            .map(
              (message) => Text(
                '${message.role}: ${message.usage.totalTokens} '
                '${context.l10n.chatTokens}',
              ),
            ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.children});

  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final colorScheme = shad.Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: colorScheme.border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              title,
              style: Theme.of(
                context,
              ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 10),
            ...children,
          ],
        ),
      ),
    );
  }
}
