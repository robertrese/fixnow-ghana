# Optional citizen accounts

Anonymous reporting and reference-plus-secret tracking remain available without an account.

## Phone OTP owner setup

Set `OTP_PROVIDER_WEBHOOK_URL` to a private HTTPS endpoint operated by the selected SMS provider adapter. Set `OTP_PROVIDER_AUTH_TOKEN` and `OTP_HASH_SECRET` through the production secret manager. The webhook receives a short-lived code and privacy-safe message; FixNow never logs the code.

The adapter must return a 2xx response only after the provider accepts the message. Delivery or handset receipt must not be inferred from that response. Configure provider-side sender identity, Ghana coverage, spend limits, delivery monitoring and abuse alerts before enabling accounts.

FixNow enforces a five-minute default expiry, one-time use, attempt limits, resend cooldown, and phone/device/IP request limits. Production values are documented in `.env.example`.

## Google and Apple

The interface reports Google and Apple sign-in as unavailable. Adding a client or service ID alone does not enable them. Owner work must add server-side ID-token verification, nonce/state validation, redirect/app-domain configuration, key rotation, account-linking rules, and provider review before changing their `enabled` state.

## Data controls

Citizen sessions are hashed, individually revocable and short lived. Accounts support masked profiles, optional display name/avatar URL, password creation and OTP reset, report linking, safe JSON export, logout invalidation and account deletion. Account deletion removes profile, consent and report links while retaining reports as identity-detached public-service records.

Terms and privacy versions plus acceptance timestamps are recorded only for account creation/current-policy acceptance. Optional processing consent must remain separate.
