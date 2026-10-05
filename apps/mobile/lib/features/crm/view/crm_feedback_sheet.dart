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

    final saved = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          feedback == null
              ? context.l10n.crmAddFeedback
              : context.l10n.commonEdit,
        ),
        content: StatefulBuilder(
          builder: (context, setState) => Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              DropdownButtonFormField<String>(
                initialValue: selectedGroupId,
                items: widget.groups
                    .map(
                      (group) => DropdownMenuItem(
                        value: group.id,
                        child: Text(group.name),
                      ),
                    )
                    .toList(growable: false),
                onChanged: (value) => setState(() => selectedGroupId = value),
                decoration: InputDecoration(labelText: context.l10n.crmGroup),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: contentController,
                minLines: 3,
                maxLines: 5,
                decoration: InputDecoration(
                  labelText: context.l10n.crmFeedback,
                ),
              ),
              SwitchListTile(
                value: requireAttention,
                onChanged: (value) => setState(() => requireAttention = value),
                title: Text(context.l10n.crmRequireAttention),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          FilledButton(
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

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              context.l10n.crmFeedbackFor(widget.user.label),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            if (widget.canManageFeedbacks)
              FilledButton.tonalIcon(
                onPressed: _editFeedback,
                icon: const Icon(Icons.add_comment_outlined),
                label: Text(context.l10n.crmAddFeedback),
              ),
            const SizedBox(height: 16),
            Expanded(
              child: _loading
                  ? const Center(child: NovaLoadingIndicator())
                  : ListView(
                      children: _items
                          .map(
                            (item) => PendingSyncFrame(
                              workspaceId: widget.wsId,
                              feature: 'crm',
                              entityId: item.id,
                              child: Card(
                                margin: const EdgeInsets.only(bottom: 8),
                                child: ListTile(
                                  title: Text(
                                    item.groupName ?? item.group?.name ?? '',
                                  ),
                                  subtitle: Text(item.content),
                                  trailing: widget.canManageFeedbacks
                                      ? PopupMenuButton<String>(
                                          onSelected: (value) {
                                            if (value == 'edit') {
                                              unawaited(_editFeedback(item));
                                            }
                                            if (value == 'delete') {
                                              unawaited(_deleteFeedback(item));
                                            }
                                          },
                                          itemBuilder: (context) => [
                                            PopupMenuItem(
                                              value: 'edit',
                                              child: Text(
                                                context.l10n.commonEdit,
                                              ),
                                            ),
                                            PopupMenuItem(
                                              value: 'delete',
                                              child: Text(
                                                context.l10n.commonDelete,
                                              ),
                                            ),
                                          ],
                                        )
                                      : null,
                                ),
                              ),
                            ),
                          )
                          .toList(growable: false),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
