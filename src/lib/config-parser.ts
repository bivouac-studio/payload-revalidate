import type { CollectionSlug, Field } from 'payload'

export const INTERNAL_COLLECTIONS: CollectionSlug[] = [
  'payload-locked-documents',
  'payload-migrations',
  'payload-preferences',
]

export type RelationPath = {
  collectionSlug: string
  depth: number
  path: string
  polymorphic?: boolean
  relationTo: string[]
  richText?: boolean
}

const isStringArray = (input: unknown): input is string[] =>
  Array.isArray(input) && input.every((v) => typeof v === 'string')

const normalizeRelationTo = (input: unknown): string[] => {
  if (isStringArray(input)) {
    return input
  }
  if (typeof input === 'string') {
    return [input]
  }
  return []
}

/**
 * Recursively extracts relation field paths from a collection's field configuration.
 *
 * This function traverses through field configurations to find all fields that can contain
 * relationships (relationship, upload, blocks, array, group) and builds a flat list of
 * relation paths with their target collections.
 *
 * @param fields - Array of field configurations to process
 * @param prefix - Current path prefix for nested fields (e.g., "author." for nested relations)
 * @param depth - Current depth level for nested relationships
 * @param collectionSlug - Current collection slug
 * @returns Array of relation paths with their target collections
 */
export const extractRelationFieldPaths = (
  fields: Field[],
  prefix = '',
  depth = 0,
  collectionSlug = '',
): RelationPath[] => {
  const relationPaths: RelationPath[] = []

  // Process each field in the configuration
  for (const fieldConfig of fields ?? []) {
    if (fieldConfig.type === 'tabs') {
      for (const tab of fieldConfig.tabs) {
        const tabPrefix = 'name' in tab ? [prefix, tab.name].filter(Boolean).join('.') : prefix
        relationPaths.push(
          ...extractRelationFieldPaths(tab.fields, tabPrefix, depth, collectionSlug),
        )
      }
      continue
    }
    if (!('name' in fieldConfig)) {
      if ('fields' in fieldConfig) {
        relationPaths.push(
          ...extractRelationFieldPaths(fieldConfig.fields, prefix, depth, collectionSlug),
        )
      }
      continue
    }

    // Extract and validate field name and type
    const fieldName = fieldConfig.name
    const fieldType = fieldConfig.type

    // Build the full field path (e.g., "author.profile" for nested fields)
    const fullFieldPath = prefix ? `${prefix}.${fieldName}` : fieldName

    // Handle different field types using switch statement
    switch (fieldType) {
      case 'array':
      case 'group': {
        // Handle array and group field types - contain nested fields
        const nestedFields = fieldConfig.fields

        // Recursively extract relation paths from nested fields
        const nestedRelationPaths = extractRelationFieldPaths(
          nestedFields,
          `${fullFieldPath}`,
          depth,
          collectionSlug,
        )
        relationPaths.push(...nestedRelationPaths)
        break
      }

      case 'blocks': {
        // Handle blocks field type - contains multiple block configurations
        const blocksConfig = fieldConfig.blocks
        // Process each block configuration
        for (const blockConfig of blocksConfig) {
          if (typeof blockConfig !== 'object' || blockConfig === null) {
            continue
          }

          // Extract fields from this block
          const blockFields = blockConfig.fields

          // Recursively extract relation paths from block fields
          const blockRelationPaths = extractRelationFieldPaths(
            blockFields,
            `${fullFieldPath}`,
            depth,
            collectionSlug,
          )
          relationPaths.push(...blockRelationPaths)
        }
        break
      }

      case 'join': {
        // TODO: handle join fields
        break
      }
      case 'relationship':
      case 'upload': {
        // Handle direct relation fields (relationship and upload types)
        relationPaths.push({
          collectionSlug,
          depth,
          path: fullFieldPath,
          polymorphic: Array.isArray(fieldConfig.relationTo),
          relationTo: normalizeRelationTo(fieldConfig.relationTo),
        })
        break
      }
      case 'richText': {
        relationPaths.push({
          collectionSlug,
          depth,
          path: fullFieldPath,
          relationTo: [],
          richText: true,
        })
        break
      }
      default:
        // Skip field types that don't contain relations
        break
    }
  }

  return relationPaths
}
