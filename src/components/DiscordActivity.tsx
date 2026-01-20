import { useState, useEffect, useCallback } from 'react';

interface VoiceChannel {
  id: string;
  name: string;
  memberCount: number;
}

interface DiscordMember {
  id: string;
  username: string;
  avatar: string;
  status: 'online' | 'idle' | 'dnd';
  activity?: string;
}

interface DiscordData {
  server: {
    id: string;
    name: string;
    inviteUrl: string | null;
  };
  stats: {
    onlineCount: number;
    voiceChannelCount: number;
    membersInVoice: number;
  };
  voiceChannels: VoiceChannel[];
  members: DiscordMember[];
  cached: boolean;
  fetchedAt: number;
  error?: string;
  widgetDisabled?: boolean;
}

interface Props {
  serverId: string;
  inviteUrl?: string;
}

const CACHE_KEY_PREFIX = 'discord-activity-';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour client-side

// Status colors and labels
const statusConfig: Record<string, { color: string; glow: string; label: string }> = {
  online: {
    color: 'bg-green-500',
    glow: 'shadow-[0_0_6px_rgba(34,197,94,0.6)]',
    label: 'Online',
  },
  idle: {
    color: 'bg-yellow-500',
    glow: 'shadow-[0_0_6px_rgba(234,179,8,0.6)]',
    label: 'Idle',
  },
  dnd: {
    color: 'bg-red-500',
    glow: 'shadow-[0_0_6px_rgba(239,68,68,0.6)]',
    label: 'Do Not Disturb',
  },
};

