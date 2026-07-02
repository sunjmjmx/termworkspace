// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AIChat } from '../src/renderer/components/AIChat'

describe('AIChat', () => {
  const mockSend = vi.fn()
  const mockOn = vi.fn()
  const mockRemoveAll = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    // Mock window.electronAPI
    Object.defineProperty(window, 'electronAPI', {
      value: {
        platform: 'darwin',
        send: mockSend,
        on: mockOn,
        removeAllListeners: mockRemoveAll,
      },
      writable: true,
      configurable: true,
    })
  })

  it('should render empty state with placeholder', () => {
    render(<AIChat chatId="test-chat-1" />)

    expect(screen.getByText('Ask anything about your workspace')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument()
  })

  it('should subscribe to IPC events on mount', () => {
    render(<AIChat chatId="test-chat-1" />)

    expect(mockOn).toHaveBeenCalledWith('ai:chunk', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('ai:done', expect.any(Function))
  })

  it('should remove IPC listeners on unmount', () => {
    const { unmount } = render(<AIChat chatId="test-chat-1" />)
    unmount()

    expect(mockRemoveAll).toHaveBeenCalledWith('ai:chunk')
    expect(mockRemoveAll).toHaveBeenCalledWith('ai:done')
  })

  it('should send message on Enter key', () => {
    render(<AIChat chatId="test-chat-1" />)

    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Hello AI' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Should have sent IPC message
    expect(mockSend).toHaveBeenCalledWith('ai:chat', {
      terminalId: 'test-chat-1',
      prompt: 'Hello AI',
    })
  })

  it('should not send empty messages', () => {
    render(<AIChat chatId="test-chat-1" />)

    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('should not send while streaming', () => {
    render(<AIChat chatId="test-chat-1" />)

    // Type and send first message
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Hello AI' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // The input should now be disabled (streaming)
    expect(mockSend).toHaveBeenCalledTimes(1)

    // Clear the mock and try sending again
    mockSend.mockClear()
    fireEvent.change(input, { target: { value: 'Second message' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Should NOT send while streaming
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('should display user message after sending', () => {
    render(<AIChat chatId="test-chat-1" />)

    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Hello AI' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // User message should appear
    expect(screen.getByText('Hello AI')).toBeInTheDocument()
    // Should show an assistant placeholder
    const bubbles = screen.getAllByText(/^(You|AI)$/)
    expect(bubbles.length).toBeGreaterThanOrEqual(1)
  })

  it('should handle Shift+Enter for newline without sending', () => {
    render(<AIChat chatId="test-chat-1" />)

    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Multi line' } })
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })

    expect(mockSend).not.toHaveBeenCalled()
  })

  it('should disable input and send button while streaming', () => {
    render(<AIChat chatId="test-chat-1" />)

    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Input should be disabled during streaming
    expect(input).toBeDisabled()

    // Send button should also be disabled (it shows "○" during streaming)
    const sendBtn = screen.getByTitle('Send (Enter)')
    expect(sendBtn).toBeDisabled()
    expect(sendBtn.textContent).toBe('○')
  })
})
