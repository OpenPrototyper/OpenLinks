# Changelog

All notable changes to this project will be documented in this file.

## [1.9.0] - 2026-01-20

### Added
- **Instagram Quick Actions** - Expandable card with action shortcuts
  - View Profile link
  - Send Message link (opens Instagram DM via ig.me)
  - Follow link (opens profile page)
  - Username displayed in card header with @ prefix
  - Peek preview showing action icons when collapsed
  - Instagram gradient brand color (#E4405F)

### Fixed
- **Reddit Activity Feed** - Fixed production API failures
  - Changed User-Agent from bot-style to browser-style to avoid Reddit blocking
  - Reddit blocks requests from data center IPs with bot User-Agents
  - Feed now works in production on Netlify
- **GitHub Activity Feed** - Fixed starred/forked repo links pointing to wrong owner
  - Starred repos now link to the actual repo (e.g., `github.com/facebook/react`)
  - Previously incorrectly linked to user's account (e.g., `github.com/yourname/react`)

### Changed
- Content schema now supports `instagram` feed type with `instagramUsername` field
- ExpandableCard supports nine feed types: `github`, `github-org`, `discord`, `linkedin`, `substack`, `reddit`, `tiktok`, `youtube`, `instagram`

### Technical Notes
- Instagram blocks all unauthenticated server-side requests (profile scraping and oEmbed API)
- Quick actions approach chosen for reliability - no external API dependencies
- Full Instagram data would require Graph API with OAuth (business account required)

## [1.8.0] - 2026-01-19

### Added
- **YouTube Activity Feed** - Recent videos with thumbnails and channel stats
  - 2x2 video grid with clickable thumbnails
  - Video duration badges on thumbnails
  - View count and like count per video (when available via Invidious API)
  - Channel header with avatar, name, and @handle
  - Subscriber count and total video count
  - "NEW" badge for videos uploaded within last 7 days
  - Play button overlay on hover
  - Peek preview showing latest video title when collapsed
  - No API key required - uses YouTube RSS feed as primary data source
  - Optional enhanced data via Invidious API (views, likes, duration, subscribers)

### Changed
- Content schema now supports `youtube` feed type with `youtubeChannelId` and `youtubeHandle` fields
- ExpandableCard supports eight feed types: `github`, `github-org`, `discord`, `linkedin`, `substack`, `reddit`, `tiktok`, `youtube`
- Updated platform-feed-patterns.md documentation

### Technical Notes
- YouTube RSS feed provides: video titles, thumbnails, descriptions, publish dates (last 15 videos)
- Invidious API (when available) adds: view counts, like counts, video duration, subscriber count
- Public Invidious instances currently have APIs disabled; enhanced data requires self-hosted instance or future API availability

## [1.7.0] - 2026-01-19

### Added
- **TikTok Activity Feed** - Profile stats and video previews
  - Profile header with avatar, nickname, and verified badge
  - Stats grid showing followers, likes, and video count
  - Featured videos with thumbnail previews (click to open on TikTok)
  - Horizontal scroll for multiple video thumbnails
  - Peek preview showing follower/like counts when collapsed
  - No OAuth required - uses web scraping for profile data
  - Video thumbnails via TikTok oEmbed API

### Changed
- Content schema now supports `tiktok` feed type with `tiktokUsername` and `tiktokVideoIds` fields
- ExpandableCard supports seven feed types: `github`, `github-org`, `discord`, `linkedin`, `substack`, `reddit`, `tiktok`

### Known Limitations
- Profile data uses web scraping which may break if TikTok changes their site structure
- Videos must be manually configured via `tiktokVideoIds` (no auto-discovery without OAuth)
- Thumbnail URLs expire periodically and refresh on next fetch

## [1.6.0] - 2026-01-19

### Added
- **Reddit Activity Feed** - Live user activity with karma and posts/comments
  - Profile header with avatar, username, and badges (Premium, Verified)
  - Karma breakdown showing post karma vs comment karma
  - Account age display
  - Recent activity feed showing posts and comments
  - Posts shown with cyan `+` icon, comments with blue `💬` icon
  - Score display with star icon for high-score items (100+)
  - Distinguished badges for admin/moderator posts
  - "NEW" badge for activity within last 24 hours
  - Peek preview showing username and karma when collapsed
  - No API token required - uses public Reddit JSON API

### Changed
- Content schema now supports `reddit` feed type with `redditUsername` field
- ExpandableCard supports six feed types: `github`, `github-org`, `discord`, `linkedin`, `substack`, `reddit`

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
