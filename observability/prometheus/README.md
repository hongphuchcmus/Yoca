# Local observability stack

Prometheus scrapes the Yoca server at `host.docker.internal:4000/metrics` every five seconds and keeps local data for seven days. Grafana reads Prometheus through the internal Docker network and loads the Yoca dashboard automatically. The same endpoint includes HTTP, external-provider, data-source and Gemini token metrics.

Set these values in `server/.env` before starting the server:

```dotenv
API_METRICS_ENABLED=true
API_METRICS_BEARER_TOKEN=yoca-local-prometheus
```

The shared token is only for local development. Use a private secret for any deployed environment.

Start the Yoca server on port 4000, then run:

```bash
npm run observability:up
```

Open `http://localhost:9090/targets` and confirm that `yoca-server` is `UP`.

Open Grafana at `http://localhost:3001` and sign in with the local-only credentials:

```text
username: admin
password: yoca-local
```

The home dashboard is provisioned as `Yoca — API and Provider Observability`. Its default range is the last 15 minutes and it refreshes every five seconds. Use the Route and Provider filters to isolate a benchmark journey before taking a screenshot or exporting results.

Gemini panels group calls by stable operation ID and requested model. Token counters come from the Gemini response metadata and contain no prompt or response text. For paid-cost calculations, use prompt tokens as input and add output plus thinking tokens as billable output; `total` is a reconciliation counter and must not be added again. Brave Web and News requests appear in the provider panels under provider `brave`.

In `Observed Blockchain Data Usage`, `none` means that a route in the benchmark scope did not explicitly register a DB, memory or provider result. Treat it as an instrumentation-coverage signal, not as a cache miss. Investigate a large `none` slice by grouping `yoca_request_data_source_total` by both `route` and `source`.

Useful commands:

```bash
npm run observability:config
npm run observability:logs
npm run observability:down
```

The older `prometheus:*` aliases remain available. Both `observability:down` and `prometheus:down` keep the named data volumes. Run `docker compose -f compose-prometheus.yml down --volumes` only when both Prometheus history and local Grafana state should be deleted.

## Report screenshots

Do not screenshot the dashboard before running a named benchmark window. For each report capture:

1. Start Yoca and the observability stack.
2. Select a short fixed time range that contains only the intended benchmark.
3. Filter Route or Provider when unrelated development traffic is present.
4. Prefer one or two panels per image so legends remain readable in the report.
5. Keep the benchmark JSON/CSV as the numerical source; Grafana is the visualization layer.
