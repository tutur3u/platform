part of 'crm_page.dart';

class _UsersFilterSheet extends StatefulWidget {
  const _UsersFilterSheet({
    required this.groups,
    required this.status,
    required this.linkStatus,
    required this.requireAttention,
    required this.groupMembership,
    required this.includedGroups,
    required this.excludedGroups,
  });

  final List<CrmGroup> groups;
  final String status;
  final String linkStatus;
  final String requireAttention;
  final String groupMembership;
  final List<String> includedGroups;
  final List<String> excludedGroups;

  @override
  State<_UsersFilterSheet> createState() => _UsersFilterSheetState();
}

class _UsersFilterSheetState extends State<_UsersFilterSheet> {
  late String _status;
  late String _linkStatus;
  late String _requireAttention;
  late String _groupMembership;
  late List<String> _includedGroups;
  late List<String> _excludedGroups;

  @override
  void initState() {
    super.initState();
    _status = widget.status;
    _linkStatus = widget.linkStatus;
    _requireAttention = widget.requireAttention;
    _groupMembership = widget.groupMembership;
    _includedGroups = List<String>.from(widget.includedGroups);
    _excludedGroups = List<String>.from(widget.excludedGroups);
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = AppTokens.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.commonFilters,
            style: tokens.typography.large.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          _FilterChoice(
            title: l10n.crmStatus,
            value: _status,
            options: {
              for (final value in [
                'active',
                'archived',
                'archived_until',
                'all',
              ])
                value: _crmStatusLabel(context, value),
            },
            onChanged: (value) => setState(() => _status = value),
          ),
          _FilterChoice(
            title: l10n.crmLinkStatus,
            value: _linkStatus,
            options: {
              for (final value in ['all', 'linked', 'virtual'])
                value: _crmLinkStatusLabel(context, value),
            },
            onChanged: (value) => setState(() => _linkStatus = value),
          ),
          _FilterChoice(
            title: l10n.crmRequireAttention,
            value: _requireAttention,
            options: {
              for (final value in ['all', 'true', 'false'])
                value: _crmRequireAttentionLabel(context, value),
            },
            onChanged: (value) => setState(() => _requireAttention = value),
          ),
          _FilterChoice(
            title: l10n.crmGroupMembership,
            value: _groupMembership,
            options: {
              for (final value in ['all', 'with_groups', 'without_groups'])
                value: _crmGroupMembershipLabel(context, value),
            },
            onChanged: (value) => setState(() => _groupMembership = value),
          ),
          Text(
            l10n.crmIncludedGroups,
            style: tokens.typography.small.copyWith(
              color: tokens.colorScheme.mutedForeground,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final group in widget.groups)
                AppChip(
                  label: Text(group.name),
                  selected: _includedGroups.contains(group.id),
                  onSelected: (value) {
                    setState(() {
                      if (value) {
                        _includedGroups.add(group.id);
                      } else {
                        _includedGroups.remove(group.id);
                      }
                    });
                  },
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(
            l10n.crmExcludedGroups,
            style: tokens.typography.small.copyWith(
              color: tokens.colorScheme.mutedForeground,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final group in widget.groups)
                AppChip(
                  label: Text(group.name),
                  selected: _excludedGroups.contains(group.id),
                  onSelected: (value) {
                    setState(() {
                      if (value) {
                        _excludedGroups.add(group.id);
                      } else {
                        _excludedGroups.remove(group.id);
                      }
                    });
                  },
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton.primary(
            onPressed: () => Navigator.of(context).pop({
              'status': _status,
              'linkStatus': _linkStatus,
              'requireAttention': _requireAttention,
              'groupMembership': _groupMembership,
              'includedGroups': _includedGroups,
              'excludedGroups': _excludedGroups,
            }),
            child: Text(l10n.commonApply),
          ),
        ],
      ),
    );
  }
}

class _AuditFilterSheet extends StatefulWidget {
  const _AuditFilterSheet({
    required this.range,
    required this.eventKind,
    required this.source,
    required this.affectedUserQuery,
    required this.actorQuery,
  });

