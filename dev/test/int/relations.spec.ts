import { getAssetsPath } from 'helpers/file.js'
import { beforeAll, expect, test } from 'vitest'

// Import global payload and mock utilities
import { mockRevalidateTag, payload } from '../setup.js'
import { mockAfter, waitForAfterCalls } from './mocks/after.js'

let mediaId: number

beforeAll(async () => {
  const media = await payload.create({
    collection: 'media',
    data: {
      id: 1,
      alt: 'image',
    },
    filePath: getAssetsPath() + '/placeholder.png',
  })

  mediaId = media.id
})

test('revalidates correctly relations for depth 1', async () => {
  let author = await payload.create({
    collection: 'authors',
    data: {
      name: 'added by plugin',
    },
  })

  await waitForAfterCalls()

  // Verify revalidateTag was called for author creation
  expect(mockRevalidateTag).toHaveBeenCalledTimes(2)
  expect(mockRevalidateTag).toHaveBeenCalledWith('authors', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`authors.${author.id}`, { expire: 0 })

  mockRevalidateTag.mockClear()
  mockAfter.mockClear()

  const post = await payload.create({
    collection: 'posts',
    data: {
      slug: 'post-slug-depth-1',
      _status: 'published',
      author: author.id,
      image: mediaId,
      title: 'added by plugin',
    },
    depth: 2,
  })

  if (typeof post.author === 'number' || !post.author?.name) {
    throw new Error('Wrong depth')
  }

  expect(post.author?.name).toBe('added by plugin')

  await waitForAfterCalls()

  // Verify revalidateTag was called for post creation
  expect(mockRevalidateTag).toHaveBeenCalledTimes(3)
  expect(mockRevalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.slug}`, { expire: 0 })

  mockRevalidateTag.mockClear()
  mockAfter.mockClear()

  author = await payload.update({
    id: author.id,
    collection: 'authors',
    data: {
      name: 'updated by plugin',
    },
  })

  await waitForAfterCalls()

  // Verify that revalidateTag was called for related collections
  expect(mockRevalidateTag).toHaveBeenCalledTimes(5)
  expect(mockRevalidateTag).toHaveBeenCalledWith('authors', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`authors.${author.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.slug}`, { expire: 0 })

  mockRevalidateTag.mockClear()
  mockAfter.mockClear()

  await payload.delete({
    collection: 'authors',
    where: { name: { equals: 'updated by plugin' } },
  })

  await waitForAfterCalls()

  expect(mockRevalidateTag).toHaveBeenCalledTimes(5)
  expect(mockRevalidateTag).toHaveBeenCalledWith('authors', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`authors.${author.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.slug}`, { expire: 0 })
  mockRevalidateTag.mockClear()

  await payload.delete({ collection: 'posts', where: { title: { equals: 'added by plugin' } } })

  expect(mockRevalidateTag).toHaveBeenCalledTimes(3)
  expect(mockRevalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.slug}`, { expire: 0 })
})

