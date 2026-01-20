import { useState, useEffect, useCallback } from 'react';

interface SubstackPost {
  title: string;
  subtitle: string;
  slug: string;
  url: string;
  time: string;
  publishedAt: string;
  likes: number;
  comments: number;
  restacks: number;
}

interface SubstackPublication {
  name: string;
  description: string;
  authorName: string;
  logoUrl: string;
  subscriberCount: number | null;
}

interface SubstackData {
  publication: SubstackPublication;
  posts: SubstackPost[];
  cached: boolean;
  fetchedAt: number;
}

interface Props {
  publication: string;
  profileUrl: string;
}

const CACHE_KEY_PREFIX = 'substack-activity-';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour client-side

// Check if time string represents activity within last 48h (posts are less frequent than commits)
function isRecent(timeStr: string): boolean {
  if (timeStr.endsWith('m')) return true; // minutes
  if (timeStr.endsWith('h')) return true; // hours (within 24h)
  if (timeStr.endsWith('d')) {
    const days = parseInt(timeStr);
    return days <= 2; // Within 2 days
  }
  return false;
}

// Format numbers (e.g., 1200 -> 1.2k)
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}m`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

export default function SubstackActivity({ publication, profileUrl }: Props) {
  const [activity, setActivity] = useState<SubstackData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [prefetched, setPrefetched] = useState(false);

  const cacheKey = `${CACHE_KEY_PREFIX}${publication}`;

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as SubstackData;
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
      const res = await fetch(`/.netlify/functions/substack-activity?publication=${publication}`);
      if (!res.ok) throw new Error('API error');

      const data = await res.json() as SubstackData;
      data.fetchedAt = Date.now();

      setActivity(data);

      // Save to localStorage
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {
        // Silent fail
      }

      // Dispatch event for activity dot update
      const recentCount = data.posts?.filter((p: SubstackPost) => isRecent(p.time)).length || 0;
      document.dispatchEvent(new CustomEvent('substack-activity-loaded', {
        detail: { publication, recentCount }
      }));
    } catch {
      if (!activity) {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [publication, cacheKey, activity]);

  // Prefetch on hover/touch
  const handlePrefetch = useCallback(() => {
    if (prefetched) return;
    setPrefetched(true);
    fetchActivity();
  }, [prefetched, fetchActivity]);

  // Listen for parent expand
  useEffect(() => {
    const card = document.querySelector(`.expandable-card[data-publication="${publication}"]`);
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
  }, [publication, prefetched, handlePrefetch]);

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
        <div className="space-y-3">
          <div className="h-16 shimmer rounded-lg" style={{ animationDelay: '0.1s' }} />
          <div className="h-16 shimmer rounded-lg" style={{ animationDelay: '0.2s' }} />
          <div className="h-16 shimmer rounded-lg" style={{ animationDelay: '0.3s' }} />
        </div>
      </div>
    );
  }

  // Error state
  if (error && !activity) {
    return (
      <div className="text-center py-4">
        <p className="text-[#a1a1a1] text-sm mb-2">Couldn't load posts</p>
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

  const { publication: pub, posts } = activity;

  return (
    <div className="space-y-4" onMouseEnter={handlePrefetch} onTouchStart={handlePrefetch}>
      {/* Publication Header */}
      {pub && (
        <div className="flex items-center gap-3 animate-[fadeSlideIn_0.4s_ease-out_forwards]">
          {pub.logoUrl ? (
            <img
              src={pub.logoUrl}
              alt={pub.name}
              className="w-10 h-10 rounded-full border border-[#333] object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#ff6719] flex items-center justify-center text-white font-bold">
              {pub.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-medium truncate">{pub.name}</h3>
            {pub.authorName && (
              <p className="text-[#a1a1a1] text-xs truncate">by {pub.authorName}</p>
            )}
            {pub.description && (
              <p className="text-[#525252] text-xs truncate">{pub.description}</p>
            )}
          </div>
        </div>
      )}

      {/* Posts Feed */}
      {posts && posts.length > 0 ? (
        <div className="space-y-2">
          {posts.slice(0, 5).map((post, i) => {
            const recent = isRecent(post.time);
            const hasStats = post.likes > 0 || post.comments > 0 || post.restacks > 0;

            return (
              <a
                key={post.slug || i}
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-3 -mx-1 rounded-lg bg-[#1a1a1a]/50 border border-transparent hover:border-[#ff6719]/30 hover:bg-[#1a1a1a] transition-all duration-200 hover:scale-[1.01] group animate-[fadeSlideIn_0.4s_ease-out_forwards] opacity-0"
                style={{ animationDelay: `${150 + i * 100}ms` }}
              >
                <div className="flex items-start gap-2">
                  {/* Post icon */}
                  <div className="relative flex-shrink-0 mt-0.5">
                    <span className="text-[#ff6719] drop-shadow-[0_0_4px_rgba(255,103,25,0.6)]">
                      ◈
                    </span>
                    {recent && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.8)]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="text-[#e5e5e5] text-sm font-medium leading-tight group-hover:text-white transition-colors line-clamp-2">
                        {post.title}
                      </h4>
                      <span className="flex items-center gap-1 flex-shrink-0 text-xs">
                        {recent && (
                          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px] font-medium">
                            NEW
                          </span>
                        )}
                        <span className="text-[#525252]">{post.time}</span>
                      </span>
                    </div>

                    {post.subtitle && (
                      <p className="text-[#a1a1a1] text-xs mt-1 line-clamp-1">{post.subtitle}</p>
                    )}

                    {/* Stats */}
                    {hasStats && (
                      <div className="flex items-center gap-3 mt-2 text-xs text-[#525252]">
                        {post.likes > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="text-red-400">❤</span>
                            <span>{formatNumber(post.likes)}</span>
                          </span>
                        )}
                        {post.comments > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="text-blue-400">💬</span>
                            <span>{formatNumber(post.comments)}</span>
                          </span>
                        )}
                        {post.restacks > 0 && (
                          <span className="flex items-center gap-1">
                            <span className="text-green-400">↻</span>
                            <span>{formatNumber(post.restacks)}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <p className="text-[#a1a1a1] text-sm">No recent posts</p>
      )}

      {/* View all link */}
      <a
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-[#a1a1a1] hover:text-white transition-colors group"
      >
        View all on Substack
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
