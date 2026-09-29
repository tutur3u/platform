import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/cache/cache_context.dart';
import 'package:mobile/core/cache/cache_key.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/pending_collection_overlay.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';

enum NoteLinkKind { task, event, finance, note, meeting }

class NoteLinkOption {
  const NoteLinkOption({
    required this.id,
    required this.kind,
    required this.title,
    required this.url,
  });

  final String id;
  final NoteLinkKind kind;
  final String title;
  final String url;
}

Future<NoteLinkOption?> showNoteLinkPickerSheet(
  BuildContext context, {
  required String wsId,
}) => showAdaptiveSheet<NoteLinkOption>(
  context: context,
  maxDialogWidth: 520,
  builder: (_) => _NoteLinkPickerSheet(wsId: wsId),
);

class _NoteLinkPickerSheet extends StatefulWidget {
  const _NoteLinkPickerSheet({required this.wsId});

  final String wsId;

  @override
  State<_NoteLinkPickerSheet> createState() => _NoteLinkPickerSheetState();
}

class _NoteLinkPickerSheetState extends State<_NoteLinkPickerSheet> {
  final _api = ApiClient();
  final _search = TextEditingController();
  Timer? _debounce;
  NoteLinkKind _kind = NoteLinkKind.task;
  List<NoteLinkOption> _options = const [];
  bool _loading = false;
  bool _failed = false;
  int _requestId = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _requestId++;
    _debounce?.cancel();
    _search.dispose();
    _api.dispose();
    super.dispose();
  }

  void _onSearchChanged(String _) {
    _debounce?.cancel();
    _debounce = Timer(
      const Duration(milliseconds: 300),
      () => unawaited(_load()),
    );
  }

  Future<List<dynamic>> _readRows({
    required String namespace,
    required String path,
    required String rowKey,
    required String pendingPath,
    bool listResponse = false,
    bool overlayPending = true,
  }) async {
    List<dynamic>? fetched;
    Object? fetchError;
    try {
      if (listResponse) {
        fetched = await readThroughJsonList(
          api: _api,
          namespace: namespace,
          workspaceId: widget.wsId,
          path: path,
        );
      } else {
        final response = await readThroughJson(
          api: _api,
          namespace: namespace,
          workspaceId: widget.wsId,
          path: path,
        );
        fetched = response[rowKey] as List<dynamic>? ?? const [];
      }
    } on Object catch (error) {
      fetchError = error;
    }
    final userId = currentCacheUserId();
    List<dynamic> rows = fetched ?? const [];
    var hasFallback = false;
    if (fetchError != null && userId != null) {
      final sourceKeys = {
        CacheKey(
          namespace: namespace,
          userId: userId,
          workspaceId: widget.wsId,
          params: {'path': path},
        ).value,
        if (namespace.startsWith('notes.'))
          CacheKey(
            namespace: namespace,
            userId: userId,
            workspaceId: widget.wsId,
          ).value,
      };
      final local = await CacheStore.instance.queryReplica(
        namespace: namespace,
        userId: userId,
        workspaceId: widget.wsId,
        sourceKeys: sourceKeys,
      );
      rows = local.map((row) => row.payload).toList(growable: false);
      hasFallback = rows.isNotEmpty;
    }
    if (overlayPending && userId != null) {
      final pending = (await CacheStore.instance.listPendingMutations())
          .where((mutation) => mutation.userId == userId)
          .toList(growable: false);
      rows = overlayPendingCollection(
        workspaceId: widget.wsId,
        feature: namespace.split('.').first,
        pathContains: pendingPath,
        source: rows.whereType<Map<String, dynamic>>().toList(growable: false),
        pending: pending,
      );
    }
    if (fetchError != null && !hasFallback && rows.isEmpty) {
      if (fetchError case final Exception error) throw error;
      throw StateError(fetchError.toString());
    }
    return rows;
  }

  Future<void> _load() async {
    final requestId = ++_requestId;
    final wsId = Uri.encodeComponent(widget.wsId);
    final search = _search.text.trim();
    final language = Localizations.localeOf(context).languageCode;
    setState(() {
      _loading = true;
      _failed = false;
    });
    try {
      final List<NoteLinkOption> options;
      switch (_kind) {
        case NoteLinkKind.task:
          final query = Uri(
            queryParameters: {
              'limit': '30',
              if (search.isNotEmpty) 'q': search,
            },
          ).query;
          final rows = await _readRows(
            namespace: 'tasks.list',
            path: '/api/v1/workspaces/$wsId/tasks?$query',
            rowKey: 'tasks',
            pendingPath: '/tasks',
          );
          options = rows
              .whereType<Map<String, dynamic>>()
              .map(
                (task) => NoteLinkOption(
                  id: task['id'] as String? ?? '',
                  kind: NoteLinkKind.task,
                  title: task['name'] as String? ?? '',
                  url:
                      'https://tasks.tuturuuu.com/$language/$wsId/tasks/${task['id']}',
                ),
              )
              .where(
                (option) =>
                    option.title.toLowerCase().contains(search.toLowerCase()),
              )
              .take(30)
              .toList();
        case NoteLinkKind.event:
          final now = DateTime.now().toUtc();
          final query = Uri(
            queryParameters: {
              'start_at': now
                  .subtract(const Duration(days: 30))
                  .toIso8601String(),
              'end_at': now.add(const Duration(days: 180)).toIso8601String(),
            },
          ).query;
          final rows = await _readRows(
            namespace: 'calendar.events',
            path: '/api/v1/workspaces/$wsId/calendar/events?$query',
            rowKey: 'data',
            pendingPath: '/events',
          );
          options = rows
              .whereType<Map<String, dynamic>>()
              .map(
                (event) => NoteLinkOption(
                  id: event['id'] as String? ?? '',
                  kind: NoteLinkKind.event,
                  title: event['title'] as String? ?? '',
                  url:
                      'https://calendar.tuturuuu.com/$language/$wsId?eventId=${Uri.encodeQueryComponent(event['id'] as String? ?? '')}',
                ),
              )
              .where(
                (option) =>
                    option.title.toLowerCase().contains(search.toLowerCase()),
              )
              .take(30)
              .toList();
        case NoteLinkKind.finance:
          final response = await _readRows(
            namespace: 'finance.wallets',
            path: '/api/v1/workspaces/$wsId/wallets',
            rowKey: '',
            pendingPath: '/wallets',
            listResponse: true,
          );
          options = response
              .whereType<Map<String, dynamic>>()
              .map(
                (wallet) => NoteLinkOption(
                  id: wallet['id'] as String? ?? '',
                  kind: NoteLinkKind.finance,
                  title: wallet['name'] as String? ?? '',
                  url:
                      'https://finance.tuturuuu.com/$language/$wsId/wallets/${wallet['id']}',
                ),
              )
              .where(
                (option) =>
                    option.title.toLowerCase().contains(search.toLowerCase()),
              )
              .take(30)
              .toList();
        case NoteLinkKind.note:
          final responses = await Future.wait([
            _readRows(
              namespace: 'notes.list',
              path: '/api/v1/workspaces/$wsId/notes',
              rowKey: '',
              pendingPath: '/notes',
              listResponse: true,
              overlayPending: false,
            ),
            _readRows(
              namespace: 'notes.archive',
              path: '/api/v1/workspaces/$wsId/notes?archived=true',
              rowKey: '',
              pendingPath: '/notes',
              listResponse: true,
              overlayPending: false,
            ),
          ]);
          options = responses
              .expand((notes) => notes)
              .whereType<Map<String, dynamic>>()
              .map(
                (note) => NoteLinkOption(
                  id: note['id'] as String? ?? '',
                  kind: NoteLinkKind.note,
                  title: note['title'] as String? ?? '',
                  url:
                      'https://tuturuuu.com/$language/$wsId/notes?noteId=${note['id']}',
                ),
              )
              .where(
                (option) =>
                    option.title.toLowerCase().contains(search.toLowerCase()),
              )
              .take(30)
              .toList();
        case NoteLinkKind.meeting:
          final query = Uri(
            queryParameters: {
              'page': '1',
              'pageSize': '30',
              if (search.isNotEmpty) 'search': search,
            },
          ).query;
          final rows = await _readRows(
            namespace: 'meet.list',
            path: '/api/v1/workspaces/$wsId/meetings?$query',
            rowKey: 'meetings',
            pendingPath: '/meetings',
          );
          options = rows
              .whereType<Map<String, dynamic>>()
              .map(
                (meeting) => NoteLinkOption(
                  id: meeting['id'] as String? ?? '',
                  kind: NoteLinkKind.meeting,
                  title: meeting['name'] as String? ?? '',
                  url:
                      'https://meet.tuturuuu.com/$language/$wsId/meetings/${meeting['id']}',
                ),
              )
              .where(
                (option) =>
                    option.title.toLowerCase().contains(search.toLowerCase()),
              )
              .take(30)
              .toList();
      }
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _options = options;
        _loading = false;
      });
    } on Object {
      if (!mounted || requestId != _requestId) return;
      setState(() {
        _loading = false;
        _failed = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          20,
          20,
          20,
          20 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SizedBox(
          height:
              (MediaQuery.sizeOf(context).height * 0.65 -
                      MediaQuery.viewInsetsOf(context).bottom)
                  .clamp(260, 650)
                  .toDouble(),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                context.l10n.notesLinkWork,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    for (final kind in NoteLinkKind.values)
                      Padding(
                        padding: const EdgeInsets.only(right: 6),
                        child: ChoiceChip(
                          label: Text(switch (kind) {
                            NoteLinkKind.task => context.l10n.notesLinkTasks,
                            NoteLinkKind.event => context.l10n.notesLinkEvents,
                            NoteLinkKind.finance =>
                              context.l10n.notesLinkFinance,
                            NoteLinkKind.note => context.l10n.notesTitle,
                            NoteLinkKind.meeting =>
                              context.l10n.notesLinkMeetings,
                          }),
                          selected: _kind == kind,
                          selectedColor: scheme.onSurface,
                          labelStyle: TextStyle(
                            color: _kind == kind
                                ? scheme.surface
                                : scheme.onSurface,
                          ),
                          onSelected: (_) {
                            setState(() {
                              _kind = kind;
                              _options = const [];
                            });
                            unawaited(_load());
                          },
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _search,
                onChanged: _onSearchChanged,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search_rounded),
                  hintText: context.l10n.notesSearchWork,
                ),
              ),
              const SizedBox(height: 12),
              Expanded(
                child: _loading && _options.isEmpty
                    ? const Center(child: NovaLoadingIndicator())
                    : _failed && _options.isEmpty
                    ? Center(child: Text(context.l10n.notesLoadError))
                    : _options.isEmpty
                    ? Center(child: Text(context.l10n.notesNoLinkResults))
                    : ListView.builder(
                        itemCount: _options.length,
                        itemBuilder: (context, index) {
                          final option = _options[index];
                          return PendingSyncFrame(
                            workspaceId: widget.wsId,
                            entityId: option.id,
                            feature: switch (option.kind) {
                              NoteLinkKind.task => 'tasks',
                              NoteLinkKind.event => 'calendar',
                              NoteLinkKind.finance => 'finance',
                              NoteLinkKind.note => 'notes',
                              NoteLinkKind.meeting => 'meet',
                            },
                            child: ListTile(
                              title: Text(
                                option.title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                              onTap: () => Navigator.of(context).pop(option),
                            ),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
