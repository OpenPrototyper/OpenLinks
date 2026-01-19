# Changelog

All notable changes to this project will be documented in this file.

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
