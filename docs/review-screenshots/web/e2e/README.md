# Web E2E Captures

Captured from the 2026-09-03 production build using real BigQuery, Vertex AI and Memory Bank services.

1. `00-google-login-production.png`: deployed Firebase Google login gate.
2. `01-empty-desktop.png`: authenticated search workspace.
3. `02-search-results-desktop.png`: real search with the first result expanded.
4. `03-import-ready-desktop.png`: target-day Android transfer prepared.
5. `04-save-review-desktop.png`: Android completed-list handoff enriched for publication.
6. `05-search-results-mobile.png`: responsive real search results.
7. `06-android-save-handoff-mobile.png`: responsive completed-list handoff.
8. `07-save-published-desktop.png`: successful BigQuery publication.

The login gate is captured from the deployed App Hosting URL. Post-login states are captured from `next start` with development identity enabled because Google's interactive account chooser is not automated; no service response is mocked.
