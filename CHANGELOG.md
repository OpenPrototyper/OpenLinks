# Changelog

All notable changes to this project will be documented in this file.

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
