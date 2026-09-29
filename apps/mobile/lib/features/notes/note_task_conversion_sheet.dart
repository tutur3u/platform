import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/data/repositories/task_repository.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';

class NoteTaskConversionSheet extends StatefulWidget {
  const NoteTaskConversionSheet({
    required this.wsId,
    required this.taskName,
    super.key,
  });

  final String wsId;
  final String taskName;

  @override
  State<NoteTaskConversionSheet> createState() =>
      _NoteTaskConversionSheetState();
}

class _NoteTaskConversionSheetState extends State<NoteTaskConversionSheet> {
  final _tasks = TaskRepository();
  List<(String, String)> _boards = const [];
  List<(String, String)> _lists = const [];
  String? _boardId;
  String? _listId;
  String? _error;
  bool _loading = true;
  bool _loadingLists = false;
  bool _creating = false;
  int _requestVersion = 0;

  @override
  void initState() {
    super.initState();
    unawaited(_loadBoards());
  }

  @override
  void dispose() {
    _requestVersion++;
    super.dispose();
  }

  Future<void> _loadBoards() async {
    try {
      final response = await _tasks.getTaskBoards(
        widget.wsId,
        pageSize: 100,
        status: 'active',
      );
      if (!mounted) return;
      final boards = response.boards
          .map((item) => (item.id, item.name ?? ''))
          .toList(growable: false);
      setState(() {
        _boards = boards;
        _loading = false;
      });
      if (boards.length == 1) await _selectBoard(boards.first.$1);
    } on Object {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = context.l10n.notesTaskLoadError;
        });
      }
    }
  }

  Future<void> _selectBoard(String boardId) async {
    final version = ++_requestVersion;
    setState(() {
      _boardId = boardId;
      _listId = null;
      _lists = const [];
      _loadingLists = true;
      _error = null;
    });
    try {
      final response = await _tasks.getBoardLists(widget.wsId, boardId);
      if (!mounted || version != _requestVersion) return;
      final lists = response
          .map((item) => (item.id, item.name ?? ''))
          .toList(growable: false);
      setState(() {
        _lists = lists;
        _listId = lists.length == 1 ? lists.first.$1 : null;
        _loadingLists = false;
      });
    } on Object {
      if (mounted && version == _requestVersion) {
        setState(() {
          _loadingLists = false;
          _error = context.l10n.notesTaskLoadError;
        });
      }
    }
  }

  Future<void> _create() async {
    final listId = _listId;
    if (listId == null || _creating) return;
    setState(() {
      _creating = true;
      _error = null;
    });
    try {
      final task = await _tasks.createTask(widget.wsId, {
        'name': widget.taskName,
        'listId': listId,
      });
      if (mounted) Navigator.of(context).pop(task.id);
    } on Object {
      if (mounted) {
        setState(() {
          _creating = false;
          _error = context.l10n.notesTaskCreateError;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: SizedBox(
          height: (MediaQuery.sizeOf(context).height * 0.55).clamp(280, 520),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                context.l10n.notesConvertToTask,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                widget.taskName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 20),
              if (_loading)
                const Expanded(child: Center(child: NovaLoadingIndicator()))
              else ...[
                Text(context.l10n.notesTaskBoard),
                const SizedBox(height: 8),
                if (_boards.isEmpty)
                  Text(context.l10n.notesTaskNoBoards)
                else
                  SizedBox(
                    height: 52,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _boards.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        final board = _boards[index];
                        return ChoiceChip(
                          label: Text(board.$2),
                          selected: _boardId == board.$1,
                          selectedColor: scheme.onSurface,
                          labelStyle: TextStyle(
                            color: _boardId == board.$1
                                ? scheme.surface
                                : scheme.onSurface,
                          ),
                          onSelected: (_) => unawaited(_selectBoard(board.$1)),
                        );
                      },
                    ),
                  ),
                const SizedBox(height: 16),
                Text(context.l10n.notesTaskList),
                const SizedBox(height: 8),
                if (_loadingLists)
                  const NovaLoadingIndicator(size: 24)
                else if (_boardId != null && _lists.isEmpty)
                  Text(context.l10n.notesTaskNoLists)
                else
                  SizedBox(
                    height: 52,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: _lists.length,
                      separatorBuilder: (_, _) => const SizedBox(width: 8),
                      itemBuilder: (context, index) {
                        final list = _lists[index];
                        return ChoiceChip(
                          label: Text(list.$2),
                          selected: _listId == list.$1,
                          selectedColor: scheme.onSurface,
                          labelStyle: TextStyle(
                            color: _listId == list.$1
                                ? scheme.surface
                                : scheme.onSurface,
                          ),
                          onSelected: (_) => setState(() => _listId = list.$1),
                        );
                      },
                    ),
                  ),
                const Spacer(),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_error!, style: TextStyle(color: scheme.error)),
                  ),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _listId == null || _creating ? null : _create,
                    style: FilledButton.styleFrom(
                      backgroundColor: scheme.onSurface,
                      foregroundColor: scheme.surface,
                    ),
                    child: Text(context.l10n.notesCreateTask),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
