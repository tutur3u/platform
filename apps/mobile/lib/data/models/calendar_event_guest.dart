import 'package:equatable/equatable.dart';

enum CalendarGuestRsvp { pending, accepted, tentative, declined }

/// Answers a provider invitation accepts: Google and Microsoft both map
/// these through `events/{id}/response`.
enum CalendarRsvpAnswer { accepted, tentative, declined }

CalendarGuestRsvp _rsvp(Object? value) => switch (value) {
  'accepted' => CalendarGuestRsvp.accepted,
  'declined' => CalendarGuestRsvp.declined,
  'tentative' || 'tentativelyAccepted' => CalendarGuestRsvp.tentative,
  _ => CalendarGuestRsvp.pending,
};

/// A guest of a Tuturuuu event, with its RSVP state.
class CalendarEventGuest extends Equatable {
  const CalendarEventGuest({
    required this.id,
    required this.email,
    this.displayName,
    this.isOrganizer = false,
    this.rsvp = CalendarGuestRsvp.pending,
    this.invited = false,
  });

  factory CalendarEventGuest.fromJson(Map<String, dynamic> json) =>
      CalendarEventGuest(
        id: json['id'] as String,
        email: json['email'] as String,
        displayName: json['displayName'] as String?,
        isOrganizer: json['isOrganizer'] == true,
        rsvp: _rsvp(json['rsvpStatus']),
        invited: json['invited'] == true,
      );

  final String id;
  final String email;
  final String? displayName;
  final bool isOrganizer;
  final CalendarGuestRsvp rsvp;
  final bool invited;

  String get label {
    final name = displayName?.trim();
    return name == null || name.isEmpty ? email : name;
  }

  @override
  List<Object?> get props => [id, email, displayName, isOrganizer, rsvp];
}

/// A read-only attendee of a provider event the user organizes.
class CalendarProviderAttendee extends Equatable {
  const CalendarProviderAttendee({
    required this.email,
    this.name,
    this.rsvp = CalendarGuestRsvp.pending,
  });

  factory CalendarProviderAttendee.fromJson(Map<String, dynamic> json) =>
      CalendarProviderAttendee(
        email: json['email'] as String,
        name: json['name'] as String?,
        rsvp: _rsvp(json['response']),
      );

  final String email;
  final String? name;
  final CalendarGuestRsvp rsvp;

  @override
  List<Object?> get props => [email, name, rsvp];
}

/// A workspace member or contact that can be invited by id; the server
/// resolves the email, so a client cannot attach another address.
class CalendarGuestCandidate extends Equatable {
  const CalendarGuestCandidate({
    required this.id,
    required this.isMember,
    this.displayName,
    this.email,
  });

  final String id;
  final bool isMember;
  final String? displayName;
  final String? email;

  String get label => displayName?.trim().isNotEmpty == true
      ? displayName!.trim()
      : (email ?? id);

  Map<String, dynamic> toInput() => isMember
      ? {'source': 'member', 'userId': id}
      : {'source': 'contact', 'contactId': id};

  @override
  List<Object?> get props => [id, isMember];
}
