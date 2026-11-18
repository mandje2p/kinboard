import Foundation

enum AppConfig {
    /// Where Kinboard lives. Change it here if the address ever changes.
    static let siteURL = URL(string: "https://maison.2points.fr")!

    /// Pages that stay inside the app. Any other address a link leads to
    /// opens in Safari (Google sign-in, for instance, refuses embedded views).
    static let internalHosts: Set<String> = ["maison.2points.fr"]
}