  final DateTimeRange range;
  final String eventKind;
  final String source;
  final String affectedUserQuery;
  final String actorQuery;

  @override
  State<_AuditFilterSheet> createState() => _AuditFilterSheetState();
}

class _AuditFilterSheetState extends State<_AuditFilterSheet> {
  late DateTimeRange _range;
  late String _eventKind;
  late String _source;
  late final TextEditingController _affectedController;
  late final TextEditingController _actorController;

  @override
  void initState() {
    super.initState();
    _range = widget.range;
    _eventKind = widget.eventKind;
    _source = widget.source;
    _affectedController = TextEditingController(text: widget.affectedUserQuery);
    _actorController = TextEditingController(text: widget.actorQuery);
  }

  @override
  void dispose() {
    _affectedController.dispose();
    _actorController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final dateFormat = DateFormat.yMMMd(
      Localizations.localeOf(context).toString(),
    );
    final tokens = AppTokens.of(context);
    return SingleChildScrollView(
      padding: const EdgeInsets.all(AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            l10n.commonFilters,
            style: tokens.typography.large.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          AppGroupedRow(
            title: Text(l10n.crmAuditRange),
            subtitle: Text(
              '${dateFormat.format(_range.start)} - '
              '${dateFormat.format(_range.end)}',
            ),
            onTap: () async {
              final start = await showAppDatePicker(
                context: context,
                initialDate: _range.start,
                firstDate: DateTime(2020),
                lastDate: DateTime.now(),
              );
              if (start == null || !context.mounted) return;
              final end = await showAppDatePicker(
                context: context,
                initialDate: _range.end.isBefore(start) ? start : _range.end,
                firstDate: start,
                lastDate: DateTime.now(),
              );
              if (end == null || !context.mounted) return;
              final endOfDay = DateTime(
                end.year,
                end.month,
                end.day + 1,
              ).subtract(const Duration(milliseconds: 1));
              setState(
                () => _range = DateTimeRange(start: start, end: endOfDay),
              );
            },
          ),
          _FilterChoice(
            title: l10n.crmAuditEvent,
            value: _eventKind,
            options: {
              for (final value in [
                'all',
                'created',
                'updated',
                'archived',
                'reactivated',
                'deleted',
              ])
                value: _crmAuditEventLabel(context, value),
            },
            onChanged: (value) => setState(() => _eventKind = value),
          ),
          _FilterChoice(
            title: l10n.crmAuditSource,
            value: _source,
            options: {
              for (final value in ['all', 'live', 'backfilled'])
                value: _crmAuditSourceLabel(context, value),
            },
            onChanged: (value) => setState(() => _source = value),
          ),
          AppTextField(
            controller: _affectedController,
            label: l10n.crmAuditAffectedUser,
            placeholder: l10n.inputPlaceholderUserId,
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _actorController,
            label: l10n.crmAuditActor,
            placeholder: l10n.inputPlaceholderUserId,
          ),
          const SizedBox(height: AppSpacing.lg),
          AppButton.primary(
            onPressed: () => Navigator.of(context).pop({
              'range': _range,
              'eventKind': _eventKind,
              'source': _source,
              'affectedUserQuery': _affectedController.text.trim(),
              'actorQuery': _actorController.text.trim(),
            }),
            child: Text(l10n.commonApply),
          ),
        ],
      ),
    );
  }
}

class _FilterChoice extends StatelessWidget {
  const _FilterChoice({
    required this.title,
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String title;
  final String value;
  final Map<String, String> options;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: AppSelect<String>(
        title: title,
        placeholder: title,
        value: value,
        options: [
          for (final entry in options.entries)
            AppSelectOption(value: entry.key, label: entry.value),
        ],
        onChanged: onChanged,
      ),
    );
  }
}
