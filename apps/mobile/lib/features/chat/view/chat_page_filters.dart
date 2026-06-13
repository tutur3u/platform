part of 'chat_page.dart';

class _ChatFilters extends StatelessWidget {
  const _ChatFilters({required this.state});

  final ChatState state;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<ChatCubit>();
    final l10n = context.l10n;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SegmentedButton<ChatScope>(
          segments: [
            ButtonSegment(
              value: ChatScope.workspaces,
              icon: const Icon(shad.LucideIcons.building2, size: 16),
              label: Text(l10n.chatWorkspace),
            ),
            ButtonSegment(
              value: ChatScope.personal,
              icon: const Icon(shad.LucideIcons.user, size: 16),
              label: Text(l10n.chatPersonal),
            ),
          ],
          selected: {state.scope},
          onSelectionChanged: (value) => cubit.setScope(value.first),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            _TypeChip(
              type: ChatConversationType.channel,
              label: l10n.chatChannels,
            ),
            _TypeChip(
              type: ChatConversationType.direct,
              label: l10n.chatDirect,
            ),
            _TypeChip(type: ChatConversationType.group, label: l10n.chatGroups),
            _TypeChip(type: ChatConversationType.ai, label: l10n.chatAi),
          ],
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          children: [
            ChoiceChip(
              label: Text(l10n.chatActive),
              selected: state.archivedFilter == ChatArchivedFilter.active,
              onSelected: (_) =>
                  unawaited(cubit.setArchivedFilter(ChatArchivedFilter.active)),
            ),
            ChoiceChip(
              label: Text(l10n.chatArchived),
              selected: state.archivedFilter == ChatArchivedFilter.archived,
              onSelected: (_) => unawaited(
                cubit.setArchivedFilter(ChatArchivedFilter.archived),
              ),
            ),
            ChoiceChip(
              label: Text(l10n.chatAll),
              selected: state.archivedFilter == ChatArchivedFilter.all,
              onSelected: (_) =>
                  unawaited(cubit.setArchivedFilter(ChatArchivedFilter.all)),
            ),
          ],
        ),
      ],
    );
  }
}

class _TypeChip extends StatelessWidget {
  const _TypeChip({required this.type, required this.label});

  final ChatConversationType type;
  final String label;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<ChatCubit>();
    final selected = context.select<ChatCubit, bool>(
      (cubit) => cubit.state.typeFilters.contains(type),
    );
    return FilterChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => cubit.toggleType(type),
    );
  }
}

class _CenteredMessage extends StatelessWidget {
  const _CenteredMessage({
    required this.title,
    required this.description,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String description;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                textAlign: TextAlign.center,
                style: textTheme.titleLarge?.copyWith(
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                description,
                textAlign: TextAlign.center,
                style: textTheme.bodyMedium,
              ),
              if (actionLabel != null && onAction != null) ...[
                const SizedBox(height: 16),
                shad.PrimaryButton(
                  onPressed: onAction,
                  child: Text(actionLabel!),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
