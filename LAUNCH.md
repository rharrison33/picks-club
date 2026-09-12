# Launch plan — September 2026

Target pilot: Saturday, September 19. Target public release: September 26.
These are targets, not scheduled deployments. No service accounts or billing have been created.

## Pilot scope

One invite-only pool initially, with one or two organizers. Players confirm they are at least 21, verify email, join by invitation, and save their own winner picks before the published kickoff of each game.

Organizers choose $25, $50, $100, or a custom entry from $10 through $2,500. They set positive whole-number prize percentages totaling 100, for up to ten places. Default is winner-takes-all. There is no platform fee. Publishing snapshots and locks the lineup, entry amount, and prize percentages.

Paid publication is deliberately blocked in production. Local entry configuration is for rehearsal, not authorization to collect money. Organizers can save an HTTPS Venmo profile link. The external link does not confirm payment or bypass provider approval. No payment status, money custody, payout, refund, or checkout integration is implemented.

## Implemented and locally checked

- Salted password hashes, expiring HttpOnly sessions, logout and server permission checks.
- Mandatory recorded 21+ acknowledgment; this is self-attestation, not age verification.
- Resend email verification and single-use password recovery; reset revokes sessions.
- Optional pilot access code, organizer-email allowlist, and maximum pool count.
- Picks persist immediately; late edits rejected using server time and immutable published kickoff.
- Other players' picks hidden in the API until that game's deadline.
- Final scores from CFBD, cached results during outages, correction-aware standings.
- One point per outright winner; tied games score zero; unresolved games remain pending.
- Tied players share the combined prize percentages of the places they occupy.
- Prize shares are projections for members with saved picks, not evidence of paid entry.
- Mobile/desktop layout, per-pick confirmation, previous/next Saturday navigation.
- Postgres migration, rollback-safe SQLite importer, and pg_dump backup command.
- Docker image definition, Render blueprint, and GitHub check workflow.

Local tests use simulated email delivery; no real recovery or verification emails have been sent.
The Docker image and hosted configuration still need an actual deployment rehearsal.

## Blocking a real-money launch

Before inviting players to pay, obtain appropriate review of the actual contest structure and player jurisdictions. Supporting all state names in software does not establish legal eligibility. Determine required age/identity/location checks and implement the resulting eligibility rules before enabling paid contests.

Payment provider acceptance is a separate requirement:

