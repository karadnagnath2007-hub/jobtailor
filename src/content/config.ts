import { defineCollection, z } from 'astro:content';

const blogCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.string(),
    readingTime: z.string(),
  }),
});

const rolesCollection = defineCollection({
  type: 'data',
  schema: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    bullets: z.array(z.string()),
  }),
});

export const collections = {
  blog: blogCollection,
  roles: rolesCollection,
};
