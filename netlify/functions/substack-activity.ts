import type { Context } from "@netlify/functions";

interface SubstackPost {
  title: string;
  subtitle: string;
  slug: string;
  publishedAt: string;
  url: string;
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

interface CachedData {
  data: {
    publication: SubstackPublication;
    posts: ProcessedPost[];
  };
  timestamp: number;
}

interface ProcessedPost {
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

// Parse RSS XML to extract posts and publication info
function parseRSS(xml: string, publication: string): { publication: SubstackPublication; posts: ProcessedPost[] } {
  // Extract publication info from channel
  const channelTitleMatch = xml.match(/<channel>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>/);
  const channelDescMatch = xml.match(/<channel>[\s\S]*?<description><!\[CDATA\[(.*?)\]\]><\/description>/);
  const authorMatch = xml.match(/<dc:creator><!\[CDATA\[(.*?)\]\]><\/dc:creator>/);
  const imageMatch = xml.match(/<image>[\s\S]*?<url>(.*?)<\/url>/);

  const publicationInfo: SubstackPublication = {
    name: channelTitleMatch?.[1] || publication,
    description: channelDescMatch?.[1] || '',
    authorName: authorMatch?.[1] || '',
    logoUrl: imageMatch?.[1] || '',
    subscriberCount: null,
  };

  // Extract posts from items
  const posts: ProcessedPost[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && posts.length < 10) {
    const item = match[1];

    const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/);
    const linkMatch = item.match(/<link>(.*?)<\/link>/);
    const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
    const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/s);

    if (titleMatch && linkMatch && pubDateMatch) {
      const url = linkMatch[1];
      const slug = url.split('/p/')[1]?.split('?')[0] || '';

      // Extract subtitle from description (first line or truncated)
      let subtitle = '';
      if (descMatch) {
        // Remove HTML tags and get first 100 chars
        subtitle = descMatch[1]
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim()
          .slice(0, 100);
        if (subtitle.length === 100) subtitle += '...';
      }

      posts.push({
        title: titleMatch[1],
        subtitle,
        slug,
        url,
        time: formatRelativeTime(pubDateMatch[1]),
        publishedAt: pubDateMatch[1],
        likes: 0,
        comments: 0,
        restacks: 0,
      });
    }
  }

  return { publication: publicationInfo, posts };
}

// Fetch post stats from undocumented API
async function fetchPostStats(publication: string, slug: string): Promise<{ likes: number; comments: number; restacks: number } | null> {
  try {
    const res = await fetch(`https://${publication}.substack.com/api/v1/posts/${slug}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'OpenLinks-Activity-Feed',
      },
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      reactions?: { '❤'?: number };
      comment_count?: number;
      restacks?: number;
    };

    return {
      likes: data.reactions?.['❤'] || 0,
      comments: data.comment_count || 0,
      restacks: data.restacks || 0,
    };
  } catch {
    return null;
  }
}

// Fetch RSS feed
async function fetchRSS(publication: string): Promise<string | null> {
  try {
    const res = await fetch(`https://${publication}.substack.com/feed`, {
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml',
        'User-Agent': 'OpenLinks-Activity-Feed',
      },
    });

    if (!res.ok) {
      console.error(`Substack RSS error: ${res.status}`);
      return null;
    }

    return await res.text();
  } catch (err) {
    console.error('Error fetching Substack RSS:', err);
    return null;
  }
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const publication = url.searchParams.get('publication');

  if (!publication) {
    return new Response(JSON.stringify({ error: 'Publication required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Normalize publication name (remove .substack.com if present)
  const pubName = publication.replace('.substack.com', '').toLowerCase();

  const now = Date.now();
  const cached = cache[pubName];

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
  const rss = await fetchRSS(pubName);

  if (!rss) {
    return new Response(JSON.stringify({ error: 'Failed to fetch Substack feed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse RSS
  const { publication: pubInfo, posts } = parseRSS(rss, pubName);

  // Fetch stats for first 5 posts (to avoid rate limiting)
  const postsWithStats = await Promise.all(
    posts.slice(0, 5).map(async (post) => {
      const stats = await fetchPostStats(pubName, post.slug);
      if (stats) {
        return { ...post, ...stats };
      }
      return post;
    })
  );

  // Combine with remaining posts (without stats)
  const allPosts = [...postsWithStats, ...posts.slice(5)];

  const data = {
    publication: pubInfo,
    posts: allPosts,
  };

  // Update cache
  cache[pubName] = { data, timestamp: now };

  return new Response(JSON.stringify({ ...data, cached: false }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
