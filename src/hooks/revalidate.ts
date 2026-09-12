import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  CollectionBeforeDeleteHook,
  GlobalAfterChangeHook,
  PayloadRequest,
} from 'payload'

import { revalidateTag } from 'next/cache.js'
import { after } from 'next/server.js'

import { getRevalidationTagsCollectionItem } from '../lib/revalidation.js'

// Next 15 expires immediately with its one-argument API; Next 16 requires an
// explicit profile. Next 15 safely ignores the extra argument.
const expireTag: (tag: string, profile: { expire: number }) => void = revalidateTag
const deletionTags = new WeakMap<PayloadRequest, Map<string, string[]>>()
const deletionKey = (slug: string, id: number | string) => JSON.stringify([slug, String(id)])

function schedule(tags: string[], req: PayloadRequest) {
  // Storage hooks and the transaction finish before the response closes.
  after(() => {
    for (const tag of tags) {
      expireTag(tag, { expire: 0 })
    }
    req.payload.logger.info(`Revalidated tags ${tags.join(', ')}`)
  })
}

export function createRevalidationHooks(maxDepth = 0) {
  const beforeDelete: CollectionBeforeDeleteHook = async ({ id, collection, context, req }) => {
    if (process.env.SEED_RUN === 'true') {
      return
    }
    const doc = await req.payload.findByID({ id, collection: collection.slug, depth: 0, req })
    const tags = await getRevalidationTagsCollectionItem(
      { collection, context, doc, req },
      maxDepth,
    )
    const pending = deletionTags.get(req) ?? new Map<string, string[]>()
    pending.set(deletionKey(collection.slug, id), tags)
    deletionTags.set(req, pending)
  }
  const afterDelete: CollectionAfterDeleteHook = async (params) => {
    if (process.env.SEED_RUN === 'true') {
      return
    }
    const key = deletionKey(params.collection.slug, params.doc.id)
    const pending = deletionTags.get(params.req)
    const tags = pending?.get(key) ?? (await getRevalidationTagsCollectionItem(params, maxDepth))
    pending?.delete(key)
    schedule(tags, params.req)
  }
  const afterChange: CollectionAfterChangeHook = async (params) => {
    if (
      process.env.SEED_RUN === 'true' ||
      params.req.query?.draft ||
      params.data?._status === 'draft'
    ) {
      return
    }
    schedule(await getRevalidationTagsCollectionItem(params, maxDepth), params.req)
  }
  return { afterChange, afterDelete, beforeDelete }
}

const hooks = createRevalidationHooks()
export const revalidateCollectionChange = hooks.afterChange
export const revalidateCollectionDelete = hooks.afterDelete

export const revalidateGlobal: GlobalAfterChangeHook = (params) => {
  if (
    process.env.SEED_RUN === 'true' ||
    params.req.query?.draft ||
    params.data?._status === 'draft'
  ) {
    return
  }
  schedule([params.global.slug], params.req)
}
