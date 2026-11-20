import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/crm/crm_models.dart';
import 'package:mobile/data/repositories/crm_repository.dart';
import 'package:mobile/features/crm/utils/contact_identity.dart';
import 'package:mobile/l10n/l10n.dart';

class ContactGroupMembers extends StatefulWidget {
  const ContactGroupMembers({
    required this.workspaceId,
    required this.group,
    required this.repository,
    required this.canManage,
    required this.canSearch,
    required this.confirmRemoval,
    super.key,
  });

  final String workspaceId;
  final CrmGroup group;
  final CrmRepository repository;
  final bool canManage;
  final bool canSearch;
  final Future<bool> Function(CrmGroupMember) confirmRemoval;

  @override
  State<ContactGroupMembers> createState() => _ContactGroupMembersState();
}

class _ContactGroupMembersState extends State<ContactGroupMembers> {
  final _query = TextEditingController();
  final _members = <String, CrmGroupMember>{};
  List<CrmUser> _candidates = const [];
  int? _offset = 0;
  bool _loading = false;
  bool _loadFailed = false;
  bool _searching = false;
  bool _searched = false;
  bool _searchFailed = false;
  bool _saving = false;
  bool _mutationFailed = false;
  int _searchGeneration = 0;
  String _role = 'STUDENT';

  @override
  void initState() {
    super.initState();
    unawaited(_read(reset: true));
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  Future<void> _read({bool reset = false}) async {
    final offset = reset ? 0 : _offset;
    if (_loading || offset == null) return;
    setState(() {
      _loading = true;
      _loadFailed = false;
      if (reset) {
        _members.clear();
        _offset = 0;
      }
    });
    try {
      final result = await widget.repository.getContactGroupMembersPage(
        widget.workspaceId,
        widget.group.id,
        offset: offset,
      );
      if (!mounted) return;
      setState(() {
        for (final member in result.members) {
          _members[member.id] = member;
        }
        _offset = result.next;
      });
    } on Object {
      if (mounted) setState(() => _loadFailed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _search(String value) async {
    final generation = ++_searchGeneration;
    final query = value.trim();
    setState(() {
      _candidates = const [];
      _searchFailed = false;
      _searching = query.isNotEmpty;
      _searched = query.isNotEmpty;
    });
    if (query.isEmpty) return;
    try {
      final response = await widget.repository.getUsers(
        widget.workspaceId,
        query: query,
        excludedGroups: [widget.group.id],
      );
      if (!mounted || generation != _searchGeneration) return;
      setState(() => _candidates = response.users);
    } on Object {
      if (!mounted || generation != _searchGeneration) return;
      setState(() => _searchFailed = true);
    } finally {
      if (mounted && generation == _searchGeneration) {
        setState(() => _searching = false);
      }
    }
  }

  Future<void> _mutate(Future<void> Function() send) async {
    if (_saving || _loading || !widget.canManage) return;
    setState(() {
      _saving = true;
      _mutationFailed = false;
    });
    try {
      await send();
      if (mounted) {
        ++_searchGeneration;
        _query.clear();
        setState(() {
          _candidates = const [];
          _searched = false;
          _searching = false;
          _searchFailed = false;
        });
      }
    } on Object {
      if (mounted) setState(() => _mutationFailed = true);
    } finally {
      if (mounted) {
        await _read(reset: true);
        if (mounted) setState(() => _saving = false);
      }
    }
  }

  Future<void> _remove(CrmGroupMember member) async {
    final confirmed = await widget.confirmRemoval(member);
    if (!mounted || !confirmed) return;
    await _mutate(
      () => widget.repository.removeContactGroupMember(
        widget.workspaceId,
        widget.group.id,
        member.id,
      ),
    );
  }

  String _roleLabel(BuildContext context, String? role) => switch (role) {
    'STUDENT' => context.l10n.crmGroupStudent,
    'TEACHER' => context.l10n.crmGroupTeacher,
    _ => '',
  };

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final candidates = _candidates
        .where((candidate) => !_members.containsKey(candidate.id))
        .toList();
    return AppSheetScaffold(
      title: l10n.crmGroupMembers,
      description: widget.group.name,
      onRefresh: _saving ? null : () => _read(reset: true),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.canManage && widget.canSearch) ...[
            AppTextField(
              controller: _query,
              label: l10n.crmFindGroupMember,
              placeholder: l10n.crmSearchUsersHint,
              textInputAction: TextInputAction.search,
              onSubmitted: _search,
              trailing: AppButton.ghost(
                onPressed: _searching ? null : () => _search(_query.text),
                child: Text(l10n.commonSearch),
              ),
            ),
            if (_searchFailed)
              AppButton.outline(
                onPressed: () => _search(_query.text),
                child: Text(l10n.commonRetry),
              ),
            if (_searching)
              const AppSkeletonRows(count: 1)
            else if (_searched && !_searchFailed && candidates.isEmpty)
              Text(l10n.crmNoGroupCandidates),
            if (candidates.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.sm),
              AppSelect<String>(
                title: l10n.crmGroupMemberRole,
                value: _role,
                options: [
                  for (final role in ['STUDENT', 'TEACHER'])
                    AppSelectOption(
                      value: role,
                      label: _roleLabel(context, role),
                    ),
                ],
                onChanged: _saving
                    ? null
                    : (role) => setState(() => _role = role),
              ),
              for (final candidate in candidates)
                AppRichRow(
                  title: contactPrimaryNameFor(candidate),
                  trailing: AppButton.outline(
                    onPressed: _saving || _loading
                        ? null
                        : () => _mutate(
                            () => widget.repository.addContactGroupMember(
                              widget.workspaceId,
                              widget.group.id,
                              candidate.id,
                              role: _role,
                            ),
                          ),
                    child: Text(l10n.crmAddGroupMember),
                  ),
                ),
            ],
            const SizedBox(height: AppSpacing.md),
          ],
          if (_mutationFailed) Text(l10n.crmGroupMembershipUnconfirmed),
          for (final member in _members.values)
            AppRichRow(
              title: member.label,
              subtitle: _roleLabel(context, member.role),
              trailing: widget.canManage
                  ? AppButton.ghost(
                      onPressed: _saving || _loading
                          ? null
                          : () => _remove(member),
                      child: Text(l10n.crmRemoveGroupMember),
                    )
                  : null,
            ),
          if (_loading)
            const AppSkeletonRows(count: 1)
          else if (_loadFailed)
            AppButton.outline(onPressed: _read, child: Text(l10n.commonRetry))
          else if (_members.isEmpty)
            Text(l10n.crmGroupMembersEmpty)
          else if (_offset != null)
            AppButton.outline(
              onPressed: _read,
              child: Text(l10n.commonLoadMore),
            ),
        ],
      ),
    );
  }
}
