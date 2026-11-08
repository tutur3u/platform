import 'package:flutter/widgets.dart';
import 'package:mobile/features/mastermind/model/snapshot.dart';
import 'package:mobile/features/mastermind/replies/mastermind_replies_cubit.dart';
import 'package:mobile/features/mastermind/replies/reply_models.dart';

/// What the person is about to send for one ask: a selected option, or their
/// own words. Shared by the composer in the page body and the sticky action
/// bar, so the bar can say what it sends ("Send “Approve”").
///
/// Typing deselects the option, so the latest intent wins; the words stay as
/// the saved draft either way. A new `version_hash` clears the selection,
/// because the options may have changed under it.
class ReplyChoice extends ChangeNotifier {
  ReplyChoice({required this.replies, required this.itemId})
    : text = TextEditingController(text: replies.draftFor(itemId).text) {
    _lastText = text.text;
    text.addListener(_typed);
  }

  final MastermindRepliesCubit replies;
  final String itemId;
  final TextEditingController text;

  late String _lastText;
  int? _selected;
  String? _shown;

  /// The index into the ask's `options[]` the person chose, if any.
  int? get selected => _selected;

  bool get hasText => isValidReplyText(text.text);

  /// Whether the primary action has something to send.
  bool get ready => _selected != null || hasText;

  void select(int index) {
    if (_selected == index) return;
    _selected = index;
    notifyListeners();
  }

  void clearSelection() {
    if (_selected == null) return;
    _selected = null;
    notifyListeners();
  }

  /// Called with the shown item on every build.
  void bindItem(NeedsYou item) {
    final shown = [
      item.versionHash,
      ...item.options,
      ...?item.hubOptions,
    ].join('\u0000');
    if (_shown != null && _shown != shown) _selected = null;
    _shown = shown;
  }

  void _typed() {
    if (text.text == _lastText) return;
    _lastText = text.text;
    replies.saveDraft(itemId, ReplyDraft(text: text.text));
    if (text.text.trim().isNotEmpty) _selected = null;
    notifyListeners();
  }

  @override
  void dispose() {
    text
      ..removeListener(_typed)
      ..dispose();
    super.dispose();
  }
}
