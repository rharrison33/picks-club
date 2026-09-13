# Abuse protection and cost controls

These changes must be deployed before they protect the public site. They reduce
abuse; they do not guarantee availability or impose a total Render bill ceiling.

## Application limits

- 1,200 requests/minute per process, then 240/minute per IPv4 address or IPv6
  subnet. Excess requests receive HTTP 429 and Retry-After before JSON parsing.
- Login/registration and recovery have additional 30 attempts/15-minute IP limits.
- At most 20 active API responses and four auth responses per process; additional
  requests receive 503. Password hashing independently permits only four jobs,
  including work still running after a client disconnects.
- Normal JSON bodies are limited to 32 KB; profile bodies to 128 KB. Compressed
  request bodies are rejected. Profile photos are already resized before upload.
- HTTP headers/body receipt timeouts and Postgres statement/idle-transaction
  timeouts bound slow input and database work. These are not a general timeout
  or cancellation mechanism for all JavaScript handlers.
- Provider calls have timeouts. Sports responses, concurrent fetches and failures
  are cached; cache size is bounded. Failures retry after one minute.
- Existing invitation-code registration, pilot organizer allowlist, one-pool
  limit, origin checks, security headers and session protections remain enabled.

## Provider budgets

Postgres migration 2 adds atomic usage reservations. Reserve before each external
attempt; failures count too. Budgets survive app restarts and are shared across
instances. Limits reset by UTC date/month. Old counters are pruned.

| Provider              | Daily | Monthly | Additional limit                                     |
| --------------------- | ----: | ------: | ---------------------------------------------------- |
| Account emails        |    90 |   2,500 | 5 per recipient/day, verification and reset combined |
| College Football Data |   300 |     900 | Only uncached upstream attempts count                |

These are conservative application allowances, not confirmation of purchased
provider quotas. Review the actual CFBD plan before increasing them. Reaching a
budget stops new calls until reset, which can delay emails or fresh game data.
Other apps sharing provider keys/accounts are outside these counters. SMS delivery
remains unconfigured and cannot generate provider charges through this app.

## Render configuration and verified account settings

- Blueprint pins one $7/month web instance and a $6.30/month Postgres instance
  including 1 GB storage: $13.30/month baseline, excluding additional usage/taxes.
  No autoscaling, replicas or automatic disk expansion configured.
- Database external IP allowlist is empty; app/database use the same region.
- Workspace build spend limit was already $0 when checked September 12, 2026.
  Builds stop after included minutes run out; running services keep running.
- Hobby workspace currently includes 5 GB outbound bandwidth, shared with other
  services. Public internet overage is $0.15/GB. The inspected settings do not
  offer a hard total-bill or bandwidth cap.
- Render includes edge DDoS protection and states DDoS bandwidth is not billed.
  This does not mean every abusive request will be classified as an attack.

Before public launch, verify real client IP forwarding behind Render, inspect
bandwidth and error metrics, confirm the Resend plan and remaining CFBD quota,
and retain single-instance deployment. In-memory request limits reset on restart;
multiple replicas need a shared limiter store. For stronger application firewall
rules or bot challenges, a separately configured edge service is a future option;
it has not been installed or enabled here.

During an incident, suspend the web service in Render to stop application work
and investigate. This sacrifices availability and is not a refund or a cap on
charges already incurred. Never delete the database as an emergency response.

Sources: [Render DDoS protection](https://render.com/docs/ddos-protection),
[Render billing FAQ](https://render.com/docs/faq),
[Render bandwidth](https://render.com/docs/outbound-bandwidth).
