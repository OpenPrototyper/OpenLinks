import { useState, useEffect, useCallback } from 'react';

interface InstagramUser {
  username: string;
  fullName: string;
  avatar: string;
  bio: string;
  verified: boolean;
  followers: number;
  following: number;
  postCount: number;
}

interface InstagramPost {
  id: string;
  caption: string;
  thumbnail: string;
  permalink: string;
}

interface InstagramData {
  user: InstagramUser | null;
  posts: InstagramPost[];
  cached: boolean;
  fetchedAt: number;
  _notice?: string;
}

interface Props {
  username: string;
  profileUrl: string;
  postIds?: string;
}

const CACHE_KEY_PREFIX = 'instagram-activity-';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour client-side

// Format numbers (e.g., 1200 -> 1.2k)
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}m`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

export default function InstagramActivity({ username, profileUrl, postIds }: Props) {
  const [activity, setActivity] = useState<InstagramData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [prefetched, setPrefetched] = useState(false);

  const cacheKey = `${CACHE_KEY_PREFIX}${username.toLowerCase()}`;

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as InstagramData;
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
      let url = `/.netlify/functions/instagram-activity?username=${username}`;
      if (postIds) {
        url += `&postIds=${postIds}`;
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error('API error');

      const data = await res.json() as InstagramData;
      data.fetchedAt = Date.now();

      setActivity(data);

      // Save to localStorage
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {
        // Silent fail
      }

      // Dispatch event for activity dot update
      const recentCount = data.posts?.length || 0;
      document.dispatchEvent(new CustomEvent('instagram-activity-loaded', {
        detail: { username, recentCount }
      }));
    } catch {
      if (!activity) {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [username, postIds, cacheKey, activity]);

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
          <div className="w-12 h-12 rounded-full shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-4 shimmer rounded w-1/3" />
            <div className="h-3 shimmer rounded w-1/2" />
          </div>
        </div>
        <div className="flex gap-4">
          <div className="h-6 shimmer rounded w-20" style={{ animationDelay: '0.1s' }} />
          <div className="h-6 shimmer rounded w-20" style={{ animationDelay: '0.15s' }} />
          <div className="h-6 shimmer rounded w-16" style={{ animationDelay: '0.2s' }} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="aspect-square shimmer rounded-lg" style={{ animationDelay: '0.25s' }} />
          <div className="aspect-square shimmer rounded-lg" style={{ animationDelay: '0.3s' }} />
          <div className="aspect-square shimmer rounded-lg" style={{ animationDelay: '0.35s' }} />
        </div>
      </div>
    );
  }

  // Error state
  if (error && !activity) {
    return (
      <div className="text-center py-4">
        <p className="text-[#a1a1a1] text-sm mb-2">Couldn't load Instagram activity</p>
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

  const { user, posts } = activity;

  return (
    <div className="space-y-4" onMouseEnter={handlePrefetch} onTouchStart={handlePrefetch}>
      {/* User Header */}
      {user && (
        <div className="flex items-center gap-3 animate-[fadeSlideIn_0.4s_ease-out_forwards]">
          {user.avatar ? (
            <img
              src={user.avatar}
              alt={user.username}
              className="w-12 h-12 rounded-full border-2 border-[#E4405F]/30 object-cover"
            />
          ) : (
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#F58529] via-[#DD2A7B] to-[#8134AF] flex items-center justify-center text-white font-bold text-lg">
              {user.username.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-white font-medium truncate">{user.username}</h3>
              {user.verified && (
                <span className="text-[#3897f0] text-sm" title="Verified">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.7L6 12.6l1.5-1.5 2.6 2.6 6.4-6.4 1.5 1.5-7.9 7.9z"/>
                  </svg>
                </span>
              )}
            </div>
            {user.fullName && (
              <p className="text-[#a1a1a1] text-sm truncate">{user.fullName}</p>
            )}
            {user.bio && (
              <p className="text-[#525252] text-xs truncate mt-0.5">{user.bio}</p>
            )}
          </div>
        </div>
      )}

      {/* Stats */}
      {user && (
        <div className="flex gap-4 text-xs animate-[fadeSlideIn_0.4s_ease-out_forwards]" style={{ animationDelay: '50ms' }}>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1a1a1a] rounded">
            <span className="text-[#E4405F]">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
              </svg>
            </span>
            <span className="text-[#a1a1a1]">{formatNumber(user.followers)} followers</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1a1a1a] rounded">
            <span className="text-[#8134AF]">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            </span>
            <span className="text-[#a1a1a1]">{formatNumber(user.following)} following</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[#1a1a1a] rounded">
            <span className="text-[#F58529]">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
              </svg>
            </span>
            <span className="text-[#a1a1a1]">{formatNumber(user.postCount)} posts</span>
          </div>
        </div>
      )}

      {/* Posts Grid */}
      {posts && posts.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {posts.slice(0, 6).map((post, i) => (
            <a
              key={post.id}
              href={post.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative aspect-square rounded-lg overflow-hidden bg-[#1a1a1a] border border-transparent hover:border-[#E4405F]/50 transition-all duration-200 hover:scale-[1.03] animate-[fadeSlideIn_0.4s_ease-out_forwards] opacity-0"
              style={{ animationDelay: `${150 + i * 100}ms` }}
              title={post.caption || 'View post'}
            >
              {post.thumbnail ? (
                <img
                  src={post.thumbnail}
                  alt={post.caption || 'Instagram post'}
                  className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#525252]">
                  <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                  </svg>
                </div>
              )}
              {/* Hover overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="7" y1="17" x2="17" y2="7" />
                  <polyline points="7 7 17 7 17 17" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      )}

      {/* No posts message */}
      {(!posts || posts.length === 0) && user && (
        <p className="text-[#525252] text-sm">No posts configured</p>
      )}

      {/* View all link */}
      <a
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-[#a1a1a1] hover:text-white transition-colors group"
      >
        View all on Instagram
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
