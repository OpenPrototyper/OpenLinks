import { defineCollection, z } from 'astro:content';

const links = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    url: z.string().url(),
    icon: z.string(),
    order: z.number(),
    embed: z.string().optional(),
    feed: z.enum(['github', 'github-org', 'discord']).optional(),
    serverId: z.string().optional(), // Discord server ID for widget API
  }),
});

export const collections = { links };
