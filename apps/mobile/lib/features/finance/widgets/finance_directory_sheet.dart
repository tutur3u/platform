import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/finance_invoice.dart';
import 'package:mobile/l10n/l10n.dart';

class FinanceDirectorySheet<T> extends StatefulWidget {
  const FinanceDirectorySheet({
    required this.title,
    required this.empty,
    required this.fetch,
    required this.row,
    this.create,
    this.createLabel,
    this.sections,
    this.onExport,
    super.key,
  });

  final String title;
  final String empty;
  final Future<FinancePageResult<T>> Function(String query, int page) fetch;
  final Widget Function(
    BuildContext context,
    T item,
    Future<void> Function() reload,
  )
  row;
  final Future<bool> Function(BuildContext context)? create;
  final String? createLabel;
  final Widget? sections;
  final Future<void> Function(BuildContext, String)? onExport;

  @override
  State<FinanceDirectorySheet<T>> createState() =>
      _FinanceDirectorySheetState<T>();
}

class _FinanceDirectorySheetState<T> extends State<FinanceDirectorySheet<T>> {
  final _search = TextEditingController();
  List<T> _items = [];
  Timer? _debounce;
  int _generation = 0;
  int _page = 0;
  int _count = 0;
  bool _failed = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load(reset: true));
  }

  @override
  void dispose() {
    _debounce?.cancel();
    WidgetsBinding.instance.addPostFrameCallback((_) => _search.dispose());
    super.dispose();
  }

  Future<void> _load({required bool reset}) async {
    final generation = ++_generation;
    final page = reset ? 1 : _page + 1;
    setState(() {
      _busy = true;
      _failed = false;
    });
    try {
      final result = await widget.fetch(_search.text.trim(), page);
      if (!mounted || generation != _generation) return;
      setState(() {
        _items = [if (!reset) ..._items, ...result.items];
        _page = page;
        _count = result.items.isEmpty ? _items.length : result.count;
      });
    } on Object {
      if (mounted && generation == _generation) setState(() => _failed = true);
    } finally {
      if (mounted && generation == _generation) setState(() => _busy = false);
    }
  }

  void _searchChanged(String value) {
    _debounce?.cancel();
    ++_generation;
    setState(() {
      _items = [];
      _page = 0;
      _count = 0;
      _busy = true;
      _failed = false;
    });
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) unawaited(_load(reset: true));
    });
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final create = widget.create;
    return AppSheetScaffold(
      title: widget.title,
      search: AppSheetSearch(
        controller: _search,
        hint: l10n.commonSearch,
        onChanged: _searchChanged,
      ),
      onRefresh: () => _load(reset: true),
      actions: [
        if (widget.onExport case final export?)
          AppButton.secondary(
            leading: const Icon(LucideIcons.download),
            onPressed: () => export(context, _search.text.trim()),
            child: Text(l10n.financeExportInvoices),
          ),
        if (create != null)
          AppButton.primary(
            leading: const Icon(LucideIcons.plus),
            onPressed: () async {
              final saved = await create(context);
              if (mounted && saved) await _load(reset: true);
            },
            child: Text(widget.createLabel!),
          ),
      ],
      slivers: [
        if (widget.sections case final sections?)
          SliverToBoxAdapter(child: sections),
        SliverList.builder(
          itemCount: _items.length,
          itemBuilder: (context, index) =>
              widget.row(context, _items[index], () => _load(reset: true)),
        ),
        SliverToBoxAdapter(
          child: _busy
              ? const AppLoadingIndicator()
              : _failed
              ? AppStateMessage.inline(
                  icon: LucideIcons.circleAlert,
                  title: l10n.commonSomethingWentWrong,
                  actionLabel: l10n.commonRetry,
                  onAction: () => unawaited(_load(reset: _page == 0)),
                )
              : _items.isEmpty
              ? AppStateMessage.inline(
                  icon: LucideIcons.search,
                  title: widget.empty,
                )
              : _items.length < _count
              ? AppButton.secondary(
                  onPressed: () => _load(reset: false),
                  child: Text(l10n.commonLoadMore),
                )
              : const SizedBox.shrink(),
        ),
      ],
    );
  }
}
