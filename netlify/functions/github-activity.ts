import type { Context } from "@netlify/functions";

interface GitHubEvent {
  type: string;
  repo: { name: string };
  payload: {
    commits?: { message: string }[];
    action?: string;
    ref_type?: string;
    ref?: string;
  };
  created_at: string;
}

interface ContributionDay {
  date: string;
  count: number;
  level: number;
}

interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  bio: string | null;
  public_repos: number;
  followers: number;
}

interface CachedData {
  data: {
    user: {
      name: string;
      login: string;
      avatar: string;
      bio: string;
      repoCount: number;
      followers: number;
    };
    events: ProcessedEvent[];
    contributions: { days: ContributionDay[]; total: number };
  };
  timestamp: number;
}

interface ProcessedEvent {
  type: string;
  repo: string;
  time: string;
  message: string;
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

function processEvent(event: GitHubEvent): ProcessedEvent | null {
  const fullRepo = event.repo.name; // e.g., "owner/repo"
  const shortRepo = event.repo.name.split('/')[1] || event.repo.name; // e.g., "repo"
  const time = formatRelativeTime(event.created_at);

  switch (event.type) {
    case 'PushEvent':
      const commitMsg = event.payload.commits?.[0]?.message?.split('\n')[0] || 'Pushed code';
      return { type: 'push', repo: shortRepo, time, message: `Pushed to ${shortRepo}: ${commitMsg.slice(0, 50)}` };

    case 'PullRequestEvent':
      return { type: 'pr', repo: shortRepo, time, message: `${event.payload.action} PR on ${shortRepo}` };

    case 'IssuesEvent':
      return { type: 'issue', repo: shortRepo, time, message: `${event.payload.action} issue on ${shortRepo}` };

    case 'WatchEvent':
      // Use full repo name for starred repos (they belong to others)
      return { type: 'star', repo: fullRepo, time, message: `Starred ${fullRepo}` };

    case 'ForkEvent':
      // Use full repo name for forked repos (they belong to others)
      return { type: 'fork', repo: fullRepo, time, message: `Forked ${fullRepo}` };

    case 'CreateEvent':
      const refType = event.payload.ref_type;
      const ref = event.payload.ref;
      if (refType === 'repository') {
        return { type: 'create', repo: shortRepo, time, message: `Created repository ${shortRepo}` };
      }
      return { type: 'create', repo: shortRepo, time, message: `Created ${refType} ${ref} on ${shortRepo}` };

    default:
      return null;
  }
}

async function fetchUserInfo(username: string): Promise<GitHubUser | null> {
  try {
    const res = await fetch(`https://api.github.com/users/${username}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'OpenLinks-Activity-Feed',
      },
    });

    if (!res.ok) {
      console.error(`GitHub User API error: ${res.status}`);
      return null;
    }

    return await res.json() as GitHubUser;
  } catch (err) {
    console.error('Error fetching user info:', err);
    return null;
  }
}

async function fetchEvents(username: string): Promise<ProcessedEvent[]> {
  try {
    const res = await fetch(`https://api.github.com/users/${username}/events/public?per_page=30`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'OpenLinks-Activity-Feed',
      },
    });

    if (!res.ok) {
      console.error(`GitHub Events API error: ${res.status}`);
      return [];
    }

    const events = await res.json() as GitHubEvent[];
    return events
      .map(processEvent)
      .filter((e): e is ProcessedEvent => e !== null)
      .slice(0, 10);
  } catch (err) {
    console.error('Error fetching GitHub events:', err);
    return [];
  }
}

async function fetchContributions(username: string): Promise<{ days: ContributionDay[]; total: number }> {
  try {
    // Use the Gruber API for contribution data
    const res = await fetch(`https://github-contributions-api.jogruber.de/v4/${username}?y=last`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'OpenLinks-Activity-Feed',
      },
    });

    if (!res.ok) {
      console.error(`Contributions API error: ${res.status}`);
      return { days: [], total: 0 };
    }

    const data = await res.json() as {
      total: Record<string, number>;
      contributions: Array<{ date: string; count: number; level: number }>;
    };

    // Calculate total from all years in response
    const total = Object.values(data.total).reduce((sum, val) => sum + val, 0);

    // Return the contribution days
    return {
      days: data.contributions || [],
      total,
    };
  } catch (err) {
    console.error('Error fetching contributions:', err);
    return { days: [], total: 0 };
  }
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

  const now = Date.now();
  const cached = cache[username];

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
  const [userInfo, events, contributions] = await Promise.all([
    fetchUserInfo(username),
    fetchEvents(username),
    fetchContributions(username),
  ]);

  const data = {
    user: userInfo ? {
      name: userInfo.name || userInfo.login,
      login: userInfo.login,
      avatar: userInfo.avatar_url,
      bio: userInfo.bio || '',
      repoCount: userInfo.public_repos,
      followers: userInfo.followers,
    } : null,
    events,
    contributions,
  };

  // Update cache
  cache[username] = { data, timestamp: now };

  return new Response(JSON.stringify({ ...data, cached: false }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