test('revalidates correctly relations for depth 2 ', async () => {
  // Create an author first
  const author = await payload.create({
    collection: 'authors',
    data: {
      name: 'authorName',
    },
  })

  // Create a post with the author (depth 1) - without media to avoid upload issues
  const post = await payload.create({
    collection: 'posts',
    data: {
      slug: 'post-slug-depth-2',
      author: author.id,
      image: mediaId,
      title: 'postTitle',
    },
  })

  // Create a category with the post (depth 0 -> depth 1 -> depth 2)
  const category = await payload.create({
    collection: 'categories',
    data: {
      name: 'categoryName',
      description: 'categoryDescription',
      featuredPost: post.id,
      posts: [post.id],
    },
  })

  await waitForAfterCalls()
  mockRevalidateTag.mockClear()

  // Update the author (depth 2) - this should trigger revalidation for:
  // - authors collection and specific author
  // - posts collection and specific post (depth 1)
  // - categories collection and specific category (depth 0)
  await payload.update({
    id: author.id,
    collection: 'authors',
    data: {
      name: 'authorNameUpdated',
    },
  })

  await waitForAfterCalls()
  // Verify revalidateTag was called for all related collections in the chain
  expect(mockRevalidateTag).toHaveBeenCalledTimes(7)
  expect(mockRevalidateTag).toHaveBeenCalledWith('authors', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`authors.${author.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.slug}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('categories', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`categories.${category.id}`, { expire: 0 })

  mockRevalidateTag.mockClear()

  // Delete the author (depth 2) - this should trigger revalidation for:
  // - authors collection and specific author
  // - posts collection and specific post (depth 1)
  // - categories collection and specific category (depth 0)
  await payload.delete({
    id: author.id,
    collection: 'authors',
  })

  await waitForAfterCalls()
  expect(mockRevalidateTag).toHaveBeenCalledTimes(7)
  expect(mockRevalidateTag).toHaveBeenCalledWith('authors', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`authors.${author.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.slug}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('categories', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`categories.${category.id}`, { expire: 0 })

  mockRevalidateTag.mockClear()

  await payload.delete({
    id: post.id,
    collection: 'posts',
  })
  await payload.delete({
    id: category.id,
    collection: 'categories',
  })
})

test('revalidates correctly relations for depth 3', async () => {
  // Create an author first (depth 3)
  const author = await payload.create({
    collection: 'authors',
    data: {
      name: 'authorNameDepth3',
    },
  })

  // Create a post with the author (depth 2)
  const post = await payload.create({
    collection: 'posts',
    data: {
      slug: 'post-slug-depth-3',
      author: author.id,
      image: mediaId,
      title: 'postTitleDepth3',
    },
  })

  // Create a category with the post (depth 1)
  const category = await payload.create({
    collection: 'categories',
    data: {
      name: 'categoryNameDepth3',
      description: 'categoryDescriptionDepth3',
      featuredPost: post.id,
      posts: [post.id],
    },
  })

  // Create a series with the category (depth 0)
  const series = await payload.create({
    collection: 'series',
    data: {
      categories: [category.id],
      description: 'seriesDescriptionDepth3',
      featuredCategory: category.id,
      title: 'seriesTitleDepth3',
    },
  })

  await waitForAfterCalls()
  mockRevalidateTag.mockClear()

  // Update the author (depth 3) - this should trigger revalidation for:
  // - authors collection and specific author (depth 3)
  // - posts collection and specific post (depth 2)
  // - categories collection and specific category (depth 1)
  // - series collection and specific series (depth 0)
  await payload.update({
    id: author.id,
    collection: 'authors',
    data: {
      name: 'authorNameDepth3Updated',
    },
  })

  await waitForAfterCalls()
  // Verify revalidateTag was called for all related collections in the chain
  expect(mockRevalidateTag).toHaveBeenCalledTimes(9)
  expect(mockRevalidateTag).toHaveBeenCalledWith('authors', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`authors.${author.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.slug}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('categories', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`categories.${category.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('series', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`series.${series.id}`, { expire: 0 })

  mockRevalidateTag.mockClear()

  // Delete the author (depth 3) - this should trigger revalidation for:
  // - authors collection and specific author (depth 3)
  // - posts collection and specific post (depth 2)
  // - categories collection and specific category (depth 1)
  // - series collection and specific series (depth 0)
  await payload.delete({
    id: author.id,
    collection: 'authors',
  })

  await waitForAfterCalls()
  expect(mockRevalidateTag).toHaveBeenCalledTimes(9)
  expect(mockRevalidateTag).toHaveBeenCalledWith('authors', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`authors.${author.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.slug}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('categories', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`categories.${category.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('series', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`series.${series.id}`, { expire: 0 })

  mockRevalidateTag.mockClear()

  // Clean up remaining entities
  await payload.delete({
    id: post.id,
    collection: 'posts',
  })
  await payload.delete({
    id: category.id,
    collection: 'categories',
  })
  await payload.delete({
    id: series.id,
    collection: 'series',
  })
})

test('revalidates correctly relations of a global -> collection ', async () => {
  // Create a post (depth 1)
  const post = await payload.create({
    collection: 'posts',
    data: {
      slug: 'post-slug-global-test',
      _status: 'published',
      image: mediaId,
      title: 'postForGlobalTest',
    },
  })

  // Update the global to reference the post and category
  await payload.updateGlobal({
    slug: 'siteSettings',
    data: {
      featuredPost: post.id,
      siteName: 'Test Site',
    },
  })
  await waitForAfterCalls()
  mockRevalidateTag.mockClear()
  mockAfter.mockClear()

  // Update the post (depth 1) - this should trigger revalidation for:
  // - posts collection and specific post (depth 1)
  // - siteSettings global (depth 0, but references the post)
  await payload.update({
    id: post.id,
    collection: 'posts',
    data: {
      title: 'postForGlobalTestUpdated',
    },
  })
  await waitForAfterCalls()

  // Verify revalidateTag was called for all related collections and the global
  expect(mockRevalidateTag).toHaveBeenCalledTimes(4)
  expect(mockRevalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.slug}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('siteSettings', { expire: 0 })

  mockRevalidateTag.mockClear()
  mockAfter.mockClear()
  // Delete the post (depth 1) - this should trigger revalidation for:
  // - posts collection and specific post (depth 1)
  // - siteSettings global (depth 0, but references the post)
  await payload.delete({
    id: post.id,
    collection: 'posts',
  })
  await waitForAfterCalls()

  expect(mockRevalidateTag).toHaveBeenCalledTimes(4)
  expect(mockRevalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.slug}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('siteSettings', { expire: 0 })
})

test('revalidates correctly relations of a global -> collection -> collection', async () => {
  // Create an author first (depth 2)
  const author = await payload.create({
    collection: 'authors',
    data: {
      name: 'authorForGlobalTest',
    },
  })

  // Create a post with the author (depth 1)
  const post = await payload.create({
    collection: 'posts',
    data: {
      slug: 'post-slug-global-test',
      _status: 'published',
      author: author.id,
      image: mediaId,
      title: 'postForGlobalTest',
    },
  })

  // Update the global to reference the post and category
  await payload.updateGlobal({
    slug: 'siteSettings',
    data: {
      featuredPost: post.id,
      siteName: 'Test Site',
    },
  })

  await waitForAfterCalls()
  mockRevalidateTag.mockClear()
  mockAfter.mockClear()

  // Update the author (depth 2) - this should trigger revalidation for:
  // - authors collection and specific author (depth 2)
  // - posts collection and specific post (depth 1)
  // - categories collection and specific category (depth 0)
  // - siteSettings global (depth 0, but references the post)
  await payload.update({
    id: author.id,
    collection: 'authors',
    data: {
      name: 'authorForGlobalTestUpdated',
    },
  })

  await waitForAfterCalls()
  // Verify revalidateTag was called for all related collections and the global
  expect(mockRevalidateTag).toHaveBeenCalledTimes(6)
  expect(mockRevalidateTag).toHaveBeenCalledWith('authors', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`authors.${author.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.slug}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('siteSettings', { expire: 0 })

  mockRevalidateTag.mockClear()
  mockAfter.mockClear()

  // Delete the author (depth 2) - this should trigger revalidation for:
  // - authors collection and specific author (depth 2)
  // - posts collection and specific post (depth 1)
  // - categories collection and specific category (depth 0)
  // - siteSettings global (depth 0, but references the post)
  await payload.delete({
    id: author.id,
    collection: 'authors',
  })

  await waitForAfterCalls()
  expect(mockRevalidateTag).toHaveBeenCalledTimes(6)
  expect(mockRevalidateTag).toHaveBeenCalledWith('authors', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`authors.${author.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('posts', { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.id}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith(`posts.${post.slug}`, { expire: 0 })
  expect(mockRevalidateTag).toHaveBeenCalledWith('siteSettings', { expire: 0 })

  mockRevalidateTag.mockClear()
  mockAfter.mockClear()
  // Clean up remaining entities
  await payload.delete({
    id: post.id,
    collection: 'posts',
  })
})
