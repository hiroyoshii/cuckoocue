package app.cuckoocue.auth

/** A single user action: authenticate if necessary, sync the selected Run, then open it. */
internal suspend fun openHistoryAfterSignIn(
    runId: String,
    isSignedIn: () -> Boolean,
    signIn: suspend () -> Unit,
    sync: suspend (String) -> Boolean,
    open: (String) -> Unit,
) {
    if (!isSignedIn()) signIn()
    check(isSignedIn()) { "ログインが完了していません" }
    check(sync(runId)) { "同期できませんでした。通信を確認して再試行してください" }
    open(runId)
}
