import { defineCollection, z } from 'astro:content';

const links = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    url: z.string().url(),
    icon: z.string(),
    order: z.number(),
    embed: z.string().optional(),
    feed: z.enum(['github', 'github-org', 'discord', 'linkedin', 'substack', 'reddit', 'tiktok', 'youtube']).optional(),
    serverId: z.string().optional(), // Discord server ID for widget API
    linkedinUsername: z.string().optional(), // LinkedIn username for quick actions
    publication: z.string().optional(), // Substack publication name (e.g., "example" for example.substack.com)
    redditUsername: z.string().optional(), // Reddit username (without u/)
    tiktokUsername: z.string().optional(), // TikTok username (without @)
    tiktokVideoIds: z.array(z.string()).optional(), // Optional: specific video IDs to embed (LIMITATION: videos must be manually configured)
    youtubeChannelId: z.string().optional(), // YouTube channel ID (starts with UC, 24 chars)
    youtubeHandle: z.string().optional(), // YouTube handle (without @)
  }),
});

export const collections = { links };
