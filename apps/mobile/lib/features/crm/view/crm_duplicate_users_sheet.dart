part of 'crm_page.dart';

class _DuplicateUsersSheet extends StatefulWidget {
  const _DuplicateUsersSheet({required this.result, required this.onMerge});

  final CrmDuplicateDetectionResult result;
  final Future<CrmMergeResult> Function(String sourceId, String targetId)
  onMerge;

  @override
  State<_DuplicateUsersSheet> createState() => _DuplicateUsersSheetState();
}

class _DuplicateUsersSheetState extends State<_DuplicateUsersSheet> {
  late final Map<int, String> _selectedTargets;
  bool _merging = false;

  @override
  void initState() {
    super.initState();
    _selectedTargets = {
      for (final cluster in widget.result.clusters)
        cluster.clusterId: cluster.suggestedTargetId,
    };
  }

  Future<void> _mergeCluster(CrmDuplicateCluster cluster) async {
    final targetId = _selectedTargets[cluster.clusterId];
    if (targetId == null) return;
    final source = cluster.users.firstWhere((user) => user.id != targetId);
    setState(() => _merging = true);
    try {
      await widget.onMerge(source.id, targetId);
      if (!mounted) return;
      Navigator.of(context).pop();
    } finally {
      if (mounted) setState(() => _merging = false);
    }
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
              context.l10n.crmDuplicateResults(widget.result.clusters.length),
              style: Theme.of(context).textTheme.titleLarge,
            ),
            const SizedBox(height: 16),
            Expanded(
              child: ListView(
                children: widget.result.clusters
                    .map(
                      (cluster) => Card(
                        margin: const EdgeInsets.only(bottom: 12),
                        child: Padding(
                          padding: const EdgeInsets.all(12),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(cluster.matchReason),
                              const SizedBox(height: 12),
                              DropdownButtonFormField<String>(
                                initialValue:
                                    _selectedTargets[cluster.clusterId],
                                items: cluster.users
                                    .map(
                                      (user) => DropdownMenuItem(
                                        value: user.id,
                                        child: Text(user.label),
                                      ),
                                    )
                                    .toList(growable: false),
                                onChanged: (value) {
                                  if (value == null) return;
                                  setState(() {
                                    _selectedTargets[cluster.clusterId] = value;
                                  });
                                },
                                decoration: InputDecoration(
                                  labelText: context.l10n.crmMergeTarget,
                                ),
                              ),
                              const SizedBox(height: 12),
                              ...cluster.users.map(
                                (user) => ListTile(
                                  contentPadding: EdgeInsets.zero,
                                  title: Text(user.label),
                                  subtitle: Text(
                                    [
                                      user.email,
                                      user.phone,
                                      if (user.isLinked)
                                        context.l10n.crmLinkedUser,
                                    ].whereType<String>().join(' • '),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              FilledButton.tonal(
                                onPressed: _merging
                                    ? null
                                    : () => _mergeCluster(cluster),
                                child: Text(context.l10n.crmMergeUsers),
                              ),
                            ],
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
