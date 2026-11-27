import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/crm/crm_group_post.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/crm/utils/crm_failure_policy.dart';
import 'package:mobile/l10n/l10n.dart';

enum _ReadState { loading, ready, failed, denied }

enum _SaveState { idle, saving, rejected, unconfirmed }

class ContactGroupPosts extends StatefulWidget {
  const ContactGroupPosts({
    required this.workspaceId,
    required this.group,
    required this.repository,
    required this.canView,
    required this.canEdit,
    super.key,
  });

  final String workspaceId;
  final CrmGroup group;
  final CrmRepository repository;
  final bool Function() canView;
  final bool Function() canEdit;

  @override
  State<ContactGroupPosts> createState() => _ContactGroupPostsState();
}

class _ContactGroupPostsState extends State<ContactGroupPosts> {
  final _posts = <String, CrmGroupPost>{};
  final _title = TextEditingController();
  final _content = TextEditingController();
  final _notes = TextEditingController();
  _ReadState _readState = _ReadState.ready;
  _SaveState _saveState = _SaveState.idle;
  String? _cursor;
  bool _resumeRefresh = false;
  CrmGroupPost? _selected;
  bool _editing = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load(refresh: true));
  }

  @override
  void dispose() {
    _title.dispose();
    _content.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _load({required bool refresh}) async {
    if (_readState == _ReadState.loading || !widget.canView()) return;
    setState(() {
      _readState = _ReadState.loading;
      _resumeRefresh = refresh;
      if (refresh) {
        _posts.clear();
        _cursor = null;
      }
    });
    try {
      final page = await widget.repository.getGroupPostsPage(
        widget.workspaceId,
        widget.group.id,
        cursor: _cursor,
      );
      if (!mounted || !widget.canView()) return;
      setState(() {
        for (final post in page.posts) {
          _posts[post.id] = post;
        }
        _cursor = page.nextCursor;
        _readState = _ReadState.ready;
        if (refresh) {
          _selected = null;
          _editing = false;
          _saveState = _SaveState.idle;
        }
      });
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        if (error is ApiException &&
            (crmAccessDenied(error) || error.statusCode == 404)) {
          _posts.clear();
          _selected = null;
          _readState = _ReadState.denied;
        } else {
          _readState = _ReadState.failed;
        }
      });
    }
  }

  void _edit(CrmGroupPost post) {
    if (!widget.canEdit()) return;
    _title.text = post.title ?? '';
    _content.text = post.content ?? '';
    _notes.text = post.notes ?? '';
    setState(() => _editing = true);
  }

  Map<String, String?> _changes(CrmGroupPost post) {
    return {
      if (_title.text != (post.title ?? ''))
        'title': _title.text.isEmpty ? null : _title.text,
      if (_content.text != (post.content ?? ''))
        'content': _content.text.isEmpty ? null : _content.text,
      if (_notes.text != (post.notes ?? ''))
        'notes': _notes.text.isEmpty ? null : _notes.text,
    };
  }

  static const _titleLimit = 255;
  static const _contentLimit = 10000;
  static const _notesLimit = 1000;

  bool _canSave(Map<String, String?> changes) =>
      _editing &&
      widget.canEdit() &&
      (_saveState == _SaveState.idle || _saveState == _SaveState.rejected) &&
      changes.isNotEmpty &&
      (changes['title']?.length ?? 0) <= _titleLimit &&
      (changes['content']?.length ?? 0) <= _contentLimit &&
      (changes['notes']?.length ?? 0) <= _notesLimit;

  Future<void> _save(CrmGroupPost post) async {
    final changes = _changes(post);
    if (!_canSave(changes)) return;
    final route = ModalRoute.of(context);
    setState(() => _saveState = _SaveState.saving);
    try {
      await widget.repository.updateGroupPost(
        widget.workspaceId,
        widget.group.id,
        post.id,
        changes,
        beforeDispatch: () async {
          if (!mounted || route?.isActive == false || !widget.canEdit()) {
            throw const ApiException(
              message: 'CRM scope changed',
              statusCode: 403,
            );
          }
        },
      );
    } on Object catch (error) {
      if (!mounted) return;
      setState(() {
        _saveState =
            error is ApiException &&
                error.statusCode >= 400 &&
                error.statusCode < 500 &&
                error.statusCode != 408 &&
                error.failureKind == ApiFailureKind.http
            ? _SaveState.rejected
            : _SaveState.unconfirmed;
      });
      return;
    }
    if (!mounted) return;
    setState(() {
      _selected = null;
      _editing = false;
      _saveState = _SaveState.idle;
    });
    await _load(refresh: true);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final post = _selected;
    final denied = !widget.canView() || _readState == _ReadState.denied;
    final saving = _saveState == _SaveState.saving;
    final unconfirmed = _saveState == _SaveState.unconfirmed;
    return PopScope(
      canPop: !saving,
      child: AppSheetScaffold(
        title: l10n.crmGroupPosts,
        description: widget.group.name,
        showCloseButton: !saving,
        actions: [
          if (!denied && unconfirmed && _readState == _ReadState.ready)
            AppButton.primary(
              onPressed: () => _load(refresh: true),
              child: Text(l10n.commonRefresh),
            )
          else if (!denied && post != null && _editing && !unconfirmed)
            AppButton.primary(
              onPressed: _canSave(_changes(post)) ? () => _save(post) : null,
              child: Text(l10n.commonSave),
            ),
        ],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (denied)
              Text(l10n.commonSomethingWentWrong)
            else if (post != null)
              ..._detail(context, post)
            else ...[
              for (final item in _posts.values)
                AppGroupedRow(
                  title: Text(_label(context, item)),
                  showChevron: true,
                  onTap: _readState == _ReadState.loading
                      ? null
                      : () => setState(() => _selected = item),
                ),
              if (_readState == _ReadState.ready && _posts.isEmpty)
                Text(l10n.crmGroupPostsEmpty),
              if (_readState == _ReadState.ready && _cursor != null)
                AppButton.outline(
                  onPressed: () => _load(refresh: false),
                  child: Text(l10n.commonLoadMore),
                ),
            ],
            if (!denied && _readState == _ReadState.loading)
              const Center(child: CircularProgressIndicator()),
            if (!denied && _readState == _ReadState.failed) ...[
              Text(l10n.commonSomethingWentWrong),
              AppButton.outline(
                onPressed: () => _load(refresh: _resumeRefresh),
                child: Text(l10n.commonRetry),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _label(BuildContext context, CrmGroupPost post) =>
      (post.title?.trim().isNotEmpty ?? false)
      ? post.title!
      : context.l10n.crmGroupPostUntitled;

  List<Widget> _detail(BuildContext context, CrmGroupPost post) {
    final l10n = context.l10n;
    final unconfirmed = _saveState == _SaveState.unconfirmed;
    final saving = _saveState == _SaveState.saving;
    return [
      if (_editing && widget.canEdit()) ...[
        for (final (controller, label, lines, limit) in [
          (_title, l10n.crmGroupPostTitle, 1, _titleLimit),
          (_content, l10n.crmGroupPostContent, 5, _contentLimit),
          (_notes, l10n.crmGroupPostNotes, 3, _notesLimit),
        ])
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: AppTextField(
              controller: controller,
              label: label,
              enabled: !saving && !unconfirmed,
              maxLines: lines,
              maxLength: limit,
              onChanged: (_) => setState(() {}),
            ),
          ),
      ] else ...[
        Text(
          _label(context, post),
          style: AppTokens.of(context).typography.large,
        ),
        if (post.content case final String content when content.isNotEmpty)
          SelectableText(content),
        if (post.notes case final String notes when notes.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.md),
          Text(l10n.crmGroupPostNotes),
          SelectableText(notes),
        ],
        if (widget.canEdit() && !_editing)
          AppButton.outline(
            onPressed: () => _edit(post),
            child: Text(l10n.commonEdit),
          ),
      ],
      if (unconfirmed)
        Text(l10n.crmGroupPostSaveUnconfirmed)
      else if (_saveState == _SaveState.rejected)
        Text(l10n.commonSomethingWentWrong),
      if (!saving && !unconfirmed)
        AppButton.ghost(
          onPressed: () => setState(() {
            if (!_editing) _selected = null;
            _editing = false;
            _saveState = _SaveState.idle;
          }),
          child: Text(_editing ? l10n.commonCancel : l10n.crmGroupPosts),
        ),
    ];
  }
}
