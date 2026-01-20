# OpenLinks

![OpenLinks Banner](public/readme-banner.png)

A minimal, self-hosted Linktree alternative with PostHog analytics.

**Live:** [links.openprototype.dev](https://links.openprototype.dev)

## Features

- **Static site** - No database, no server-side code
- **Fast** - Built with Astro, minimal JavaScript
- **Live Activity Feeds** - Expandable cards with real-time platform data
  - **GitHub** - Contribution graphs, recent activity, streak tracking
  - **GitHub Org** - Popular repos, organization activity
  - **Discord** - Online members, voice channels, current activities
  - **LinkedIn** - Quick actions (view profile, message, connect)
  - **Substack** - Recent posts with likes, comments, restacks
  - **Reddit** - User activity, karma stats, posts and comments
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

### Activity Feeds

| Feed | Description | Required Fields |
|------|-------------|-----------------|
| `github` | Contribution graph, recent activity, streak | URL with GitHub username |
| `github-org` | Popular repos, org activity | URL with GitHub org name |
| `discord` | Online members, voice channels, activities | `serverId` (Discord server ID) |
| `linkedin` | Quick actions (profile, message, connect) | `linkedinUsername` |
| `substack` | Recent posts with engagement stats | `publication` (subdomain name) |
| `reddit` | User activity, karma stats, posts/comments | `redditUsername` (without u/) |

**Discord example:**
```md
---
name: "Discord"
url: "https://discord.gg/your-invite"
icon: "discord"
order: 5
feed: "discord"
serverId: "1234567890123456789"
---
```

To get your Discord server ID: Enable Developer Mode in Discord settings, then right-click your server icon and select "Copy Server ID". You must also enable the Server Widget in Server Settings > Widget.

**LinkedIn example:**
```md
---
name: "LinkedIn"
url: "https://www.linkedin.com/in/yourname/"
icon: "linkedin"
order: 3
feed: "linkedin"
linkedinUsername: "yourname"
---
```

The LinkedIn username is the part after `/in/` in your profile URL.

**Substack example:**
```md
---
name: "Substack"
url: "https://yourname.substack.com"
icon: "substack"
order: 6
feed: "substack"
publication: "yourname"
---
```

The publication is the subdomain of your Substack (e.g., `yourname` for `yourname.substack.com`). No API token required.

**Reddit example:**
```md
---
name: "Reddit"
url: "https://www.reddit.com/user/yourname/"
icon: "reddit"
order: 7
feed: "reddit"
redditUsername: "yourname"
---
```

The Reddit username is your username without the `u/` prefix. No API token required - uses public Reddit JSON API.

## Deployment

Build command: `npm run build`
Output directory: `dist`

**Note:** Activity feeds require Netlify Functions. Deploy to Netlify for full functionality, or adapt the functions in `netlify/functions/` for other serverless platforms.

## License

MIT
