part of 'snapshot_parser.dart';

CreditPoint parseCreditPoint(JsonReader r) {
  r.keys(
    [
      'instance',
      'display_name',
      't',
      'remaining',
      'daily_burn',
      'daily_target',
      'burn_vs_target',
    ],
    [
      'instance',
      'display_name',
      't',
      'remaining',
      'daily_burn',
      'daily_target',
      'burn_vs_target',
    ],
  );
  return CreditPoint(
    instance: r
        .field('instance')
        .string(maxLength: 60, pattern: RegExp(r'^[A-Za-z0-9_]+$')),
    displayName: r
        .field('display_name')
        .enumOf<CreditDisplayName>(CreditDisplayName.values, (v) => v.wireName),
    t: r.field('t').utcTimestamp(),
    remaining: r.field('remaining').nullable((v) => v.number(min: 0)),
    dailyBurn: r.field('daily_burn').nullable((v) => v.number(min: 0)),
    dailyTarget: r.field('daily_target').nullable((v) => v.number(min: 0)),
    burnVsTarget: r.field('burn_vs_target').nullable((v) => v.number()),
  );
}
