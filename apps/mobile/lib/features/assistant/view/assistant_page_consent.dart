part of 'assistant_page.dart';

/// The page's consent gate for its cubits: the cached server answer, and the
/// disclosure sheet when the user has not allowed sharing yet.
class _AssistantPageAiConsentGate implements MiraAiConsentGate {
  _AssistantPageAiConsentGate(this._page, this._controller);

  final _AssistantPageState _page;
  final MiraAiConsentController _controller;

  @override
  bool get granted => _controller.granted;

  @override
  Future<bool> request() => _page._ensureAiConsent();

  @override
  void consentRequired() {
    _controller.consentRequired();
    // Ask again at once; the refused send stays in the chat with Retry.
    if (_page.mounted) unawaited(_page._ensureAiConsent());
  }
}

extension _AssistantPageConsent on _AssistantPageState {
  /// Whether a cloud send must first ask for consent. Checked without
  /// waiting, so a consented send keeps its timing.
  bool get _aiConsentPending => !(_aiConsent?.granted ?? true);

  /// True when Mira may send to Google Gemini; asks the user when needed.
  /// Without a provided controller the page sends as before.
  Future<bool> _ensureAiConsent() async {
    final controller = _aiConsent;
    if (controller == null || controller.granted) return true;
    if (!mounted) return false;
    return await ensureMiraAiConsent(context, controller);
  }

  /// A revoke stops a running Live session from sending anything new.
  void _observeAiConsent() {
    final controller = _aiConsent;
    if (controller == null || !mounted || !controller.known) return;
    if (!controller.granted &&
        !_liveCubit.state.status.isDisconnectedOrErrored) {
      unawaited(_disconnectForLifecycle());
    }
  }

  /// Shows the Report this response sheet for one saved Mira reply.
  Future<void> _reportReply(String messageId, bool Function() current) async {
    final target = _chatCubit.replyReportTarget(messageId);
    if (target == null || !current()) return;
    final sent = await showMiraResponseReportSheet(
      context,
      target: target,
      repository: _reportRepository,
    );
    if (sent && mounted) _showInlineNotice(context.l10n.miraReportSent);
  }
}
