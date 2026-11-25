import 'package:flutter/foundation.dart';
import 'package:mobile/core/layout/master_detail_split.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Share of the Mail master-detail body the conversation list takes, matching
/// web Mail's pane layout: 38/62 by default, the list between 28% and 48%,
/// and the reader keeping at least 45%.
const mailPaneSplitBounds = AppMasterDetailSplitBounds(
  defaultFraction: 0.38,
  minList: 0.28,
  maxList: 0.48,
  minDetail: 0.45,
);

/// The device's Mail list/reader split, stored with the other Mail settings.
class MailPaneSplitPreference extends ValueNotifier<double> {
  MailPaneSplitPreference() : super(mailPaneSplitBounds.defaultFraction);

  static final instance = MailPaneSplitPreference();
  static const storageKey = 'mail.paneSplit';
  Future<void>? _loading;
  bool _selected = false;

  Future<void> load() => _loading ??= _load();

  Future<void> _load() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getDouble(storageKey);
      if (!_selected && saved != null) {
        value = mailPaneSplitBounds.normalize(saved);
      }
    } on Exception {
      // The default split applies when preference storage is unavailable.
    }
  }

  /// Applies [fraction] at once; [persist] writes it, so a drag stores only
  /// where it ends.
  Future<void> select(double fraction, {bool persist = true}) async {
    _selected = true;
    value = mailPaneSplitBounds.clamp(fraction);
    if (!persist) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setDouble(storageKey, value);
    } on Exception {
      // The split remains usable for this session.
    }
  }

  Future<void> reset() => select(mailPaneSplitBounds.defaultFraction);

  @visibleForTesting
  void debugReset() {
    _loading = null;
    _selected = false;
    value = mailPaneSplitBounds.defaultFraction;
  }
}
