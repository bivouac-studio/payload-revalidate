import { expect, test } from 'vitest'

// Import global payload and mock utilities
import { mockRevalidateTag, payload } from '../setup.js'
import { waitForAfterCalls } from './mocks/after.js'

test('revalidates correctly collections on create', async () => {
  const author = await payload.create({
    collection: 'authors',
    data: {
      name: 'authorName',
    },
  })
  await waitForAfterCalls()
  expect(mockRevalidateTag).toHaveBeenCalledTimes(2)
  expect(mockRevalidateTag).toHaveBeenCalledWith('authors', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`authors.${author.id}`, { expire: 0 })
})

test('revalidates correctly collections on update', async () => {
  const createdAuthor = await payload.create({
    collection: 'authors',
    data: {
      name: 'authorName',
    },
  })
  await waitForAfterCalls()
  mockRevalidateTag.mockClear()
  const updatedAuthor = await payload.update({
    id: createdAuthor.id,
    collection: 'authors',
    data: {
      name: 'authorName',
    },
  })
  await waitForAfterCalls()
  expect(mockRevalidateTag).toHaveBeenCalledTimes(2)
  expect(mockRevalidateTag).toHaveBeenCalledWith('authors', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`authors.${updatedAuthor.id}`, { expire: 0 })
})

test('revalidates correctly collections on delete', async () => {
  const createdAuthor = await payload.create({
    collection: 'authors',
    data: {
      name: 'authorName',
    },
  })
  await waitForAfterCalls()
  mockRevalidateTag.mockClear()
  await payload.delete({
    id: createdAuthor.id,
    collection: 'authors',
  })
  await waitForAfterCalls()
  expect(mockRevalidateTag).toHaveBeenCalledTimes(2)
  expect(mockRevalidateTag).toHaveBeenCalledWith('authors', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`authors.${createdAuthor.id}`, { expire: 0 })
})
