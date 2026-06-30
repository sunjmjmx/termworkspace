# Streaming Output — Phase2-1

## Overview

Phase2-1 adds **streaming (逐字输出)** support to TermWorkspace. When a user
sends a message to an LLM provider, the response now appears incrementally
chunk by chunk instead of waiting for the full response.

## Architecture

```
User input → app.py do_send()
  → providers.py send_message(stream=True)
    → _send_stream_openai() or _send_stream_anthropic()
      → SSE event stream parsed into chunks
  → async for chunk in generator:
    → window.py stream_chunk() / stream_end() / stream_error()
      → TextArea.text grows incrementally (user sees word-by-word output)
```

### Module responsibilities

| Module | File | Role |
|--------|------|------|
| `providers.py` | `src/termworkspace/providers.py` | Sends request with `stream: true`, parses SSE lines, yields `{"content": ..., "done": bool}` dicts via `AsyncGenerator`. Supports both OpenAI-compatible and Anthropic APIs. |
| `app.py` | `src/termworkspace/app.py` | `on_ai_window_panel_send_requested` → `do_send()` coroutine consumes the async generator and routes each chunk to the active panel. Handles 3 error tiers: `ValueError` (config), `ClientError` (network), `TimeoutError`. |
| `window.py` | `src/termworkspace/window.py` | `stream_chunk()`, `stream_end()`, `stream_error()` — manages per-panel streaming state including header creation, incremental text appending, error recovery, and storage persistence. |

## Streaming API (window.py)

### `stream_chunk(content: str)`
Appends a content chunk to the conversation history. On first call per message,
automatically creates the `── assistant ──` header. Subsequent calls append
content in-place. Handles empty chunks gracefully (skipped).

### `stream_end()`
Finalises the streamed message: records the complete assistant content into
`self.messages`, fires the storage save callback (if wired), resets streaming
state. Safe to call even if streaming never started (no-op).

### `stream_error(msg: str)`
Three-path error handling:
1. **No streaming started**: Adds a system error message directly.
2. **Streaming started but no real content yet**: Removes the empty assistant
   header (no dangling heading).
3. **Some content already streamed**: Appends `[Error: {msg}]` inline.

All paths reset `_streaming` state and add the error to `self.messages`.

## Edge cases handled

| Scenario | Behaviour |
|----------|-----------|
| Empty chunk (`content=''`) | Skipped, nothing appended |
| Error before first content | Empty header cleaned up, no visible noise |
| Error after some content | `[Error: ...]` appended inline |
| Streaming interrupted mid-turn | `stream_error` cleans up state |
| Multiple panels | Each panel has independent `_streaming` flag |
| Clear conversation during streaming | `clear_conversation()` resets `_streaming`/`_streaming_content` |
| No streaming needed (sync mode) | `send_message(stream=False)` returns dict as before |
| Session persistence | `stream_end()` fires `_save_callback` for DB write |

## Verification

Streaming was verified end-to-end using local Ollama (`qwen3.5` model):

```
input:  "Count 1 to 3, just the numbers"
output: chunk: '1'
        chunk: ' 2'
        chunk: ' 3'
        [DONE]
```

Test script (in `docs/screenshots/streaming-test.py`):

```python
import asyncio
from termworkspace.providers import ProviderManager, send_message

async def test():
    mgr = ProviderManager({
        "ollama": {
            "api_key": "ollama",
            "base_url": "http://localhost:11434/v1",
            "models": ["qwen3.5"]
        }
    })
    gen = await send_message(
        model_name="ollama/qwen3.5",
        messages=[{"role": "user", "content": "Count 1 to 3"}],
        provider_manager=mgr,
        stream=True,
    )
    async for chunk in gen:
        if chunk.get("done"):
            print("[DONE]")
        elif chunk.get("content"):
            print(f"  {repr(chunk['content'])}")

asyncio.run(test())
```

## Files changed

- `src/termworkspace/window.py` — Added streaming API (`stream_chunk`, `stream_end`, `stream_error`, `set_storage_callbacks`, `load_messages`), streaming instance state (`_streaming`, `_streaming_content`), storage callback fields (`_save_callback`, `_clear_callback`)
- `src/termworkspace/app.py` — `do_send()` coroutine with `async for` consumption, tiered error handling
- `src/termworkspace/providers.py` — `_send_stream_openai`, `_send_stream_anthropic` (pre-existing in branch, verified complete)

### Out of scope (moved to own branches)

Changes that were on `feat/streaming-output` but have been moved to their own
feature branches:

| File(s) | Target branch |
|---------|---------------|
| `Formula/`, `install.sh`, `pyproject.toml` | `feat/packaging` |
| `docs/templates/` | `feat/template-market` |
| `tests/test_config_templates.py` | `feat/testing-v2` |
| `Formula/` (Homebrew) | `feat/packaging` |
