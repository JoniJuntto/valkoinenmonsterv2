# Rybbit Analytics

Site ID: `766a22932609`

## Environment variables

Add to server `.env` (optional but required for server-side events):

```env
RYBBIT_API_KEY=rb_your_api_key_here
RYBBIT_SITE_ID=766a22932609
```

Generate the API key in Rybbit: **Settings → Account → API Keys**.

## Dashboard settings

In your Rybbit site settings, enable:

| Setting | Value |
|---------|-------|
| Track SPA Navigation | On |
| Track URL Parameters | On |
| Track Outbound Links | On |
| Track Web Vitals | On |
| Capture Errors | On |
| Session Replay | On |
| Track Button Clicks | On |
| Track Form Interactions | On |
| Track Copy | Off |

## Funnels

Create these funnels in the Rybbit dashboard:

1. **Activation:** pageview `/` → `game.loaded` → `game.click.milestone` (milestone = 1) → `game.purchase.producer`
2. **Prestige loop:** `game.prestige.ready` → `game.prestige.confirmed` → `game.purchase.golden_upgrade`
3. **Registration:** `nav.claim_progress` → pageview `/login` → `auth.sign_up.succeeded` → `auth.account_linked`
4. **Frenzy engagement:** `game.click.milestone` → `game.frenzy.started` → `game.frenzy.ended`

## Goals

| Goal | Trigger |
|------|---------|
| First click | `game.click.milestone` where milestone = 1 |
| First producer | `game.purchase.producer` |
| First prestige | `game.prestige.completed` |
| Account created | `auth.sign_up.succeeded` |
| Progress claimed | `auth.account_linked` |
| Golden upgrade | `game.purchase.golden_upgrade` |

## Verification checklist

After deploy:

1. Network tab shows requests to `app.rybbit.io`
2. Live event stream shows `game.click.milestone` at clicks 1, 10, 100…
3. Navigating `/` ↔ `/login` produces one pageview per navigation (SPA tracking)
4. Sign up from anonymous session attributes pre-login events to the user ID
5. Server events `auth.account_linked` and `game.prestige.completed` appear when `RYBBIT_API_KEY` is set
6. Session replay masks login form inputs (`.rr-mask` class)

## Privacy

- User identification uses internal user ID only (no email or name)
- Session replay masks all inputs by default
- Auth form fields use the `rr-mask` CSS class
