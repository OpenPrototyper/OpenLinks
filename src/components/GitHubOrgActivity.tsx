import { useState, useEffect, useCallback } from 'react';

interface GitHubEvent {
  type: string;
  repo: string;
  time: string;
  message: string;
}

interface GitHubRepo {
  name: string;
  description: string;
  stars: number;
  language: string;
  updatedAt: string;
  url: string;
}

interface GitHubOrgData {
  org: {
    name: string;
    description: string;
    avatar: string;
    repoCount: number;
    memberCount: number;
  };
  events: GitHubEvent[];
  repos: GitHubRepo[];
  cached: boolean;
  fetchedAt: number;
}

interface Props {
  org: string;
  profileUrl: string;
}

const CACHE_KEY_PREFIX = 'github-org-activity-';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour client-side

const eventIcons: Record<string, string> = {
  push: '●',
  pr: '◆',
  issue: '○',
  star: '★',
  fork: '⑂',
  create: '+',
  release: '◈',
  member: '👤',
  default: '•',
};

const eventStyles: Record<string, string> = {
  push: 'text-green-400 drop-shadow-[0_0_4px_rgba(74,222,128,0.6)]',
  pr: 'text-purple-400 drop-shadow-[0_0_4px_rgba(192,132,252,0.6)]',
  issue: 'text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.6)]',
  star: 'text-yellow-300 drop-shadow-[0_0_4px_rgba(253,224,71,0.6)]',
  fork: 'text-blue-400 drop-shadow-[0_0_4px_rgba(96,165,250,0.6)]',
  create: 'text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.6)]',
  release: 'text-pink-400 drop-shadow-[0_0_4px_rgba(244,114,182,0.6)]',
  member: 'text-orange-400 drop-shadow-[0_0_4px_rgba(251,146,60,0.6)]',
  default: 'text-gray-400',
};

const languageColors: Record<string, string> = {
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  Python: '#3572A5',
  Rust: '#dea584',
  Go: '#00ADD8',
  Java: '#b07219',
  Ruby: '#701516',
  PHP: '#4F5D95',
  'C++': '#f34b7d',
  C: '#555555',
  'C#': '#178600',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Shell: '#89e051',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Vue: '#41b883',
  Svelte: '#ff3e00',
  Astro: '#ff5a03',
  default: '#8b8b8b',
};

// Check if time string represents activity within last 24h
function isRecent(timeStr: string): boolean {
  if (timeStr.endsWith('m') || timeStr.endsWith('h')) {
    const num = parseInt(timeStr);
    if (timeStr.endsWith('m')) return true;
    if (timeStr.endsWith('h') && num <= 24) return true;
  }
  return false;
}

