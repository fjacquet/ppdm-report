import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { WarningsBanner } from './WarningsBanner'

describe('WarningsBanner', () => {
  beforeEach(async () => await i18n.changeLanguage('en'))
  afterEach(() => cleanup())

  it('renders nothing when there are no warnings', () => {
    const { container } = render(<WarningsBanner warnings={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders each unique warning', () => {
    render(<WarningsBanner warnings={['a caveat', 'a caveat', 'another']} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('another')).toBeInTheDocument()
  })
})
