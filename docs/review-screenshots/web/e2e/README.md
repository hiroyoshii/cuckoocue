# Web E2E Captures

Captured from the 2026-09-05 production build using real BigQuery, Vertex AI and Memory Bank services.

1. `00-google-login-production.png`: deployed Firebase Google login gate.
2. `01-empty-desktop.png`: authenticated search workspace.
3. `02-search-results-desktop.png`: deduplicated real search results with fit context and compact task previews.
4. `03-import-ready-desktop.png`: target-day import prepared with absolute task dates and no desktop-only Android action.
5. `04-save-review-desktop.png`: completed-list review with absolute dates, priorities and named LLM groups.
6. `05-search-results-mobile.png`: responsive search results without clipped or inert controls.
7. `06-android-save-handoff-mobile.png`: responsive completed-list review with editable absolute dates and groups.
8. `07-save-published-desktop.png`: successful BigQuery publication.

The login gate is captured from the deployed App Hosting URL. Post-login states are captured from `next start` with development identity enabled because Google's interactive account chooser is not automated. Search, enrichment and profile retrieval call the real services; no API response is mocked. The publication confirmation image remains evidence from the earlier successful real-service flow because the quality capture deliberately stops before creating another public corpus row.
