import { getAssetsPath } from 'helpers/file.js'
import { expect, test } from 'vitest'
import { mockRevalidateTag, payload } from '../setup.js'
import { waitForAfterCalls } from './mocks/after.js'

const content = (id: number) => ({
  root: {
    type: 'root',
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [{ type: 'upload', version: 3, relationTo: 'media', value: id }],
  },
})

test('Lexical uploads invalidate their owners, SQL parents and globals on metadata edit, replacement and deletion', async () => {
  const media = await payload.create({
    collection: 'media',
    data: { alt: 'Lexical' },
    filePath: getAssetsPath() + '/placeholder.png',
  })
  const post = await payload.create({
    collection: 'posts',
    data: {
      slug: 'lexical-owner',
      _status: 'published',
      content: content(media.id),
    },
  })
  const unrelated = await payload.create({
    collection: 'posts',
    data: { slug: 'lexical-unrelated', _status: 'published' },
  })
  const category = await payload.create({
    collection: 'categories',
    data: { name: 'Lexical parent', featuredPost: post.id },
  })
  await payload.updateGlobal({
    slug: 'siteSettings',
    data: { siteName: 'Lexical site', featuredPost: post.id },
  })
  const expected = [
    'media',
    `media.${media.id}`,
    'posts',
    `posts.${post.id}`,
    'posts.lexical-owner',
    'categories',
    `categories.${category.id}`,
    'siteSettings',
  ]
  for (const mutate of [
    () => payload.update({ collection: 'media', id: media.id, data: { alt: 'Updated alt' } }),
    () =>
      payload.update({
        collection: 'media',
        id: media.id,
        data: { alt: 'Replaced' },
        filePath: getAssetsPath() + '/placeholder.png',
      }),
    () => payload.delete({ collection: 'media', id: media.id }),
  ]) {
    await waitForAfterCalls()
    mockRevalidateTag.mockClear()
    await mutate()
    await waitForAfterCalls()
    expect(new Set(mockRevalidateTag.mock.calls.map(([tag]) => tag))).toEqual(new Set(expected))
    expect(mockRevalidateTag).not.toHaveBeenCalledWith(`posts.${unrelated.id}`, { expire: 0 })
    for (const [, profile] of mockRevalidateTag.mock.calls) expect(profile).toEqual({ expire: 0 })
  }
  await payload.delete({ collection: 'categories', id: category.id })
  await payload.delete({ collection: 'posts', id: post.id })
  await payload.delete({ collection: 'posts', id: unrelated.id })
})
