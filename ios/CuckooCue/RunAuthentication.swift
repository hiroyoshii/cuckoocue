import FirebaseAuth
import FirebaseCore
import Foundation
import GoogleSignIn
import UIKit

struct RunAuthUser: Equatable {
    let id: String
    let displayName: String?
    let email: String?
}

@MainActor
protocol RunAuthenticating: AnyObject {
    var user: RunAuthUser? { get }
    var configurationAvailable: Bool { get }
    var onChange: ((RunAuthUser?) -> Void)? { get set }
    func signIn() async throws
    func signOut() throws
    func idToken() async throws -> String
    func handle(url: URL) -> Bool
}

@MainActor
final class FirebaseRunAuthenticator: RunAuthenticating {
    private(set) var user: RunAuthUser?
    private(set) var configurationAvailable = false
    var onChange: ((RunAuthUser?) -> Void)?
    private var listener: AuthStateDidChangeListenerHandle?

    init() {
        guard let serviceURL = Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist"),
              let serviceData = try? Data(contentsOf: serviceURL),
              let propertyList = try? PropertyListSerialization.propertyList(from: serviceData, format: nil),
              let service = propertyList as? [String: Any],
              let reversedClientID = service["REVERSED_CLIENT_ID"] as? String,
              Self.registeredURLSchemes.contains(reversedClientID) else { return }
        if FirebaseApp.app() == nil { FirebaseApp.configure() }
        guard FirebaseApp.app()?.options.clientID?.isEmpty == false else { return }
        configurationAvailable = true
        listener = Auth.auth().addStateDidChangeListener { [weak self] _, firebaseUser in
            Task { @MainActor in
                let user = firebaseUser.map {
                    RunAuthUser(id: $0.uid, displayName: $0.displayName, email: $0.email)
                }
                self?.user = user
                self?.onChange?(user)
            }
        }
    }

    func signIn() async throws {
        guard configurationAvailable, let clientID = FirebaseApp.app()?.options.clientID else {
            throw RunSyncError.configurationMissing
        }
        guard let presenter = Self.presentingViewController else { throw RunSyncError.configurationMissing }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            GIDSignIn.sharedInstance.configure { error in
                if let error { continuation.resume(throwing: error) }
                else { continuation.resume() }
            }
        }
        let result: GIDSignInResult = try await withCheckedThrowingContinuation { continuation in
            GIDSignIn.sharedInstance.signIn(withPresenting: presenter) { result, error in
                if let error { continuation.resume(throwing: error) }
                else if let result { continuation.resume(returning: result) }
                else { continuation.resume(throwing: RunSyncError.signedOut) }
            }
        }
        guard let idToken = result.user.idToken?.tokenString else { throw RunSyncError.signedOut }
        let credential = GoogleAuthProvider.credential(
            withIDToken: idToken,
            accessToken: result.user.accessToken.tokenString
        )
        _ = try await Auth.auth().signIn(with: credential)
    }

    func signOut() throws {
        guard configurationAvailable else { return }
        try Auth.auth().signOut()
        GIDSignIn.sharedInstance.signOut()
    }

    func idToken() async throws -> String {
        guard configurationAvailable, let current = Auth.auth().currentUser else { throw RunSyncError.signedOut }
        return try await current.getIDToken()
    }

    func handle(url: URL) -> Bool {
        configurationAvailable && GIDSignIn.sharedInstance.handle(url)
    }

    private static var presentingViewController: UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        var presenter = scenes.flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController
        while let presented = presenter?.presentedViewController { presenter = presented }
        return presenter
    }

    private static var registeredURLSchemes: Set<String> {
        let urlTypes = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? []
        return Set(urlTypes.flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] })
    }
}
