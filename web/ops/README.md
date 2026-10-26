# Web monitoring configuration

`web-dashboard.json` is the Cloud Monitoring dashboard source. The two `*-alert.json` files are one-condition log alerts; Cloud Monitoring requires log-match policies to contain exactly one condition.

Before applying, create or select an email notification channel and pass its full resource name explicitly. Do not add email addresses or channel IDs to these files.

```bash
gcloud beta monitoring dashboards create \
  --project=cuckoocue \
  --config-from-file=web/ops/web-dashboard.json

gcloud alpha monitoring policies create \
  --project=cuckoocue \
  --policy-from-file=web/ops/search-failed-alert.json \
  --notification-channels="$CUCKOOCUE_NOTIFICATION_CHANNEL"
```

Apply the other alert file with the same command. The project also has counter log metrics for search completion/failure/model use, BQ read caps, and CSP reports. Metric filters use only structured event names; never add search text, UID, IP, prompt, or token content as labels.
