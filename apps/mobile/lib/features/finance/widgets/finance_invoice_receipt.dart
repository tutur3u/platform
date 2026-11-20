import 'dart:async';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:intl/intl.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/finance/finance_invoice.dart';
import 'package:mobile/features/finance/widgets/finance_money.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Writes [boundary] as a PNG in the temporary directory and opens the
/// system share sheet for it.
Future<void> shareFinanceInvoiceImage(
  RenderRepaintBoundary boundary, {
  required String invoiceId,
  required String text,
  double pixelRatio = 3,
}) async {
  final image = await boundary.toImage(pixelRatio: pixelRatio);
  try {
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    if (bytes == null) return;
    final directory = await getTemporaryDirectory();
    final file = File('${directory.path}/invoice-$invoiceId.png');
    await file.writeAsBytes(bytes.buffer.asUint8List(), flush: true);
    await SharePlus.instance.share(
      ShareParams(
        files: [XFile(file.path, mimeType: 'image/png')],
        text: text,
      ),
    );
  } finally {
    image.dispose();
  }
}

/// The invoice's lines, applied promotions and totals as one card that
/// [shareFinanceInvoiceImage] can capture through [boundaryKey].
class FinanceInvoiceReceipt extends StatelessWidget {
  const FinanceInvoiceReceipt({
    required this.detail,
    required this.fallbackCurrency,
    this.boundaryKey,
    super.key,
  });

  final FinanceInvoiceDetail detail;
  final String fallbackCurrency;
  final GlobalKey? boundaryKey;

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final tokens = context.tokens;
    final colors = tokens.colorScheme;
    final currency = detail.currency ?? fallbackCurrency;
    final quantity = NumberFormat.decimalPattern(l10n.localeName);
    final created = detail.createdAt;
    String money(double value, {bool signed = false}) =>
        financeMoney(context, value, currency, signed: signed);
    Widget totalRow(
      String label,
      String value, {
      bool strong = false,
    }) => Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: (strong ? tokens.typography.base : tokens.typography.small)
                  .copyWith(
                    color: strong ? colors.foreground : colors.mutedForeground,
                    fontWeight: strong ? FontWeight.w700 : null,
                  ),
            ),
          ),
          Text(
            value,
            style: (strong ? tokens.typography.base : tokens.typography.small)
                .copyWith(
                  fontWeight: strong ? FontWeight.w700 : FontWeight.w500,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
          ),
        ],
      ),
    );
    return RepaintBoundary(
      key: boundaryKey,
      child: DecoratedBox(
        key: const ValueKey('invoice-receipt'),
        decoration: BoxDecoration(
          color: colors.card,
          borderRadius: BorderRadius.circular(tokens.shapes.card),
          border: Border.all(color: colors.border),
        ),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (detail.customerName case final customer?)
                Text(
                  customer,
                  style: tokens.typography.base.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
                ),
              Text(
                [
                  if (created != null)
                    DateFormat.yMMMd(l10n.localeName).format(created.toLocal()),
                  if (detail.walletName case final wallet?) wallet,
                ].join(' · '),
                style: tokens.typography.small.copyWith(
                  color: colors.mutedForeground,
                ),
              ),
              if (detail.notice case final notice?
                  when notice.trim().isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(notice, style: tokens.typography.small),
              ],
              const SizedBox(height: AppSpacing.md),
              AppSectionHeader(
                title: l10n.financeInvoiceItems,
                count: detail.lines.length,
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
              ),
              for (final line in detail.lines)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(line.name, style: tokens.typography.small),
                            Text(
                              l10n.financeInvoiceLineDetail(
                                quantity.format(line.quantity),
                                line.unit ?? '',
                                money(line.price),
                              ),
                              style: tokens.typography.xSmall.copyWith(
                                color: colors.mutedForeground,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      FinanceAmountText(line.total, currency),
                    ],
                  ),
                ),
              Divider(height: AppSpacing.lg, color: colors.border),
              totalRow(l10n.financeInvoiceSubtotal, money(detail.subtotal)),
              if (detail.adjustment != 0)
                totalRow(
                  [
                    if (detail.adjustment < 0)
                      l10n.financeInvoiceAdjustment
                    else
                      l10n.financeInvoiceSurcharge,
                    for (final promotion in detail.promotions) promotion.code,
                  ].join(' · '),
                  money(detail.adjustment, signed: true),
                ),
              totalRow(
                l10n.financeInvoiceTotal,
                money(detail.total),
                strong: true,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Loads the invoice detail and shows [FinanceInvoiceReceipt], with a
/// share action once it is loaded.
class FinanceInvoiceReceiptLoader extends StatefulWidget {
  const FinanceInvoiceReceiptLoader({
    required this.load,
    required this.fallbackCurrency,
    super.key,
  });

  final Future<FinanceInvoiceDetail> Function() load;
  final String fallbackCurrency;

  @override
  State<FinanceInvoiceReceiptLoader> createState() =>
      _FinanceInvoiceReceiptLoaderState();
}

class _FinanceInvoiceReceiptLoaderState
    extends State<FinanceInvoiceReceiptLoader> {
  final GlobalKey _boundary = GlobalKey();
  late Future<FinanceInvoiceDetail> _detail = _start();

  /// Starts a load whose failure the builder shows, never an unhandled
  /// error before it subscribes.
  Future<FinanceInvoiceDetail> _start() => widget.load()..ignore();
  bool _sharing = false;

  Future<void> _share(FinanceInvoiceDetail detail) async {
    final boundary = _boundary.currentContext?.findRenderObject();
    if (_sharing || boundary is! RenderRepaintBoundary) return;
    final l10n = context.l10n;
    setState(() => _sharing = true);
    try {
      await shareFinanceInvoiceImage(
        boundary,
        invoiceId: detail.id,
        text: l10n.financeInvoice,
      );
    } on Object {
      if (mounted) {
        showAppToast(context, message: l10n.commonSomethingWentWrong);
      }
    } finally {
      if (mounted) setState(() => _sharing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    return FutureBuilder<FinanceInvoiceDetail>(
      future: _detail,
      builder: (context, snapshot) {
        if (snapshot.connectionState != ConnectionState.done) {
          return const AppSkeletonRows(count: 3);
        }
        final detail = snapshot.data;
        if (detail == null) {
          return AppStateMessage.inline(
            icon: LucideIcons.circleAlert,
            title: l10n.financeInvoiceLinesUnavailable,
            actionLabel: l10n.commonRetry,
            onAction: () => setState(() {
              _detail = _start();
            }),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: AppSpacing.sm,
          children: [
            FinanceInvoiceReceipt(
              detail: detail,
              fallbackCurrency: widget.fallbackCurrency,
              boundaryKey: _boundary,
            ),
            AppButton.outline(
              key: const ValueKey('invoice-share'),
              leading: const Icon(LucideIcons.share2),
              onPressed: _sharing ? null : () => unawaited(_share(detail)),
              child: Text(l10n.financeInvoiceShare),
            ),
          ],
        );
      },
    );
  }
}
