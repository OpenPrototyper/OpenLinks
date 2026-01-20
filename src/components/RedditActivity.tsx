import { useState, useEffect, useCallback } from 'react';

interface RedditUser {
  name: string;
  iconUrl: string;
  linkKarma: number;
  commentKarma: number;
  totalKarma: number;
  createdAt: number;
  accountAge: string;
  isGold: boolean;
  isMod: boolean;
  verified: boolean;
  bio: string;
}

interface RedditActivityItem {
  id: string;
  type: 'post' | 'comment';
  subreddit: string;
  score: number;
  time: string;
  createdAt: number;
  permalink: string;
  distinguished: string | null;
  title?: string;
  numComments?: number;
  body?: string;
  linkTitle?: string;
}

interface RedditData {
  user: RedditUser;
  activities: RedditActivityItem[];
  cached: boolean;
  fetchedAt: number;
}

interface Props {
  username: string;
  profileUrl: string;
}

const CACHE_KEY_PREFIX = 'reddit-activity-';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour client-side

// Check if time string represents activity within last 24h
function isRecent(timeStr: string): boolean {
  if (timeStr.endsWith('m')) return true; // minutes
  if (timeStr.endsWith('h')) {
    const hours = parseInt(timeStr);
    return hours <= 24;
  }
  return false;
}

