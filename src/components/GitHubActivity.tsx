import { useState, useEffect, useCallback } from 'react';

interface GitHubEvent {
  type: string;
  repo: string;
  time: string;
  message?: string;
}

interface ContributionDay {
  date: string;
  count: number;
  level: number;
}

interface GitHubUser {
  name: string;
  login: string;
  avatar: string;
  bio: string;
  repoCount: number;
  followers: number;
}

interface GitHubData {
  user: GitHubUser | null;
  events: GitHubEvent[];
  contributions: {
    days: ContributionDay[];
    total: number;
  };
  cached: boolean;
  fetchedAt: number;
}

// Format large numbers (e.g., 1200 -> 1.2k)
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}m`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

interface Props {
  username: string;
  profileUrl: string;
}

const CACHE_KEY_PREFIX = 'github-activity-';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour client-side

const eventIcons: Record<string, string> = {
  push: '●',
  pr: '◆',
  issue: '○',
  star: '★',
  fork: '⑂',
  create: '+',
  default: '•',
};

const eventStyles: Record<string, string> = {
  push: 'text-green-400 drop-shadow-[0_0_4px_rgba(74,222,128,0.6)]',
  pr: 'text-purple-400 drop-shadow-[0_0_4px_rgba(192,132,252,0.6)]',
  issue: 'text-yellow-400 drop-shadow-[0_0_4px_rgba(250,204,21,0.6)]',
  star: 'text-yellow-300 drop-shadow-[0_0_4px_rgba(253,224,71,0.6)]',
  fork: 'text-blue-400 drop-shadow-[0_0_4px_rgba(96,165,250,0.6)]',
  create: 'text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.6)]',
  default: 'text-gray-400',
};

// Check if time string represents activity within last 24h
function isRecent(timeStr: string): boolean {
  if (timeStr.endsWith('m') || timeStr.endsWith('h')) {
    const num = parseInt(timeStr);
    if (timeStr.endsWith('m')) return true; // minutes = definitely recent
    if (timeStr.endsWith('h') && num <= 24) return true;
  }
  return false;
}

// Format date for tooltip
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

// Calculate current contribution streak
function calculateStreak(days: ContributionDay[]): number {
  if (!days || days.length === 0) return 0;

  // Days are sorted oldest to newest, so reverse to check from today
  const sortedDays = [...days].reverse();
  let streak = 0;

  // Get today's date (normalized to midnight)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const day of sortedDays) {
    if (day.count > 0) {
      streak++;
    } else {
      // Check if this zero-day is today (streak still active if today has no contributions yet)
      const dayDate = new Date(day.date);
      dayDate.setHours(0, 0, 0, 0);
      if (dayDate.getTime() === today.getTime() && streak === 0) {
        continue; // Skip today if no contributions yet
      }
      break; // Streak broken
    }
  }

  return streak;
}

// Tooltip component for contribution squares
function ContributionTooltip({ day, children }: { day: ContributionDay; children: React.ReactNode }) {
  const [show, setShow] = useState(false);

  if (!day.date) return <>{children}</>;

  return (
    <div
      className="relative group/tooltip"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          className="absolute z-50 px-2 py-1 text-xs bg-[#1a1a1a] border border-[#333] rounded shadow-lg whitespace-nowrap pointer-events-none bottom-full left-1/2 -translate-x-1/2 mb-2"
        >
          <span className="font-medium text-white">{day.count} contribution{day.count !== 1 ? 's' : ''}</span>
          <span className="text-[#888] ml-1">on {formatDate(day.date)}</span>
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#333]" />
        </div>
      )}
    </div>
  );
}

export default function GitHubActivity({ username, profileUrl }: Props) {
  const [activity, setActivity] = useState<GitHubData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [prefetched, setPrefetched] = useState(false);

  const cacheKey = `${CACHE_KEY_PREFIX}${username}`;

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as GitHubData;
        // Check if cache is still valid
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
      const res = await fetch(`/.netlify/functions/github-activity?username=${username}`);
      if (!res.ok) throw new Error('API error');

      const data = await res.json() as GitHubData;
      data.fetchedAt = Date.now();

      setActivity(data);

      // Save to localStorage
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {
        // Silent fail
      }

      // Dispatch event for activity dot update
      const recentCount = data.events?.filter((e: GitHubEvent) => isRecent(e.time)).length || 0;
      document.dispatchEvent(new CustomEvent('github-activity-loaded', {
        detail: { username, recentCount }
      }));
    } catch {
      // If we have cached data, keep showing it
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

  // Listen for parent expand to trigger prefetch
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
        <div className="h-20 shimmer rounded-lg" />
        <div className="space-y-2">
          <div className="h-4 shimmer rounded w-3/4" style={{ animationDelay: '0.1s' }} />
          <div className="h-4 shimmer rounded w-1/2" style={{ animationDelay: '0.2s' }} />
          <div className="h-4 shimmer rounded w-2/3" style={{ animationDelay: '0.3s' }} />
        </div>
      </div>
    );
  }

  // Error state (no cached data)
  if (error && !activity) {
    return (
      <div className="text-center py-4">
        <p className="text-[#a1a1a1] text-sm mb-2">Couldn't load activity</p>
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

  // Group contribution days into weeks for grid display
  const getWeeks = (days: ContributionDay[]) => {
    if (!days || days.length === 0) return [];

    const weeks: ContributionDay[][] = [];
    let currentWeek: ContributionDay[] = [];

    // Get the day of week for the first date (0 = Sunday)
    const firstDate = new Date(days[0].date);
    const startPadding = firstDate.getDay();

    // Add empty padding for start of first week
    for (let i = 0; i < startPadding; i++) {
      currentWeek.push({ date: '', count: 0, level: -1 });
    }

    days.forEach((day) => {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    });

    // Push remaining days
    if (currentWeek.length > 0) {
      weeks.push(currentWeek);
    }

    return weeks;
  };

  const levelStyles = [
    { bg: 'bg-[#161b22]', glow: '' }, // level 0 - no contributions
    { bg: 'bg-[#0e4429]', glow: 'shadow-[0_0_4px_rgba(14,68,41,0.5)]' }, // level 1
    { bg: 'bg-[#006d32]', glow: 'shadow-[0_0_6px_rgba(0,109,50,0.6)]' }, // level 2
    { bg: 'bg-[#26a641]', glow: 'shadow-[0_0_8px_rgba(38,166,65,0.7)]' }, // level 3
    { bg: 'bg-[#39d353]', glow: 'shadow-[0_0_10px_rgba(57,211,83,0.8)]' }, // level 4
  ];

  const weeks = getWeeks(activity.contributions?.days || []);

  // Extract repo link from event - handles both "repo" and "owner/repo" formats
  const getRepoUrl = (repo: string) => {
    if (repo.includes('/')) {
      // Full path like "owner/repo" - link directly
      return `https://github.com/${repo}`;
    }
    // Short name like "repo" - prepend username
    return `https://github.com/${username}/${repo}`;
  };

  return (
    <div className="space-y-4" onMouseEnter={handlePrefetch} onTouchStart={handlePrefetch}>
      {/* User Header */}
      {activity.user && (
        <div className="flex items-center gap-3 animate-[fadeSlideIn_0.4s_ease-out_forwards]">
          <img
            src={activity.user.avatar}
            alt={activity.user.name}
            className="w-10 h-10 rounded-full border border-[#333]"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-medium truncate">{activity.user.name}</h3>
            {activity.user.bio && (
              <p className="text-[#a1a1a1] text-xs truncate">{activity.user.bio}</p>
            )}
            <p className="text-[#525252] text-xs">
              {activity.user.repoCount} repos · {formatNumber(activity.user.followers)} followers
            </p>
          </div>
        </div>
      )}

      {/* Contribution Graph */}
      {weeks.length > 0 && (
        <div className="overflow-x-auto">
          <div className="flex gap-[3px] min-w-fit">
            {weeks.map((week, weekIdx) => (
              <div key={weekIdx} className="flex flex-col gap-[3px]">
                {week.map((day, dayIdx) => {
                  const style = day.level >= 0 ? levelStyles[day.level] || levelStyles[0] : null;
                  return (
                    <ContributionTooltip key={dayIdx} day={day}>
                      <div
                        className={`w-[10px] h-[10px] rounded-sm transition-transform hover:scale-150 ${style ? `${style.bg} ${style.glow}` : 'bg-transparent'}`}
                      />
                    </ContributionTooltip>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-xs text-[#a1a1a1]">
              {activity.contributions.total.toLocaleString()} contributions in the last year
            </p>
            {(() => {
              const streak = calculateStreak(activity.contributions.days);
              if (streak > 0) {
                return (
                  <span className="flex items-center gap-1 text-xs text-orange-400">
                    <span className="animate-pulse">🔥</span>
                    <span>{streak} day streak</span>
                  </span>
                );
              }
              return null;
            })()}
          </div>
        </div>
      )}

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
                {/* New indicator */}
                <div className="relative flex-shrink-0">
                  <span className={`${eventStyles[event.type] || eventStyles.default}`}>
                    {eventIcons[event.type] || eventIcons.default}
                  </span>
                  {recent && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.8)]" />
                  )}
                </div>

                {/* Message with clickable repo */}
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
                    <>
                      {event.message || `${event.type} on `}
                      {!event.message && (
                        <a
                          href={getRepoUrl(event.repo)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#58a6ff] hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {event.repo}
                        </a>
                      )}
                    </>
                  )}
                </span>

                {/* Time with new badge */}
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
