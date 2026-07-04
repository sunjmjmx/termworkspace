// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Cell } from '../src/renderer/components/Cell'

describe('Cell', () => {
  beforeEach(() => {
    // Mock window.electronAPI
    Object.defineProperty(window, 'electronAPI', {
      value: {
        platform: 'darwin',
        send: vi.fn(),
        on: vi.fn(() => () => {}),
        invoke: vi.fn().mockResolvedValue([]),
        removeAllListeners: vi.fn(),
      },
      writable: true,
      configurable: true,
    })
  })

  it('should render with terminal mode by default', () => {
    const { container } = render(<Cell leafId="test-leaf-1" theme="dark" />)

    // The terminal layer should be visible, AI layer hidden
    expect(container.querySelector('.cell')).toBeInTheDocument()
    // Default mode should be 'terminal'
    expect(screen.getByTitle('Open AI chat')).toBeInTheDocument()
  })

  it('should show mode toggle button', () => {
    render(<Cell leafId="test-leaf-1" theme="dark" />)

    // Mode switch button should be present
    const toggleBtn = screen.getByRole('button')
    expect(toggleBtn).toBeInTheDocument()
  })

  it('should toggle from terminal to AI mode on button click', () => {
    const { container } = render(<Cell leafId="test-leaf-1" theme="dark" />)

    // Button should show AI icon in terminal mode
    const toggleBtn = screen.getByTitle('Open AI chat')
    expect(toggleBtn).toBeInTheDocument()

    // Click to switch to AI mode
    fireEvent.click(toggleBtn)

    // Now should show close icon
    expect(screen.getByTitle('Close AI panel')).toBeInTheDocument()
  })

  it('should toggle back from AI to terminal mode', () => {
    const { container } = render(<Cell leafId="test-leaf-1" theme="dark" />)

    // Switch to AI
    fireEvent.click(screen.getByTitle('Open AI chat'))

    // Switch back to terminal
    fireEvent.click(screen.getByTitle('Close AI panel'))

    // Should be back to terminal
    expect(screen.getByTitle('Open AI chat')).toBeInTheDocument()
  })

  it('should display display:none for inactive mode layer', () => {
    const { container } = render(<Cell leafId="test-leaf-1" theme="dark" />)

    const layers = container.querySelectorAll('.cell-layer')
    expect(layers.length).toBe(2)

    // Terminal layer (first) should be visible
    expect((layers[0] as HTMLElement).style.display).toBe('flex')
    // AI layer (second) should be hidden
    expect((layers[1] as HTMLElement).style.display).toBe('none')
  })
})