export default function DiscordActivity({ serverId, inviteUrl }: Props) {
  const [data, setData] = useState<DiscordData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [prefetched, setPrefetched] = useState(false);

  const cacheKey = `${CACHE_KEY_PREFIX}${serverId}`;

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as DiscordData;
        // Check if cache is still valid
        if (Date.now() - parsed.fetchedAt < CACHE_TTL) {
          setData(parsed);
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
      const res = await fetch(`/.netlify/functions/discord-activity?serverId=${serverId}`);

      if (!res.ok) {
        const errorData = await res.json();
        if (errorData.widgetDisabled) {
          setData({
            server: { id: serverId, name: 'Discord Server', inviteUrl: inviteUrl || null },
            stats: { onlineCount: 0, voiceChannelCount: 0, membersInVoice: 0 },
            voiceChannels: [],
            members: [],
            cached: false,
            fetchedAt: Date.now(),
            error: 'Widget not enabled',
            widgetDisabled: true,
          });
          return;
        }
        throw new Error('API error');
      }

      const responseData = await res.json() as DiscordData;
      responseData.fetchedAt = Date.now();

      setData(responseData);

      // Save to localStorage
      try {
        localStorage.setItem(cacheKey, JSON.stringify(responseData));
      } catch {
        // Silent fail
      }

      // Dispatch event for activity dot update
      document.dispatchEvent(new CustomEvent('discord-activity-loaded', {
        detail: { serverId, onlineCount: responseData.stats.onlineCount }
      }));
    } catch {
      // If we have cached data, keep showing it
      if (!data) {
        setError(true);
      }
    } finally {
      setLoading(false);
    }
  }, [serverId, cacheKey, data, inviteUrl]);

  // Prefetch on hover/touch
  const handlePrefetch = useCallback(() => {
    if (prefetched) return;
    setPrefetched(true);
    fetchActivity();
  }, [prefetched, fetchActivity]);

  // Listen for parent expand to trigger prefetch
  useEffect(() => {
    const card = document.querySelector(`.expandable-card[data-server-id="${serverId}"]`);
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
  }, [serverId, prefetched, handlePrefetch]);

  // Skeleton loader
  if (loading && !data) {
    return (
      <div className="space-y-4">
        {/* Server header skeleton */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl shimmer" />
          <div className="flex-1 space-y-2">
            <div className="h-4 shimmer rounded w-1/3" />
            <div className="h-3 shimmer rounded w-1/2" />
          </div>
        </div>
        {/* Stats skeleton */}
        <div className="flex gap-4">
          <div className="h-16 shimmer rounded-lg flex-1" />
          <div className="h-16 shimmer rounded-lg flex-1" />
        </div>
        {/* Members skeleton */}
        <div className="space-y-2">
          <div className="h-4 shimmer rounded w-1/4" />
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full shimmer" />
            <div className="w-8 h-8 rounded-full shimmer" style={{ animationDelay: '0.1s' }} />
            <div className="w-8 h-8 rounded-full shimmer" style={{ animationDelay: '0.2s' }} />
          </div>
        </div>
      </div>
    );
  }

  // Error state (no cached data)
  if (error && !data) {
    return (
      <div className="text-center py-4">
        <p className="text-[#a1a1a1] text-sm mb-2">Couldn't load Discord activity</p>
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
  if (!data) {
    return null;
  }

  // Widget disabled state
  if (data.widgetDisabled) {
    return (
      <div className="space-y-4" onMouseEnter={handlePrefetch} onTouchStart={handlePrefetch}>
        <div className="text-center py-6 px-4 bg-[#1a1a1a] rounded-lg border border-[#333]">
          <div className="text-4xl mb-3">🔒</div>
          <p className="text-[#a1a1a1] text-sm mb-2">
            Server widget is not enabled
          </p>
          <p className="text-[#525252] text-xs">
            The server admin needs to enable the widget in Server Settings &gt; Widget
          </p>
        </div>

        {/* Still show join button if we have an invite URL */}
        {(inviteUrl || data.server.inviteUrl) && (
          <a
            href={inviteUrl || data.server.inviteUrl || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[#5865f2] hover:bg-[#4752c4] text-white rounded-lg transition-colors font-medium"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
            Join Server
          </a>
        )}
      </div>
    );
  }

  // Group members by status for display
  const membersByStatus = {
    online: data.members.filter(m => m.status === 'online'),
    idle: data.members.filter(m => m.status === 'idle'),
    dnd: data.members.filter(m => m.status === 'dnd'),
  };

  return (
    <div className="space-y-4" onMouseEnter={handlePrefetch} onTouchStart={handlePrefetch}>
      {/* Server Header */}
      <div className="flex items-center gap-3 animate-[fadeSlideIn_0.4s_ease-out_forwards]">
        <img
          src="/logo.png"
          alt={data.server.name}
          className="w-12 h-12 rounded-xl border border-[#333]"
        />
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium truncate">{data.server.name}</h3>
          <p className="text-[#a1a1a1] text-sm flex items-center gap-2">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              {data.stats.onlineCount.toLocaleString()} online
            </span>
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 animate-[fadeSlideIn_0.4s_ease-out_forwards]" style={{ animationDelay: '100ms' }}>
        {/* Online Members Card */}
        <div className="bg-[#1a1a1a] rounded-lg p-3 border border-[#262626]">
          <div className="flex items-center gap-2 text-green-400 mb-1">
            <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]" />
            <span className="text-xs font-medium uppercase tracking-wide">Online</span>
          </div>
          <p className="text-2xl font-bold text-white">{data.stats.onlineCount}</p>
        </div>

        {/* Voice Activity Card */}
        <div className="bg-[#1a1a1a] rounded-lg p-3 border border-[#262626]">
          <div className="flex items-center gap-2 text-[#5865f2] mb-1">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
            </svg>
            <span className="text-xs font-medium uppercase tracking-wide">In Voice</span>
          </div>
          <p className="text-2xl font-bold text-white">{data.stats.membersInVoice}</p>
        </div>
      </div>

      {/* Voice Channels (if any have members) */}
      {data.voiceChannels.filter(c => c.memberCount > 0).length > 0 && (
        <div className="animate-[fadeSlideIn_0.4s_ease-out_forwards] opacity-0" style={{ animationDelay: '200ms' }}>
          <h4 className="text-xs font-medium text-[#a1a1a1] uppercase tracking-wide mb-2">
            Active Voice Channels
          </h4>
          <div className="space-y-1.5">
            {data.voiceChannels.filter(c => c.memberCount > 0).map((channel, i) => (
              <div
                key={channel.id}
                className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg border border-[#262626] hover:border-[#5865f2] transition-colors"
              >
                <svg className="w-4 h-4 text-[#5865f2] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM9.5 16.5v-9l7 4.5-7 4.5z"/>
                </svg>
                <span className="text-[#e5e5e5] text-sm flex-1 truncate">{channel.name}</span>
                <span className="text-xs text-[#a1a1a1] bg-[#262626] px-2 py-0.5 rounded-full">
                  {channel.memberCount} {channel.memberCount === 1 ? 'user' : 'users'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Online Members */}
      {data.members.length > 0 && (
        <div className="animate-[fadeSlideIn_0.4s_ease-out_forwards] opacity-0" style={{ animationDelay: '300ms' }}>
          <h4 className="text-xs font-medium text-[#a1a1a1] uppercase tracking-wide mb-2">
            Online Members ({data.members.length})
          </h4>
          <div className="space-y-3">
            {/* Online */}
            {membersByStatus.online.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {membersByStatus.online.slice(0, 10).map((member) => (
                  <MemberAvatar key={member.id} member={member} />
                ))}
                {membersByStatus.online.length > 10 && (
                  <div className="w-8 h-8 rounded-full bg-[#262626] flex items-center justify-center text-xs text-[#a1a1a1]">
                    +{membersByStatus.online.length - 10}
                  </div>
                )}
              </div>
            )}

            {/* Idle */}
            {membersByStatus.idle.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {membersByStatus.idle.slice(0, 10).map((member) => (
                  <MemberAvatar key={member.id} member={member} />
                ))}
                {membersByStatus.idle.length > 10 && (
                  <div className="w-8 h-8 rounded-full bg-[#262626] flex items-center justify-center text-xs text-[#a1a1a1]">
                    +{membersByStatus.idle.length - 10}
                  </div>
                )}
              </div>
            )}

            {/* DND */}
            {membersByStatus.dnd.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {membersByStatus.dnd.slice(0, 5).map((member) => (
                  <MemberAvatar key={member.id} member={member} />
                ))}
                {membersByStatus.dnd.length > 5 && (
                  <div className="w-8 h-8 rounded-full bg-[#262626] flex items-center justify-center text-xs text-[#a1a1a1]">
                    +{membersByStatus.dnd.length - 5}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activities (members playing games) */}
      {data.members.some(m => m.activity) && (
        <div className="animate-[fadeSlideIn_0.4s_ease-out_forwards] opacity-0" style={{ animationDelay: '400ms' }}>
          <h4 className="text-xs font-medium text-[#a1a1a1] uppercase tracking-wide mb-2">
            Currently Playing
          </h4>
          <div className="space-y-1.5">
            {data.members.filter(m => m.activity).slice(0, 5).map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-2 p-2 bg-[#1a1a1a] rounded-lg border border-[#262626]"
              >
                <img
                  src={member.avatar}
                  alt={member.username}
                  className="w-6 h-6 rounded-full"
                />
                <span className="text-[#e5e5e5] text-sm truncate">{member.username}</span>
                <span className="text-xs text-[#a1a1a1] truncate flex-1 text-right">
                  Playing {member.activity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Join Button */}
      {(inviteUrl || data.server.inviteUrl) && (
        <a
          href={inviteUrl || data.server.inviteUrl || '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 px-4 bg-[#5865f2] hover:bg-[#4752c4] text-white rounded-lg transition-colors font-medium animate-[fadeSlideIn_0.4s_ease-out_forwards] opacity-0"
          style={{ animationDelay: '500ms' }}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          Join Server
        </a>
      )}

      {/* Stale indicator */}
      {loading && data && (
        <p className="text-xs text-[#525252]">Updating...</p>
      )}
    </div>
  );
}

// Member Avatar with tooltip
function MemberAvatar({ member }: { member: DiscordMember }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const status = statusConfig[member.status];

  return (
    <div
      className="relative group"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className="relative">
        <img
          src={member.avatar}
          alt={member.username}
          className="w-8 h-8 rounded-full border-2 border-[#1a1a1a] hover:border-[#5865f2] transition-colors"
        />
        {/* Status indicator */}
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#1a1a1a] ${status.color} ${status.glow}`}
        />
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#1a1a1a] border border-[#333] rounded shadow-lg whitespace-nowrap pointer-events-none">
          <p className="text-sm text-white font-medium">{member.username}</p>
          <p className="text-xs text-[#a1a1a1] flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${status.color}`} />
            {status.label}
          </p>
          {member.activity && (
            <p className="text-xs text-[#5865f2] mt-0.5">Playing {member.activity}</p>
          )}
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-[#333]" />
        </div>
      )}
    </div>
  );
}
