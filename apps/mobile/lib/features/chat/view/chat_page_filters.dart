part of 'chat_page.dart';

class _ChatFilters extends StatelessWidget {
  const _ChatFilters({required this.state});

  final ChatState state;

  @override
  Widget build(BuildContext context) {
    final cubit = context.read<ChatCubit>();
    final l10n = context.l10n;
    return Wrap(
      spacing: AppSpacing.sm,
      runSpacing: AppSpacing.sm,
      children: [
        _TypeChip(type: ChatConversationType.channel, label: l10n.chatChannels),
        _TypeChip(type: ChatConversationType.direct, label: l10n.chatDirect),
        _TypeChip(type: ChatConversationType.group, label: l10n.chatGroups),
        _TypeChip(type: ChatConversationType.ai, label: l10n.chatAi),
        AppChip(
          label: Text(l10n.chatActive),
          selected: state.archivedFilter == ChatArchivedFilter.active,
          inMutuallyExclusiveGroup: true,
          onSelected: (_) =>
              unawaited(cubit.setArchivedFilter(ChatArchivedFilter.active)),
        ),
        AppChip(
          label: Text(l10n.chatArchived),
          selected: state.archivedFilter == ChatArchivedFilter.archived,
          inMutuallyExclusiveGroup: true,
          onSelected: (_) =>
              unawaited(cubit.setArchivedFilter(ChatArchivedFilter.archived)),
        ),
        AppChip(
          label: Text(l10n.chatAll),
          selected: state.archivedFilter == ChatArchivedFilter.all,
          inMutuallyExclusiveGroup: true,
          onSelected: (_) =>
              unawaited(cubit.setArchivedFilter(ChatArchivedFilter.all)),
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
    return AppChip(
      label: Text(label),
      selected: selected,
      onSelected: (_) => cubit.toggleType(type),
    );
  }
}
