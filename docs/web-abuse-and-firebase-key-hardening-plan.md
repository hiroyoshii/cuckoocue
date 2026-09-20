# Web API abuse prevention and Firebase key hardening plan

## Scope and current state

The public web app authenticates `/api/search` with a Firebase ID token, including anonymous Firebase users. The endpoint can invoke paid search and model services, but it currently has no App Check enforcement or application-level rate limit. The web and Android clients also appear to share Firebase client-key configuration. Firebase client keys are public identifiers, but unrestricted or shared keys make quota abuse and incident response harder.

This plan keeps anonymous discovery available while adding independent controls at the request, app-attestation, budget, and credential layers.

## 2. Search API abuse and cost controls

### Target behavior

- Legitimate anonymous users can search without creating an account.
- Automated traffic is rejected before paid BigQuery or model calls begin.
- A single user, device, or network cannot consume an unbounded share of the daily budget.
- Operators can see rejection rates, latency, and estimated paid-call volume without logging raw queries, tokens, or IP addresses.

### Phase A: measurement and server-side limits

1. Add structured metrics for request outcome, authentication class, cache hit, downstream call count, duration, and `429` responses. Hash UID and network identifiers with a rotating server secret; never persist raw UID, IP, ID token, App Check token, or query text.
2. Add billing-budget alerts at 50%, 80%, and 100% of the monthly target. Add a separate operational alert for a sudden rise in search invocations or paid downstream calls.
3. Add a Firestore transactional limiter at the start of `/api/search`, before BigQuery or model work. Store only hashed keys and fixed-window counters with TTL cleanup.
4. Start with these configurable limits, then tune from production metrics:

   | Caller | Burst limit | Daily limit |
   | --- | ---: | ---: |
   | Anonymous Firebase user | 10 / 10 min | 100 / day |
   | Registered Firebase user | 30 / 10 min | 500 / day |
   | Hashed network backstop | 40 / 10 min | 1,000 / day |

5. Give cursor-only pagination a separate, higher limit because it should reuse the original query path and cost less. Reject changed-query cursors as new searches.
6. Return `429` with `Retry-After` and a stable machine-readable error code. Keep the entered query and existing results in the UI so retrying does not lose state.
7. Bound downstream cost with strict timeouts, result caps, duplicate-request coalescing, and an App Hosting maximum-instance ceiling. Treat the instance ceiling as a cost fuse, not the primary rate limiter.

Implementation areas: `web/src/app/api/search/route.ts`, a new server-only limiter module, Firestore TTL/index configuration, API-client error handling, and metrics configuration. Tests should cover anonymous and registered buckets, concurrent increments, daily rollover, network backstop, pagination, and the guarantee that rejected requests make zero paid downstream calls.

### Phase B: Firebase App Check

1. Register the production web app with reCAPTCHA Enterprise and initialize App Check in the browser.
2. Send the App Check token in `X-Firebase-AppCheck` for search requests and verify it server-side before rate limiting and paid work.
3. Deploy verification in metrics-only mode for 48–72 hours. Measure missing, valid, invalid, and expired tokens by route and browser class.
4. Enable enforcement for `/api/search` after valid-token coverage meets the release gate. Use explicit localhost debug tokens for local and CI tests; never accept the debug provider in production.
5. Keep Firebase Authentication verification in place. App Check proves the request came through an approved client; it does not identify the user or replace authorization.
6. Add Android Play Integrity support before enabling any project-wide enforcement that would affect Android. Roll out per service or route so the web release cannot break the mobile app.

Release gate: at least 99% valid App Check coverage for normal production searches over 48 hours, no supported-browser regression, and a tested emergency switch that disables route enforcement without removing authentication or rate limits.

### Rollout and rollback

Deploy metrics first, then the limiter in report-only mode, then enforce generous thresholds, tune them after one week, and finally enforce App Check. Each control must have an independent configuration switch. Rollback should disable only the failing layer while authentication, metrics, and paid-call bounds remain active.

## 3. Firebase client-key separation and restrictions

### Key layout

Create separate Google API keys for:

- Web production
- Web local/preview/CI
- Android release
- Android debug
- iOS, when the client exists

Server-side BigQuery, model, and administrative access must continue to use service identities or server secrets and must not be added to these client keys.

### Restrictions

- Web production: HTTP-referrer restrictions for the custom production domain and the Firebase App Hosting domain. Allow only the exact Firebase browser APIs observed in production.
- Web local/preview: separate key with localhost and approved preview origins only; use lower quotas where available.
- Android release: Android-application restriction with the release package name and signing-certificate SHA-1/SHA-256 fingerprints.
- Android debug: separate Android restriction with the debug certificate and lower quotas.
- iOS: iOS bundle-ID restriction when introduced.

Do not assume an API restriction from memory. First collect successful API usage for each client, derive the minimum allowlist, and test authentication, anonymous sign-in, Firestore access, and any storage calls in staging.

### No-downtime migration

1. Inventory every current key, owner, API allowlist, caller restriction, quota, and usage over the previous 30 days.
2. Create the new restricted keys without changing the existing shared key.
3. Put each key in its platform-specific configuration and secret-management path. Ensure build logs and generated review artifacts do not print complete keys.
4. Release web production first and verify the custom and hosted domains. Release Android debug, then Android release, and verify installed builds signed with the intended certificates.
5. Observe the old shared key for at least seven days. Any remaining traffic must be traced to a known build or integration.
6. When old-key traffic reaches zero, disable the old key. Keep its configuration record for rollback, then delete it after the agreed observation window.

Rollback consists of restoring the previous client configuration while leaving the newly created keys enabled. Do not remove or rotate the shared key until every active client version has a working replacement.

### Acceptance criteria

- Each production client uses a different key.
- Every key has both caller and API restrictions appropriate to its platform.
- Requests from an unapproved origin, package, certificate, or API fail.
- Web anonymous sign-in, search, pagination, and Android authentication pass after migration.
- No complete key appears in tracked review artifacts, build output, or application logs.
- The legacy shared key has zero observed traffic before disablement.

## Recommended execution order

1. Add metrics and budget alerts.
2. Add and enforce the server-side limiter.
3. Split and restrict keys without disabling the legacy key.
4. Add App Check in metrics-only mode.
5. Enforce App Check for web search.
6. Disable and later delete the legacy shared key after the observation window.

This order reduces immediate cost exposure first and avoids coupling App Check rollout to credential migration.
