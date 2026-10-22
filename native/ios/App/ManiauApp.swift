import SwiftUI
import WidgetKit

@main
struct ManiauApp: App {
    var body: some Scene { WindowGroup { ApplicationView() } }
}

struct ApplicationView: View {
    @AppStorage("configuredWebAppURL") private var savedURL = ""
    @State private var inputURL = "https://train-time-three.vercel.app/"
    @State private var editing = false
    @State private var error: String?
    @State private var browserID = UUID()
    @StateObject private var background = BackgroundWalking.shared

    var body: some View {
        NavigationStack {
            Group {
                if !editing, let url = TrustedOrigin.configuredURL(savedURL) {
                    TrainWebView(url: url).id(browserID)
                } else {
                    Form {
                        Section("公開済みWebアプリのURL") {
                            TextField("https://your-app.vercel.app", text: $inputURL)
                                .textContentType(.URL).keyboardType(.URL)
                                .textInputAutocapitalization(.never).autocorrectionDisabled()
                            Text("ご自身で公開した、このアプリのHTTPSアドレスを入力してください。登録したサイトからのみウィジェットを保存します。")
                                .font(.footnote)
                            if let error { Text(error).foregroundStyle(.red) }
                            Button("このURLを使う") { saveURL() }
                        }
                        Section("ウィジェットへの保存") {
                            Text("Webアプリで駅・方面・電車を選び、ウィジェット保存ボタンを押してください。その後、ホーム画面を長押しし、ウィジェットから「まにあう」を追加します。")
                            Text("保存時の予定時刻・徒歩時間を端末内で共有します。背景更新を使わない場合、位置や徒歩時間の期限が切れたらアプリを開いて更新してください。")
                            Button("ウィジェットの保存内容を消す", role: .destructive) {
                                do { background.stop(); try SnapshotStore.clear(); WidgetCenter.shared.reloadTimelines(ofKind: SnapshotStore.widgetKind) }
                                catch { self.error = "保存内容を削除できませんでした。App Group設定を確認してください。" }
                            }
                        }
                        Section("任意：バックグラウンドで徒歩時間を更新") {
                            Text("ONにすると、アプリを離れても現在地を取得し、設定したWebサーバーとその徒歩経路サービスへ送信します。端末には座標履歴を保存しません。電池を消費します。GPSの常時動作はiOSが制御するため保証できません。登録地点の実測時間は自動更新しません。")
                                .font(.footnote)
                            Button("① アプリ使用中の位置情報を許可") { background.requestForegroundPermission() }
                            Button("② バックグラウンド利用のため「常に」を許可") { background.requestAlwaysPermission() }
                            Toggle("バックグラウンド更新", isOn: Binding(get: { background.enabled }, set: { background.setEnabled($0) }))
                            Text(background.message).font(.footnote)
                            Text("通信は最短150秒間隔。保存した電車がすべて発車するか時刻表の期限が切れると停止します。強制終了・省電力・OS判断で停止する場合があります。アプリの再起動後はOFFです。")
                                .font(.footnote)
                        }
                    }
                }
            }
            .navigationTitle("まにあう").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(editing ? "戻る" : "設定") {
                        inputURL = savedURL.isEmpty ? "https://train-time-three.vercel.app/" : savedURL; editing.toggle(); error = nil
                    }
                }
            }
            .onAppear { inputURL = savedURL.isEmpty ? "https://train-time-three.vercel.app/" : savedURL }
            .onOpenURL { url in
                if url.scheme == "maniau", url.host == "open" { editing = false; browserID = UUID() }
            }
        }
    }

    private func saveURL() {
        guard let url = TrustedOrigin.configuredURL(inputURL) else {
            error = "HTTPSのURLを入力してください。認証情報、クエリ、#以降は含められません。"; return
        }
        do {
            if savedURL != url.absoluteString { background.stop(); try SnapshotStore.clear() }
            savedURL = url.absoluteString; editing = false; error = nil; browserID = UUID()
            WidgetCenter.shared.reloadTimelines(ofKind: SnapshotStore.widgetKind)
        } catch { self.error = "設定を変更できませんでした。App Group設定を確認してください。" }
    }
}
