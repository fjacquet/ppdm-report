import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { __pwaTest } from '../test/pwaRegisterStub'
import { PwaUpdater } from './PwaUpdater'

describe('PwaUpdater', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    __pwaTest.reset()
  })
  afterEach(() => cleanup())

  it('renders nothing when no update is available', () => {
    const { container } = render(<PwaUpdater />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a reload prompt when an update is available and reloads on click', () => {
    __pwaTest.setNeedRefresh(true)
    render(<PwaUpdater />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('New version available')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Reload'))
    expect(__pwaTest.updateCount).toBeGreaterThan(0)
  })
})
