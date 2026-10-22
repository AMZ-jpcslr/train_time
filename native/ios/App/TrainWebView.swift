import SwiftUI
import WebKit
import WidgetKit

struct TrainWebView: UIViewRepresentable {
    let url: URL
    func makeCoordinator() -> Coordinator { Coordinator(url: url) }
    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(context.coordinator, name: "maniauWidget")
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.allowsBackForwardNavigationGestures = true
        view.load(URLRequest(url: url))
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {}
    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.stopLoading()
        view.configuration.userContentController.removeScriptMessageHandler(forName: "maniauWidget")
        view.navigationDelegate = nil; view.uiDelegate = nil
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        let trustedURL: URL
        init(url: URL) { trustedURL = url }

        func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
            let origin = message.frameInfo.securityOrigin
            guard UIApplication.shared.applicationState == .active,
                  let currentURL = TrustedOrigin.configuredURL(UserDefaults.standard.string(forKey: "configuredWebAppURL") ?? ""),
                  TrustedOrigin.matches(trustedURL, configured: currentURL),
                  message.name == "maniauWidget", message.frameInfo.isMainFrame,
                  origin.protocol.lowercased() == "https",
                  origin.host.lowercased() == trustedURL.host?.lowercased(),
                  (origin.port == 0 ? 443 : origin.port) == (trustedURL.port ?? 443),
                  TrustedOrigin.matches(message.webView?.url, configured: trustedURL),
                  let text = message.body as? String, text.utf8.count <= WidgetSnapshot.maximumBytes,
                  let data = text.data(using: .utf8) else { return }
            do {
                let snapshot = try WidgetSnapshot.decode(data)
                guard Date().timeIntervalSince1970 * 1000 - snapshot.generatedAt <= 300_000 else {
                    reply(message.webView, ok: false); return
                }
                try SnapshotStore.save(data)
                BackgroundWalking.shared.snapshotChanged()
                WidgetCenter.shared.reloadTimelines(ofKind: SnapshotStore.widgetKind)
                reply(message.webView, ok: true)
            } catch { reply(message.webView, ok: false) }
        }

        private func reply(_ view: WKWebView?, ok: Bool) {
            // Only a fixed success/error enum crosses back into JavaScript; never interpolate received text.
            let result = ok ? "{ok:true}" : "{ok:false,error:'保存できませんでした。データまたはApp Group設定を確認してください。'}"
            view?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('maniauwidgetresult',{detail:\(result)}));", completionHandler: nil)
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let destination = action.request.url else { decisionHandler(.cancel); return }
            if TrustedOrigin.matches(destination, configured: trustedURL) {
                if action.targetFrame == nil { webView.load(action.request); decisionHandler(.cancel) }
                else { decisionHandler(.allow) }
            } else {
                // Cross-origin frames cannot become bridge-enabled content. Open user-followed links externally only.
                if action.navigationType == .linkActivated,
                   action.targetFrame?.isMainFrame != false,
                   ["https", "http"].contains(destination.scheme?.lowercased() ?? "") {
                    UIApplication.shared.open(destination)
                }
                decisionHandler(.cancel)
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                     decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
            decisionHandler(TrustedOrigin.matches(response.response.url, configured: trustedURL) ? .allow : .cancel)
        }
    }
}
