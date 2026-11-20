import 'package:flutter/material.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/features/crm/utils/contact_identity.dart';
import 'package:mobile/l10n/l10n.dart';

/// Picks a surviving record for each duplicate cluster and merges the rest.
class ContactMergeSheet extends StatefulWidget {
  const ContactMergeSheet({
    required this.result,
    required this.onMerge,
    this.confirmBulkMerge,
    super.key,
  });

  final CrmDuplicateDetectionResult result;
  final Future<CrmMergeResult> Function(String sourceId, String targetId)
  onMerge;
  final Future<bool> Function(int count)? confirmBulkMerge;

  @override
  State<ContactMergeSheet> createState() => ContactMergeSheetState();
}

class ContactMergeSheetState extends State<ContactMergeSheet> {
  late final Map<int, String> _selectedTargets;
  bool _merging = false;
  int _completedCount = 0;
  int? _batchSize;

  List<(String, String)> get _independentPairs {
    final pairs = <(String, String)>[];
    final used = <String>{};
    for (final cluster in widget.result.clusters) {
      if (cluster.users.length != 2) continue;
      final target = _selectedTargets[cluster.clusterId];
      final source = cluster.users.where((user) => user.id != target);
      if (target == null || source.length != 1) continue;
      final sourceId = source.single.id;
      if (!used.add(sourceId) || !used.add(target)) return const [];
      pairs.add((sourceId, target));
    }
    return pairs;
  }

  Future<void> _mergeBatch() async {
    final confirm = widget.confirmBulkMerge;
    if (confirm == null || _merging || _batchSize != null) return;
    final pairs = _independentPairs;
    if (pairs.length < 2) return;
    setState(() => _merging = true);
    try {
      if (!await confirm(pairs.length) || !mounted) return;
      setState(() => _batchSize = pairs.length);
      for (final (source, target) in pairs) {
        if (!mounted) return;
        final result = await widget.onMerge(source, target);
        if (!mounted || !result.success) return;
        setState(() => _completedCount++);
      }
    } on Object {
      // Keep the confirmed count visible after an uncertain write.
    } finally {
      if (mounted) setState(() => _merging = false);
    }
  }

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
    if (targetId == null || _merging) return;
    final source = cluster.users.where((user) => user.id != targetId);
    if (source.isEmpty) return;
    setState(() => _merging = true);
    try {
      await widget.onMerge(source.first.id, targetId);
      if (!mounted) return;
      final navigator = Navigator.of(context);
      if (navigator.canPop()) navigator.pop();
    } finally {
      if (mounted) setState(() => _merging = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      children: [
        Text(
          l10n.crmDuplicateResults(widget.result.clusters.length),
          style: AppTokens.of(
            context,
          ).typography.large.copyWith(fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: AppSpacing.lg),
        if (_batchSize case final total?)
          AppPanel(
            child: Text(
              _merging || _completedCount == total
                  ? l10n.crmBulkMergeProgress(_completedCount, total)
                  : l10n.crmBulkMergeStopped(_completedCount, total),
            ),
          )
        else if (widget.confirmBulkMerge != null &&
            _independentPairs.length > 1)
          AppButton.outline(
            onPressed: _merging ? null : _mergeBatch,
            child: Text(l10n.crmBulkMerge),
          ),
        const SizedBox(height: AppSpacing.md),
        for (final cluster in widget.result.clusters) ...[
          AppPanel(
            title: cluster.matchReason,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AppSelect<String>(
                  title: l10n.crmMergeTarget,
                  placeholder: l10n.crmMergeTarget,
                  value: _selectedTargets[cluster.clusterId],
                  options: [
                    for (final user in cluster.users)
                      AppSelectOption(
                        value: user.id,
                        label: _duplicateName(user),
                        description: _duplicateSecondary(user),
                      ),
                  ],
                  onChanged: _merging || _batchSize != null
                      ? null
                      : (value) => setState(() {
                          _selectedTargets[cluster.clusterId] = value;
                        }),
                ),
                const SizedBox(height: AppSpacing.md),
                for (final user in cluster.users)
                  AppRichRow(
                    title: _duplicateName(user),
                    subtitle: _duplicateSecondary(user),
                    meta: [
                      if (_duplicatePhone(user) case final phone?)
                        AppMetaItem(icon: LucideIcons.phone, label: phone),
                      if (user.isLinked)
                        AppMetaItem(
                          icon: LucideIcons.link,
                          label: l10n.crmLinkedUser,
                        ),
                    ],
                  ),
                const SizedBox(height: AppSpacing.md),
                AppButton.primary(
                  key: ValueKey('contact-merge-${cluster.clusterId}'),
                  loading: _merging,
                  onPressed: _merging || _batchSize != null
                      ? null
                      : () => _mergeCluster(cluster),
                  child: Text(l10n.crmMergeUsers),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
      ],
    );
  }

  String _duplicateName(CrmDuplicateUser user) => contactPrimaryName(
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    fallback: user.id,
  );

  String? _duplicateSecondary(CrmDuplicateUser user) => contactSecondaryLine(
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
  );

  String? _duplicatePhone(CrmDuplicateUser user) => contactPhoneLine(
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
  );
}
