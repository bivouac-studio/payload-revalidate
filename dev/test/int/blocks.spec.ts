import { expect, test } from 'vitest'
import { mockRevalidateTag, payload } from '../setup.js'
import { waitForAfterCalls } from './mocks/after.js'

test('repeated relationship paths across block types do not produce duplicate SQL aliases', async () => {
  const leaf = await payload.create({
    collection: 'posts',
    data: { slug: 'block-target', _status: 'published' },
  })
  const parent = await payload.create({
    collection: 'posts',
    data: {
      slug: 'block-parent',
      _status: 'published',
      sections: [
        { blockType: 'hero', cta: { link: leaf.id } },
        { blockType: 'text', cta: { link: leaf.id } },
      ],
    },
  })
  await waitForAfterCalls()
  mockRevalidateTag.mockClear()
  await payload.update({ collection: 'posts', id: leaf.id, data: { title: 'Changed target' } })
  await waitForAfterCalls()
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${parent.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('posts.block-parent', { expire: 0 })
  await payload.delete({ collection: 'posts', id: parent.id })
  await payload.delete({ collection: 'posts', id: leaf.id })
})
