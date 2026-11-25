import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum MailAfterArchive { next, list }

/// Reading preferences are device-local, as in the web Mail client.
class MailReadingPreferences extends ChangeNotifier {
  static final instance = MailReadingPreferences();
  static const afterArchiveKey = 'mail.afterArchive';
  static const keyboardKey = 'mail.keyboardShortcuts';

  MailAfterArchive _afterArchive = MailAfterArchive.next;
  bool _keyboardEnabled = true;
  bool _archiveEdited = false;
  bool _keyboardEdited = false;
  Future<void>? _loading;

  MailAfterArchive get afterArchive => _afterArchive;
  bool get keyboardEnabled => _keyboardEnabled;

  Future<void> load() => _loading ??= _load();

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      if (!_archiveEdited) {
        _afterArchive = prefs.getString(afterArchiveKey) == 'list'
            ? MailAfterArchive.list
            : MailAfterArchive.next;
      }
      if (!_keyboardEdited) {
        _keyboardEnabled = prefs.getBool(keyboardKey) ?? true;
      }
    } on Exception {
      // Use the session values if device preferences are unavailable.
    }
    notifyListeners();
  }

  Future<void> setAfterArchive(MailAfterArchive value) async {
    _archiveEdited = true;
    _afterArchive = value;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(afterArchiveKey, value.name);
    } on Exception {
      // Retain the session choice.
    }
  }

  Future<void> setKeyboardEnabled(bool value) async {
    _keyboardEdited = true;
    _keyboardEnabled = value;
    notifyListeners();
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(keyboardKey, value);
    } on Exception {
      // Retain the session choice.
    }
  }
}

/// Prefers the next visible row and falls back to the nearest preceding row.
String? mailConversationAfterAction({
  required MailAfterArchive preference,
  required List<String> order,
  required String current,
  required Set<String> remaining,
}) {
  if (preference == MailAfterArchive.list) return null;
  final index = order.indexOf(current);
  if (index < 0) return null;
  return order.skip(index + 1).where(remaining.contains).firstOrNull ??
      order.take(index).toList().reversed.where(remaining.contains).firstOrNull;
}
