import { defineCollection, z } from 'astro:content';

const links = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    url: z.string().url(),
    icon: z.string(),
    order: z.number(),
    embed: z.string().optional(),
    feed: z.enum(['github', 'github-org', 'discord', 'linkedin']).optional(),
    serverId: z.string().optional(), // Discord server ID for widget API
    linkedinUsername: z.string().optional(), // LinkedIn username for quick actions
  }),
});

export const collections = { links };
