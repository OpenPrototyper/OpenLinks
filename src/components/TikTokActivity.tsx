import { useState, useEffect, useCallback } from 'react';

/**
 * TikTok Activity Component
 *
 * LIMITATIONS:
 * - Profile stats come from web scraping (may break if TikTok changes their site)
 * - No way to fetch recent videos without OAuth - videos must be manually configured
 * - Video embeds require user to specify video IDs in their link config
 * - TikTok may block requests from serverless functions (rate limiting)
 * - Embed iframes add significant page weight (~500KB each)
 * - Some TikTok features are region-locked
 */

interface TikTokUser {
  id: string;
  username: string;
  nickname: string;
  avatar: string;
  bio: string;
  verified: boolean;
  followers: number;
  following: number;
  likes: number;
  videoCount: number;
}

interface TikTokVideo {
  id: string;
  caption: string;
  time: string;
  plays: number;
  likes: number;
  comments: number;
  shares: number;
  cover: string;
  duration: number;
  embedHtml?: string;
}

interface TikTokData {
  user: TikTokUser | null;
  videos: TikTokVideo[];
  cached: boolean;
  fetchedAt: number;
  _notice?: string;
}

interface Props {
  username: string;
  profileUrl: string;
  videoIds?: string[]; // Optional: specific video IDs to embed
}

const CACHE_KEY_PREFIX = 'tiktok-activity-';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour client-side

/**
 * Component to render TikTok video preview cards with thumbnails
 * Links out to TikTok instead of embedding (more reliable)
 */
