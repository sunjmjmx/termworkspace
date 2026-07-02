import { useState, useRef, useEffect, useCallback } from 'react'
import type { AiChatMessage } from '../../types'

interface AIChatProps {
  /** Unique ID for this AI chat instance — used to correlate IPC events */
  chatId: string
  /** Optional initial model override */
  model?: string
  /** Optional system prompt */
  systemPrompt?: string
}

/**
 * AIChat — AI dialog component with streaming output.
 *
 * - Input box + message list.
 * - Enter sends, Shift+Enter adds newline.
 * - Streaming response via IPC events (ai:chunk, ai:done).
 * - Message bubbles with Catppuccin Mocha palette.
 */
export function AIChat({ chatId, model, systemPrompt }: AIChatProps) {
  const [messages, setMessages] = useState<AiChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Subscribe to IPC events
  useEffect(() => {
    const api = window.electronAPI

    const onChunk = (_chatId: string, text: string) => {
      if (_chatId !== chatId) return

      setMessages((prev) => {
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant') {
          // Append to the last assistant message
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...last,
            content: last.content + text,
          }
          return updated
        }
        return prev
      })
    }

    const onDone = (_chatId: string) => {
      if (_chatId !== chatId) return
      setIsStreaming(false)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.on('ai:chunk', onChunk as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.on('ai:done', onDone as any)

    return () => {
      api.removeAllListeners('ai:chunk')
      api.removeAllListeners('ai:done')
    }
  }, [chatId])

  const sendMessage = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return

    // Add user message
    const userMsg: AiChatMessage = { role: 'user', content: trimmed }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsStreaming(true)

    // Add an empty placeholder for the assistant response
    const placeholder: AiChatMessage = { role: 'assistant', content: '' }
    setMessages((prev) => [...prev, placeholder])

    // Send IPC to main process
    window.electronAPI.send('ai:chat', {
      terminalId: chatId,
      prompt: trimmed,
      model,
      systemPrompt,
    })
  }, [input, isStreaming, chatId, model, systemPrompt])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        sendMessage()
      }
    },
    [sendMessage],
  )

  return (
    <div className="ai-chat">
      {/* Message list */}
      <div className="ai-chat-messages">
        {messages.length === 0 && (
          <div className="ai-chat-empty">
            <div className="ai-chat-empty-icon">🤖</div>
            <p>Ask anything about your workspace</p>
            <p className="ai-chat-empty-hint">
              Press Enter to send · Shift+Enter for new line
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`ai-chat-bubble ai-chat-bubble-${msg.role}`}
          >
            <div className="ai-chat-bubble-role">
              {msg.role === 'user' ? 'You' : 'AI'}
            </div>
            <div className="ai-chat-bubble-content">
              {msg.content || (msg.role === 'assistant' && isStreaming && i === messages.length - 1 ? (
                <span className="ai-chat-cursor">|</span>
              ) : (
                msg.content
              ))}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="ai-chat-input-area">
        <textarea
          ref={inputRef}
          className="ai-chat-input"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          disabled={isStreaming}
        />
        <button
          className="ai-chat-send-btn"
          onClick={sendMessage}
          disabled={!input.trim() || isStreaming}
          title="Send (Enter)"
        >
          {isStreaming ? '○' : '→'}
        </button>
      </div>
    </div>
  )
}

export default AIChat
