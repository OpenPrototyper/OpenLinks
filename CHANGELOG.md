# Changelog

All notable changes to this project will be documented in this file.

## [1.5.0] - 2026-01-19

### Added
- **Substack Activity Feed** - Live newsletter posts with engagement stats
  - Recent posts with title, subtitle, and publish date
  - Engagement metrics: likes, comments, restacks
  - Publication header with logo and author name
  - "NEW" badge for posts within last 48 hours
  - Peek preview showing latest post title when collapsed
  - No API token required - uses public RSS feed

### Changed
- Content schema now supports `substack` feed type with `publication` field
- ExpandableCard supports five feed types: `github`, `github-org`, `discord`, `linkedin`, `substack`

## [1.4.0] - 2026-01-19

### Added
- **LinkedIn Quick Actions** - Expandable card with action shortcuts
  - View Profile link
  - Send Message link (opens LinkedIn compose, requires connection)
  - Connect link (opens profile for connection request)
  - Username displayed in card header with @ prefix
  - Peek preview showing action icons when collapsed

### Changed
- Content schema now supports `linkedin` feed type with `linkedinUsername` field
- ExpandableCard supports four feed types: `github`, `github-org`, `discord`, `linkedin`

## [1.3.0] - 2026-01-19

### Added
- **Discord Server Activity Feed** - Live server stats via Discord Widget API
  - Online member count with live indicator
  - Voice channel activity with user counts
  - Member avatars with status indicators (online/idle/dnd)
  - Currently playing activities display
  - Join Server button with invite link
  - Graceful handling when widget is disabled
- **GitHub Organization Activity Feed** - Activity preview for GitHub orgs
  - Popular repositories with star counts
  - Recent org activity feed
  - Peek preview showing top repos when collapsed

### Changed
- Content schema now supports `discord` feed type with `serverId` field
- ExpandableCard supports three feed types: `github`, `github-org`, `discord`

## [1.2.0] - 2026-01-19

### Added
- **GitHub Activity Preview** - Expandable dropdown on link cards showing live GitHub activity
  - Contribution graph with interactive tooltips
  - Recent activity feed (commits, PRs, issues, stars, forks)
  - Contribution streak indicator with fire emoji
  - "NEW" badges for activity within last 24 hours
  - Blue notification dot showing recent activity count
- **Netlify Functions** - Serverless API endpoint for GitHub data
  - Fetches from GitHub Events API and contribution graph
  - 5-minute server-side caching to respect rate limits
  - 1-hour client-side localStorage caching
- **Micro-interactions & Animations**
  - Haptic-style bounce on expand button click
  - Staggered fade-in for activity items
  - Shimmer loading skeleton effect
  - Glow pulse animation when card is expanded
  - Peek preview of contribution graph when collapsed
- **React Integration** - Added `@astrojs/react` for interactive components

### Changed
- Link cards with `feed: "github"` now show expandable activity preview
- Content schema updated to support optional `feed` field

## [1.1.0] - 2026-01-19

### Added
- Cookie consent banner with GDPR compliance
  - Slides up smoothly on first visit
  - Confetti celebration animation on accept
  - Responsive design for mobile and desktop
- Privacy-first analytics: PostHog starts in cookieless mode by default
- Returning visitor tracking enabled only after consent

### Changed
- PostHog now uses `persistence: 'memory'` until user accepts cookies
- Analytics data is still collected anonymously without cookies, but visitor identity doesn't persist across sessions until consent is given

## [1.0.0] - 2026-01-18

### Added
- Initial release
- Static link hub with Astro
- PostHog analytics integration
- Platform-specific hover colors
- Share button with clipboard copy
- Dark theme design
