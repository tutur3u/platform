enum WalletInterestProvider { momo, zalopay }

enum WalletInterestTier { standard, gold, diamond }

enum WalletInterestProjectionPeriod { week, month, quarter, year }

class WalletInterest {
  WalletInterest.fromJson(Map<String, dynamic> json)
    : config = switch (json['config']) {
        final Map<String, dynamic> config => WalletInterestConfig.fromJson(
          config,
        ),
        _ => null,
      },
      currentRate =
          (json['currentRate'] as Map<String, dynamic>?)?['annual_rate']
              as num?,
      today = json['todayInterest'] as num?,
      month = json['monthToDateInterest'] as num?,
      year = json['yearToDateInterest'] as num?,
      total = json['totalEarnedInterest'] as num?,
      rates = (json['rateHistory'] as List<dynamic>? ?? const [])
          .cast<Map<String, dynamic>>()
          .map(WalletInterestRate.fromJson)
          .toList(growable: false),
      _projections = json['projections'] as Map<String, dynamic>?,
      pendingDeposits = (json['pendingDeposits'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(WalletInterestPendingDeposit.fromJson)
          .where((deposit) => deposit.depositDate != null)
          .toList(growable: false);

  final WalletInterestConfig? config;
  final num? currentRate;
  final num? today;
  final num? month;
  final num? year;
  final num? total;
  final List<WalletInterestRate> rates;
  final Map<String, dynamic>? _projections;

  /// Deposits that start earning interest on a later business day.
  final List<WalletInterestPendingDeposit> pendingDeposits;

  /// Projected cumulative interest per day of [period].
  List<(DateTime, num)> projectionSeries(
    WalletInterestProjectionPeriod period,
  ) => [
    for (final row
        in (_projections?[period.name] as List<dynamic>? ?? const [])
            .whereType<Map<String, dynamic>>())
      if ((_date(row['date']), row['projectedCumulativeInterest']) case (
        final DateTime date,
        final num value,
      ))
        (date, value),
  ];

  num? projection(WalletInterestProjectionPeriod period) {
    final values = _projections?[period.name] as List<dynamic>?;
    final last = values?.lastOrNull as Map<String, dynamic>?;
    return last?['projectedCumulativeInterest'] as num?;
  }
}

class WalletInterestPendingDeposit {
  WalletInterestPendingDeposit.fromJson(Map<String, dynamic> json)
    : depositDate = _date(json['depositDate']),
      interestStartDate = _date(json['interestStartDate']),
      amount = json['amount'] as num? ?? 0,
      daysUntilInterest = (json['daysUntilInterest'] as num?)?.toInt() ?? 0;

  final DateTime? depositDate;
  final DateTime? interestStartDate;
  final num amount;
  final int daysUntilInterest;
}

class WalletInterestConfig {
  WalletInterestConfig.fromJson(Map<String, dynamic> json)
    : provider = WalletInterestProvider.values.byName(
        json['provider'] as String,
      ),
      tier = switch (json['zalopay_tier']) {
        final String value => WalletInterestTier.values.byName(value),
        _ => null,
      },
      enabled = json['enabled'] as bool,
      start = _date(json['tracking_start_date']),
      end = _date(json['tracking_end_date']);

  final WalletInterestProvider provider;
  final WalletInterestTier? tier;
  final bool enabled;
  final DateTime? start;
  final DateTime? end;
}

class WalletInterestRate {
  WalletInterestRate.fromJson(Map<String, dynamic> json)
    : rate = json['annual_rate'] as num,
      start = _date(json['effective_from'])!,
      end = _date(json['effective_to']);

  final num rate;
  final DateTime start;
  final DateTime? end;
}

DateTime? _date(Object? value) =>
    value is String ? DateTime.tryParse(value) : null;
