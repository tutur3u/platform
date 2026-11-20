part of 'crm_page.dart';

enum _ContactSection {
  reports,
  attendance,
  approvals,
  guestLeads,
  tutoring,
  metrics,
  structure,
  announcements,
  workforce,
}

extension _CrmSections on _CrmPageState {
  Future<void> _openSection(_ContactSection section) async {
    _updateState(() {
      _section = section;
      _sectionDrill = null;
      _sectionRecords = const [];
      _sectionLoading = true;
      _sectionError = null;
    });
    await _reloadSection();
  }

  Future<void> _reloadSection() async {
    final section = _section;
    final wsId = _wsId;
    if (section == null || wsId == null) return;
    _updateState(() {
      _sectionLoading = true;
      _sectionError = null;
    });
    try {
      final records = await _recordsFor(section, wsId);
      if (!mounted || _section != section) return;
      _updateState(() => _sectionRecords = records);
    } on ApiException catch (error) {
      if (!mounted) return;
      _updateState(() => _sectionError = error.message);
    } on Object {
      if (!mounted) return;
      _updateState(() => _sectionError = context.l10n.commonSomethingWentWrong);
    } finally {
      if (mounted) _updateState(() => _sectionLoading = false);
    }
  }

  Future<List<ContactSectionRecord>> _recordsFor(
    _ContactSection section,
    String wsId,
  ) async {
    return switch (section) {
      _ContactSection.reports => await _repository.loadReports(wsId),
      _ContactSection.approvals => await _repository.loadApprovals(wsId),
      _ContactSection.announcements => await _repository.loadAnnouncements(
        wsId,
      ),
      _ContactSection.guestLeads => await _repository.loadGuestLeads(wsId),
      _ContactSection.attendance || _ContactSection.structure =>
        _groups
            .map((group) {
              return ContactSectionRecord(
                id: group.id,
                title: group.name,
                subtitle: group.notes,
              );
            })
            .toList(growable: false),
      _ContactSection.metrics =>
        _sectionDrill == null
            ? _groups
                  .map(
                    (group) =>
                        ContactSectionRecord(id: group.id, title: group.name),
                  )
                  .toList(growable: false)
            : await _repository.loadMetrics(wsId, _sectionDrill!),
      _ContactSection.tutoring =>
        contactScheduleDays(
              await _repository.getSessions(
                wsId,
                from: DateTime.now().toUtc().toIso8601String(),
                to: DateTime.now()
                    .toUtc()
                    .add(const Duration(days: 14))
                    .toIso8601String(),
              ),
            )
            .expand((day) => day.sessions)
            .map((session) {
              return ContactSectionRecord(
                id: session.id,
                title: session.label,
                subtitle: session.groupName,
                trailing: contactSessionDate(session),
              );
            })
            .toList(growable: false),
      _ContactSection.workforce =>
        _users
            .map(
              (user) => ContactSectionRecord(
                id: user.id,
                title: contactPrimaryNameFor(user),
                subtitle: user.email,
              ),
            )
            .toList(growable: false),
    };
  }

  Future<void> _openSectionRecord(ContactSectionRecord record) async {
    final section = _section;
    if (section == _ContactSection.attendance) {
      final group = _groups.where((item) => item.id == record.id).firstOrNull;
      if (group == null) return;
      await _showGroupAttendance(group);
      return;
    }
    if (section == _ContactSection.metrics && _sectionDrill == null) {
      _updateState(() => _sectionDrill = record.id);
      await _reloadSection();
    }
  }

  Future<void> _showGroupAttendance(CrmGroup group) async {
    final wsId = _wsId;
    if (wsId == null) return;
    final today = DateUtils.dateOnly(DateTime.now());
    final start = DateTime.tryParse(group.startingDate ?? '');
    final firstDate = start != null && !start.isAfter(today)
        ? DateUtils.dateOnly(start)
        : DateTime(1900);
    final selected = await showAppDatePicker(
      context: context,
      initialDate: today,
      firstDate: firstDate,
      lastDate: today,
    );
    if (!mounted || selected == null) return;
    final date = DateFormat('yyyy-MM-dd', 'en').format(selected);
    try {
      final members = await _repository.getGroupMembers(wsId, group.id);
      final marks = await _repository.getAttendance(wsId, group.id, date: date);
      if (!mounted) return;
      final marksByUser = {for (final mark in marks) mark.userId: mark};
      final initial = marksByUser.map((id, mark) => MapEntry(id, mark.status));
      final dayLabel = DateFormat.yMMMd(
        Localizations.localeOf(context).toString(),
      ).format(selected);
      await _showOwnedSheet<bool>(
        context: context,
        builder: (context) => ContactAttendanceSheet(
          title: context.l10n.contactsAttendanceForDay(group.name, dayLabel),
          members: members,
          canEdit: _canCheckAttendance,
          initialStatus: initial,
          onSave: (statusByUser) async {
            final payload = contactAttendanceChanges(
              date: date,
              initial: marksByUser,
              current: statusByUser,
            );
            if (payload.isNotEmpty) {
              await _repository.saveAttendance(wsId, group.id, payload);
            }
          },
        ),
      );
    } on ApiException catch (error) {
      if (!mounted) return;
      _toast(error.message, destructive: true);
    }
  }

  String _sectionTitle(AppLocalizations l10n) {
    final drill = _sectionDrill;
    if (_section == _ContactSection.metrics && drill != null) {
      return _groups.where((group) => group.id == drill).firstOrNull?.name ??
          l10n.contactsMetrics;
    }
    return switch (_section) {
      _ContactSection.reports => l10n.contactsReports,
      _ContactSection.attendance => l10n.contactsWorkspaceAttendance,
      _ContactSection.approvals => l10n.contactsApprovals,
      _ContactSection.guestLeads => l10n.contactsGuestLeads,
      _ContactSection.tutoring => l10n.contactsTutoring,
      _ContactSection.metrics => l10n.contactsMetrics,
      _ContactSection.structure => l10n.contactsStructure,
      _ContactSection.announcements => l10n.contactsAnnouncements,
      _ContactSection.workforce => l10n.contactsWorkforce,
      null => l10n.contactsTitle,
    };
  }
}
