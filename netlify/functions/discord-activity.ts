import type { Context } from "@netlify/functions";

interface DiscordChannel {
  id: string;
  name: string;
  position: number;
}

interface DiscordMember {
  id: string;
  username: string;
  discriminator: string;
  avatar: string | null;
  avatar_url: string;
  status: 'online' | 'idle' | 'dnd';
  game?: {
    name: string;
  };
}

interface DiscordWidgetData {
  id: string;
  name: string;
  instant_invite: string | null;
  channels: DiscordChannel[];
  members: DiscordMember[];
  presence_count: number;
}

interface ProcessedData {
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
  voiceChannels: Array<{
    id: string;
    name: string;
    memberCount: number;
  }>;
  members: Array<{
    id: string;
    username: string;
    avatar: string;
    status: 'online' | 'idle' | 'dnd';
    activity?: string;
  }>;
}

interface CachedData {
  data: ProcessedData;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache: Record<string, CachedData> = {};

async function fetchDiscordWidget(serverId: string): Promise<DiscordWidgetData | null> {
  try {
    const res = await fetch(`https://discord.com/api/guilds/${serverId}/widget.json`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'OpenLinks-Activity-Feed',
      },
    });

    if (!res.ok) {
      if (res.status === 403) {
        console.error('Discord widget is not enabled for this server');
      } else if (res.status === 404) {
        console.error('Discord server not found');
      } else {
        console.error(`Discord Widget API error: ${res.status}`);
      }
      return null;
    }

    return await res.json() as DiscordWidgetData;
  } catch (err) {
    console.error('Error fetching Discord widget:', err);
    return null;
  }
}

function processWidgetData(widget: DiscordWidgetData): ProcessedData {
  // Count members in voice channels
  const membersInVoice = widget.members.filter(m =>
    // Members with a channel_id are in voice
    (m as any).channel_id !== undefined
  ).length;

  // Get voice channel info with member counts
  const voiceChannels = widget.channels.map(channel => {
    const membersInChannel = widget.members.filter(m =>
      (m as any).channel_id === channel.id
    ).length;
    return {
      id: channel.id,
      name: channel.name,
      memberCount: membersInChannel,
    };
  }).sort((a, b) => b.memberCount - a.memberCount);

  // Process members - group by status
  const processedMembers = widget.members
    .map(member => ({
      id: member.id,
      username: member.username,
      avatar: member.avatar_url || `https://cdn.discordapp.com/embed/avatars/${parseInt(member.discriminator) % 5}.png`,
      status: member.status,
      activity: member.game?.name,
    }))
    .sort((a, b) => {
      // Sort by status: online > idle > dnd
      const statusOrder = { online: 0, idle: 1, dnd: 2 };
      return statusOrder[a.status] - statusOrder[b.status];
    })
    .slice(0, 20); // Limit to 20 members for display

  return {
    server: {
      id: widget.id,
      name: widget.name,
      inviteUrl: widget.instant_invite,
    },
    stats: {
      onlineCount: widget.presence_count,
      voiceChannelCount: widget.channels.length,
      membersInVoice,
    },
    voiceChannels,
    members: processedMembers,
  };
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const serverId = url.searchParams.get('serverId');

  if (!serverId) {
    return new Response(JSON.stringify({ error: 'Server ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = Date.now();
  const cached = cache[serverId];

  // Return cached data if fresh
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return new Response(JSON.stringify({ ...cached.data, cached: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  // Fetch fresh data
  const widgetData = await fetchDiscordWidget(serverId);

  if (!widgetData) {
    // Return error but with cache headers to prevent hammering
    return new Response(JSON.stringify({
      error: 'Could not fetch Discord widget. Make sure the widget is enabled in server settings.',
      widgetDisabled: true,
    }), {
      status: 503,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60', // Cache errors for 1 minute
      },
    });
  }

  const data = processWidgetData(widgetData);

  // Update cache
  cache[serverId] = { data, timestamp: now };

  return new Response(JSON.stringify({ ...data, cached: false }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
