import 'dart:convert';
import 'dart:typed_data';

import 'package:mobile/core/validation/uuid.dart';
import 'package:mobile/data/sources/api_client.dart';

final class ProductFeedbackDraft {
  ProductFeedbackDraft({
    required String title,
    required String body,
    Uint8List? image,
    this.contentType,
  }) : title = title.trim(),
       body = body.trim(),
       image = image == null
           ? null
           : Uint8List.fromList(image).asUnmodifiableView() {
    if (this.title.runes.isEmpty ||
        this.title.runes.length > 160 ||
        this.body.runes.isEmpty ||
        this.body.runes.length > 8000 ||
        (image != null &&
            (image.isEmpty ||
                image.length > 2097152 ||
                !const [
                  'image/png',
                  'image/jpeg',
                  'image/webp',
                ].contains(contentType)))) {
      throw const FormatException('feedback_invalid_submission');
    }
  }
  final String title;
  final String body;
  final Uint8List? image;
  final String? contentType;

  Map<String, dynamic> payload(String key, String token) => {
    'title': title,
    'body': body,
    'idempotencyKey': key,
    'turnstileToken': token,
    if (image case final bytes?)
      'media': {'contentType': contentType, 'data': base64Encode(bytes)},
  };
}

final class ProductFeedbackReceipt {
  const ProductFeedbackReceipt({required this.id, required this.createdAt});
  factory ProductFeedbackReceipt.fromJson(Map<String, dynamic> json) {
    final id = json['id'];
    final created = json['createdAt'];
    if (id is! String ||
        !isUuid(id) ||
        created is! String ||
        DateTime.tryParse(created) == null) {
      throw const FormatException('feedback_invalid_receipt');
    }
    return ProductFeedbackReceipt(id: id, createdAt: DateTime.parse(created));
  }
  final String id;
  final DateTime createdAt;
}

/// Account-scoped native dispatch; no offline queue or response-based replay.
class ProductFeedbackRepository {
  ProductFeedbackRepository({
    required this.actorId,
    required this.isCurrent,
    ApiClient? api,
  }) : _api = api ?? ApiClient(expectedUserId: actorId);
  final String actorId;
  final bool Function() isCurrent;
  final ApiClient _api;
  static const path = '/api/v1/product-feedback';

  void _check() {
    _api.checkUser(actorId);
    if (!isCurrent()) {
      throw const ApiException(message: 'Account changed', statusCode: 401);
    }
  }

  Future<ProductFeedbackReceipt> submit({
    required ProductFeedbackDraft draft,
    required String key,
    required String token,
  }) async {
    _check();
    if (token.isEmpty ||
        !RegExp(
          '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-'
          r'[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
        ).hasMatch(key)) {
      throw const FormatException('feedback_invalid_submission');
    }
    final response = await _api.postJsonAcknowledged(
      path,
      draft.payload(key, token),
      actorId: actorId,
      isCurrent: isCurrent,
    );
    _check();
    return ProductFeedbackReceipt.fromJson(response);
  }

  Future<ProductFeedbackReceipt?> receipt(String key) async {
    _check();
    if (!isUuid(key)) throw const FormatException('feedback_invalid_key');
    final response = await _api.getJson(
      '$path/receipts/${Uri.encodeComponent(key)}',
    );
    _check();
    final receipt = response['receipt'];
    if (receipt == null && response.containsKey('receipt')) return null;
    if (receipt is! Map<String, dynamic>) {
      throw const FormatException('feedback_invalid_receipt');
    }
    return ProductFeedbackReceipt.fromJson(receipt);
  }
}
