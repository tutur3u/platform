part of 'crm_page.dart';

class _FeedbackSheet extends StatefulWidget {
  const _FeedbackSheet({
    required this.wsId,
    required this.user,
    required this.groups,
    required this.repository,
    required this.canManageFeedbacks,
  });

  final String wsId;
  final CrmUser user;
  final List<CrmGroup> groups;
  final CrmRepository repository;
  final bool canManageFeedbacks;

  @override
  State<_FeedbackSheet> createState() => _FeedbackSheetState();
}

class _FeedbackSheetState extends State<_FeedbackSheet> {
  List<CrmFeedback> _items = const <CrmFeedback>[];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    try {
      final result = await widget.repository.getFeedbacks(
        widget.wsId,
        userId: widget.user.id,
        pageSize: 100,
      );
      if (!mounted) return;
      setState(() {
        _items = result.items;
      });
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _editFeedback([CrmFeedback? feedback]) async {
    final contentController = TextEditingController(
      text: feedback?.content ?? '',
    );
    var selectedGroupId = feedback?.groupId;
    if (selectedGroupId == null && widget.groups.isNotEmpty) {
      selectedGroupId = widget.groups.first.id;
    }
    var requireAttention = feedback?.requireAttention ?? false;

    final saved = await showAppDialog<bool>(
      context: context,
      builder: (context) => AppDialog(
        title: feedback == null
            ? context.l10n.crmAddFeedback
            : context.l10n.commonEdit,
        content: StatefulBuilder(
          builder: (context, setState) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppSelect<String>(
                title: context.l10n.crmGroup,
                placeholder: context.l10n.crmGroup,
                value: selectedGroupId,
                options: [
                  for (final group in widget.groups)
                    AppSelectOption(value: group.id, label: group.name),
                ],
                onChanged: (value) => setState(() => selectedGroupId = value),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: contentController,
                minLines: 3,
                maxLines: 5,
                placeholder: context.l10n.inputPlaceholderFeedback,
                label: context.l10n.crmFeedback,
              ),
              AppToggleRow(
                value: requireAttention,
                onChanged: (value) => setState(() => requireAttention = value),
                title: Text(context.l10n.crmRequireAttention),
              ),
            ],
          ),
        ),
        actions: [
          AppButton.ghost(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          AppButton.primary(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(context.l10n.commonSave),
          ),
        ],
      ),
    );

    if (saved != true || selectedGroupId == null) return;

    if (feedback == null) {
      await widget.repository.createFeedback(
        widget.wsId,
        userId: widget.user.id,
        groupId: selectedGroupId!,
        content: contentController.text,
        requireAttention: requireAttention,
      );
    } else {
      await widget.repository.updateFeedback(
        widget.wsId,
        feedbackId: feedback.id,
        content: contentController.text,
        requireAttention: requireAttention,
      );
    }

    await _load();
  }

  Future<void> _deleteFeedback(CrmFeedback feedback) async {
    await widget.repository.deleteFeedback(
      widget.wsId,
      feedbackId: feedback.id,
    );
    await _load();
  }

  Future<void> _feedbackActions(CrmFeedback item) async {
    final l10n = context.l10n;
    final action = await showAppActionSheet<String>(
      context: context,
      title: item.groupName ?? item.group?.name ?? l10n.crmFeedback,
      actions: [
        AppSheetAction(
          label: l10n.commonEdit,
          value: 'edit',
          icon: LucideIcons.pencil,
        ),
        AppSheetAction(
          label: l10n.commonDelete,
          value: 'delete',
          icon: LucideIcons.trash2,
          destructive: true,
        ),
      ],
    );
    if (!mounted || action == null) return;
    if (action == 'edit') {
      await _editFeedback(item);
    } else if (action == 'delete') {
      await _deleteFeedback(item);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    return Padding(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.crmFeedbackFor(contactPrimaryNameFor(widget.user)),
            style: tokens.typography.large.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          if (widget.canManageFeedbacks)
            AppButton.secondary(
              onPressed: _editFeedback,
              leading: const Icon(LucideIcons.messageCircle),
              child: Text(l10n.crmAddFeedback),
            ),
          const SizedBox(height: AppSpacing.lg),
          Expanded(
            child: _loading
                ? const AppLoadingIndicator.page()
                : NovaRefreshIndicator(
                    onRefresh: _load,
                    child: ListView(
                      physics: const AlwaysScrollableScrollPhysics(),
                      children: [
                        for (var index = 0; index < _items.length; index++)
                          PendingSyncFrame(
                            workspaceId: widget.wsId,
                            feature: 'crm',
                            entityId: _items[index].id,
                            child: AppGroupedSlice(
                              position: AppSlicePosition.of(
                                index,
                                _items.length,
                              ),
                              child: AppRichRow(
                                title:
                                    _items[index].groupName ??
                                    _items[index].group?.name ??
                                    '',
                                subtitle: _items[index].content,
                                onLongPress: widget.canManageFeedbacks
                                    ? () => _feedbackActions(_items[index])
                                    : null,
                              ),
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
}
