import type { Context } from "@netlify/functions";

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

interface CachedData {
  data: {
    channel: YouTubeChannel;
    videos: YouTubeVideo[];
  };
  timestamp: number;
}

// Invidious instances to try (in order of preference)
const INVIDIOUS_INSTANCES = [
  'https://vid.puffyan.us',
  'https://invidious.nerdvpn.de',
  'https://inv.nadeko.net',
  'https://invidious.privacyredirect.com',
];

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const cache: Record<string, CachedData> = {};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 30) return `${diffDays}d`;
  return `${Math.floor(diffDays / 30)}mo`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

// Parse YouTube RSS XML to extract channel info and videos
function parseRSS(xml: string): { channel: YouTubeChannel; videos: YouTubeVideo[] } {
  // Extract channel info
  const channelIdMatch = xml.match(/<yt:channelId>([^<]+)<\/yt:channelId>/);
  const channelNameMatch = xml.match(/<author>\s*<name>([^<]+)<\/name>/);
  const channelUrlMatch = xml.match(/<author>\s*<name>[^<]+<\/name>\s*<uri>([^<]+)<\/uri>/s);

  const channel: YouTubeChannel = {
    id: channelIdMatch?.[1] || '',
    name: channelNameMatch?.[1] || 'Unknown Channel',
    url: channelUrlMatch?.[1] || '',
  };

  // Extract videos from entries
  const videos: YouTubeVideo[] = [];
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(xml)) !== null && videos.length < 10) {
    const entry = match[1];

    const videoIdMatch = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
    const titleMatch = entry.match(/<title>([^<]+)<\/title>/);
    const linkMatch = entry.match(/<link rel="alternate" href="([^"]+)"/);
    const publishedMatch = entry.match(/<published>([^<]+)<\/published>/);
    const descriptionMatch = entry.match(/<media:description>([^<]*)<\/media:description>/);

    if (videoIdMatch && titleMatch && publishedMatch) {
      const videoId = videoIdMatch[1];
      videos.push({
        id: videoId,
        title: titleMatch[1],
        description: descriptionMatch?.[1]?.slice(0, 150) || '',
        url: linkMatch?.[1] || `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
        publishedAt: publishedMatch[1],
        time: formatRelativeTime(publishedMatch[1]),
      });
    }
  }

  return { channel, videos };
}

// Fetch RSS feed
async function fetchRSS(channelId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`, {
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml',
        'User-Agent': 'OpenLinks-Activity-Feed',
      },
    });

    if (!res.ok) {
      console.error(`YouTube RSS error: ${res.status}`);
      return null;
    }

    return await res.text();
  } catch (err) {
    console.error('Error fetching YouTube RSS:', err);
    return null;
  }
}

// Fetch video details from Invidious API
async function fetchVideoDetails(videoId: string): Promise<{
  views: number;
  likes: number;
  durationSeconds: number;
} | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=viewCount,likeCount,lengthSeconds`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'OpenLinks-Activity-Feed',
        },
      });

      if (!res.ok) continue;

      const data = await res.json() as {
        viewCount?: number;
        likeCount?: number;
        lengthSeconds?: number;
      };

      return {
        views: data.viewCount || 0,
        likes: data.likeCount || 0,
        durationSeconds: data.lengthSeconds || 0,
      };
    } catch {
      // Try next instance
      continue;
    }
  }
  return null;
}

// Fetch channel details from Invidious API
async function fetchChannelDetails(channelId: string): Promise<{
  handle?: string;
  avatar?: string;
  subscribers?: number;
  totalViews?: number;
  videoCount?: number;
} | null> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await fetch(`${instance}/api/v1/channels/${channelId}?fields=author,authorId,authorUrl,authorThumbnails,subCount,totalViews,videoCount`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'OpenLinks-Activity-Feed',
        },
      });

      if (!res.ok) continue;

      const data = await res.json() as {
        author?: string;
        authorUrl?: string;
        authorThumbnails?: Array<{ url: string; width: number }>;
        subCount?: number;
        totalViews?: number;
        videoCount?: number;
      };

      // Extract handle from authorUrl (e.g., "/@OpenPrototype" -> "OpenPrototype")
      let handle: string | undefined;
      if (data.authorUrl) {
        const handleMatch = data.authorUrl.match(/\/@([^\/]+)/);
        handle = handleMatch?.[1];
      }

      // Get a reasonably sized avatar
      const avatar = data.authorThumbnails?.find(t => t.width >= 88)?.url ||
                     data.authorThumbnails?.[0]?.url;

      return {
        handle,
        avatar,
        subscribers: data.subCount,
        totalViews: data.totalViews,
        videoCount: data.videoCount,
      };
    } catch {
      // Try next instance
      continue;
    }
  }
  return null;
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const channelId = url.searchParams.get('channelId');

  if (!channelId) {
    return new Response(JSON.stringify({ error: 'Channel ID required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate channel ID format (should start with UC and be 24 chars)
  if (!channelId.startsWith('UC') || channelId.length !== 24) {
    return new Response(JSON.stringify({ error: 'Invalid channel ID format. Should start with UC and be 24 characters.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = Date.now();
  const cached = cache[channelId];

  // Return cached data if fresh
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return new Response(JSON.stringify({ ...cached.data, cached: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  // Fetch RSS feed
  const rss = await fetchRSS(channelId);

  if (!rss) {
    return new Response(JSON.stringify({ error: 'Failed to fetch YouTube feed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse RSS
  let { channel, videos } = parseRSS(rss);

  // Fetch additional channel details from Invidious
  const channelDetails = await fetchChannelDetails(channelId);
  if (channelDetails) {
    channel = {
      ...channel,
      handle: channelDetails.handle,
      avatar: channelDetails.avatar,
      subscribers: channelDetails.subscribers,
      totalViews: channelDetails.totalViews,
      videoCount: channelDetails.videoCount,
    };
  }

  // Fetch additional video details from Invidious (limit to first 4 to avoid rate limiting)
  const enrichedVideos = await Promise.all(
    videos.slice(0, 4).map(async (video) => {
      const details = await fetchVideoDetails(video.id);
      if (details) {
        return {
          ...video,
          views: details.views,
          likes: details.likes,
          durationSeconds: details.durationSeconds,
          duration: formatDuration(details.durationSeconds),
        };
      }
      return video;
    })
  );

  // Combine enriched videos with remaining videos
  const allVideos = [...enrichedVideos, ...videos.slice(4)];

  const data = {
    channel,
    videos: allVideos,
  };

  // Update cache
  cache[channelId] = { data, timestamp: now };

  return new Response(JSON.stringify({ ...data, cached: false }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
