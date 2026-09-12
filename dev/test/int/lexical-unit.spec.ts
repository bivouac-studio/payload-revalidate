import type { Field } from 'payload'
import { expect, test, vi } from 'vitest'
import { extractRelationFieldPaths } from '../../../src/lib/config-parser.js'
import {
  getRevalidationTagsCollectionItem,
  lexicalReferences,
  type RevalidateCollectionParams,
} from '../../../src/lib/revalidation.js'

const upload = (collection: string, value: unknown) => ({
  type: 'upload',
  relationTo: collection,
  value,
})
const rich = (...children: unknown[]) => ({ root: { type: 'root', children } })

test('Lexical references include nested uploads, relationships and internal links with string IDs', () => {
  expect(
    lexicalReferences(
      rich({
        type: 'paragraph',
        children: [
          upload('media', { id: 'image', content: rich(upload('media', 'not-a-node')) }),
          { type: 'relationship', relationTo: 'authors', value: 0 },
          {
            type: 'link',
            fields: { linkType: 'internal', doc: { relationTo: 'posts', value: { id: 9 } } },
          },
          upload('media', null),
          { type: 'text', relationTo: 'media', value: 'not-a-reference' },
        ],
      }),
    ),
  ).toEqual([
    { collection: 'media', id: 'image' },
    { collection: 'authors', id: 0 },
    { collection: 'posts', id: 9 },
  ])
})

test('schema traversal finds rich text in named/unnamed tabs, rows, blocks, arrays and groups', () => {
  const fields: Field[] = [
    {
      type: 'tabs',
      tabs: [
        {
          label: 'Unnamed',
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'rows',
                  type: 'array',
                  fields: [
                    { name: 'group', type: 'group', fields: [{ name: 'body', type: 'richText' }] },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: 'named',
          fields: [
            {
              name: 'sections',
              type: 'blocks',
              blocks: [{ slug: 'text', fields: [{ name: 'body', type: 'richText' }] }],
            },
          ],
        },
      ],
    },
  ]
  expect(extractRelationFieldPaths(fields).map((field) => field.path)).toEqual([
    'rows.group.body',
    'named.sections.body',
  ])
})

function fixture() {
  const collection = { slug: 'media', fields: [] }
  const pages = {
    slug: 'pages',
    fields: [{ name: 'rows', type: 'array', fields: [{ name: 'body', type: 'richText' }] }],
  }
  const req = {
    payload: {
      config: {
        collections: [collection, pages],
        globals: [{ slug: 'footer', fields: [{ name: 'body', type: 'richText' }] }],
        localization: { localeCodes: ['en', 'fr'] },
      },
      find: vi.fn(async ({ page }: { page: number }) =>
        page === 1
          ? {
              docs: [{ id: 'unrelated', rows: [{ body: rich(upload('other-media', 42)) }] }],
              hasNextPage: true,
            }
          : {
              docs: [
                {
                  id: 'owner',
                  slug: 'owner-slug',
                  rows: [{ body: { en: rich(), fr: rich(upload('media', '42')) } }],
                },
                { id: 'parent', rows: [{ body: rich(upload('pages', 'owner')) }] },
                { id: 'owner', rows: [{ body: rich(upload('pages', 'parent')) }] },
              ],
              hasNextPage: false,
            },
      ),
      findGlobal: vi.fn(async () => ({ body: rich(upload('pages', 'parent')) })),
    },
  }
  return {
    params: {
      collection,
      context: {},
      doc: { id: 42 },
      req,
    } as unknown as RevalidateCollectionParams,
    req,
  }
}

test('pagination, localized content, mixed string/number IDs and cycles preserve targeted transitive tags', async () => {
  const { params, req } = fixture()
  expect(new Set(await getRevalidationTagsCollectionItem(params))).toEqual(
    new Set([
      'media',
      'media.42',
      'pages',
      'pages.owner',
      'pages.owner-slug',
      'pages.parent',
      'footer',
    ]),
  )
  expect(req.payload.find).toHaveBeenCalledTimes(2)
  expect(req.payload.find).toHaveBeenCalledWith(
    expect.objectContaining({ depth: 0, req, locale: 'all', page: 2, limit: 100 }),
  )
})

test('maxDepth bounds traversal even across rich-text relationships', async () => {
  const { params } = fixture()
  expect(new Set(await getRevalidationTagsCollectionItem(params, 1))).toEqual(
    new Set(['media', 'media.42', 'pages', 'pages.owner', 'pages.owner-slug']),
  )
})
