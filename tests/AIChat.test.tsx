// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AIChat } from '../src/renderer/components/AIChat'

describe('AIChat', () => {
  const mockSend = vi.fn()
  const mockOn = vi.fn()
  const mockRemoveAll = vi.fn()
  // Registry to simulate IPC event subscription — allows triggering registered callbacks
  const listenerRegistry = new Map<string, (...args: unknown[]) => void>()

  beforeEach(() => {
    vi.clearAllMocks()
    listenerRegistry.clear()

    // Track registered listeners so tests can trigger them
    mockOn.mockImplementation((channel: string, callback: (...args: unknown[]) => void) => {
      listenerRegistry.set(channel, callback)
    })

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

    expect(mockOn).toHaveBeenCalledWith('chat:loaded', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('ai:chunk', expect.any(Function))
    expect(mockOn).toHaveBeenCalledWith('ai:done', expect.any(Function))
  })

  it('should send chat:load on mount', () => {
    render(<AIChat chatId="test-chat-1" />)

    expect(mockSend).toHaveBeenCalledWith('chat:load', 'test-chat-1')
  })

  it('should remove IPC listeners on unmount', () => {
    const { unmount } = render(<AIChat chatId="test-chat-1" />)
    unmount()

    expect(mockRemoveAll).toHaveBeenCalledWith('chat:loaded')
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

    expect(mockSend).not.toHaveBeenCalledWith('ai:chat', expect.anything())
  })

  it('should not send while streaming', () => {
    render(<AIChat chatId="test-chat-1" />)

    // Type and send first message
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Hello AI' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // The input should now be disabled (streaming)
    expect(mockSend).toHaveBeenCalledWith('ai:chat', expect.anything())

    // Clear the mock and try sending again
    mockSend.mockClear()
    fireEvent.change(input, { target: { value: 'Second message' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Should NOT send while streaming
    expect(mockSend).not.toHaveBeenCalledWith('ai:chat', expect.anything())
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

    expect(mockSend).not.toHaveBeenCalledWith('ai:chat', expect.anything())
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

  // ── Persistence tests ──────────────────────────────────────

  it('should load persisted messages on mount via chat:loaded event', () => {
    render(<AIChat chatId="test-chat-1" />)

    // Simulate receiving persisted messages
    const persistedMessages = [
      { role: 'user' as const, content: 'Hello' },
      { role: 'assistant' as const, content: 'Hi there!' },
    ]
    const onLoaded = listenerRegistry.get('chat:loaded')
    expect(onLoaded).toBeDefined()

    act(() => {
      onLoaded!('test-chat-1', persistedMessages)
    })

    // Persisted messages should now be visible
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Hi there!')).toBeInTheDocument()
  })

  it('should ignore chat:loaded events for other chatIds', () => {
    render(<AIChat chatId="test-chat-1" />)

    const onLoaded = listenerRegistry.get('chat:loaded')
    act(() => {
      // Different chatId — should not affect this component
      onLoaded!('other-chat', [{ role: 'user' as const, content: 'Should not appear' }])
    })

    expect(screen.queryByText('Should not appear')).not.toBeInTheDocument()
  })

  it('should save messages on ai:done', () => {
    render(<AIChat chatId="test-chat-1" />)

    // Send a message
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Hello' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Clear chat:load send from mount to isolate ai:done save
    mockSend.mockClear()

    // Simulate ai:done
    const onDone = listenerRegistry.get('ai:done')
    expect(onDone).toBeDefined()

    const onChunk = listenerRegistry.get('ai:chunk')
    expect(onChunk).toBeDefined()

    // Separate act() calls so React flushes state → effect → ref between events
    act(() => {
      onChunk!('test-chat-1', 'Some AI ')
    })
    act(() => {
      onChunk!('test-chat-1', 'response')
    })
    act(() => {
      onDone!('test-chat-1')
    })

    // Should have saved messages
    expect(mockSend).toHaveBeenCalledWith('chat:save', 'test-chat-1', [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Some AI response' },
    ])
  })

  it('should enforce 500 message cap when saving', () => {
    render(<AIChat chatId="test-chat-1" />)

    // Simulate loading 505 messages (padding to exceed 500 cap)
    const manyMessages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    for (let i = 0; i < 505; i++) {
      manyMessages.push({ role: 'user', content: `Message ${i}` })
    }

    const onLoaded = listenerRegistry.get('chat:loaded')
    act(() => {
      onLoaded!('test-chat-1', manyMessages)
    })

    // Send one more message
    const input = screen.getByPlaceholderText('Type a message...')
    fireEvent.change(input, { target: { value: 'Final' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    mockSend.mockClear()

    // Simulate ai:done to trigger save — separate act() to flush ref
    const onDone = listenerRegistry.get('ai:done')
    act(() => {
      onDone!('test-chat-1')
    })

    // Find the chat:save call and check it has <= 500 messages
    const saveCall = mockSend.mock.calls.find(
      (call: unknown[]) => call[0] === 'chat:save'
    )
    expect(saveCall).toBeDefined()
    const savedMessages = saveCall![2] as unknown[]
    expect(savedMessages.length).toBeLessThanOrEqual(500)
    // The last user message should be 'Final' (the placeholder follows it)
    const userMsg = [...savedMessages].reverse().find((m: any) => m.role === 'user')
    expect(userMsg?.content).toBe('Final')
  })

  it('should ignore ai:done events for other chatIds (no spurious save)', () => {
    render(<AIChat chatId="test-chat-1" />)

    mockSend.mockClear()

    const onDone = listenerRegistry.get('ai:done')
    act(() => {
      onDone!('other-chat')
    })

    // Should NOT have saved (wrong chatId)
    expect(mockSend).not.toHaveBeenCalledWith('chat:save', expect.anything(), expect.anything())
  })
})
