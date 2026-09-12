import type { CollectionConfig } from 'payload'

import { env } from '../env.js'

const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    livePreview: {
      url: ({ collectionConfig, data }) => {
        const { slug } = data

        if (!collectionConfig?.slug) {
          throw new Error('Collection slug is required')
        }

        const encodedParams = new URLSearchParams({
          slug: `${slug}`,
          collection: `${collectionConfig.slug}`,
          path: `/${collectionConfig.slug}/${slug}`,
          previewSecret: env.PREVIEW_SECRET,
        })

        return `/api/preview?${encodedParams.toString()}`
      },
    },
  },
  versions: {
    drafts: {
      autosave: true,
    },
  },

  fields: [
    {
      name: 'sections',
      type: 'blocks',
      blocks: ['hero', 'text'].map((slug) => ({
        slug,
        fields: [
          {
            name: 'cta',
            type: 'group',
            fields: [{ name: 'link', type: 'relationship', relationTo: 'posts' }],
          },
          { name: 'content', type: 'richText' },
        ],
      })),
    },
    { name: 'slug', type: 'text', required: true, unique: true },
    {
      name: 'title',
      type: 'text',
    },
    {
      name: 'content',
      type: 'richText',
    },
    {
      name: 'author',
      type: 'relationship',
      hasMany: false,
      relationTo: 'authors',
    },
    {
      name: 'image',
      type: 'upload',
      label: 'Image',
      relationTo: 'media',
      required: false,
    },
  ],
}

export default Posts
