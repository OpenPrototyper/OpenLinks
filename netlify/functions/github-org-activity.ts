import type { Context } from "@netlify/functions";

interface GitHubEvent {
  type: string;
  repo: { name: string };
  actor: { login: string; avatar_url: string };
  payload: {
    commits?: { message: string }[];
    action?: string;
    ref_type?: string;
    ref?: string;
    release?: { tag_name: string };
    member?: { login: string };
  };
  created_at: string;
}

interface GitHubOrg {
  name: string;
  description: string | null;
  avatar_url: string;
  public_repos: number;
  followers: number;
}

interface GitHubRepo {
  name: string;
  description: string | null;
  stargazers_count: number;
  language: string | null;
  pushed_at: string;
  html_url: string;
}

interface ProcessedEvent {
  type: string;
  repo: string;
  time: string;
  message: string;
}

interface ProcessedRepo {
  name: string;
  description: string;
  stars: number;
  language: string;
  updatedAt: string;
  url: string;
}

interface CachedData {
  data: {
    org: {
      name: string;
      description: string;
      avatar: string;
      repoCount: number;
      memberCount: number;
    };
    events: ProcessedEvent[];
    repos: ProcessedRepo[];
  };
  timestamp: number;
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

function processEvent(event: GitHubEvent, orgName: string): ProcessedEvent | null {
  // Extract repo name (remove org prefix)
  const repoFullName = event.repo.name;
  const repo = repoFullName.includes('/')
    ? repoFullName.split('/')[1]
    : repoFullName;
  const time = formatRelativeTime(event.created_at);

  switch (event.type) {
    case 'PushEvent':
      const commitMsg = event.payload.commits?.[0]?.message?.split('\n')[0] || 'Pushed code';
      return { type: 'push', repo, time, message: `Pushed to ${repo}: ${commitMsg.slice(0, 50)}` };

    case 'PullRequestEvent':
      return { type: 'pr', repo, time, message: `${event.payload.action} PR on ${repo}` };

    case 'IssuesEvent':
      return { type: 'issue', repo, time, message: `${event.payload.action} issue on ${repo}` };

    case 'WatchEvent':
      return { type: 'star', repo, time, message: `${event.actor.login} starred ${repo}` };

    case 'ForkEvent':
      return { type: 'fork', repo, time, message: `${event.actor.login} forked ${repo}` };

    case 'CreateEvent':
      const refType = event.payload.ref_type;
      const ref = event.payload.ref;
      if (refType === 'repository') {
        return { type: 'create', repo, time, message: `Created repository ${repo}` };
      }
      return { type: 'create', repo, time, message: `Created ${refType} ${ref} on ${repo}` };

    case 'ReleaseEvent':
      const tag = event.payload.release?.tag_name || 'new version';
      return { type: 'release', repo, time, message: `Released ${tag} on ${repo}` };

    case 'MemberEvent':
      const member = event.payload.member?.login || 'someone';
      return { type: 'member', repo, time, message: `Added ${member} to ${repo}` };

    default:
      return null;
  }
}

async function fetchOrgInfo(org: string): Promise<GitHubOrg | null> {
  try {
    const res = await fetch(`https://api.github.com/orgs/${org}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'OpenLinks-Activity-Feed',
      },
    });

    if (!res.ok) {
      console.error(`GitHub Org API error: ${res.status}`);
      return null;
    }

    return await res.json() as GitHubOrg;
  } catch (err) {
    console.error('Error fetching org info:', err);
    return null;
  }
}

async function fetchOrgEvents(org: string): Promise<ProcessedEvent[]> {
  try {
    const res = await fetch(`https://api.github.com/orgs/${org}/events?per_page=30`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'OpenLinks-Activity-Feed',
      },
    });

    if (!res.ok) {
      console.error(`GitHub Org Events API error: ${res.status}`);
      return [];
    }

    const events = await res.json() as GitHubEvent[];
    return events
      .map(e => processEvent(e, org))
      .filter((e): e is ProcessedEvent => e !== null)
      .slice(0, 10);
  } catch (err) {
    console.error('Error fetching org events:', err);
    return [];
  }
}

async function fetchOrgRepos(org: string): Promise<ProcessedRepo[]> {
  try {
    const res = await fetch(`https://api.github.com/orgs/${org}/repos?sort=pushed&per_page=12`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'OpenLinks-Activity-Feed',
      },
    });

    if (!res.ok) {
      console.error(`GitHub Org Repos API error: ${res.status}`);
      return [];
    }

    const repos = await res.json() as GitHubRepo[];
    return repos.map(repo => ({
      name: repo.name,
      description: repo.description || '',
      stars: repo.stargazers_count,
      language: repo.language || '',
      updatedAt: formatRelativeTime(repo.pushed_at),
      url: repo.html_url,
    }));
  } catch (err) {
    console.error('Error fetching org repos:', err);
    return [];
  }
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const org = url.searchParams.get('org');

  if (!org) {
    return new Response(JSON.stringify({ error: 'Organization name required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = Date.now();
  const cached = cache[org];

  // Return cached data if fresh
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return new Response(JSON.stringify({ ...cached.data, cached: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  // Fetch fresh data in parallel
  const [orgInfo, events, repos] = await Promise.all([
    fetchOrgInfo(org),
    fetchOrgEvents(org),
    fetchOrgRepos(org),
  ]);

  if (!orgInfo) {
    return new Response(JSON.stringify({ error: 'Organization not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const data = {
    org: {
      name: orgInfo.name || org,
      description: orgInfo.description || '',
      avatar: orgInfo.avatar_url,
      repoCount: orgInfo.public_repos,
      memberCount: orgInfo.followers,
    },
    events,
    repos,
  };

  // Update cache
  cache[org] = { data, timestamp: now };

  return new Response(JSON.stringify({ ...data, cached: false }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
};
