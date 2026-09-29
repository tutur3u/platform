part of 'mail_page.dart';

extension _MailWorkspaceOpenRetry on _MailWorkspaceState {
  Future<Map<String, dynamic>> _readOpenDetailWithRetry(
    String mailboxId,
    String id,
    bool thread,
  ) async {
    for (var attempt = 0; ; attempt++) {
      try {
        return await _repository
            .detail(widget.workspaceId, mailboxId, id, thread: thread)
            .timeout(const Duration(seconds: 12));
      } on Object catch (error) {
        final transient =
            error is TimeoutException ||
            (error is ApiException &&
                (error.statusCode == 0 ||
                    error.statusCode == 408 ||
                    error.statusCode == 429 ||
                    error.statusCode >= 500));
        if (!transient || attempt >= 1 || !mounted || mailboxId != _mailboxId) {
          rethrow;
        }
        await Future<void>.delayed(const Duration(milliseconds: 350));
      }
    }
  }

  void _showOpenFailure(Map<String, dynamic> item) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          margin: const EdgeInsets.fromLTRB(16, 0, 16, 112),
          content: Text(context.l10n.mailOpenFailed),
          action: SnackBarAction(
            label: context.l10n.commonRetry,
            onPressed: () {
              if (mounted) unawaited(_open(item));
            },
          ),
        ),
      );
  }
}
