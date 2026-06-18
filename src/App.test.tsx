import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test } from 'vitest'
import App from './App'
import i18n from './i18n'

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
})

test('renders the app title', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: 'PPDM Report' })).toBeInTheDocument()
})

test('links to the documentation in a new tab', () => {
  render(<App />)
  const link = screen.getByRole('link', { name: 'Docs' })
  expect(link).toHaveAttribute(
    'href',
    'https://github.com/fjacquet/ppdm-report/blob/main/docs/USER-GUIDE.md',
  )
  expect(link).toHaveAttribute('target', '_blank')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
})
