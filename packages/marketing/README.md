# @parallax/marketing

Marketing site for Parallax.

## Local development

```bash
pnpm --filter @parallax/marketing dev
```

## Build

```bash
pnpm --filter @parallax/marketing build
```

Documentation pages pull markdown from the repository [/docs](/Users/maxi/projects/parallax/docs) directory through the sync script at [sync-docs.mjs](/Users/maxi/projects/parallax/packages/marketing/scripts/sync-docs.mjs).

SPA fallback files are included for common hosts:

- [public/_redirects](/Users/maxi/projects/parallax/packages/marketing/public/_redirects) for Netlify-style static hosting
- [vercel.json](/Users/maxi/projects/parallax/packages/marketing/vercel.json) for Vercel
