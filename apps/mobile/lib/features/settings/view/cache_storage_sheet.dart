import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/cache/cache_storage_snapshot.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/features/settings/view/cache_storage_chart.dart';
import 'package:mobile/l10n/l10n.dart';

Future<void> showCacheStorageSheet(BuildContext context) =>
    showModalBottomSheet<void>(
      context: context,
      useRootNavigator: true,
      useSafeArea: true,
      isScrollControlled: true,
      builder: (_) => const FractionallySizedBox(
        heightFactor: 0.82,
        child: CacheStorageSheet(),
      ),
    );

class CacheStorageSheet extends StatefulWidget {
  const CacheStorageSheet({super.key});

  @override
  State<CacheStorageSheet> createState() => _CacheStorageSheetState();
}

class _CacheStorageSheetState extends State<CacheStorageSheet> {
  CacheStorageSnapshot? _snapshot;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_refresh());
  }

  Future<void> _refresh() async {
    try {
      final snapshot = await CacheStore.instance.storageSnapshot();
      if (!mounted) return;
      setState(() {
        _snapshot = snapshot;
        _error = null;
      });
    } on Object {
      if (mounted) setState(() => _error = context.l10n.cacheStorageError);
    }
  }

  Future<void> _setLimit(int bytes) async {
    setState(() => _busy = true);
    try {
      await CacheStore.instance.setMaxStorageBytes(bytes);
      await _refresh();
    } on Object {
      if (mounted) setState(() => _error = context.l10n.cacheStorageError);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _clear() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(context.l10n.cacheStorageClear),
        content: Text(context.l10n.cacheStorageClearDescription),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: Text(context.l10n.commonCancel),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: Text(context.l10n.cacheStorageClear),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await CacheStore.instance.clearResourceCache();
      await _refresh();
    } on Object {
      if (mounted) setState(() => _error = context.l10n.cacheStorageError);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final snapshot = _snapshot;
    final scheme = Theme.of(context).colorScheme;
    final colors = [
      scheme.primary,
      scheme.secondary,
      scheme.tertiary,
      scheme.error,
      scheme.primaryContainer,
      scheme.tertiaryContainer,
      scheme.outline,
    ];
    const categories = CacheStorageCategory.values;
    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      child: ListView(
        children: [
          Center(
            child: Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: scheme.outlineVariant,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ),
          const SizedBox(height: 24),
          Text(
            l10n.cacheStorageTitle,
            style: Theme.of(context).textTheme.headlineSmall,
          ),
          const SizedBox(height: 6),
          Text(l10n.cacheStorageDescription),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: TextStyle(color: scheme.error)),
          ],
          if (snapshot == null) ...[
            const SizedBox(height: 28),
            const Center(child: CircularProgressIndicator()),
          ] else ...[
            const SizedBox(height: 26),
            Center(
              child: CacheStorageChart(
                bytes: snapshot.totalBytes,
                limitBytes: snapshot.maxBytes,
                categoryBytes: [
                  for (final category in categories)
                    snapshot.categoryBytes[category] ?? 0,
                ],
                colors: colors,
              ),
            ),
            const SizedBox(height: 12),
            Center(
              child: Text(
                '${_formatBytes(snapshot.totalBytes)} / ${_formatBytes(snapshot.maxBytes)}',
              ),
            ),
            const SizedBox(height: 6),
            Center(
              child: Text(
                l10n.cacheStorageEstimateNote,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ),
            const SizedBox(height: 22),
            for (var index = 0; index < categories.length; index++)
              _CategoryRow(
                label: _categoryLabel(context, categories[index]),
                bytes: snapshot.categoryBytes[categories[index]] ?? 0,
                total: snapshot.totalBytes,
                color: colors[index],
              ),
            const SizedBox(height: 20),
            Text(
              l10n.cacheStorageLimit,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                for (final bytes in CacheStore.allowedMaxBytes)
                  ChoiceChip(
                    label: Text(_formatBytes(bytes)),
                    selected: snapshot.maxBytes == bytes,
                    onSelected: _busy
                        ? null
                        : (_) => unawaited(_setLimit(bytes)),
                  ),
              ],
            ),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: _busy || snapshot.totalBytes == 0
                  ? null
                  : () => unawaited(_clear()),
              icon: const Icon(Icons.delete_outline_rounded),
              label: Text(l10n.cacheStorageClear),
            ),
          ],
        ],
      ),
    );
  }
}

class _CategoryRow extends StatelessWidget {
  const _CategoryRow({
    required this.label,
    required this.bytes,
    required this.total,
    required this.color,
  });
  final String label;
  final int bytes;
  final int total;
  final Color color;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 5),
    child: Column(
      children: [
        Row(
          children: [
            Icon(Icons.circle, size: 10, color: color),
            const SizedBox(width: 8),
            Expanded(child: Text(label)),
            Text(_formatBytes(bytes)),
          ],
        ),
        const SizedBox(height: 5),
        LinearProgressIndicator(
          value: total == 0 ? 0 : bytes / total,
          color: color,
          minHeight: 3,
        ),
      ],
    ),
  );
}

String _formatBytes(int bytes) => bytes >= 1024 * 1024
    ? '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB'
    : '${(bytes / 1024).toStringAsFixed(1)} KB';

String _categoryLabel(BuildContext context, CacheStorageCategory category) {
  final l10n = context.l10n;
  return switch (category) {
    CacheStorageCategory.mailMedia => l10n.cacheCategoryMailMedia,
    CacheStorageCategory.mail => l10n.cacheCategoryMail,
    CacheStorageCategory.messages => l10n.cacheCategoryMessages,
    CacheStorageCategory.tasks => l10n.cacheCategoryTasks,
    CacheStorageCategory.calendar => l10n.cacheCategoryCalendar,
    CacheStorageCategory.finance => l10n.cacheCategoryFinance,
    CacheStorageCategory.other => l10n.cacheCategoryOther,
  };
}
