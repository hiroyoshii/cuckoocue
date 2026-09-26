import AuthenticationServices
import CryptoKit
import FirebaseAuth
import FirebaseCore
import Foundation
import GoogleSignIn
import Security
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
    func signInWithApple() async throws
    func prepareAccountDeletion() async throws
    func deleteCurrentAccount() async throws
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
    private var appleSession: AppleAuthorizationSession?

    init() {
        guard Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") != nil else { return }
        if FirebaseApp.app() == nil { FirebaseApp.configure() }
        guard FirebaseApp.app() != nil else { return }
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
        _ = try await Auth.auth().signIn(with: try await googleCredential())
    }

    func signInWithApple() async throws {
        let authorization = try await authorizeWithApple()
        _ = try await Auth.auth().signIn(with: authorization.credential)
    }

    func prepareAccountDeletion() async throws {
        guard configurationAvailable, let current = Auth.auth().currentUser else { throw RunSyncError.signedOut }
        let providers = Set(current.providerData.map(\.providerID))
        if providers.contains("apple.com") {
            let authorization = try await authorizeWithApple()
            _ = try await current.reauthenticate(with: authorization.credential)
            if let code = authorization.authorizationCode {
                try await Auth.auth().revokeToken(withAuthorizationCode: code)
            }
        } else if providers.contains("google.com") {
            _ = try await current.reauthenticate(with: try await googleCredential())
        }
    }

    func deleteCurrentAccount() async throws {
        guard configurationAvailable, let current = Auth.auth().currentUser else { throw RunSyncError.signedOut }
        try await current.delete()
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

    private func googleCredential() async throws -> AuthCredential {
        guard let clientID = FirebaseApp.app()?.options.clientID,
              let presenter = Self.presentingViewController else { throw RunSyncError.configurationMissing }
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
        return GoogleAuthProvider.credential(withIDToken: idToken, accessToken: result.user.accessToken.tokenString)
    }

    private func authorizeWithApple() async throws -> AppleFirebaseAuthorization {
        guard configurationAvailable, let anchor = Self.presentingViewController?.view.window else {
            throw RunSyncError.configurationMissing
        }
        let rawNonce = try Self.randomNonce()
        let request = ASAuthorizationAppleIDProvider().createRequest()
        request.requestedScopes = [.fullName, .email]
        request.nonce = SHA256.hash(data: Data(rawNonce.utf8)).map { String(format: "%02x", $0) }.joined()
        let session = AppleAuthorizationSession(anchor: anchor)
        appleSession = session
        defer { appleSession = nil }
        let credential = try await session.authorize(request)
        guard let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8) else { throw RunSyncError.signedOut }
        let firebaseCredential = OAuthProvider.appleCredential(
            withIDToken: token,
            rawNonce: rawNonce,
            fullName: credential.fullName
        )
        return AppleFirebaseAuthorization(
            credential: firebaseCredential,
            authorizationCode: credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
        )
    }

    private static func randomNonce(length: Int = 32) throws -> String {
        let characters = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var result = ""
        while result.count < length {
            var byte: UInt8 = 0
            guard SecRandomCopyBytes(kSecRandomDefault, 1, &byte) == errSecSuccess else {
                throw RunSyncError.configurationMissing
            }
            if byte < characters.count { result.append(characters[Int(byte)]) }
        }
        return result
    }
}

private struct AppleFirebaseAuthorization {
    let credential: AuthCredential
    let authorizationCode: String?
}

private final class AppleAuthorizationSession: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    private let anchor: ASPresentationAnchor
    private var continuation: CheckedContinuation<ASAuthorizationAppleIDCredential, Error>?

    init(anchor: ASPresentationAnchor) { self.anchor = anchor }

    func authorize(_ request: ASAuthorizationAppleIDRequest) async throws -> ASAuthorizationAppleIDCredential {
        try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { anchor }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential else {
            continuation?.resume(throwing: RunSyncError.signedOut); continuation = nil; return
        }
        continuation?.resume(returning: credential); continuation = nil
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        continuation?.resume(throwing: error); continuation = nil
    }
}
