import 'package:mobile/data/models/crm/crm_models.dart';

/// Collapses repeated whitespace and a name that is the same phrase twice.
///
/// Stored display names sometimes arrive as "Ada  Lovelace" or
/// "Ada Lovelace Ada Lovelace". The directory shows that person once.
String collapseContactName(String value) {
  final collapsed = value.trim().replaceAll(RegExp(r'\s+'), ' ');
  final parts = collapsed.split(' ');
  if (parts.length < 2 || parts.length.isOdd) return collapsed;
  final half = parts.length ~/ 2;
  final first = parts.take(half).join(' ');
  final second = parts.skip(half).join(' ');
  if (first.toLowerCase() == second.toLowerCase()) return first;
  return collapsed;
}

bool contactNamesMatch(String left, String right) {
  String key(String value) =>
      collapseContactName(value).toLowerCase().replaceAll(' ', '');
  final a = key(left);
  final b = key(right);
  return a.isNotEmpty && a == b;
}

/// Display or full name, after [collapseContactName]. Null when neither is set.
String? contactNamedTitle({String? displayName, String? fullName}) {
  final display = _present(displayName);
  if (display != null) return display;
  return _present(fullName);
}

/// The one name a row or detail title shows.
String contactPrimaryName({
  required String fallback,
  String? displayName,
  String? fullName,
  String? email,
  String? phone,
}) {
  return contactNamedTitle(displayName: displayName, fullName: fullName) ??
      _trimmed(email) ??
      _trimmed(phone) ??
      fallback;
}

String contactPrimaryNameFor(CrmUser user) => contactPrimaryName(
  displayName: user.displayName,
  fullName: user.fullName,
  email: user.email,
  phone: user.phone,
  fallback: user.id,
);

/// A second name only when it is a different person-facing name.
String? contactAlternateName({String? displayName, String? fullName}) {
  final primary = contactNamedTitle(
    displayName: displayName,
    fullName: fullName,
  );
  final full = _present(fullName);
  final display = _present(displayName);
  for (final candidate in [full, display]) {
    if (candidate == null) continue;
    if (primary != null && contactNamesMatch(candidate, primary)) continue;
    return candidate;
  }
  return null;
}

/// One secondary line for a directory row.
///
/// Email wins. A phone number is returned only when there is no email and no
/// distinct alternate name, so the number is not joined onto a wrapping line.
String? contactSecondaryLine({
  String? displayName,
  String? fullName,
  String? email,
  String? phone,
}) {
  final alternate = contactAlternateName(
    displayName: displayName,
    fullName: fullName,
  );
  if (alternate != null) return alternate;
  final mail = _trimmed(email);
  if (mail != null) return mail;
  return null;
}

/// Phone shown on its own non-wrapping line when it is not the secondary text.
String? contactPhoneLine({
  String? displayName,
  String? fullName,
  String? email,
  String? phone,
}) {
  if (contactSecondaryLine(
        displayName: displayName,
        fullName: fullName,
        email: email,
        phone: phone,
      ) !=
      null) {
    return null;
  }
  return _trimmed(phone);
}

String contactInitials(String name) {
  final parts = name.split(' ').where((part) => part.isNotEmpty).take(2);
  final buffer = StringBuffer();
  for (final part in parts) {
    buffer.write(_firstCharacter(part).toUpperCase());
  }
  final value = buffer.toString();
  return value.isEmpty ? '?' : value;
}

String contactSectionLabel(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) return '#';
  final first = _firstCharacter(trimmed).toUpperCase();
  if (RegExp(r'^\p{L}|\p{N}', unicode: true).hasMatch(first)) return first;
  return '#';
}

/// Alphabetical groups. People who share a section stay in name order.
List<ContactListGroup> contactListGroups(List<CrmUser> users) {
  final sorted = [...users]
    ..sort((a, b) {
      final byName = contactPrimaryNameFor(
        a,
      ).toLowerCase().compareTo(contactPrimaryNameFor(b).toLowerCase());
      if (byName != 0) return byName;
      return a.id.compareTo(b.id);
    });
  final groups = <ContactListGroup>[];
  for (final user in sorted) {
    final label = contactSectionLabel(contactPrimaryNameFor(user));
    if (groups.isEmpty || groups.last.label != label) {
      groups.add(ContactListGroup(label: label, users: [user]));
    } else {
      groups.last.users.add(user);
    }
  }
  return groups;
}

class ContactListGroup {
  ContactListGroup({required this.label, required List<CrmUser> users})
    : users = List<CrmUser>.of(users);

  final String label;
  final List<CrmUser> users;
}

String? _present(String? value) {
  if (value == null) return null;
  final collapsed = collapseContactName(value);
  return collapsed.isEmpty ? null : collapsed;
}

String? _trimmed(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) return null;
  return trimmed;
}

String _firstCharacter(String value) {
  final iterator = value.runes.iterator;
  if (!iterator.moveNext()) return '';
  return String.fromCharCode(iterator.current);
}
