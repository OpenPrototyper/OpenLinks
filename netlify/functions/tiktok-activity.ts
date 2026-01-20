import type { Context } from "@netlify/functions";

/**
 * TikTok Activity Feed - Netlify Function
 *
 * LIMITATIONS:
 * - Uses web scraping which may break if TikTok changes their page structure
 * - No official API access - TikTok requires OAuth for their Display API
 * - Rate limited by TikTok's anti-bot measures (may need proxies at scale)
 * - Video data requires separate oEmbed calls per video URL
 * - Some regions may be geo-blocked
 * - Data freshness depends on TikTok's SSR hydration data
 */

interface TikTokUser {
  id: string;
  uniqueId: string;       // username
  nickname: string;       // display name
  avatarLarger: string;
  signature: string;      // bio
  verified: boolean;
  secUid: string;
  followerCount: number;
  followingCount: number;
  heartCount: number;     // total likes received
  videoCount: number;
  diggCount: number;      // likes given
}

interface TikTokVideo {
  id: string;
  desc: string;           // caption
  createTime: number;     // unix timestamp
  stats: {
    playCount: number;
    diggCount: number;    // likes
    commentCount: number;
    shareCount: number;
  };
  video: {
    cover: string;
    duration: number;
  };
}

interface ProcessedVideo {
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

interface CachedData {
  data: {
    user: {
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
    } | null;
    videos: ProcessedVideo[];
    error?: string;
  };
  timestamp: number;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes (longer due to scraping fragility)
const cache: Record<string, CachedData> = {};

function formatRelativeTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 30) return `${diffDays}d`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo`;
  return `${Math.floor(diffDays / 365)}y`;
}

/**
 * Scrapes TikTok profile page for user data
 *
 * LIMITATION: This relies on TikTok's __UNIVERSAL_DATA_FOR_REHYDRATION__ script tag
 * which contains SSR data. This can change without notice.
 */
async function scrapeTikTokProfile(username: string): Promise<{
  user: TikTokUser | null;
  videos: TikTokVideo[];
}> {
  try {
    const res = await fetch(`https://www.tiktok.com/@${username}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
      },
    });

    if (!res.ok) {
      console.error(`TikTok fetch error: ${res.status}`);
      return { user: null, videos: [] };
    }

    const html = await res.text();

    // Try to extract the SIGI_STATE or __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON
    // TikTok has changed this format multiple times
    let jsonData: any = null;

    // Method 1: __UNIVERSAL_DATA_FOR_REHYDRATION__ (newer)
    const universalMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/);
    if (universalMatch) {
      try {
        jsonData = JSON.parse(universalMatch[1]);
        // Navigate to user data in the new structure
        const defaultScope = jsonData?.__DEFAULT_SCOPE__;
        if (defaultScope) {
          const userDetail = defaultScope['webapp.user-detail'];
          if (userDetail?.userInfo) {
            const user = userDetail.userInfo.user;
            const stats = userDetail.userInfo.stats;
            return {
              user: {
                id: user.id,
                uniqueId: user.uniqueId,
                nickname: user.nickname,
                avatarLarger: user.avatarLarger,
                signature: user.signature || '',
                verified: user.verified || false,
                secUid: user.secUid,
                followerCount: stats?.followerCount || 0,
                followingCount: stats?.followingCount || 0,
                heartCount: stats?.heartCount || stats?.heart || 0,
                videoCount: stats?.videoCount || 0,
                diggCount: stats?.diggCount || 0,
              },
              videos: [], // Videos are loaded dynamically, not in initial SSR
            };
          }
        }
      } catch (e) {
        console.error('Failed to parse __UNIVERSAL_DATA_FOR_REHYDRATION__:', e);
      }
    }

    // Method 2: SIGI_STATE (older format, may still work)
    const sigiMatch = html.match(/<script id="SIGI_STATE"[^>]*>([^<]+)<\/script>/);
    if (sigiMatch) {
      try {
        jsonData = JSON.parse(sigiMatch[1]);
        const userModule = jsonData?.UserModule;
        const userKey = Object.keys(userModule?.users || {})[0];
        if (userKey) {
          const user = userModule.users[userKey];
          const stats = userModule.stats?.[userKey];
          return {
            user: {
              id: user.id,
              uniqueId: user.uniqueId,
              nickname: user.nickname,
              avatarLarger: user.avatarLarger,
              signature: user.signature || '',
              verified: user.verified || false,
              secUid: user.secUid,
              followerCount: stats?.followerCount || 0,
              followingCount: stats?.followingCount || 0,
              heartCount: stats?.heartCount || 0,
              videoCount: stats?.videoCount || 0,
              diggCount: stats?.diggCount || 0,
            },
            videos: [],
          };
        }
      } catch (e) {
        console.error('Failed to parse SIGI_STATE:', e);
      }
    }

    // Method 3: Try to find any JSON with user data pattern
    const jsonPattern = /"uniqueId"\s*:\s*"([^"]+)".*?"followerCount"\s*:\s*(\d+)/;
    const patternMatch = html.match(jsonPattern);
    if (patternMatch) {
      console.log('Found user via pattern match, but cannot extract full data');
    }

    console.error('Could not find TikTok user data in page - structure may have changed');
    return { user: null, videos: [] };

  } catch (err) {
    console.error('Error scraping TikTok:', err);
    return { user: null, videos: [] };
  }
}

