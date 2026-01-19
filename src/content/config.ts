import { defineCollection, z } from 'astro:content';

const links = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    url: z.string().url(),
    icon: z.string(),
    order: z.number(),
    embed: z.string().optional(),
    feed: z.enum(['github']).optional(),
  }),
});

export const collections = { links };
