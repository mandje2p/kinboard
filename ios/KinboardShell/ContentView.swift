import SwiftUI
import UIKit

struct ContentView: View {
    // Owned here so HomeKit stays alive as long as the screen does.
    @StateObject private var bridge = HomeKitBridge()

    var body: some View {
        KinboardWebView(url: AppConfig.siteURL, bridge: bridge)
            .background(Color.black)
            .onAppear(perform: keepScreenOn)
            .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
                keepScreenOn()
            }
    }

    /// A wall display: never let the iPad fall asleep while Kinboard is in front.
    private func keepScreenOn() {
        UIApplication.shared.isIdleTimerDisabled = true
    }
}
