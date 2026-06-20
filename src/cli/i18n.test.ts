import { describe, expect, it } from 'vitest'
import { createReportT } from './i18n'

describe('createReportT', () => {
  it('resolves namespaced keys without React', () => {
    const t = createReportT('en')
    expect(typeof t('common:sizeUnknown')).toBe('string')
    expect(t('common:sizeUnknown').length).toBeGreaterThan(0)
  })
})