// Format large numbers (e.g., 1200 -> 1.2k)
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}m`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

export default function GitHubOrgActivity({ org, profileUrl }: Props) {
  const [activity, setActivity] = useState<GitHubOrgData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [prefetched, setPrefetched] = useState(false);

  const cacheKey = `${CACHE_KEY_PREFIX}${org}`;

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as GitHubOrgData;
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
      const res = await fetch(`/.netlify/functions/github-org-activity?org=${org}`);
      if (!res.ok) throw new Error('API error');

      const data = await res.json() as GitHubOrgData;
      data.fetchedAt = Date.now();

      setActivity(data);

      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {
        // Silent fail
      }

      // Dispatch event for activity dot update
      const recentCount = data.events?.filter((e: GitHubEvent) => isRecent(e.time)).length || 0;
      document.dispatchEvent(new CustomEvent('github-org-activity-loaded', {
        detail: { org, recentCount }
      }));
    } catch {
      if (!activity) {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [org, cacheKey, activity]);

  // Prefetch on hover/touch
  const handlePrefetch = useCallback(() => {
    if (prefetched) return;
    setPrefetched(true);
    fetchActivity();
  }, [prefetched, fetchActivity]);

  // Listen for parent expand to trigger prefetch
  useEffect(() => {
    const card = document.querySelector(`.expandable-card[data-org="${org}"]`);
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
  }, [org, prefetched, handlePrefetch]);

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
        <div className="space-y-2">
          <div className="h-4 shimmer rounded w-3/4" />
          <div className="h-4 shimmer rounded w-1/2" style={{ animationDelay: '0.1s' }} />
          <div className="h-4 shimmer rounded w-2/3" style={{ animationDelay: '0.2s' }} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-16 shimmer rounded" style={{ animationDelay: '0.3s' }} />
          <div className="h-16 shimmer rounded" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    );
  }

  // Error state
  if (error && !activity) {
    return (
      <div className="text-center py-4">
        <p className="text-[#a1a1a1] text-sm mb-2">Couldn't load organization activity</p>
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

  const getRepoUrl = (repoName: string) => `https://github.com/${org}/${repoName}`;

  return (
    <div className="space-y-4" onMouseEnter={handlePrefetch} onTouchStart={handlePrefetch}>
      {/* Org Header */}
      <div className="flex items-center gap-3 animate-[fadeSlideIn_0.4s_ease-out_forwards]">
        <img
          src={activity.org.avatar}
          alt={activity.org.name}
          className="w-10 h-10 rounded-full border border-[#333]"
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium truncate">{activity.org.name}</h3>
          {activity.org.description && (
            <p className="text-[#a1a1a1] text-xs truncate">{activity.org.description}</p>
          )}
          <p className="text-[#525252] text-xs">
            {activity.org.repoCount} repos · {formatNumber(activity.org.memberCount)} followers
          </p>
        </div>
      </div>

      {/* Activity Feed */}
      {activity.events && activity.events.length > 0 ? (
        <div className="space-y-1">
          {activity.events.slice(0, 5).map((event, i) => {
            const recent = isRecent(event.time);
            return (
              <div
                key={i}
                className="flex items-start gap-2 text-sm p-1.5 -mx-1.5 rounded-md transition-all duration-200 hover:bg-[#1a1a1a] hover:scale-[1.02] cursor-default group animate-[fadeSlideIn_0.4s_ease-out_forwards] opacity-0"
                style={{ animationDelay: `${150 + i * 100}ms` }}
              >
                <div className="relative flex-shrink-0">
                  <span className={`${eventStyles[event.type] || eventStyles.default}`}>
                    {eventIcons[event.type] || eventIcons.default}
                  </span>
                  {recent && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.8)]" />
                  )}
                </div>

                <span className="text-[#e5e5e5] flex-1 truncate">
                  {event.message?.includes(event.repo) ? (
                    <>
                      {event.message.split(event.repo)[0]}
                      <a
                        href={getRepoUrl(event.repo)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#58a6ff] hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {event.repo}
                      </a>
                      {event.message.split(event.repo).slice(1).join(event.repo)}
                    </>
                  ) : (
                    event.message
                  )}
                </span>

                <span className="flex items-center gap-1 flex-shrink-0 text-xs">
                  {recent && (
                    <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px] font-medium">
                      NEW
                    </span>
                  )}
                  <span className="text-[#525252]">{event.time}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[#a1a1a1] text-sm">No recent public activity</p>
      )}

      {/* Repositories Grid */}
      {activity.repos && activity.repos.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[#a1a1a1] text-xs font-medium uppercase tracking-wider">
            Popular Repositories
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {activity.repos.slice(0, 6).map((repo, i) => (
              <a
                key={repo.name}
                href={repo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 bg-[#1a1a1a] border border-[#262626] rounded-md hover:border-[#333] hover:bg-[#222] transition-all duration-200 group animate-[fadeSlideIn_0.4s_ease-out_forwards] opacity-0"
                style={{ animationDelay: `${400 + i * 80}ms` }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[#58a6ff] text-sm font-medium truncate group-hover:underline">
                    {repo.name}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#525252]">
                  <span className="flex items-center gap-1">
                    <span className="text-yellow-400">★</span>
                    {formatNumber(repo.stars)}
                  </span>
                  {repo.language && (
                    <span className="flex items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: languageColors[repo.language] || languageColors.default }}
                      />
                      {repo.language}
                    </span>
                  )}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* View all link */}
      <a
        href={profileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-sm text-[#a1a1a1] hover:text-white transition-colors group"
      >
        View all on GitHub
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
