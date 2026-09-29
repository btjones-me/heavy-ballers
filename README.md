# Kensington Heavy Ballers

A recreation of the public Kensington Heavy Ballers website, with Tuesday/Saturday league archives, a fictional Tuesday Season 2, password-protected admin, persistent D1/R2 storage and a real AI → HTTP MCP → database WhatsApp-style demonstration.

**Source:** `/Users/benjaminjones/repos/heavy-ballers`

**Public demo:** https://heavy-ballers-demo.btjones-me.chatgpt.site

**Admin:** https://heavy-ballers-demo.btjones-me.chatgpt.site/admin — initial password `heavyballers`.

**Stack:** React/TypeScript, Next.js App Router conventions via Vinext, Cloudflare Worker/D1/R2, Sites hosting.

- [Admin operating guide](docs/ADMIN.md)
- [Architecture, storage, scoring and spend controls](docs/ARCHITECTURE.md)
- [MCP connection and future WhatsApp adapter](docs/MCP.md)
- [Verification record](docs/VERIFICATION.md)

## Run locally

Use Node 22.13 or newer. Run `npm run install:ci`, configure ignored `.dev.vars` from `.env.example`, run `npm run db:local` to apply D1 migrations, then `npm run dev -- --host 127.0.0.1 --port 3000`. Set `APP_ORIGIN` to that exact origin. Secrets must be configured separately in Sites for production.

`/admin` uses the server-configured password (initial demo password: `heavyballers`). No visitor login is required. This is a separate demonstration site; the original website and real WhatsApp chats are not modified.

## Verify

```sh
npx tsc --noEmit
npm test
npm run build
```

Each browser tab receives a private fictional season, conversation and activity log, retained across refreshes for up to 24 hours. Reset demo in the drawer starts a fresh private season without changing anyone else’s results. The monthly £5 AI allowance remains shared across the site and cannot be reset by visitors.

All source photography and branding were collected from the referenced original public website for this requested recreation. Invented chat content contains no private message history or phone numbers. Historical source records with incomplete scorers or missing shootouts are explicitly flagged.
