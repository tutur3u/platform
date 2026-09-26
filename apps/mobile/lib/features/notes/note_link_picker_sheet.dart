import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/l10n/l10n.dart';

enum NoteLinkKind { task, event, meeting }

class NoteLinkOption {
  const NoteLinkOption({required this.title, required this.url});

  final String title;
  final String url;
}

Future<NoteLinkOption?> showNoteLinkPickerSheet(
  BuildContext context, {
  required String wsId,
}) => showModalBottomSheet<NoteLinkOption>(
  context: context,
  isScrollControlled: true,
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
          final response = await _api.getJson(
            '/api/v1/workspaces/$wsId/tasks?$query',
          );
          options = (response['tasks'] as List<dynamic>? ?? const [])
              .whereType<Map<String, dynamic>>()
              .map(
                (task) => NoteLinkOption(
                  title: task['name'] as String? ?? '',
                  url:
                      'https://tasks.tuturuuu.com/$language/$wsId/tasks/${task['id']}',
                ),
              )
              .where((option) => option.title.isNotEmpty)
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
          final response = await _api.getJson(
            '/api/v1/workspaces/$wsId/calendar/events?$query',
          );
          options = (response['data'] as List<dynamic>? ?? const [])
              .whereType<Map<String, dynamic>>()
              .map(
                (event) => NoteLinkOption(
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
        case NoteLinkKind.meeting:
          final query = Uri(
            queryParameters: {
              'page': '1',
              'pageSize': '30',
              if (search.isNotEmpty) 'search': search,
            },
          ).query;
          final response = await _api.getJson(
            '/api/v1/workspaces/$wsId/meetings?$query',
          );
          options = (response['meetings'] as List<dynamic>? ?? const [])
              .whereType<Map<String, dynamic>>()
              .map(
                (meeting) => NoteLinkOption(
                  title: meeting['name'] as String? ?? '',
                  url:
                      'https://meet.tuturuuu.com/$language/$wsId/meetings/${meeting['id']}',
                ),
              )
              .where((option) => option.title.isNotEmpty)
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
  Widget build(BuildContext context) => SafeArea(
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
            SegmentedButton<NoteLinkKind>(
              segments: [
                ButtonSegment(
                  value: NoteLinkKind.task,
                  label: Text(context.l10n.notesLinkTasks),
                ),
                ButtonSegment(
                  value: NoteLinkKind.event,
                  label: Text(context.l10n.notesLinkEvents),
                ),
                ButtonSegment(
                  value: NoteLinkKind.meeting,
                  label: Text(context.l10n.notesLinkMeetings),
                ),
              ],
              selected: {_kind},
              onSelectionChanged: (value) {
                setState(() => _kind = value.first);
                unawaited(_load());
              },
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
              child: _loading
                  ? const Center(child: CircularProgressIndicator())
                  : _failed
                  ? Center(child: Text(context.l10n.notesLoadError))
                  : _options.isEmpty
                  ? Center(child: Text(context.l10n.notesNoLinkResults))
                  : ListView.builder(
                      itemCount: _options.length,
                      itemBuilder: (context, index) {
                        final option = _options[index];
                        return ListTile(
                          title: Text(
                            option.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          onTap: () => Navigator.of(context).pop(option),
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