- [PayPal](https://securepayments.paypal.com/us/cshelp/article/what-gambling-activities-does-paypal-prohibit-help391) requires approval for entry-fee/prize activities, including skill games.
- [Venmo](https://venmo.com/legal/us-helpful-information) requires prior approval for this category and permitted jurisdictions.
- [Cash App](https://cash.app/us/en/legal/acceptable-use-policy) limits gambling activity to approved legal merchants.

Do not substitute personal payment links or mislabeled transfers. An age checkbox is not a substitute for provider approval or jurisdiction review.

After approval: implement verified payment webhooks, idempotency, paid-entry eligibility, reconciliation, refund/cancellation rules, payout handling, and disputed-payment support. Never trust a browser redirect as proof of payment.

## Infrastructure setup

Proposed pilot: one Render paid web service with a managed Postgres database, plus Resend and a domain you own. Render offers a service URL for the pilot; email requires a verified sending domain. Review current costs before purchasing: [Render pricing](https://render.com/pricing), [managed Postgres](https://render.com/docs/postgresql-creating-connecting), [Resend documentation](https://resend.com/docs/introduction).

1. Create the hosting and email accounts and register the preferred domain, picks-club.com, if available at purchase time. No accounts, subscriptions, or domain have been purchased by this work.
2. Verify your sending domain in Resend and obtain a restricted sending key.
3. Push the reviewed repository changes, then create a Render Blueprint from render.yaml.
4. Set APP_ORIGIN to the exact HTTPS site origin, EMAIL_FROM to a verified sender, RESEND_API_KEY, CFBD_API_KEY, and PILOT_ORGANIZER_EMAILS to your organizer email(s).
5. Use the Blueprint-provided DATABASE_URL to connect to managed Postgres. Keep external database access restricted.
6. The blueprint generates REGISTRATION_CODE and limits the pilot to one pool. Share codes privately. PILOT_POOL_LIMIT can later increase.
7. Check the platform's proxy behavior before retaining TRUST_PROXY_HOPS=1; never trust arbitrary forwarded IP headers.
8. Confirm /api/health, secure cookies, registration, email verification, password recovery, and login on the hosted HTTPS URL.
9. Take a backup and restore it into a separate test instance before inviting participants.

The deployment uses shared Postgres storage. Authentication rate limiting remains process-local; add shared rate limiting before horizontal scaling.

## Rehearsal and deadlines

By September 15:

- Hosting, domain, email delivery, and actual eligible pilot jurisdictions decided.
- Provider approval and paid-contest path confirmed; otherwise September 19 cannot be a paid launch.
- Contest rules agreed: late entries, canceled/postponed games, ties, prize allocation, rounding, refunds, disputes, and finalization deadline.

By September 17:

- End-to-end hosted rehearsal with organizer, second organizer, player, and nonmember accounts.
- Check rejected underage acknowledgment, expired/reused recovery links, cross-pool access, kickoff boundary, data-feed failure, and duplicate requests.
- Rehearse backup restore, restart persistence, rollback, and support contact.
- Check real iPhone Safari and Android Chrome, not just resized desktop windows.
- Verify CFBD quota, permitted data usage, schedules, and final-result availability.

September 18:

- Freeze the pilot release. Publish the reviewed lineup and rules.
- Confirm every invited player can sign in and understands when each pick locks.
- Enable uptime/error alerts and establish who watches them. Export an off-host backup.

September 19–20:

- Monitor saved-pick failures and delayed results.
- Do not manually alter locked picks.
- Unresolved or postponed games stay pending; this build has no adjudication UI.
- Do not finalize prizes until results and payment eligibility are reconciled.

September 21–25:

- Review pilot feedback; fix all lost-pick, lock, scoring, access, and payment defects.
- Complete privacy notice, participant terms, data retention/deletion process, support channel, and approved eligibility rules.
- Load-test expected traffic and verify off-host backup/restore again.

September 26 public launch gate:
Only expand when the pilot completed cleanly, payments/eligibility are approved and tested, operations are staffed, and no critical defects remain. Remove pilot restrictions deliberately, not automatically on the date.

## Backup and rollback

Run npm run backup from server (or npm run backup -- /private/path/new-file.dump), with DATABASE_URL configured.
It creates a consistent Postgres dump and checks the archive directory. A same-disk copy is not disaster recovery: copy backups to access-controlled off-host storage and automate the schedule before launch.

Restore rehearsal: use pg_restore into a separate empty database, point a test instance at it, and verify memberships, published weeks, and picks. Never overwrite a running production database. See DATABASE.md. Document which picks could be lost since the backup.

Code rollback: redeploy the previous reviewed revision while keeping the disk. Back up before migrations. Do not roll back schema/data destructively without a tested restore plan.

## Remaining work, explicitly not launch-ready

- Real hosting accounts, domain, email credentials, deployed smoke test.
- Approved paid-contest eligibility and payment integration.
- Age/location verification if required by the approved model.
- Cancellation/postponement adjudication and refund/finalization rules.
- Off-host backup automation, alert delivery, support ownership.
- Real-device testing, privacy/terms review, public-release load testing.

## Favorite teams and SMS

Registration and profile editing use 1–5 favorite teams from the CFBD team catalog. State is no longer requested or used for recommendations. Older accounts start with no favorites and can add them in My profile; old database state values are retained only for migration compatibility and are not exposed in the account/member API.

Preferred domain: picks-club.com. It has not been purchased or connected. Use its actual HTTPS origin after ownership/DNS setup; do not send links to an unowned domain.

Saturday SMS:

- Users can save an optional phone number and explicit consent, and turn it off in their profile.
- Preferences are pending until a provider is connected and phone ownership is verified.
- A background poll runs every five minutes, independent of open browsers, for published Saturdays in each pool's timezone.
- Completion alerts are deduplicated per player/pool/week/game. Late results arriving after the pool's Saturday are not texted.
- Links open the relevant pool, week, and standings after login. No authentication tokens appear in SMS links.
- The transport interface is in server/sms.ts. An approved provider must implement verification and sending, authenticate its STOP webhook, call stopSms, handle HELP, and be supplied to both route setup and the background worker.
- No transport is connected, so no real SMS is sent. Twilio is not a suitable default: its US/Canada policy prohibits gambling-related traffic including sports picks. See https://www.twilio.com/docs/api/errors/30461.
- Outbox statuses sending/unknown require provider reconciliation; ambiguous timeouts are not automatically retried. Pending alerts expire after an hour or Saturday ends.
- Carrier/provider registration, accepted use case, verified domain, real-device opt-in/STOP testing, and operational support must be completed before enabling delivery.
- Phone numbers and consent records are private database data and are not included in pool member lists.
