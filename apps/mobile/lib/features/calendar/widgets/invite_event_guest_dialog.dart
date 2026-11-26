import 'package:flutter/material.dart';
import 'package:mobile/data/models/calendar_event_guest.dart';
import 'package:mobile/l10n/l10n.dart';

Future<Map<String, dynamic>?> showInviteEventGuestDialog(
  BuildContext context, {
  required Future<List<CalendarGuestCandidate>> Function(String) search,
}) => showDialog<Map<String, dynamic>>(
  context: context,
  builder: (_) => _InviteGuestDialog(search: search),
);

class _InviteGuestDialog extends StatefulWidget {
  const _InviteGuestDialog({required this.search});

  final Future<List<CalendarGuestCandidate>> Function(String) search;

  @override
  State<_InviteGuestDialog> createState() => _InviteGuestDialogState();
}

class _InviteGuestDialogState extends State<_InviteGuestDialog> {
  final _input = TextEditingController();
  List<CalendarGuestCandidate> _matches = const [];
  bool _busy = false;
  bool _failed = false;
  bool _searched = false;
  int _request = 0;

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final query = _input.text.trim();
    if (query.length < 2) return;
    final request = ++_request;
    setState(() {
      _busy = true;
      _failed = false;
      _searched = false;
      _matches = const [];
    });
    try {
      final matches = await widget.search(query);
      if (!mounted || request != _request) return;
      setState(() {
        _matches = matches;
        _searched = true;
      });
    } on Object {
      if (mounted && request == _request) setState(() => _failed = true);
    } finally {
      if (mounted && request == _request) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final query = _input.text.trim();
    final email = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(query);
    return AlertDialog(
      title: Text(l10n.calendarGuestInvite),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: _input,
                decoration: InputDecoration(
                  labelText: l10n.calendarGuests,
                  hintText: l10n.calendarGuestSearch,
                  suffixIcon: IconButton(
                    tooltip: MaterialLocalizations.of(context).searchFieldLabel,
                    onPressed: query.length < 2 || _busy ? null : _search,
                    icon: const Icon(Icons.search),
                  ),
                ),
                onSubmitted: (_) => _search(),
                onChanged: (_) => setState(() {
                  _request++;
                  _busy = false;
                  _failed = false;
                  _searched = false;
                  _matches = const [];
                }),
              ),
              if (_busy) const LinearProgressIndicator(),
              if (_failed) Text(l10n.calendarGuestFailed),
              if (_searched && _matches.isEmpty) Text(l10n.calendarGuestEmpty),
              for (final candidate in _matches)
                ListTile(
                  title: Text(candidate.label),
                  subtitle: candidate.email == null
                      ? null
                      : Text(candidate.email!),
                  onTap: () => Navigator.of(context).pop(candidate.toInput()),
                ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l10n.commonCancel),
        ),
        if (email)
          FilledButton(
            onPressed: () =>
                Navigator.of(context).pop({'source': 'email', 'email': query}),
            child: Text(l10n.calendarGuestInvite),
          ),
      ],
    );
  }
}
