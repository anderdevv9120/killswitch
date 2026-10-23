import { Children, isValidElement, type ReactElement } from 'react'
import { expect, it, vi } from 'vitest'
import ErrorPage from '../app/error'

it('refetches failed server content when Try again is selected', () => {
  const retry = vi.fn()
  const reset = vi.fn()
  const page = ErrorPage({ ...{ retry, reset } })
  const button = Children.toArray(page.props.children).find((child) => isValidElement(child) && child.type === 'button') as ReactElement<{ onClick: () => void }>
  button.props.onClick()
  expect(retry).toHaveBeenCalledOnce()
  expect(reset).not.toHaveBeenCalled()
})
