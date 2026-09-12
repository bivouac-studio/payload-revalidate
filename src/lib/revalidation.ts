import type {
  PayloadRequest,
  RequestContext,
  SanitizedCollectionConfig,
  SanitizedGlobalConfig,
  TypeWithID,
  Where,
} from 'payload'

import {
  extractRelationFieldPaths,
  INTERNAL_COLLECTIONS,
  type RelationPath,
} from './config-parser.js'

export interface RevalidateCollectionParams<T extends TypeWithID = TypeWithID> {
  collection: SanitizedCollectionConfig
  context: RequestContext
  doc: T
  req: PayloadRequest
}

export interface RevalidateGlobalParams<T extends TypeWithID = TypeWithID> {
  context: RequestContext
  doc: T
  global: SanitizedGlobalConfig
  req: PayloadRequest
}

type Document = { id: number | string; slug?: unknown }
type Reference = { collection: string; id: number | string }
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const idOf = (value: unknown): number | string | undefined => {
  const id = record(value) ? value.id : value
  return typeof id === 'number' || typeof id === 'string' ? id : undefined
}
const keyOf = ({ id, collection }: Reference) => JSON.stringify([collection, String(id)])

// Only walk Lexical nodes, never a populated document's own fields.
export function lexicalReferences(value: unknown): Reference[] {
  if (!record(value)) {
    return []
  }
  if (record(value.root)) {
    return lexicalReferences(value.root)
  }
  const refs: Reference[] = []
  const relation =
    value.type === 'link' || value.type === 'autolink'
      ? record(value.fields) && value.fields.linkType === 'internal'
        ? value.fields.doc
        : undefined
      : value.type === 'upload' || value.type === 'relationship'
        ? value
        : undefined
  if (record(relation) && typeof relation.relationTo === 'string') {
    const id = idOf(relation.value)
    if (id !== undefined) {
      refs.push({ id, collection: relation.relationTo })
    }
  }
  if (Array.isArray(value.children)) {
    for (const child of value.children) {
      refs.push(...lexicalReferences(child))
    }
  }
  return refs
}

function valuesAt(value: unknown, path: string[], locales: string[]): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => valuesAt(item, path, locales))
  }
  if (record(value) && !('root' in value) && locales.some((locale) => locale in value)) {
    return locales.flatMap((locale) => valuesAt(value[locale], path, locales))
  }
  if (!path.length) {
    return [value]
  }
  if (!record(value)) {
    return []
  }
  return valuesAt(value[path[0]], path.slice(1), locales)
}

function addTags(tags: Set<string>, collection: string, doc: Document) {
  tags.add(collection)
  tags.add(`${collection}.${doc.id}`)
  if (typeof doc.slug === 'string' && doc.slug) {
    tags.add(`${collection}.${doc.slug}`)
  }
}

export const getRevalidationTagsGlobalItem = (params: RevalidateGlobalParams): Promise<string[]> =>
  Promise.resolve([params.global.slug])

/** Walk reverse relations one hop at a time so JSON uploads and SQL relations can mix. */
export async function getRevalidationTagsCollectionItem(
  params: RevalidateCollectionParams,
  maxDepth = 0,
): Promise<string[]> {
  const { collection, doc, req } = params
  const { payload } = req
  const tags = new Set<string>()
  addTags(tags, collection.slug, doc)
  const collections = payload.config.collections.filter(
    (item) => !INTERNAL_COLLECTIONS.includes(item.slug),
  )
  const fields = new Map(
    collections.map((item) => [item.slug, extractRelationFieldPaths(item.fields)]),
  )
  const locales = payload.config.localization ? payload.config.localization.localeCodes : []
  const readOptions = { depth: 0, locale: 'all' as const, overrideAccess: true, req }
  const richOwners = new Map<string, { collection: string; doc: Document }[]>()
  const globals = new Map<string, Set<string>>()

  // JSON paths are not portable between Payload database adapters. Scan only
  // collections with rich text, once per mutation, in bounded database batches.
  for (const owner of collections) {
    const richFields = fields.get(owner.slug)!.filter((field) => field.richText)
    if (!richFields.length) {
      continue
    }
    let page = 1
    while (true) {
      const result = await payload.find({
        ...readOptions,
        collection: owner.slug,
        limit: 100,
        page,
      })
      for (const ownerDoc of result.docs) {
        for (const field of richFields) {
          for (const value of valuesAt(ownerDoc, field.path.split('.'), locales)) {
            for (const ref of lexicalReferences(value)) {
              const key = keyOf(ref)
              const owners = richOwners.get(key) ?? []
              owners.push({ collection: owner.slug, doc: ownerDoc })
              richOwners.set(key, owners)
            }
          }
        }
      }
      if (!result.hasNextPage) {
        break
      }
      page++
    }
  }

  // Globals cannot be relationship targets; record their outgoing references.
  for (const global of payload.config.globals) {
    const paths = extractRelationFieldPaths(global.fields)
    if (!paths.length) {
      continue
    }
    const value = await payload.findGlobal({ ...readOptions, slug: global.slug })
    for (const field of paths) {
      for (const entry of valuesAt(value, field.path.split('.'), locales)) {
        const refs = field.richText ? lexicalReferences(entry) : relationReferences(entry, field)
        for (const ref of refs) {
          const key = keyOf(ref)
          const owners = globals.get(key) ?? new Set<string>()
          owners.add(global.slug)
          globals.set(key, owners)
        }
      }
    }
  }

  const queue = [{ id: doc.id, collection: collection.slug, depth: 0 }]
  const visited = new Set<string>()
  for (let index = 0; index < queue.length; index++) {
    const modified = queue[index]
    const key = keyOf(modified)
    if (visited.has(key)) {
      continue
    }
    visited.add(key)
    if (maxDepth > 0 && modified.depth >= maxDepth) {
      continue
    }
    for (const global of globals.get(key) ?? []) {
      tags.add(global)
    }
    const enqueue = (slug: string, owner: Document) => {
      addTags(tags, slug, owner)
      queue.push({ id: owner.id, collection: slug, depth: modified.depth + 1 })
    }
    for (const owner of richOwners.get(key) ?? []) {
      enqueue(owner.collection, owner.doc)
    }
    for (const owner of collections) {
      const relations = fields
        .get(owner.slug)!
        .filter((field) => field.relationTo.includes(modified.collection))
      if (!relations.length) {
        continue
      }
      const where: Where = {
        or: relations.map(
          (field): Where =>
            field.polymorphic
              ? {
                  and: [
                    { [`${field.path}.relationTo`]: { equals: modified.collection } },
                    { [`${field.path}.value`]: { equals: modified.id } },
                  ],
                }
              : { [field.path]: { equals: modified.id } },
        ),
      }
      let page = 1
      while (true) {
        const result = await payload.find({
          ...readOptions,
          collection: owner.slug,
          limit: 100,
          page,
          where,
        })
        for (const ownerDoc of result.docs) {
          enqueue(owner.slug, ownerDoc)
        }
        if (!result.hasNextPage) {
          break
        }
        page++
      }
    }
  }
  return [...tags]
}

function relationReferences(value: unknown, field: RelationPath): Reference[] {
  if (field.polymorphic) {
    if (!record(value) || typeof value.relationTo !== 'string') {
      return []
    }
    const id = idOf(value.value)
    return id === undefined ? [] : [{ id, collection: value.relationTo }]
  }
  const id = idOf(value)
  return id === undefined ? [] : field.relationTo.map((collection) => ({ id, collection }))
}
