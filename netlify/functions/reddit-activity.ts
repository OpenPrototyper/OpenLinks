import type { Context } from "@netlify/functions";

interface RedditUser {
  name: string;
  icon_img: string;
  link_karma: number;
  comment_karma: number;
  total_karma: number;
  created_utc: number;
  is_gold: boolean;
  is_mod: boolean;
  verified: boolean;
  subreddit?: {
    public_description?: string;
  };
}

interface RedditActivity {
  kind: string; // t1 = comment, t3 = post
  data: {
    id: string;
    author: string;
    subreddit: string;
    subreddit_name_prefixed: string;
    score: number;
    created_utc: number;
    permalink: string;
    distinguished: string | null;
    // Post-specific
    title?: string;
    num_comments?: number;
    url?: string;
    is_self?: boolean;
    selftext?: string;
    // Comment-specific
    body?: string;
    link_title?: string;
  };
}

interface ProcessedActivity {
  id: string;
  type: 'post' | 'comment';
  subreddit: string;
  score: number;
  time: string;
  createdAt: number;
  permalink: string;
  distinguished: string | null;
  // Post fields
  title?: string;
  numComments?: number;
  // Comment fields
  body?: string;
  linkTitle?: string;
}

interface ProcessedUser {
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

interface CachedData {
  data: {
    user: ProcessedUser;
    activities: ProcessedActivity[];
  };
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
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
  return `${Math.floor(diffDays / 30)}mo`;
}

function formatAccountAge(createdUtc: number): string {
  const created = new Date(createdUtc * 1000);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  const diffYears = Math.floor(diffDays / 365);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffYears > 0) return `${diffYears}y`;
  if (diffMonths > 0) return `${diffMonths}mo`;
  return `${diffDays}d`;
}

function truncateText(text: string, maxLength: number): string {
  if (!text) return '';
  const cleaned = text.replace(/\n+/g, ' ').trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength).trim() + '...';
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function fetchRedditUser(username: string): Promise<RedditUser | null> {
  try {
    const res = await fetch(`https://www.reddit.com/user/${username}/about.json`, {
      headers: {
        'User-Agent': 'OpenLinks-Activity-Feed/1.0',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`Reddit user fetch error: ${res.status}`);
      return null;
    }

    const json = await res.json() as { data: RedditUser };
    return json.data;
  } catch (err) {
    console.error('Error fetching Reddit user:', err);
    return null;
  }
}

async function fetchRedditActivity(username: string): Promise<RedditActivity[]> {
  try {
    const res = await fetch(`https://www.reddit.com/user/${username}.json?limit=15`, {
      headers: {
        'User-Agent': 'OpenLinks-Activity-Feed/1.0',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      console.error(`Reddit activity fetch error: ${res.status}`);
      return [];
    }

    const json = await res.json() as { data: { children: RedditActivity[] } };
    return json.data.children || [];
  } catch (err) {
    console.error('Error fetching Reddit activity:', err);
    return [];
  }
}

function processActivity(item: RedditActivity): ProcessedActivity {
  const { kind, data } = item;
  const isComment = kind === 't1';

  const base: ProcessedActivity = {
    id: data.id,
    type: isComment ? 'comment' : 'post',
    subreddit: data.subreddit_name_prefixed,
    score: data.score,
    time: formatRelativeTime(data.created_utc),
    createdAt: data.created_utc,
    permalink: `https://reddit.com${data.permalink}`,
    distinguished: data.distinguished,
  };

  if (isComment) {
    return {
      ...base,
      body: truncateText(data.body || '', 120),
      linkTitle: data.link_title,
    };
  } else {
    return {
      ...base,
      title: data.title,
      numComments: data.num_comments,
    };
  }
}

function processUser(user: RedditUser): ProcessedUser {
  return {
    name: user.name,
    iconUrl: decodeHtmlEntities(user.icon_img || ''),
    linkKarma: user.link_karma,
    commentKarma: user.comment_karma,
    totalKarma: user.total_karma,
    createdAt: user.created_utc,
    accountAge: formatAccountAge(user.created_utc),
    isGold: user.is_gold,
    isMod: user.is_mod,
    verified: user.verified,
    bio: user.subreddit?.public_description || '',
  };
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const username = url.searchParams.get('username');

  if (!username) {
    return new Response(JSON.stringify({ error: 'Username required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const normalizedUsername = username.replace(/^u\//, '').toLowerCase();
  const now = Date.now();
  const cached = cache[normalizedUsername];

  // Return cached data if fresh
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return new Response(JSON.stringify({ ...cached.data, cached: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  // Fetch user and activity in parallel
  const [user, activities] = await Promise.all([
    fetchRedditUser(normalizedUsername),
    fetchRedditActivity(normalizedUsername),
  ]);

  if (!user) {
    return new Response(JSON.stringify({ error: 'User not found or private' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const processedUser = processUser(user);
  const processedActivities = activities.map(processActivity);

  const data = {
    user: processedUser,
    activities: processedActivities,
  };

  // Update cache
  cache[normalizedUsername] = { data, timestamp: now };

  return new Response(JSON.stringify({ ...data, cached: false }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
