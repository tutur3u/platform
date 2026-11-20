part of 'crm_repository.dart';

mixin _CrmBillingRepository {
  ApiClient get _api;

  Future<({List<FinanceInvoice> items, int count, double? outstanding})>
  getContactInvoices(
    String workspaceId,
    String contactId, {
    required int page,
  }) async {
    final contact = CrmEndpoints.user(
      Uri.encodeComponent(workspaceId),
      Uri.encodeComponent(contactId),
    );
    final result = await _api.getJson('$contact/billing?page=$page');
    return (
      items: (result['data'] as List)
          .cast<Map<String, dynamic>>()
          .map(FinanceInvoice.fromJson)
          .toList(),
      count: result['count'] as int,
      outstanding: (result['outstanding'] as num?)?.toDouble(),
    );
  }
}
