import type { Context } from "@netlify/functions";

/**
 * Instagram Activity Feed - Netlify Function
 *
 * LIMITATIONS:
 * - Uses web scraping which may break if Instagram changes their page structure
 * - No official API access without OAuth + Business account
 * - Rate limited by Instagram's anti-bot measures
 * - Post data requires oEmbed calls per post URL
 * - Some regions may be geo-blocked
 */

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
  embedHtml?: string;
}

interface CachedData {
  data: {
    user: InstagramUser | null;
    posts: InstagramPost[];
    _notice?: string;
  };
  timestamp: number;
}

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const cache: Record<string, CachedData> = {};

/**
 * Scrapes Instagram profile page for user data
 */
async function scrapeInstagramProfile(username: string): Promise<InstagramUser | null> {
  try {
    const res = await fetch(`https://www.instagram.com/${username}/`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
      },
    });

    if (!res.ok) {
      console.error(`Instagram fetch error: ${res.status}`);
      return null;
    }

    const html = await res.text();

    // Method 1: Try to find window._sharedData (older format)
    const sharedDataMatch = html.match(/window\._sharedData\s*=\s*({.+?});<\/script>/);
    if (sharedDataMatch) {
      try {
        const data = JSON.parse(sharedDataMatch[1]);
        const user = data?.entry_data?.ProfilePage?.[0]?.graphql?.user;
        if (user) {
          return {
            username: user.username,
            fullName: user.full_name || '',
            avatar: user.profile_pic_url_hd || user.profile_pic_url || '',
            bio: user.biography || '',
            verified: user.is_verified || false,
            followers: user.edge_followed_by?.count || 0,
            following: user.edge_follow?.count || 0,
            postCount: user.edge_owner_to_timeline_media?.count || 0,
          };
        }
      } catch (e) {
        console.error('Failed to parse _sharedData:', e);
      }
    }

    // Method 2: Try __additionalDataLoaded (newer format)
    const additionalDataMatch = html.match(/window\.__additionalDataLoaded\s*\(\s*['"][^'"]+['"]\s*,\s*({.+?})\s*\)\s*;/);
    if (additionalDataMatch) {
      try {
        const data = JSON.parse(additionalDataMatch[1]);
        const user = data?.graphql?.user || data?.user;
        if (user) {
          return {
            username: user.username,
            fullName: user.full_name || '',
            avatar: user.profile_pic_url_hd || user.profile_pic_url || '',
            bio: user.biography || '',
            verified: user.is_verified || false,
            followers: user.edge_followed_by?.count || user.follower_count || 0,
            following: user.edge_follow?.count || user.following_count || 0,
            postCount: user.edge_owner_to_timeline_media?.count || user.media_count || 0,
          };
        }
      } catch (e) {
        console.error('Failed to parse __additionalDataLoaded:', e);
      }
    }

    // Method 3: Try to find JSON in script tags with user data pattern
    const scriptMatches = html.matchAll(/<script[^>]*>([^<]*"username"\s*:\s*"[^"]+"[^<]*)<\/script>/g);
    for (const match of scriptMatches) {
      try {
        // Try to extract a JSON object containing the user data
        const jsonMatch = match[1].match(/\{[^{}]*"username"\s*:\s*"[^"]+(?:"[^{}]*|\{[^{}]*\})*\}/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0]);
          if (data.username === username || data.username?.toLowerCase() === username.toLowerCase()) {
            return {
              username: data.username,
              fullName: data.full_name || '',
              avatar: data.profile_pic_url_hd || data.profile_pic_url || '',
              bio: data.biography || '',
              verified: data.is_verified || false,
              followers: data.edge_followed_by?.count || data.follower_count || 0,
              following: data.edge_follow?.count || data.following_count || 0,
              postCount: data.edge_owner_to_timeline_media?.count || data.media_count || 0,
            };
          }
        }
      } catch {
        // Continue trying other matches
      }
    }

    // Method 4: Try meta tags as fallback for basic info
    const descMatch = html.match(/<meta\s+(?:name|property)="(?:description|og:description)"\s+content="([^"]+)"/i);
    const titleMatch = html.match(/<meta\s+(?:name|property)="og:title"\s+content="([^"]+)"/i);
    const imageMatch = html.match(/<meta\s+(?:name|property)="og:image"\s+content="([^"]+)"/i);

    if (descMatch) {
      // Parse description like "1,234 Followers, 567 Following, 89 Posts - See Instagram photos and videos from Name (@username)"
      const desc = descMatch[1];
      const followersMatch = desc.match(/([\d,]+)\s*Followers/i);
      const followingMatch = desc.match(/([\d,]+)\s*Following/i);
      const postsMatch = desc.match(/([\d,]+)\s*Posts/i);
      const nameMatch = desc.match(/from\s+([^(@]+)\s*\(@/);

      if (followersMatch) {
        return {
          username: username,
          fullName: nameMatch ? nameMatch[1].trim() : '',
          avatar: imageMatch ? imageMatch[1] : '',
          bio: '',
          verified: false,
          followers: parseInt(followersMatch[1].replace(/,/g, '')) || 0,
          following: followingMatch ? parseInt(followingMatch[1].replace(/,/g, '')) || 0 : 0,
          postCount: postsMatch ? parseInt(postsMatch[1].replace(/,/g, '')) || 0 : 0,
        };
      }
    }

    console.error('Could not find Instagram user data in page - structure may have changed');
    return null;

  } catch (err) {
    console.error('Error scraping Instagram:', err);
    return null;
  }
}

/**
 * Fetches oEmbed data for an Instagram post
 */
async function fetchPostEmbed(shortcode: string): Promise<InstagramPost | null> {
  try {
    const postUrl = `https://www.instagram.com/p/${shortcode}/`;
    const oembedUrl = `https://api.instagram.com/oembed?url=${encodeURIComponent(postUrl)}`;

    const res = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) {
      console.error(`Instagram oEmbed error for ${shortcode}: ${res.status}`);
      return null;
    }

    const text = await res.text();

    // Check if response is HTML (error page) instead of JSON
    if (text.startsWith('<!') || text.startsWith('<html')) {
      console.error(`Instagram oEmbed returned HTML for ${shortcode}`);
      return null;
    }

    const data = JSON.parse(text) as {
      title?: string;
      thumbnail_url?: string;
      html?: string;
    };

    return {
      id: shortcode,
      caption: data.title || '',
      thumbnail: data.thumbnail_url || '',
      permalink: postUrl,
      embedHtml: data.html,
    };
  } catch (err) {
    console.error(`Error fetching oEmbed for ${shortcode}:`, err);
    return null;
  }
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const username = url.searchParams.get('username');
  const postIds = url.searchParams.get('postIds')?.split(',').filter(Boolean) || [];

  if (!username) {
    return new Response(JSON.stringify({ error: 'Username required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cacheKey = `${username.toLowerCase()}-${postIds.join(',')}`;
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
  const user = await scrapeInstagramProfile(username);

  // Fetch oEmbed data for specified posts (if any)
  const posts: InstagramPost[] = [];

  if (postIds.length > 0) {
    const embedPromises = postIds.slice(0, 6).map(fetchPostEmbed);
    const embeds = await Promise.all(embedPromises);
    posts.push(...embeds.filter((p): p is InstagramPost => p !== null));
  }

  const data = {
    user,
    posts,
    _notice: user
      ? undefined
      : 'Instagram scraping may have failed. Their page structure changes frequently.',
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
