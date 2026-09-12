import { beforeAll, expect, test } from 'vitest'

// Import global payload and mock utilities
import { mockRevalidateTag, payload } from '../setup.js'
import { waitForAfterCalls } from './mocks/after.js'

// Initialize global data
beforeAll(async () => {
  // Globals are already reset before each test in setup.ts
})

test('revalidates correctly globals on update', async () => {
  await payload.updateGlobal({
    slug: 'mainMenu',
    data: {
      menu: [{ label: 'mainMenuName1' }, { label: 'mainMenuName2' }],
    },
  })
  await waitForAfterCalls()
  expect(mockRevalidateTag).toHaveBeenCalledTimes(1)
  expect(mockRevalidateTag).toHaveBeenCalledWith('mainMenu', { expire: 0 })
})
