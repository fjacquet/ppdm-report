// Test double for `virtual:pwa-register/react` (aliased here in vitest.config.ts).
// PwaUpdater imports the hook via the virtual specifier; tests drive it via
// __pwaTest. Both resolve to THIS module, so the state is shared.
// NOTE: state is module-level and shared across test files. Any test rendering a
// component that uses this stub should call `__pwaTest.reset()` in `beforeEach`.
let needRefresh = false
let updateCount = 0

export const __pwaTest = {
  setNeedRefresh(v: boolean) {
    needRefresh = v
  },
  reset() {
    needRefresh = false
    updateCount = 0
  },
  get updateCount() {
    return updateCount
  },
}

export function useRegisterSW() {
  return {
    needRefresh: [needRefresh, () => {}] as [boolean, () => void],
    offlineReady: [false, () => {}] as [boolean, () => void],
    updateServiceWorker: async (_reloadPage?: boolean) => {
      updateCount += 1
    },
  }
}
