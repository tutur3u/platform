import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/inventory_product_image_cache.dart';
import 'package:mobile/data/sources/supabase_client.dart';

/// Displays the scoped encrypted copy first and caches newly visited images.
class InventoryProductImage extends StatefulWidget {
  const InventoryProductImage({
    required this.product,
    this.size = 56,
    this.cache,
    super.key,
  });

  final InventoryProduct product;
  final double size;
  final InventoryProductImageCache? cache;

  @override
  State<InventoryProductImage> createState() => _InventoryProductImageState();
}

class _InventoryProductImageState extends State<InventoryProductImage> {
  Uint8List? _bytes;
  String? _scope;
  int _generation = 0;
  StreamSubscription<dynamic>? _auth;
  InventoryProductImageCache? _observedCache;

  @override
  void initState() {
    super.initState();
    _auth = maybeSupabase?.auth.onAuthStateChange.listen((_) {
      if (mounted) setState(_load);
    });
  }

  void _observeCache() {
    if (identical(_observedCache, _cache)) return;
    _observedCache?.store.resourceRemovalRevision.removeListener(_onRemoved);
    _observedCache = _cache;
    _observedCache!.store.resourceRemovalRevision.addListener(_onRemoved);
  }

  void _onRemoved() {
    if (!mounted) return;
    final retained = _cache.peek(widget.product);
    if (retained == null && _bytes != null) {
      _generation++;
      _scope = null;
      setState(() => _bytes = null);
    }
  }

  InventoryProductImageCache get _cache =>
      widget.cache ?? InventoryProductImageCache.instance;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _load();
  }

  @override
  void didUpdateWidget(covariant InventoryProductImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    _load();
  }

  void _load() {
    _observeCache();
    final user = _cache.currentUserId();
    final product = widget.product;
    final scope = '$user:${product.wsId}:${product.id}:${product.avatarUrl}';
    if (_scope == scope) return;
    _scope = scope;
    final generation = ++_generation;
    _bytes = _cache.peek(product);
    if (user == null || product.avatarUrl == null || _bytes != null) return;
    unawaited(() async {
      try {
        final bytes = await _cache.load(product);
        if (!mounted ||
            generation != _generation ||
            _cache.currentUserId() != user) {
          return;
        }
        setState(() => _bytes = bytes);
      } on Object {
        // A missing image never hides the product or blocks checkout.
      }
    }());
  }

  @override
  void dispose() {
    _generation++;
    unawaited(_auth?.cancel());
    _observedCache?.store.resourceRemovalRevision.removeListener(_onRemoved);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(12),
    child: SizedBox.square(
      dimension: widget.size,
      child: _bytes == null
          ? _placeholder(context)
          : Image.memory(
              _bytes!,
              fit: BoxFit.cover,
              cacheWidth: (widget.size * MediaQuery.devicePixelRatioOf(context))
                  .ceil(),
              excludeFromSemantics: true,
              errorBuilder: (_, _, _) => _placeholder(context),
            ),
    ),
  );

  Widget _placeholder(BuildContext context) => ColoredBox(
    color: Theme.of(context).colorScheme.surfaceContainerHighest,
    child: Icon(
      Icons.image_outlined,
      color: Theme.of(context).colorScheme.onSurfaceVariant,
      size: 24,
    ),
  );
}
