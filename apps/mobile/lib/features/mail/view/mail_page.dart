import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/mail/data/mail_repository.dart';
import 'package:mobile/features/mail/view/mail_composer.dart';
import 'package:mobile/features/mail/view/mail_message_tile.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/mail/view/mail_settings_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';

class MailPage extends StatelessWidget {
  const MailPage({super.key});

  @override
  Widget build(BuildContext context) {
    final user = context
        .select<AuthCubit, AuthState>((cubit) => cubit.state)
        .user;
    final wsId = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    if (user == null || wsId == null) return const SizedBox.shrink();
    if (!(user.email?.toLowerCase().endsWith('@tuturuuu.com') ?? false)) {
      return Center(child: Text(context.l10n.mailAccessRequired));
    }
    return _MailNavigator(key: ValueKey('${user.id}:$wsId'), workspaceId: wsId);
  }
}

class _MailNavigator extends StatefulWidget {
  const _MailNavigator({required this.workspaceId, super.key});
  final String workspaceId;
  @override
  State<_MailNavigator> createState() => _MailNavigatorState();
}

class _MailNavigatorState extends State<_MailNavigator> {
  final _navigator = GlobalKey<NavigatorState>();
  @override
  Widget build(BuildContext context) => NavigatorPopHandler<Object?>(
    onPopWithResult: (result) => _navigator.currentState?.pop(result),
    child: Navigator(
      key: _navigator,
      onGenerateRoute: (_) => MaterialPageRoute<void>(
        builder: (_) => MailWorkspace(workspaceId: widget.workspaceId),
      ),
    ),
  );
}

class MailWorkspace extends StatefulWidget {
  const MailWorkspace({required this.workspaceId, super.key, this.repository});
  final String workspaceId;
  final MailRepository? repository;

  @override
  State<MailWorkspace> createState() => _MailWorkspaceState();
}

class _MailWorkspaceState extends State<MailWorkspace> {
  late final MailRepository _repository;
  final _search = TextEditingController();
  List<Map<String, dynamic>> _mailboxes = [];
  List<Map<String, dynamic>> _items = [];
  List<Map<String, dynamic>> _labels = [];
  List<Map<String, dynamic>> _folders = [];
  final Set<String> _selected = {};
  String? _labelId;
  String? _folderId;
  bool _mutating = false;
  String? _mailboxId;
  String _folder = 'inbox';
  bool _loading = true;
  bool _hasMore = false;
  bool _failed = false;
  int _page = 1;
  int _generation = 0;

  bool get _threads => _folder != 'drafts' && _folder != 'sent';
  Map<String, dynamic> get _mailbox => _mailboxes.firstWhere(
    (box) => box['id'] == _mailboxId,
    orElse: () => <String, dynamic>{},
  );
  bool get _canSend {
    if (_mailbox['status'] != 'active') return false;
    final group = _mailbox['groupPolicy'] as Map<String, dynamic>?;
    final roles = group == null
        ? ['owner', 'admin', 'sender']
        : group['sendAs'] == 'members'
        ? ['owner', 'admin', 'sender', 'viewer']
        : ['owner', 'admin'];
    return roles.contains(_mailbox['role']);
  }

  @override
  void initState() {
    super.initState();
    _repository = widget.repository ?? MailRepository();
    unawaited(_bootstrap());
  }

  @override
  void dispose() {
    _generation++;
    _search.dispose();
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  Future<void> _bootstrap() async {
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final result = await _repository.bootstrap(widget.workspaceId);
      if (!mounted) return;
      setState(() {
        _mailboxes = mailRows(result['mailboxes']);
        _mailboxId = _mailboxes.firstOrNull?['id'] as String?;
      });
      await _load();
    } on Object {
      if (mounted) {
        setState(() {
          _failed = true;
          _loading = false;
        });
      }
    }
  }

  Future<void> _load({bool more = false}) async {
    final box = _mailboxId;
    final generation = ++_generation;
    if (box == null) {
      setState(() => _loading = false);
      return;
    }
    final page = more ? _page + 1 : 1;
    setState(() {
      _loading = true;
      _failed = false;
      if (!more) _items = [];
      if (!more) _selected.clear();
    });
    try {
      final result = await _repository.list(
        widget.workspaceId,
        box,
        folder: _folder,
        query: _search.text.trim(),
        page: page,
        label: _labelId,
        folderId: _folderId,
      );
      final organization = await _repository.organization(
        widget.workspaceId,
        box,
      );
      if (!mounted || generation != _generation) return;
      final pagination = result['pagination'] as Map<String, dynamic>;
      setState(() {
        final items = mailRows(result[_threads ? 'threads' : 'messages']);
        _items = more ? [..._items, ...items] : items;
        _page = page;
        _labels = mailRows(organization['labels']);
        _folders = mailRows(
          organization['folders'],
        ).where((f) => f['kind'] == 'custom').toList();
        if (!_labels.any((label) => label['id'] == _labelId)) _labelId = null;
        if (!_folders.any((folder) => folder['id'] == _folderId)) {
          _folderId = null;
        }
        _hasMore =
            pagination['hasMore'] as bool? ??
            page * 30 < (pagination['total'] as int? ?? 0);
      });
    } on Object {
      if (mounted && generation == _generation) setState(() => _failed = true);
    } finally {
      if (mounted && generation == _generation) {
        setState(() => _loading = false);
      }
    }
  }

