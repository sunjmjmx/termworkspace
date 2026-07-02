// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Cell } from '../src/renderer/components/Cell'

describe('Cell', () => {
  beforeEach(() => {
    // Mock electronAPI (required by AIChat within Cell)
    Object.defineProperty(window, 'electronAPI', {
      value: {
        platform: 'darwin',
        send: vi.fn(),
        on: vi.fn(),
        removeAllListeners: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
  })

  it('should render with terminal mode by default', () => {
    const { container } = render(<Cell leafId="test-leaf-1" />)

    // The terminal layer should be visible, AI layer hidden
    expect(container.querySelector('.cell')).toBeInTheDocument()
    // Default mode should be 'terminal'
    expect(screen.getByTitle('Switch to AI mode')).toBeInTheDocument()
  })

  it('should show mode toggle button', () => {
    render(<Cell leafId="test-leaf-1" />)

    // Mode switch button should be present
    const toggleBtn = screen.getByRole('button')
    expect(toggleBtn).toBeInTheDocument()
  })

  it('should toggle from terminal to AI mode on button click', () => {
    const { container } = render(<Cell leafId="test-leaf-1" />)

    // Button should show AI icon in terminal mode
    const toggleBtn = screen.getByTitle('Switch to AI mode')
    expect(toggleBtn).toBeInTheDocument()

    // Click to switch to AI mode
    fireEvent.click(toggleBtn)

    // Now should show terminal icon
    expect(screen.getByTitle('Switch to Terminal mode')).toBeInTheDocument()
  })

  it('should toggle back from AI to terminal mode', () => {
    const { container } = render(<Cell leafId="test-leaf-1" />)

    // Switch to AI
    fireEvent.click(screen.getByTitle('Switch to AI mode'))

    // Switch back to terminal
    fireEvent.click(screen.getByTitle('Switch to Terminal mode'))

    // Should be back to terminal
    expect(screen.getByTitle('Switch to AI mode')).toBeInTheDocument()
  })

  it('should display display:none for inactive mode layer', () => {
    const { container } = render(<Cell leafId="test-leaf-1" />)

    const layers = container.querySelectorAll('.cell-layer')
    expect(layers.length).toBe(2)

    // Terminal layer (first) should be visible
    expect((layers[0] as HTMLElement).style.display).toBe('flex')
    // AI layer (second) should be hidden
    expect((layers[1] as HTMLElement).style.display).toBe('none')
  })
})
