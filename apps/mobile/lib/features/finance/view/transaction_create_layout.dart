part of 'transaction_detail_sheet.dart';

extension on _TransactionFormDialogState {
  Widget _buildCreate(BuildContext context) => PopScope(
    canPop: !_isSaving,
    child: Scaffold(
      backgroundColor: context.tokens.colorScheme.background,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _buildCreateHeader(context),
            Expanded(
              child: _buildCreateScrollView(
                showAmounts: financeAmountsVisible(context),
              ),
            ),
            _buildCreateFooter(context),
          ],
        ),
      ),
    ),
  );

  Widget _buildCreateHeader(BuildContext context) {
    final l10n = context.l10n;
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: 56),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Row(
          spacing: 8,
          children: [
            AppIconButton(
              icon: const Icon(Icons.close_rounded),
              tooltip: l10n.financeCloseTransactionForm,
              onPressed: _isSaving ? null : () => Navigator.of(context).pop(),
            ),
            Expanded(
              child: Semantics(
                header: true,
                child: Text(
                  l10n.financeNewTransaction,
                  style: context.tokens.typography.title,
                ),
              ),
            ),
            const FinanceAmountVisibilityButton(),
          ],
        ),
      ),
    );
  }

  Widget _buildCreateScrollView({required bool showAmounts}) => LayoutBuilder(
    builder: (context, constraints) {
      final gutter = AppPageInsets.gutterOf(
        context,
        width: constraints.maxWidth,
      );
      return Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 640),
          child: NotificationListener<UserScrollNotification>(
            onNotification: (_) {
              _dismissMoneyInput();
              return false;
            },
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(gutter, 12, gutter, 20),
              child: _buildCreateBody(context, showAmounts: showAmounts),
            ),
          ),
        ),
      );
    },
  );
}