  Future<void> _compose([Map<String, dynamic>? draft]) async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => MailComposer(
          repository: _repository,
          workspaceId: widget.workspaceId,
          mailboxId: _mailboxId!,
          fromAddress: _mailbox['address'] as String,
          signatureText: _mailbox['signatureText'] as String?,
          signatureHtml: _mailbox['signatureHtml'] as String?,
          draft: draft,
        ),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _manage() async {
    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => MailSettingsPage(
          repository: _repository,
          workspaceId: widget.workspaceId,
          mailboxId: _mailboxId!,
        ),
      ),
    );
    if (mounted) await _load();
  }

  Future<void> _bulk(String action, {String? labelId, String? folderId}) async {
    if (_mutating || _selected.isEmpty) return;
    setState(() => _mutating = true);
    try {
      await _repository.bulk(
        widget.workspaceId,
        _mailboxId!,
        _selected.toList(),
        action,
        threads: _threads,
        labelId: labelId,
        folderId: folderId,
      );
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
        );
      }
    } finally {
      if (mounted) await _load();
      if (mounted) setState(() => _mutating = false);
    }
  }

  Future<void> _markAllRead() async {
    setState(() => _mutating = true);
    try {
      await _repository.markFolderRead(
        widget.workspaceId,
        _mailboxId!,
        _folder,
      );
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
        );
      }
    } finally {
      if (mounted) await _load();
      if (mounted) setState(() => _mutating = false);
    }
  }

  Future<void> _open(Map<String, dynamic> item) async {
    final box = _mailboxId!;
    final generation = _generation;
    try {
      final detail = await _repository.detail(
        widget.workspaceId,
        box,
        item['id'] as String,
        thread: _threads,
      );
      if (!mounted || generation != _generation) return;
      if (_folder == 'drafts') {
        await _compose(detail);
        return;
      }
      await Navigator.of(context).push<void>(
        MaterialPageRoute(
          builder: (_) => MailReader(
            repository: _repository,
            workspaceId: widget.workspaceId,
            mailboxId: box,
            detail: detail,
            thread: _threads,
            canSend: _canSend,
            fromAddress: _mailbox['address'] as String,
            signatureText: _mailbox['signatureText'] as String?,
            signatureHtml: _mailbox['signatureHtml'] as String?,
          ),
        ),
      );
      if (mounted && generation == _generation) await _load();
    } on Object {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(context.l10n.commonSomethingWentWrong)),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final folders = {
      'inbox': l10n.mailInbox,
      'sent': l10n.mailSent,
      'drafts': l10n.mailDrafts,
      'starred': l10n.mailStarred,
      'archive': l10n.mailArchive,
      'spam': l10n.mailSpam,
      'trash': l10n.mailTrash,
    };
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.mailTitle),
        actions: [
          if (_mailboxId != null && ['inbox', 'archive'].contains(_folder))
            IconButton(
              tooltip: l10n.mailMarkAllRead,
              onPressed: _mutating ? null : _markAllRead,
              icon: const Icon(Icons.mark_email_read_outlined),
            ),
          if (['owner', 'admin'].contains(_mailbox['role']))
            IconButton(
              tooltip: l10n.mailSettings,
              onPressed: _mutating ? null : _manage,
              icon: const Icon(Icons.settings_outlined),
            ),
        ],
      ),
      floatingActionButton: _mailboxId != null && _canSend
          ? FloatingActionButton.extended(
              onPressed: _mutating ? null : _compose,
              icon: const Icon(Icons.edit_outlined),
              label: Text(l10n.mailCompose),
            )
          : null,
      body: AbsorbPointer(
        absorbing: _mutating,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  if (_mailboxes.isNotEmpty)
                    DropdownButtonFormField<String>(
                      initialValue: _mailboxId,
                      isExpanded: true,
                      decoration: InputDecoration(labelText: l10n.mailMailbox),
                      items: _mailboxes
                          .map(
                            (box) => DropdownMenuItem(
                              value: box['id'] as String,
                              child: Text(
                                box['address'] as String,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          )
                          .toList(),
                      onChanged: (value) {
                        setState(() {
                          _mailboxId = value;
                          _labelId = null;
                          _folderId = null;
                        });
                        unawaited(_load());
                      },
                    ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _search,
                    textInputAction: TextInputAction.search,
                    decoration: InputDecoration(
                      labelText: l10n.mailSearch,
                      prefixIcon: const Icon(Icons.search),
                      suffixIcon: IconButton(
                        tooltip: l10n.mailSearch,
                        onPressed: _load,
                        icon: const Icon(Icons.arrow_forward),
                      ),
                    ),
                    onSubmitted: (_) => _load(),
                  ),
                ],
              ),
            ),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final folder in folders.entries)
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: ChoiceChip(
                        label: Text(folder.value),
                        selected: _folder == folder.key,
                        onSelected: (_) {
                          setState(() => _folder = folder.key);
                          unawaited(_load());
                        },
                      ),
                    ),
                ],
              ),
            ),
            if (_loading) const LinearProgressIndicator(),
            if (_mutating) const LinearProgressIndicator(),
            if (_labels.isNotEmpty || _folders.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: DropdownButton<String>(
                  value: _labelId != null
                      ? 'label:$_labelId'
                      : _folderId != null
                      ? 'folder:$_folderId'
                      : '',
                  isExpanded: true,
                  items: [
                    DropdownMenuItem(
                      value: '',
                      child: Text(l10n.mailAllLabels),
                    ),
                    for (final label in _labels)
                      DropdownMenuItem(
                        value: 'label:${label['id']}',
                        child: Text(label['name'] as String),
                      ),
                    for (final folder in _folders)
                      DropdownMenuItem(
                        value: 'folder:${folder['id']}',
                        child: Text(folder['name'] as String),
                      ),
                  ],
                  onChanged: (v) {
                    setState(() {
                      _labelId = v?.startsWith('label:') == true
                          ? v!.substring(6)
                          : null;
                      _folderId = v?.startsWith('folder:') == true
                          ? v!.substring(7)
                          : null;
                    });
                    unawaited(_load());
                  },
                ),
              ),
            if (_selected.isNotEmpty)
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    Padding(
                      padding: const EdgeInsets.all(8),
                      child: Text('${_selected.length}'),
                    ),
                    IconButton(
                      tooltip: l10n.mailSelectAll,
                      onPressed: () => setState(
                        () => _selected.addAll(
                          _items.map((i) => i['id'] as String),
                        ),
                      ),
                      icon: const Icon(Icons.select_all),
                    ),
                    IconButton(
                      tooltip: l10n.mailArchive,
                      onPressed: () => _bulk('archive'),
                      icon: const Icon(Icons.archive_outlined),
                    ),
                    IconButton(
                      tooltip: l10n.mailTrash,
                      onPressed: () => _bulk('trash'),
                      icon: const Icon(Icons.delete_outline),
                    ),
                    IconButton(
                      tooltip: l10n.mailMarkAllRead,
                      onPressed: () => _bulk('mark_read'),
                      icon: const Icon(Icons.mark_email_read_outlined),
                    ),
                    if (_labels.isNotEmpty)
                      PopupMenuButton<String>(
                        tooltip: l10n.mailLabels,
                        icon: const Icon(Icons.label_outline),
                        onSelected: (id) => _bulk('add_label', labelId: id),
                        itemBuilder: (_) => _labels
                            .map(
                              (l) => PopupMenuItem(
                                value: l['id'] as String,
                                child: Text(l['name'] as String),
                              ),
                            )
                            .toList(),
                      ),
                    IconButton(
                      tooltip: l10n.commonCancel,
                      onPressed: () => setState(_selected.clear),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
              ),
            if (_failed)
              TextButton.icon(
                onPressed: _mailboxId == null ? _bootstrap : _load,
                icon: const Icon(Icons.refresh),
                label: Text(l10n.commonSomethingWentWrong),
              ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.only(bottom: 100),
                  children: [
                    if (!_loading && !_failed && _items.isEmpty)
                      Padding(
                        padding: const EdgeInsets.all(32),
                        child: Center(child: Text(l10n.mailEmpty)),
                      ),
                    for (final item in _items)
                      MailMessageTile(
                        item: item,
                        thread: _threads,
                        selected: _selected.contains(item['id']),
                        onSelect: () => setState(() {
                          final id = item['id'] as String;
                          if (!_selected.remove(id)) _selected.add(id);
                        }),
                        onTap: () {
                          if (_selected.isEmpty) {
                            unawaited(_open(item));
                          } else {
                            setState(() {
                              final id = item['id'] as String;
                              if (!_selected.remove(id)) _selected.add(id);
                            });
                          }
                        },
                      ),
                    if (_hasMore)
                      TextButton(
                        onPressed: _loading ? null : () => _load(more: true),
                        child: Text(l10n.mailLoadMore),
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
