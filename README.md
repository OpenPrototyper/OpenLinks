# OpenLinks

![OpenLinks Banner](public/readme-banner.png)

A minimal, self-hosted Linktree alternative with PostHog analytics.

**Live:** [links.openprototype.dev](https://links.openprototype.dev)

## Features

- **Static site** - No database, no server-side code
- **Fast** - Built with Astro, minimal JavaScript
- **GitHub Activity Preview** - Expandable cards showing live contribution graphs and recent activity
- **Analytics** - PostHog integration for tracking
- **Privacy-first** - Cookie consent banner, GDPR compliant
- **Brand colors** - Each link has platform-specific hover colors
- **Share button** - Copy URL to clipboard
- **Dark theme** - Clean, modern design

## Stack

- [Astro](https://astro.build/) - Static site framework
- [React](https://react.dev/) - Interactive components
- [Tailwind CSS](https://tailwindcss.com/) - Styling
- [Netlify Functions](https://www.netlify.com/products/functions/) - Serverless API
- [PostHog](https://posthog.com/) - Analytics

## Quick Start

```bash
npm install
npm run dev
```

## Adding Links

Create a markdown file in `src/content/links/`:

```md
---
name: "GitHub"
url: "https://github.com/username"
icon: "github"
order: 1
feed: "github"  # Optional: enables activity preview
---
```

**Available icons:** `github`, `twitter`, `linkedin`, `discord`, `youtube`, `tiktok`, `reddit`, `substack`, `email`, `portfolio`

**Activity feeds:** Currently supports `github` - shows contribution graph and recent activity

## Deployment

Build command: `npm run build`
Output directory: `dist`

**Note:** The GitHub activity feature requires Netlify Functions. Deploy to Netlify for full functionality, or adapt the `netlify/functions/github-activity.ts` for other serverless platforms.

## License

MIT
