import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/data/models/calendar_event.dart';
import 'package:mobile/data/models/calendar_event_guest.dart';
import 'package:mobile/data/repositories/calendar_guests_repository.dart';
import 'package:mobile/features/calendar/widgets/invite_event_guest_dialog.dart';
import 'package:mobile/l10n/l10n.dart';

class EventGuestsPanel extends StatefulWidget {
  const EventGuestsPanel({
    super.key,
    required this.event,
    required this.workspaceId,
    required this.scopeIsCurrent,
  });

  final CalendarEvent event;
  final String workspaceId;
  final bool Function() scopeIsCurrent;

  @override
  State<EventGuestsPanel> createState() => _EventGuestsPanelState();
}

class _EventGuestsPanelState extends State<EventGuestsPanel> {
  late final _repository = CalendarGuestsRepository(
    scopeIsCurrent: widget.scopeIsCurrent,
  );
  List<CalendarEventGuest>? _nativeGuests;
  List<CalendarProviderAttendee>? _providerGuests;
  CalendarGuestFailure? _failure;
  CalendarRsvpAnswer? _answer;
  bool _loading = false;
  bool _busy = false;
  bool _canRespond = false;
  int _loadRequest = 0;

  bool get _providerEvent =>
      widget.event.provider == 'google' || widget.event.provider == 'microsoft';

  @override
  void dispose() {
    _repository.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    if (!widget.scopeIsCurrent()) return;
    final request = ++_loadRequest;
    setState(() {
      _loading = true;
      _canRespond = false;
      _nativeGuests = null;
      _providerGuests = null;
      _failure = null;
    });
    try {
      if (_providerEvent) {
        final guests = await _repository.listProviderAttendees(
          widget.workspaceId,
          widget.event.id,
        );
        if (_acceptLoad(request)) {
          setState(() {
            _providerGuests = guests;
            _canRespond = guests == null;
          });
        }
      } else {
        final guests = await _repository.listGuests(
          widget.workspaceId,
          widget.event.id,
        );
        if (_acceptLoad(request)) {
          setState(() => _nativeGuests = guests);
        }
      }
    } on Object catch (error) {
      if (_acceptLoad(request)) {
        setState(() => _failure = calendarGuestFailureOf(error));
      }
    } finally {
      if (mounted && request == _loadRequest) setState(() => _loading = false);
    }
  }

  bool _acceptLoad(int request) =>
      mounted && request == _loadRequest && widget.scopeIsCurrent();

  Future<void> _change(Future<void> Function() action) async {
    if (_busy || !widget.scopeIsCurrent()) return;
    setState(() {
      _busy = true;
      _failure = null;
    });
    try {
      await action();
    } on Object catch (error) {
      if (mounted && widget.scopeIsCurrent()) {
        setState(() => _failure = calendarGuestFailureOf(error));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _invite() async {
    final input = await showInviteEventGuestDialog(
      context,
      search: (query) => widget.scopeIsCurrent()
          ? _repository.searchPeople(widget.workspaceId, query)
          : Future.value(const <CalendarGuestCandidate>[]),
    );
    if (!mounted || input == null) return;
    await _change(() async {
      await _repository.addGuest(
        widget.workspaceId,
        widget.event.id,
        input,
        allDay: widget.event.isAllDay,
      );
      if (mounted) await _load();
    });
  }

  Future<void> _remove(CalendarEventGuest guest) async {
    final l10n = context.l10n;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(l10n.calendarGuestRemove),
        content: Text(guest.label),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: Text(l10n.calendarGuestRemove),
          ),
        ],
      ),
    );
    if (!mounted || confirm != true) return;
    await _change(() async {
      await _repository.removeGuest(
        widget.workspaceId,
        widget.event.id,
        guest.id,
      );
      if (mounted) await _load();
    });
  }

  Future<void> _respond(CalendarRsvpAnswer answer) => _change(() async {
    await _repository.respond(widget.workspaceId, widget.event.id, answer);
    if (mounted && widget.scopeIsCurrent()) {
      setState(() => _answer = answer);
    }
  });

  String _rsvp(BuildContext context, CalendarGuestRsvp rsvp) => switch (rsvp) {
    CalendarGuestRsvp.accepted => context.l10n.calendarGuestGoing,
    CalendarGuestRsvp.tentative => context.l10n.calendarGuestMaybe,
    CalendarGuestRsvp.declined => context.l10n.calendarGuestDeclined,
    CalendarGuestRsvp.pending => context.l10n.calendarGuestPending,
  };

  @override
  Widget build(BuildContext context) {
    if (!widget.scopeIsCurrent()) return const SizedBox.shrink();
    final l10n = context.l10n;
    final failure = _failure;
    final providerGuests = _providerGuests;
    final nativeGuests = _nativeGuests;
    return ExpansionTile(
      title: Text(l10n.calendarGuests),
      onExpansionChanged: (expanded) {
        if (expanded &&
            !_loading &&
            !_busy &&
            _nativeGuests == null &&
            _providerGuests == null &&
            !_canRespond &&
            _failure == null) {
          unawaited(_load());
        }
      },
      children: [
        if (_loading || _busy) const LinearProgressIndicator(),
        if (failure != null)
          ListTile(
            title: Text(switch (failure) {
              CalendarGuestFailure.offline => l10n.calendarGuestOffline,
              CalendarGuestFailure.quota ||
              CalendarGuestFailure.guestLimit => l10n.calendarGuestLimit,
              CalendarGuestFailure.denied ||
              CalendarGuestFailure.unavailable => l10n.calendarGuestUnavailable,
              CalendarGuestFailure.failed => l10n.calendarGuestFailed,
            }),
            trailing: TextButton(
              onPressed: _loading || _busy ? null : _load,
              child: Text(l10n.commonRetry),
            ),
          ),
        if (providerGuests?.isEmpty == true || nativeGuests?.isEmpty == true)
          ListTile(title: Text(l10n.calendarGuestEmpty)),
        if (providerGuests != null)
          for (final guest in providerGuests)
            ListTile(
              title: Text(
                guest.name?.trim().isNotEmpty == true
                    ? guest.name!.trim()
                    : guest.email,
              ),
              subtitle: Text(_rsvp(context, guest.rsvp)),
            ),
        if (nativeGuests != null) ...[
          for (final guest in nativeGuests)
            ListTile(
              title: Text(guest.label),
              subtitle: Text(_rsvp(context, guest.rsvp)),
              trailing: guest.isOrganizer
                  ? null
                  : IconButton(
                      tooltip: l10n.calendarGuestRemove,
                      icon: const Icon(Icons.person_remove_outlined),
                      onPressed: _busy ? null : () => _remove(guest),
                    ),
            ),
          TextButton(
            onPressed: _busy ? null : _invite,
            child: Text(l10n.calendarGuestInvite),
          ),
        ],
        if (_canRespond)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Wrap(
              spacing: 8,
              children: [
                for (final (answer, label) in [
                  (CalendarRsvpAnswer.accepted, l10n.calendarGuestGoing),
                  (CalendarRsvpAnswer.tentative, l10n.calendarGuestMaybe),
                  (CalendarRsvpAnswer.declined, l10n.calendarGuestDeclined),
                ])
                  ChoiceChip(
                    label: Text(label),
                    selected: _answer == answer,
                    onSelected: _busy || _answer == answer
                        ? null
                        : (_) => _respond(answer),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}
