import 'package:mobile/data/models/finance/finance_promotion.dart';
import 'package:mobile/data/repositories/finance_promotions_repository.dart';

/// A percentage code in use, a fixed-amount code and a used-up code.
const financeScenePromotions = [
  FinancePromotion(
    id: 'spring',
    name: 'Spring sale',
    code: 'SPRING10',
    value: 10,
    maxUses: 50,
    currentUses: 12,
  ),
  FinancePromotion(
    id: 'loyal',
    name: 'Loyal customer',
    code: 'LOYAL',
    value: 50000,
    useRatio: false,
  ),
  FinancePromotion(
    id: 'launch',
    name: 'Launch week',
    code: 'LAUNCH',
    value: 20,
    maxUses: 5,
    currentUses: 5,
  ),
];

/// In-memory promotions that record every write.
class FinanceScenePromotionsRepository extends FinancePromotionsRepository {
  FinanceScenePromotionsRepository([this.rows = financeScenePromotions]);

  final List<FinancePromotion> rows;
  final calls = <String>[];

  @override
  Future<List<FinancePromotion>> list(
    String wsId, {
    bool forceRefresh = false,
  }) async => rows;

  @override
  Future<void> create(String wsId, FinancePromotion promotion) async =>
      calls.add('create:${promotion.toPayload()}');

  @override
  Future<void> update(String wsId, FinancePromotion promotion) async =>
      calls.add('update:${promotion.id}:${promotion.value}');

  @override
  Future<void> delete(String wsId, String id) async => calls.add('delete:$id');
}
