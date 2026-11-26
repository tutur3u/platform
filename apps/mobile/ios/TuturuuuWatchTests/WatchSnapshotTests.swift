import CoreGraphics
import SwiftUI
import TuturuuuWatchKit
import UIKit
import XCTest
@testable import TuturuuuWatch

@MainActor
final class WatchSnapshotTests: XCTestCase {
  private let watchWidth: CGFloat = 198
  private let watchHeight: CGFloat = 242
  private let watchScale: CGFloat = 2.0

  private func sampleMetadata(locale: WatchLocale) -> WatchSessionMetadata {
    WatchSessionMetadata(
      userId: "user-snapshot",
      workspaceId: "ws-snapshot",
      workspaceName: locale == .vi ? "Không gian chính" : "Personal",
      isPersonal: true,
      apiOrigins: .productionDefault,
      locale: locale,
      calmColors: false,
      expiresAtEpochSeconds: Date().addingTimeInterval(3600).timeIntervalSince1970
    )
  }

  private func sampleSnapshot(locale: WatchLocale) -> WatchTodaySnapshot {
    let now = Date()
    let events = [
      WatchCalendarEvent(
        id: "ev-1",
        title: locale == .vi ? "Họp thiết kế sản phẩm" : "Product design sync",
        location: locale == .vi ? "Phòng A" : "Studio A",
        startAt: now.addingTimeInterval(900),
        endAt: now.addingTimeInterval(2700),
        color: "blue",
        isAllDay: false
      ),
      WatchCalendarEvent(
        id: "ev-2",
        title: locale == .vi ? "Kiểm tra bản phát hành" : "Release check-in",
        location: nil,
        startAt: now.addingTimeInterval(5400),
        endAt: now.addingTimeInterval(7200),
        color: "purple",
        isAllDay: false
      ),
    ]
    let tasks = [
      WatchTaskItem(
        id: "task-1",
        name: locale == .vi ? "Duyệt thiết kế đồng hồ" : "Review watch complications",
        priority: .critical,
        endDate: now.addingTimeInterval(-600),
        listId: "list-todo",
        boardId: "board-1",
        workspaceId: "ws-snapshot",
        isCompleted: false
      ),
      WatchTaskItem(
        id: "task-2",
        name: locale == .vi ? "Gửi ghi chú phát hành" : "Send release notes",
        priority: .high,
        endDate: now.addingTimeInterval(3600),
        listId: "list-todo",
        boardId: "board-1",
        workspaceId: "ws-snapshot",
        isCompleted: false
      ),
    ]
    return WatchTodaySnapshot(
      workspaceId: "ws-snapshot",
      workspaceName: locale == .vi ? "Không gian chính" : "Personal",
      isPersonal: true,
      syncedAt: now,
      events: events,
      tasks: tasks
    )
  }

  private func renderAndVerify<V: View>(_ view: V, named name: String) throws {
    let framed = view
      .frame(width: watchWidth, height: watchHeight, alignment: .top)
      .background(SorbetWatchPalette.background.color)
      .environment(\.colorScheme, .dark)

    let renderer = ImageRenderer(content: framed)
    renderer.scale = watchScale
    renderer.proposedSize = ProposedViewSize(width: watchWidth, height: watchHeight)

    guard let cgImage = renderer.cgImage else {
      XCTFail("ImageRenderer produced nil CGImage for \(name)")
      return
    }

    XCTAssertEqual(cgImage.width, Int(watchWidth * watchScale), "\(name) width mismatch")
    XCTAssertEqual(cgImage.height, Int(watchHeight * watchScale), "\(name) height mismatch")

    let image = UIImage(cgImage: cgImage, scale: watchScale, orientation: .up)
    guard let pngData = image.pngData() else {
      XCTFail("Failed to encode PNG for \(name)")
      return
    }
    XCTAssertGreaterThan(pngData.count, 1024, "\(name) PNG unexpectedly small")
    XCTAssertTrue(
      hasVisualVariance(cgImage: cgImage),
      "\(name) rendered as a flat single-color image"
    )

    let attachment = XCTAttachment(data: pngData, uniformTypeIdentifier: "public.png")
    attachment.name = "\(name).png"
    attachment.lifetime = .keepAlways
    add(attachment)

    if let outputDir = ProcessInfo.processInfo.environment["WATCH_SNAPSHOT_DIR"], !outputDir.isEmpty {
      let dirURL = URL(fileURLWithPath: outputDir, isDirectory: true)
      try FileManager.default.createDirectory(at: dirURL, withIntermediateDirectories: true)
      let fileURL = dirURL.appendingPathComponent("\(name).png")
      try pngData.write(to: fileURL)
    }
  }

  private func hasVisualVariance(cgImage: CGImage) -> Bool {
    let width = cgImage.width
    let height = cgImage.height
    let bytesPerRow = width * 4
    var pixels = [UInt8](repeating: 0, count: height * bytesPerRow)
    guard let context = CGContext(
      data: &pixels,
      width: width,
      height: height,
      bitsPerComponent: 8,
      bytesPerRow: bytesPerRow,
      space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
      return false
    }
    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))

    var distinctColors = Set<UInt32>()
    let strideY = max(1, height / 40)
    let strideX = max(1, width / 40)
    for y in stride(from: 0, to: height, by: strideY) {
      for x in stride(from: 0, to: width, by: strideX) {
        let offset = y * bytesPerRow + x * 4
        let packed = (UInt32(pixels[offset]) << 16)
          | (UInt32(pixels[offset + 1]) << 8)
          | UInt32(pixels[offset + 2])
        distinctColors.insert(packed)
        if distinctColors.count >= 8 {
          return true
        }
      }
    }
    return false
  }

  func testTodayViewEnglishSnapshot() throws {
    let viewModel = WatchAppViewModel.preview(
      metadata: sampleMetadata(locale: .en),
      snapshot: sampleSnapshot(locale: .en)
    )
    try renderAndVerify(
      TodayView(viewModel: viewModel).snapshotContent.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading),
      named: "today_en"
    )
  }

  func testTodayViewVietnameseSnapshot() throws {
    let viewModel = WatchAppViewModel.preview(
      metadata: sampleMetadata(locale: .vi),
      snapshot: sampleSnapshot(locale: .vi)
    )
    try renderAndVerify(
      TodayView(viewModel: viewModel).snapshotContent.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading),
      named: "today_vi"
    )
  }

  func testTodayViewSignedOutSnapshot() throws {
    let viewModel = WatchAppViewModel.preview(metadata: nil, snapshot: nil)
    try renderAndVerify(
      SignedOutView(viewModel: viewModel).snapshotContent.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading),
      named: "today_signed_out"
    )
  }

  func testQuickCaptureSnapshot() throws {
    let viewModel = WatchAppViewModel.preview(
      metadata: sampleMetadata(locale: .en),
      snapshot: sampleSnapshot(locale: .en)
    )
    try renderAndVerify(
      QuickCaptureView(viewModel: viewModel).snapshotContent.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading),
      named: "quick_capture_en"
    )
  }

  func testMiraQuickAskSnapshot() throws {
    let viewModel = WatchAppViewModel.preview(
      metadata: sampleMetadata(locale: .en),
      snapshot: sampleSnapshot(locale: .en),
      miraLastPrompt: "What is next on my schedule?",
      miraReply: "Product design sync starts in 15 minutes in Studio A, followed by 2 open priority tasks."
    )
    try renderAndVerify(
      MiraQuickAskView(viewModel: viewModel).snapshotContent.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading),
      named: "mira_quick_ask_en"
    )
  }
}
