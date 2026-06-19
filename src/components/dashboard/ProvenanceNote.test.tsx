import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../../i18n'
import { ProvenanceNote } from './ProvenanceNote'

describe('ProvenanceNote', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing when fully available', () => {
    const { container } = render(
      <ProvenanceNote p={{ available: true, serversCovered: 2, serversTotal: 2 }} dark={false} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders an unavailable note', () => {
    render(
      <ProvenanceNote p={{ available: false, serversCovered: 0, serversTotal: 3 }} dark={false} />,
    )
    expect(screen.getByText(/not available/i)).toBeInTheDocument()
  })

  it('renders a partial coverage note', () => {
    render(
      <ProvenanceNote p={{ available: true, serversCovered: 1, serversTotal: 4 }} dark={false} />,
    )
    expect(screen.getByText(/1.*4/)).toBeInTheDocument()
  })
})