/**
 * Fetches oEmbed data for a TikTok video URL
 *
 * LIMITATION: This is the only "official" way to embed videos without OAuth
 * but requires knowing the video URL beforehand
 */
async function fetchVideoEmbed(videoUrl: string): Promise<{
  html: string;
  title: string;
  thumbnail: string;
  thumbnailWidth: number;
  thumbnailHeight: number;
} | null> {
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`);
    if (!res.ok) return null;

    const data = await res.json();
    return {
      html: data.html || '',
      title: data.title || '',
      thumbnail: data.thumbnail_url || '',
      thumbnailWidth: data.thumbnail_width || 720,
      thumbnailHeight: data.thumbnail_height || 1280,
    };
  } catch {
    return null;
  }
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const username = url.searchParams.get('username');
  // Optional: comma-separated video IDs to fetch embeds for
  const videoIds = url.searchParams.get('videoIds')?.split(',').filter(Boolean) || [];

  if (!username) {
    return new Response(JSON.stringify({ error: 'Username required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cacheKey = `${username}-${videoIds.join(',')}`;
  const now = Date.now();
  const cached = cache[cacheKey];

  // Return cached data if fresh
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return new Response(JSON.stringify({ ...cached.data, cached: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600',
      },
    });
  }

  // Scrape profile data
  const { user: rawUser, videos: rawVideos } = await scrapeTikTokProfile(username);

  // Fetch oEmbed data for specified videos (if any)
  const processedVideos: ProcessedVideo[] = [];

  if (videoIds.length > 0) {
    // Fetch embeds for user-specified video IDs
    const embedPromises = videoIds.slice(0, 3).map(async (videoId) => {
      const videoUrl = `https://www.tiktok.com/@${username}/video/${videoId}`;
      const embed = await fetchVideoEmbed(videoUrl);
      return {
        id: videoId,
        caption: embed?.title || '',
        time: '', // Unknown without full video data
        plays: 0,
        likes: 0,
        comments: 0,
        shares: 0,
        cover: embed?.thumbnail || '',
        duration: 0,
        embedHtml: embed?.html,
      };
    });

    const embeds = await Promise.all(embedPromises);
    processedVideos.push(...embeds.filter(v => v.cover || v.embedHtml));
  }

  const data = {
    user: rawUser ? {
      id: rawUser.id,
      username: rawUser.uniqueId,
      nickname: rawUser.nickname,
      avatar: rawUser.avatarLarger,
      bio: rawUser.signature,
      verified: rawUser.verified,
      followers: rawUser.followerCount,
      following: rawUser.followingCount,
      likes: rawUser.heartCount,
      videoCount: rawUser.videoCount,
    } : null,
    videos: processedVideos,
    // Include limitation notice in response for transparency
    _notice: rawUser
      ? undefined
      : 'TikTok scraping may have failed. Their page structure changes frequently.',
  };

  // Update cache
  cache[cacheKey] = { data, timestamp: now };

  return new Response(JSON.stringify({ ...data, cached: false }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=600',
    },
  });
};
