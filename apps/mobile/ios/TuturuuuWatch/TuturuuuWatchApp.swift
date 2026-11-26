import SwiftUI
import TuturuuuWatchKit
import WatchKit
import WidgetKit

@main
struct TuturuuuWatchApp: App {
  @StateObject private var viewModel = WatchAppViewModel()

  var body: some Scene {
    WindowGroup {
      NavigationStack {
        TodayView(viewModel: viewModel)
      }
      .preferredColorScheme(.dark)
      .onAppear {
        scheduleNextBackgroundRefresh()
      }
    }
    .backgroundTask(.appRefresh("com.tuturuuu.watch.refresh")) {
      await viewModel.refreshToday()
      WidgetCenter.shared.reloadAllTimelines()
      scheduleNextBackgroundRefresh()
    }
  }

  private func scheduleNextBackgroundRefresh() {
    let nextDate = Date().addingTimeInterval(30 * 60)
    WKApplication.shared().scheduleBackgroundRefresh(
      withPreferredDate: nextDate,
      userInfo: nil
    ) { _ in }
  }
}
