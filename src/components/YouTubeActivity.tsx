import { useState, useEffect, useCallback } from 'react';

interface YouTubeVideo {
  id: string;
  title: string;
  description: string;
  url: string;
  thumbnail: string;
  publishedAt: string;
  time: string;
  views?: number;
  likes?: number;
  duration?: string;
  durationSeconds?: number;
}

interface YouTubeChannel {
  id: string;
  name: string;
  handle?: string;
  url: string;
  avatar?: string;
  subscribers?: number;
  totalViews?: number;
  videoCount?: number;
}

interface YouTubeData {
  channel: YouTubeChannel;
  videos: YouTubeVideo[];
  cached: boolean;
  fetchedAt: number;
}

interface Props {
  channelId: string;
  profileUrl: string;
}

const CACHE_KEY_PREFIX = 'youtube-activity-';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour client-side

// Check if time string represents activity within last 7 days (videos are less frequent)
function isRecent(timeStr: string): boolean {
  if (timeStr.endsWith('m')) return true; // minutes
  if (timeStr.endsWith('h')) return true; // hours (within 24h)
  if (timeStr.endsWith('d')) {
    const days = parseInt(timeStr);
    return days <= 7; // Within 7 days
  }
  return false;
}

// Format numbers (e.g., 1200 -> 1.2K)
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export default function YouTubeActivity({ channelId, profileUrl }: Props) {
  const [activity, setActivity] = useState<YouTubeData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [prefetched, setPrefetched] = useState(false);

  const cacheKey = `${CACHE_KEY_PREFIX}${channelId}`;

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as YouTubeData;
        if (Date.now() - parsed.fetchedAt < CACHE_TTL) {
          setActivity(parsed);
        }
      }
    } catch {
      // Silent fail
    }
  }, [cacheKey]);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    setError(false);

    try {
      const res = await fetch(`/.netlify/functions/youtube-activity?channelId=${channelId}`);
      if (!res.ok) throw new Error('API error');

      const data = await res.json() as YouTubeData;
      data.fetchedAt = Date.now();

      setActivity(data);

      // Save to localStorage
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {
        // Silent fail
      }

      // Dispatch event for activity dot update
      const recentCount = data.videos?.filter((v: YouTubeVideo) => isRecent(v.time)).length || 0;
      document.dispatchEvent(new CustomEvent('youtube-activity-loaded', {
        detail: { channelId, recentCount }
      }));
    } catch {
      if (!activity) {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [channelId, cacheKey, activity]);

  // Prefetch on hover/touch
  const handlePrefetch = useCallback(() => {
    if (prefetched) return;
    setPrefetched(true);
    fetchActivity();
  }, [prefetched, fetchActivity]);

  // Listen for parent expand
  useEffect(() => {
    const card = document.querySelector(`.expandable-card[data-channel-id="${channelId}"]`);
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
  }, [channelId, prefetched, handlePrefetch]);

  // Skeleton loader
  if (loading && !activity) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-4 shimmer rounded w-1/3" />
            <div className="h-3 shimmer rounded w-1/2" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="aspect-video shimmer rounded-lg" style={{ animationDelay: '0.1s' }} />
          <div className="aspect-video shimmer rounded-lg" style={{ animationDelay: '0.2s' }} />
          <div className="aspect-video shimmer rounded-lg" style={{ animationDelay: '0.3s' }} />
          <div className="aspect-video shimmer rounded-lg" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    );
  }

  // Error state
  if (error && !activity) {
    return (
      <div className="text-center py-4">
        <p className="text-[#a1a1a1] text-sm mb-2">Couldn't load videos</p>
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

  const { channel, videos } = activity;

  return (
    <div className="space-y-4" onMouseEnter={handlePrefetch} onTouchStart={handlePrefetch}>
      {/* Channel Header */}
      {channel && (
        <div className="flex items-center gap-3 animate-[fadeSlideIn_0.4s_ease-out_forwards]">
          {channel.avatar ? (
            <img
              src={channel.avatar}
              alt={channel.name}
              className="w-10 h-10 rounded-full border border-[#333] object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#ff0000] flex items-center justify-center text-white">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-medium truncate">{channel.name}</h3>
              {channel.handle && (
                <span className="text-[#525252] text-xs">@{channel.handle}</span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-[#a1a1a1]">
              {channel.subscribers !== undefined && (
                <span>{formatNumber(channel.subscribers)} subscribers</span>
              )}
              {channel.videoCount !== undefined && (
                <span className="text-[#525252]">{channel.videoCount} videos</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Videos Grid */}
      {videos && videos.length > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          {videos.slice(0, 4).map((video, i) => {
            const recent = isRecent(video.time);

            return (
              <a
                key={video.id}
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block rounded-lg overflow-hidden bg-[#1a1a1a] border border-transparent hover:border-[#ff0000]/30 transition-all duration-200 hover:scale-[1.02] animate-[fadeSlideIn_0.4s_ease-out_forwards] opacity-0"
                style={{ animationDelay: `${150 + i * 100}ms` }}
              >
                {/* Thumbnail */}
                <div className="relative aspect-video">
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {/* Duration badge */}
                  {video.duration && (
                    <span className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/80 text-white rounded text-[10px] font-medium">
                      {video.duration}
                    </span>
                  )}
                  {/* Play button overlay */}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-10 h-10 rounded-full bg-[#ff0000] flex items-center justify-center">
                      <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </div>
                  {/* NEW badge */}
                  {recent && (
                    <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-blue-500/90 text-white rounded text-[10px] font-medium shadow-lg">
                      NEW
                    </span>
                  )}
                </div>

                {/* Video info */}
                <div className="p-2">
                  <h4 className="text-[#e5e5e5] text-xs font-medium leading-tight line-clamp-2 group-hover:text-white transition-colors">
                    {video.title}
                  </h4>
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-[#525252]">
                    {video.views !== undefined && (
                      <span className="flex items-center gap-0.5">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                        {formatNumber(video.views)}
                      </span>
                    )}
                    {video.likes !== undefined && video.likes > 0 && (
                      <span className="flex items-center gap-0.5">
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                        </svg>
                        {formatNumber(video.likes)}
                      </span>
                    )}
                    <span>{video.time}</span>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <p className="text-[#a1a1a1] text-sm">No recent videos</p>
      )}

      {/* View all link */}
      <a
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-[#a1a1a1] hover:text-white transition-colors group"
      >
        View all on YouTube
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