function TikTokVideoEmbed({ video, username, index }: { video: TikTokVideo; username: string; index: number }) {
  const videoUrl = `https://www.tiktok.com/@${username}/video/${video.id}`;
  const [imgError, setImgError] = useState(false);

  // Truncate caption for display
  const shortCaption = video.caption
    ? video.caption.slice(0, 60) + (video.caption.length > 60 ? '...' : '')
    : 'View video';

  return (
    <a
      href={videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-lg overflow-hidden border border-[#262626] animate-[fadeSlideIn_0.4s_ease-out_forwards] opacity-0 flex-shrink-0 snap-start hover:border-[#00f2ea] hover:scale-[1.02] transition-all group"
      style={{ animationDelay: `${300 + index * 100}ms`, width: '140px' }}
    >
      {/* Video thumbnail */}
      <div className="relative h-[180px] bg-[#1a1a1a] overflow-hidden">
        {video.cover && !imgError ? (
          <img
            src={video.cover}
            alt={shortCaption}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={() => setImgError(true)}
          />
        ) : (
          // Fallback gradient if no thumbnail
          <div className="w-full h-full bg-gradient-to-br from-[#00f2ea]/20 via-[#1a1a1a] to-[#fe2c55]/20" />
        )}

        {/* Overlay gradient for text readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Play button */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-[#fe2c55]/90 flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-[#fe2c55] transition-all">
            <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>

        {/* TikTok logo */}
        <div className="absolute top-1.5 right-1.5 opacity-70">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-white drop-shadow">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
          </svg>
        </div>
      </div>

      {/* Caption */}
      <div className="p-2 bg-[#141414]">
        <p className="text-[#a1a1a1] text-[10px] leading-tight line-clamp-2">
          {shortCaption}
        </p>
      </div>
    </a>
  );
}

// Format large numbers (e.g., 1200 -> 1.2K, 1200000 -> 1.2M)
function formatNumber(num: number): string {
  if (num >= 1000000000) return `${(num / 1000000000).toFixed(1)}B`;
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export default function TikTokActivity({ username, profileUrl, videoIds = [] }: Props) {
  const [activity, setActivity] = useState<TikTokData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [prefetched, setPrefetched] = useState(false);

  const cacheKey = `${CACHE_KEY_PREFIX}${username}`;

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as TikTokData;
        if (Date.now() - parsed.fetchedAt < CACHE_TTL) {
          setActivity(parsed);
        }
      }
    } catch {
      // Silent fail - localStorage might be disabled
    }
  }, [cacheKey]);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      const videoIdsParam = videoIds.length > 0 ? `&videoIds=${videoIds.join(',')}` : '';
      const res = await fetch(`/.netlify/functions/tiktok-activity?username=${username}${videoIdsParam}`);
      if (!res.ok) throw new Error('API error');

      const data = await res.json() as TikTokData;
      data.fetchedAt = Date.now();

      setActivity(data);

      // Save to localStorage
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {
        // Silent fail
      }

      // Dispatch event for activity dot update
      // For TikTok, we don't have "recent" activity without OAuth, so just show video count
      document.dispatchEvent(new CustomEvent('tiktok-activity-loaded', {
        detail: { username, hasData: !!data.user }
      }));
    } catch {
      if (!activity) {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [username, videoIds, cacheKey, activity]);

  // Prefetch on hover/touch
  const handlePrefetch = useCallback(() => {
    if (prefetched) return;
    setPrefetched(true);
    fetchActivity();
  }, [prefetched, fetchActivity]);

  // Listen for parent expand to trigger prefetch
  useEffect(() => {
    const card = document.querySelector(`.expandable-card[data-tiktok-username="${username}"]`);
    if (!card) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-expanded') {
          const isExpanded = card.getAttribute('data-expanded') === 'true';
          if (isExpanded && !prefetched) {
            handlePrefetch();
          }
        }
      });
    });

    observer.observe(card, { attributes: true });
    return () => observer.disconnect();
  }, [username, prefetched, handlePrefetch]);

  // Skeleton loader
  if (loading && !activity) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-4 shimmer rounded w-1/3" />
            <div className="h-3 shimmer rounded w-1/2" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="h-16 shimmer rounded-lg" />
          <div className="h-16 shimmer rounded-lg" style={{ animationDelay: '0.1s' }} />
          <div className="h-16 shimmer rounded-lg" style={{ animationDelay: '0.2s' }} />
        </div>
      </div>
    );
  }

  // Error state (no cached data)
  if (error && !activity) {
    return (
      <div className="text-center py-4">
        <p className="text-[#a1a1a1] text-sm mb-2">Couldn't load TikTok data</p>
        <p className="text-[#525252] text-xs mb-3">
          TikTok may be blocking requests or their site structure changed
        </p>
        <button
          onClick={fetchActivity}
          className="text-sm text-white underline hover:no-underline"
        >
          Retry
        </button>
      </div>
    );
  }

  // No data yet
  if (!activity) {
    return null;
  }

  // Warning if scraping failed
  const scrapingFailed = !activity.user && activity._notice;

  return (
    <div className="space-y-4" onMouseEnter={handlePrefetch} onTouchStart={handlePrefetch}>
      {/* Scraping warning */}
      {scrapingFailed && (
        <div className="px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-yellow-400 text-xs">
            Could not fetch TikTok profile data. This may be due to rate limiting or site changes.
          </p>
        </div>
      )}

      {/* User Header */}
      {activity.user && (
        <div className="flex items-center gap-3 animate-[fadeSlideIn_0.4s_ease-out_forwards]">
          <img
            src={activity.user.avatar}
            alt={activity.user.nickname}
            className="w-12 h-12 rounded-full border-2 border-[#333] object-cover"
            onError={(e) => {
              // Fallback if avatar fails to load (CORS issues common with TikTok)
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-medium truncate">{activity.user.nickname}</h3>
              {activity.user.verified && (
                <svg className="w-4 h-4 text-[#20d5ec] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              )}
            </div>
            <p className="text-[#a1a1a1] text-sm">@{activity.user.username}</p>
            {activity.user.bio && (
              <p className="text-[#525252] text-xs truncate mt-0.5">{activity.user.bio}</p>
            )}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      {activity.user && (
        <div className="grid grid-cols-3 gap-2 animate-[fadeSlideIn_0.4s_ease-out_forwards]" style={{ animationDelay: '100ms' }}>
          <div className="bg-[#1a1a1a] rounded-lg p-3 text-center border border-[#262626] hover:border-[#00f2ea] transition-colors">
            <p className="text-white font-semibold text-lg">{formatNumber(activity.user.followers)}</p>
            <p className="text-[#525252] text-xs">Followers</p>
          </div>
          <div className="bg-[#1a1a1a] rounded-lg p-3 text-center border border-[#262626] hover:border-[#fe2c55] transition-colors">
            <p className="text-white font-semibold text-lg">{formatNumber(activity.user.likes)}</p>
            <p className="text-[#525252] text-xs">Likes</p>
          </div>
          <div className="bg-[#1a1a1a] rounded-lg p-3 text-center border border-[#262626] hover:border-[#00f2ea] transition-colors">
            <p className="text-white font-semibold text-lg">{formatNumber(activity.user.videoCount)}</p>
            <p className="text-[#525252] text-xs">Videos</p>
          </div>
        </div>
      )}

      {/* Video Embeds (if configured) - horizontal scroll */}
      {activity.videos && activity.videos.length > 0 && (
        <div className="animate-[fadeSlideIn_0.4s_ease-out_forwards]" style={{ animationDelay: '200ms' }}>
          <p className="text-[#a1a1a1] text-xs font-medium uppercase tracking-wide mb-2">Featured Videos</p>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[#333] [&::-webkit-scrollbar-thumb]:rounded-full">
            {activity.videos.map((video, i) => (
              <TikTokVideoEmbed
                key={video.id}
                video={video}
                username={username}
                index={i}
              />
            ))}
          </div>
        </div>
      )}

      {/* No videos configured notice */}
      {(!activity.videos || activity.videos.length === 0) && activity.user && (
        <div className="text-center py-2 opacity-0 animate-[fadeSlideIn_0.4s_ease-out_forwards]" style={{ animationDelay: '200ms' }}>
          <p className="text-[#525252] text-xs">
            {/* LIMITATION: Cannot fetch videos without OAuth */}
            No featured videos configured
          </p>
        </div>
      )}

      {/* View all link */}
      <a
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-[#a1a1a1] hover:text-white transition-colors group"
      >
        View all on TikTok
        <svg
          className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="7" y1="17" x2="17" y2="7" />
          <polyline points="7 7 17 7 17 17" />
        </svg>
      </a>

      {/* Stale indicator */}
      {loading && activity && (
        <p className="text-xs text-[#525252]">Updating...</p>
      )}
    </div>
  );
}
