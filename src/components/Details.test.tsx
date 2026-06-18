// src/components/Details.test.tsx
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Details } from './Details'

describe('Details', () => {
  afterEach(() => cleanup())

  it('renders the summary label and is collapsed by default', () => {
    render(
      <Details summary="Show details">
        <p>secret row</p>
      </Details>,
    )
    expect(screen.getByText('Show details')).toBeInTheDocument()
    const details = screen.getByText('Show details').closest('details')
    expect(details).not.toBeNull()
    expect(details?.hasAttribute('open')).toBe(false)
  })

  it('keeps children in the DOM (so they are testable even when collapsed)', () => {
    render(
      <Details summary="Show details">
        <p>secret row</p>
      </Details>,
    )
    expect(screen.getByText('secret row')).toBeInTheDocument()
  })
})
