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
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                context.l10n.commonFilters,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                initialValue: _status,
                items: [
                  DropdownMenuItem(
                    value: 'active',
                    child: Text(_crmStatusLabel(context, 'active')),
                  ),
                  DropdownMenuItem(
                    value: 'archived',
                    child: Text(_crmStatusLabel(context, 'archived')),
                  ),
                  DropdownMenuItem(
                    value: 'archived_until',
                    child: Text(_crmStatusLabel(context, 'archived_until')),
                  ),
                  DropdownMenuItem(
                    value: 'all',
                    child: Text(_crmStatusLabel(context, 'all')),
                  ),
                ],
                onChanged: (value) =>
                    setState(() => _status = value ?? 'active'),
                decoration: InputDecoration(labelText: context.l10n.crmStatus),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _linkStatus,
                items: [
                  DropdownMenuItem(
                    value: 'all',
                    child: Text(_crmLinkStatusLabel(context, 'all')),
                  ),
                  DropdownMenuItem(
                    value: 'linked',
                    child: Text(_crmLinkStatusLabel(context, 'linked')),
                  ),
                  DropdownMenuItem(
                    value: 'virtual',
                    child: Text(_crmLinkStatusLabel(context, 'virtual')),
                  ),
                ],
                onChanged: (value) =>
                    setState(() => _linkStatus = value ?? 'all'),
                decoration: InputDecoration(
                  labelText: context.l10n.crmLinkStatus,
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _requireAttention,
                items: [
                  DropdownMenuItem(
                    value: 'all',
                    child: Text(_crmRequireAttentionLabel(context, 'all')),
                  ),
                  DropdownMenuItem(
                    value: 'true',
                    child: Text(_crmRequireAttentionLabel(context, 'true')),
                  ),
                  DropdownMenuItem(
                    value: 'false',
                    child: Text(_crmRequireAttentionLabel(context, 'false')),
                  ),
                ],
                onChanged: (value) =>
                    setState(() => _requireAttention = value ?? 'all'),
                decoration: InputDecoration(
                  labelText: context.l10n.crmRequireAttention,
                ),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _groupMembership,
                items: [
                  DropdownMenuItem(
                    value: 'all',
                    child: Text(_crmGroupMembershipLabel(context, 'all')),
                  ),
                  DropdownMenuItem(
                    value: 'with_groups',
                    child: Text(
                      _crmGroupMembershipLabel(context, 'with_groups'),
                    ),
                  ),
                  DropdownMenuItem(
                    value: 'without_groups',
                    child: Text(
                      _crmGroupMembershipLabel(context, 'without_groups'),
                    ),
                  ),
                ],
                onChanged: (value) =>
                    setState(() => _groupMembership = value ?? 'all'),
                decoration: InputDecoration(
                  labelText: context.l10n.crmGroupMembership,
                ),
              ),
              const SizedBox(height: 16),
              Text(context.l10n.crmIncludedGroups),
              Wrap(
                spacing: 8,
                children: widget.groups
                    .map(
                      (group) => FilterChip(
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
                    )
                    .toList(growable: false),
              ),
              const SizedBox(height: 16),
              Text(context.l10n.crmExcludedGroups),
              Wrap(
                spacing: 8,
                children: widget.groups
                    .map(
                      (group) => FilterChip(
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
                    )
                    .toList(growable: false),
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => Navigator.of(context).pop({
                  'status': _status,
                  'linkStatus': _linkStatus,
                  'requireAttention': _requireAttention,
                  'groupMembership': _groupMembership,
                  'includedGroups': _includedGroups,
                  'excludedGroups': _excludedGroups,
                }),
                child: Text(context.l10n.commonApply),
              ),
            ],
          ),
        ),
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
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              context.l10n.commonFilters,
              style: Theme.of(context).textTheme.titleLarge,
            ),
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(context.l10n.crmAuditRange),
              subtitle: Text(
                '${DateFormat.yMMMd().format(_range.start)} - '
                '${DateFormat.yMMMd().format(_range.end)}',
              ),
              onTap: () async {
                final picked = await showDateRangePicker(
                  context: context,
                  firstDate: DateTime(2020),
                  lastDate: DateTime.now(),
                  initialDateRange: _range,
                );
                if (picked != null) setState(() => _range = picked);
              },
            ),
            DropdownButtonFormField<String>(
              initialValue: _eventKind,
              items: [
                DropdownMenuItem(
                  value: 'all',
                  child: Text(_crmAuditEventLabel(context, 'all')),
                ),
                DropdownMenuItem(
                  value: 'created',
                  child: Text(_crmAuditEventLabel(context, 'created')),
                ),
                DropdownMenuItem(
                  value: 'updated',
                  child: Text(_crmAuditEventLabel(context, 'updated')),
                ),
                DropdownMenuItem(
                  value: 'archived',
                  child: Text(_crmAuditEventLabel(context, 'archived')),
                ),
                DropdownMenuItem(
                  value: 'reactivated',
                  child: Text(_crmAuditEventLabel(context, 'reactivated')),
                ),
                DropdownMenuItem(
                  value: 'deleted',
                  child: Text(_crmAuditEventLabel(context, 'deleted')),
                ),
              ],
              onChanged: (value) => setState(() => _eventKind = value ?? 'all'),
              decoration: InputDecoration(
                labelText: context.l10n.crmAuditEvent,
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _source,
              items: [
                DropdownMenuItem(
                  value: 'all',
                  child: Text(_crmAuditSourceLabel(context, 'all')),
                ),
                DropdownMenuItem(
                  value: 'live',
                  child: Text(_crmAuditSourceLabel(context, 'live')),
                ),
                DropdownMenuItem(
                  value: 'backfilled',
                  child: Text(_crmAuditSourceLabel(context, 'backfilled')),
                ),
              ],
              onChanged: (value) => setState(() => _source = value ?? 'all'),
              decoration: InputDecoration(
                labelText: context.l10n.crmAuditSource,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _affectedController,
              decoration: InputDecoration(
                labelText: context.l10n.crmAuditAffectedUser,
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _actorController,
              decoration: InputDecoration(
                labelText: context.l10n.crmAuditActor,
              ),
            ),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => Navigator.of(context).pop({
                'range': _range,
                'eventKind': _eventKind,
                'source': _source,
                'affectedUserQuery': _affectedController.text.trim(),
                'actorQuery': _actorController.text.trim(),
              }),
              child: Text(context.l10n.commonApply),
            ),
          ],
        ),
      ),
    );
  }
}
