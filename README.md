# Kensington Heavy Ballers

A recreation of the public Kensington Heavy Ballers website, with Tuesday/Saturday league archives, a fictional Tuesday Season 2, password-protected admin, persistent D1/R2 storage and a real AI → HTTP MCP → database WhatsApp-style demonstration.

**Source:** `/Users/benjaminjones/repos/heavy-ballers`

**Stack:** React/TypeScript, Next.js App Router conventions via Vinext, Cloudflare Worker/D1/R2, Sites hosting.

- [Admin operating guide](docs/ADMIN.md)
- [Architecture, storage, scoring and spend controls](docs/ARCHITECTURE.md)
- [MCP connection and future WhatsApp adapter](docs/MCP.md)

## Run locally

Use Node 22.13 or newer. Run `npm run install:ci`, configure ignored `.dev.vars` from `.env.example`, run `npm run db:local` to apply D1 migrations, then `npm run dev -- --host 127.0.0.1 --port 3000`. Set `APP_ORIGIN` to that exact origin. Secrets must be configured separately in Sites for production.

`/admin` uses the server-configured password (initial demo password: `heavyballers`). No visitor login is required. This is a separate demonstration site; the original website and real WhatsApp chats are not modified.

## Verify

```sh
npx tsc --noEmit
npm test
npm run build
```

The demo changes shared data. Only an admin may reset it. Reset affects fictional Season 2 and its conversation, preserving historic records and the monthly AI budget ledger.

All source photography and branding were collected from the referenced original public website for this requested recreation. Invented chat content contains no private message history or phone numbers. Historical source records with incomplete scorers or missing shootouts are explicitly flagged.
