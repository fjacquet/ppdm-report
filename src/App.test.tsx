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
