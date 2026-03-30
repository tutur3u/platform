import 'dart:async';
import 'dart:io' show Platform;
import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:image/image.dart' as img;
import 'package:permission_handler/permission_handler.dart';

class AssistantLiveCameraService {
  CameraController? _controller;
  bool _processingFrame = false;
  DateTime _lastFrameSentAt = DateTime.fromMillisecondsSinceEpoch(0);
  Uint8List? _latestFrame;

  CameraController? get controller => _controller;
  Uint8List? get latestFrame => _latestFrame;
  bool get isInitialized => _controller?.value.isInitialized ?? false;

  Future<bool> ensurePermission() async {
    final status = await Permission.camera.request();
    return status.isGranted;
  }

  Future<void> initialize() async {
    if (_controller?.value.isInitialized ?? false) return;

    final cameras = await availableCameras();
    final selected = cameras.where(
      (camera) => camera.lensDirection == CameraLensDirection.front,
    );

    final camera = selected.isNotEmpty ? selected.first : cameras.first;
    final controller = CameraController(
      camera,
      ResolutionPreset.low,
      enableAudio: false,
      imageFormatGroup: Platform.isIOS
          ? ImageFormatGroup.bgra8888
          : ImageFormatGroup.yuv420,
    );

    await controller.initialize();
    _controller = controller;
  }

  Future<void> startStreaming(
    void Function(Uint8List jpegBytes) onFrame,
  ) async {
    await initialize();
    final controller = _controller;
    if (controller == null || controller.value.isStreamingImages) return;

    await controller.startImageStream((image) async {
      final elapsed = DateTime.now().difference(_lastFrameSentAt);
      if (_processingFrame || elapsed < const Duration(milliseconds: 600)) {
        return;
      }

      _processingFrame = true;
      try {
        final jpegBytes = _encodeCameraImageToJpeg(
          _CameraFrameData.fromCameraImage(image),
        );
        _latestFrame = jpegBytes;
        _lastFrameSentAt = DateTime.now();
        onFrame(jpegBytes);
      } finally {
        _processingFrame = false;
      }
    });
  }

  Future<void> stopStreaming() async {
    final controller = _controller;
    if (controller == null) return;
    if (controller.value.isStreamingImages) {
      await controller.stopImageStream();
    }
  }

  Future<void> dispose() async {
    await stopStreaming();
    await _controller?.dispose();
    _controller = null;
    _latestFrame = null;
  }
}

class _CameraFrameData {
  const _CameraFrameData({
    required this.width,
    required this.height,
    required this.formatGroup,
    required this.planes,
  });

  factory _CameraFrameData.fromCameraImage(CameraImage image) =>
      _CameraFrameData(
        width: image.width,
        height: image.height,
        formatGroup: image.format.group.name,
        planes: image.planes
            .map(
              (plane) => _CameraPlaneData(
                bytes: plane.bytes,
                bytesPerPixel: plane.bytesPerPixel,
                bytesPerRow: plane.bytesPerRow,
              ),
            )
            .toList(),
      );

  final int width;
  final int height;
  final String formatGroup;
  final List<_CameraPlaneData> planes;
}

class _CameraPlaneData {
  const _CameraPlaneData({
    required this.bytes,
    required this.bytesPerPixel,
    required this.bytesPerRow,
  });

  final Uint8List bytes;
  final int? bytesPerPixel;
  final int bytesPerRow;
}

Uint8List _encodeCameraImageToJpeg(_CameraFrameData data) {
  final image = switch (data.formatGroup) {
    'bgra8888' => _bgraToImage(data),
    'yuv420' => _yuv420ToImage(data),
    'nv21' => _yuv420ToImage(data),
    _ => _fallbackToImage(data),
  };

  return Uint8List.fromList(img.encodeJpg(image, quality: 55));
}

img.Image _fallbackToImage(_CameraFrameData data) {
  final image = img.Image(width: data.width, height: data.height);
  return image;
}

img.Image _bgraToImage(_CameraFrameData data) {
  final plane = data.planes.first;
  return img.Image.fromBytes(
    width: data.width,
    height: data.height,
    bytes: plane.bytes.buffer,
    order: img.ChannelOrder.bgra,
  );
}

img.Image _yuv420ToImage(_CameraFrameData data) {
  final yPlane = data.planes[0];
  final uPlane = data.planes[1];
  final vPlane = data.planes[2];
  final image = img.Image(width: data.width, height: data.height);

  final uPixelStride = uPlane.bytesPerPixel ?? 1;
  final vPixelStride = vPlane.bytesPerPixel ?? 1;

  for (var y = 0; y < data.height; y++) {
    final uvRow = y >> 1;
    for (var x = 0; x < data.width; x++) {
      final uvColumn = x >> 1;
      final yIndex = y * yPlane.bytesPerRow + x;
      final uIndex = uvRow * uPlane.bytesPerRow + uvColumn * uPixelStride;
      final vIndex = uvRow * vPlane.bytesPerRow + uvColumn * vPixelStride;

      final yValue = yPlane.bytes[yIndex];
      final uValue = uPlane.bytes[uIndex];
      final vValue = vPlane.bytes[vIndex];

      final r = (yValue + 1.402 * (vValue - 128)).round().clamp(0, 255);
      final g = (yValue - 0.344136 * (uValue - 128) - 0.714136 * (vValue - 128))
          .round()
          .clamp(0, 255);
      final b = (yValue + 1.772 * (uValue - 128)).round().clamp(0, 255);

      image.setPixelRgb(x, y, r, g, b);
    }
  }

  return image;
}
