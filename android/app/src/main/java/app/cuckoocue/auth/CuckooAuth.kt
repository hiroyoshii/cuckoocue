package app.cuckoocue.auth

import android.app.Activity
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import kotlinx.coroutines.tasks.await

class CuckooAuth(
    private val auth: FirebaseAuth = FirebaseAuth.getInstance(),
) {
    val currentUser: FirebaseUser?
        get() = auth.currentUser

    fun addListener(listener: FirebaseAuth.AuthStateListener) = auth.addAuthStateListener(listener)

    fun removeListener(listener: FirebaseAuth.AuthStateListener) = auth.removeAuthStateListener(listener)

    suspend fun signIn(activity: Activity): FirebaseUser {
        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(activity.getString(app.cuckoocue.R.string.default_web_client_id))
            .build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()
        val result = CredentialManager.create(activity).getCredential(activity, request)
        val googleCredential = GoogleIdTokenCredential.createFrom(result.credential.data)
        val firebaseCredential = GoogleAuthProvider.getCredential(googleCredential.idToken, null)
        return requireNotNull(auth.signInWithCredential(firebaseCredential).await().user)
    }

    suspend fun signOut(activity: Activity) {
        auth.signOut()
        CredentialManager.create(activity).clearCredentialState(ClearCredentialStateRequest())
    }
}