// Format numbers (e.g., 1200 -> 1.2k)
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}m`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

export default function RedditActivity({ username, profileUrl }: Props) {
  const [activity, setActivity] = useState<RedditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [prefetched, setPrefetched] = useState(false);

  const cacheKey = `${CACHE_KEY_PREFIX}${username.toLowerCase()}`;

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as RedditData;
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
      const res = await fetch(`/.netlify/functions/reddit-activity?username=${username}`);
      if (!res.ok) throw new Error('API error');

      const data = await res.json() as RedditData;
      data.fetchedAt = Date.now();

      setActivity(data);

      // Save to localStorage
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {
        // Silent fail
      }

      // Dispatch event for activity dot update
      const recentCount = data.activities?.filter((a: RedditActivityItem) => isRecent(a.time)).length || 0;
      document.dispatchEvent(new CustomEvent('reddit-activity-loaded', {
        detail: { username, recentCount }
      }));
    } catch {
      if (!activity) {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [username, cacheKey, activity]);

  // Prefetch on hover/touch
  const handlePrefetch = useCallback(() => {
    if (prefetched) return;
    setPrefetched(true);
    fetchActivity();
  }, [prefetched, fetchActivity]);

  // Listen for parent expand
  useEffect(() => {
    const card = document.querySelector(`.expandable-card[data-username="${username}"]`);
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
          <div className="w-10 h-10 rounded-full shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-4 shimmer rounded w-1/3" />
            <div className="h-3 shimmer rounded w-1/2" />
          </div>
        </div>
        <div className="space-y-3">
          <div className="h-14 shimmer rounded-lg" style={{ animationDelay: '0.1s' }} />
          <div className="h-14 shimmer rounded-lg" style={{ animationDelay: '0.2s' }} />
          <div className="h-14 shimmer rounded-lg" style={{ animationDelay: '0.3s' }} />
        </div>
      </div>
    );
  }

  // Error state
  if (error && !activity) {
    return (
      <div className="text-center py-4">
        <p className="text-[#a1a1a1] text-sm mb-2">Couldn't load Reddit activity</p>
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

  const { user, activities } = activity;

  return (
    <div className="space-y-4" onMouseEnter={handlePrefetch} onTouchStart={handlePrefetch}>
      {/* User Header */}
      {user && (
        <div className="flex items-center gap-3 animate-[fadeSlideIn_0.4s_ease-out_forwards]">
          {user.iconUrl ? (
            <img
              src={user.iconUrl}
              alt={user.name}
              className="w-10 h-10 rounded-full border border-[#333] object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-[#ff4500] flex items-center justify-center text-white font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-medium truncate">u/{user.name}</h3>
              {user.isGold && (
                <span className="text-yellow-400 text-xs" title="Reddit Premium">
                  ★
                </span>
              )}
              {user.verified && (
                <span className="text-blue-400 text-xs" title="Verified">
                  ✓
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-[#a1a1a1]">
              <span title="Total Karma">{formatNumber(user.totalKarma)} karma</span>
              <span className="text-[#525252]">•</span>
              <span title="Account Age">{user.accountAge} old</span>
            </div>
            {user.bio && (
              <p className="text-[#525252] text-xs truncate mt-0.5">{user.bio}</p>
            )}
          </div>
        </div>
      )}

      {/* Karma Breakdown */}
      {user && (
        <div className="flex gap-4 text-xs animate-[fadeSlideIn_0.4s_ease-out_forwards]" style={{ animationDelay: '50ms' }}>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1a1a1a] rounded">
            <span className="text-cyan-400">+</span>
            <span className="text-[#a1a1a1]">{formatNumber(user.linkKarma)} post</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1a1a1a] rounded">
            <span className="text-blue-400">💬</span>
            <span className="text-[#a1a1a1]">{formatNumber(user.commentKarma)} comment</span>
          </div>
        </div>
      )}

      {/* Activity Feed */}
      {activities && activities.length > 0 ? (
        <div className="space-y-2">
          {activities.slice(0, 6).map((item, i) => {
            const recent = isRecent(item.time);
            const isPost = item.type === 'post';
            const isHighScore = item.score >= 100;

            return (
              <a
                key={item.id}
                href={item.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-2.5 -mx-1 rounded-lg bg-[#1a1a1a]/50 border border-transparent hover:border-[#ff4500]/30 hover:bg-[#1a1a1a] transition-all duration-200 hover:scale-[1.01] group animate-[fadeSlideIn_0.4s_ease-out_forwards] opacity-0"
                style={{ animationDelay: `${150 + i * 100}ms` }}
              >
                <div className="flex items-start gap-2">
                  {/* Type icon */}
                  <div className="relative flex-shrink-0 mt-0.5">
                    <span className={isPost
                      ? 'text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.6)]'
                      : 'text-blue-300 drop-shadow-[0_0_4px_rgba(147,197,253,0.6)]'
                    }>
                      {isPost ? '+' : '💬'}
                    </span>
                    {recent && (
                      <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.8)]" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[#e5e5e5] text-sm leading-tight group-hover:text-white transition-colors line-clamp-2">
                          {isPost ? item.title : item.body}
                        </p>
                        <p className="text-[#525252] text-xs mt-1">
                          {item.subreddit}
                          {item.distinguished && (
                            <span className={`ml-1.5 px-1 py-0.5 rounded text-[10px] ${
                              item.distinguished === 'admin'
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-green-500/20 text-green-400'
                            }`}>
                              {item.distinguished === 'admin' ? 'ADMIN' : 'MOD'}
                            </span>
                          )}
                        </p>
                      </div>
                      <span className="flex items-center gap-1 flex-shrink-0 text-xs">
                        {recent && (
                          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px] font-medium">
                            NEW
                          </span>
                        )}
                        <span className="text-[#525252]">{item.time}</span>
                      </span>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-[#525252]">
                      <span className="flex items-center gap-1">
                        <span className={isHighScore ? 'text-yellow-400' : 'text-[#a1a1a1]'}>
                          {isHighScore ? '★' : '⬆'}
                        </span>
                        <span>{formatNumber(item.score)}</span>
                      </span>
                      {isPost && item.numComments !== undefined && (
                        <span className="flex items-center gap-1">
                          <span className="text-blue-400">💬</span>
                          <span>{formatNumber(item.numComments)}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <p className="text-[#a1a1a1] text-sm">No recent public activity</p>
      )}

      {/* View all link */}
      <a
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-[#a1a1a1] hover:text-white transition-colors group"
      >
        View all on Reddit
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
