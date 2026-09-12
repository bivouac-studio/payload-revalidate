# payload-revalidate

A Payload CMS plugin that integrates with Next.js's `next/cache` architecture for better performance and revalidation. This plugin helps keep your database sleeping for basic websites and webapps by leveraging Next.js caching capabilities.

## What it does

This plugin automatically revalidates Payload data with Next.js's `revalidateTag` function using a standard pattern:

- `collection-slug` - for collection-level revalidation
- `collection-slug.item-id` - for specific item revalidation by ID
- `collection-slug.item-slug` - for specific item revalidation by slug

This allows you to easily create a data layer in Next.js server code with `unstable_cache`:

```ts
export const getEventById = async (id) =>
  unstable_cache(
    async (id: number) =>
      await payload.findByID({
        collection: 'events',
        id: id,
      }),
    ['eventById'],
    { tags: [`events.${id}`] },
  )(id)
```

## Installation

```bash
npm install payload-revalidate
```

## Usage

Add the plugin to your Payload configuration:

```ts
import { payloadRevalidate } from 'payload-revalidate'

export const config = buildConfig({
  plugins: [
    payloadRevalidate({
      // Plugin options here
    }),
  ],
})
```

## Current Status

⚠️ **VERY early stage** - This is currently a proof of concept.

- 📦 Available on npm: `npm install payload-revalidate`
- 🔗 GitHub: [BivouacAgency/payload-revalidate](https://github.com/BivouacAgency/payload-revalidate)
- ⚠️ Some warnings may be present
- 💿 Only tested with PostgreSQL. The behaviour seem to differ with other databases.

## Compatibility

- Payload CMS 3.x
- Next.js 15+

## Contributing

This is an early-stage project and feedback is welcome! We'd love to:

- Get feedback on the approach
- Discuss best practices for Payload + Next.js caching
- Learn from the community's experience
- Potentially collaborate on making this more robust

## License

MIT

## Questions

Please open an issue on GitHub for any questions or feedback about this plugin.

## Rich text and media (0.7)

The plugin follows Lexical upload, relationship and internal-link nodes, including
rich text inside Payload blocks, arrays, groups and tabs. It propagates changes
through ordinary relationships and rich text to parent collections and globals.
Both numeric and string IDs are supported. Only affected documents receive item
tags; collection-level tags still expire the whole collection cache.

Dependencies are read within the mutation's request/transaction. Deletion captures
them in `beforeDelete`, before Payload detaches relationships. Cache expiry runs
in Next's `after()` callback, after the response closes, with immediate expiration
on Next 15 and Next 16. `SEED_RUN=true` skips this work. Local API writes outside
Next need a request lifecycle or separate invalidation.

Lexical JSON is scanned at depth zero in batches of 100, once per mutation for
collections containing rich text, across all locales. Ordinary relationships use
filtered, paginated queries. There is no database migration or persistent index,
but scanning rich-text collections adds work to writes on large content sets.
Custom Lexical block fields and custom node formats are not traversed; the built-in
upload, relationship and internal-link nodes under `children` are supported.

`maxDepth` limits reverse relationship hops; omitted or `0` follows all reachable
dependencies, with cycle detection. `next` is a peer dependency so revalidation
uses the application's Next runtime.
