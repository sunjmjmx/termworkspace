"""
TermWorkspace — 模型 API 抽象层

ProviderConfig: provider 数据类
ProviderManager: 管理多 provider 的连接测试、模型列表、API key 查询
send_message: 统一异步发送消息（OpenAI 兼容 API / Anthropic 单独处理）
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import AsyncGenerator, Optional

import aiohttp

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────
# ProviderConfig
# ──────────────────────────────────────────────


@dataclass
class ProviderConfig:
    """单个 provider 的配置。"""

    name: str
    api_key: str
    base_url: str
    models: list[str] = field(default_factory=list)


# ──────────────────────────────────────────────
# ProviderManager
# ──────────────────────────────────────────────


class ProviderManager:
    """从 config 字典加载所有 provider，提供查询、测试、API key 检索功能。"""

    def __init__(self, providers_config: Optional[dict] = None):
        """
        Args:
            providers_config: 形如 {'deepseek': {'api_key': 'sk-...', 'base_url': '...', 'models': [...]}}
        """
        self._providers: dict[str, ProviderConfig] = {}
        if providers_config:
            self.load_from_config(providers_config)

    # ── 加载 ──────────────────────────────────

    def load_from_config(self, providers_config: dict) -> None:
        """从配置字典加载所有 provider。"""
        self._providers.clear()
        for name, cfg in providers_config.items():
            self._providers[name] = ProviderConfig(
                name=name,
                api_key=cfg.get("api_key", ""),
                base_url=cfg.get("base_url", "").rstrip("/"),
                models=cfg.get("models", []),
            )

    def get_provider(self, name: str) -> Optional[ProviderConfig]:
        """按名称获取 provider。"""
        return self._providers.get(name)

    @property
    def all_providers(self) -> dict[str, ProviderConfig]:
        return dict(self._providers)

    # ── 测试连通性 ─────────────────────────────

    async def test_connection(self, provider_name: str) -> bool:
        """发一个最简单的请求测试 provider 连通性。

        对 OpenAI 兼容 API 发 GET /v1/models（使用 API key 鉴权）。
        对 Anthropic 发 GET /v1/models。
        """
        provider = self._providers.get(provider_name)
        if not provider:
            logger.warning("test_connection: provider '%s' not found", provider_name)
            return False
        if not provider.api_key:
            logger.warning("test_connection: provider '%s' has no API key", provider_name)
            return False

        base = provider.base_url.rstrip("/")
        # Anthropic 的 /v1/models 返回格式不同，但也走 GET
        headers = self._build_headers(provider)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{base}/models", headers=headers, timeout=aiohttp.ClientTimeout(total=15)
                ) as resp:
                    if resp.status == 200:
                        logger.info("test_connection: %s OK", provider_name)
                        return True
                    else:
                        body = await resp.text()
                        logger.warning(
                            "test_connection: %s returned %s — %s",
                            provider_name,
                            resp.status,
                            body[:200],
                        )
                        return False
        except (asyncio.TimeoutError, aiohttp.ClientError) as exc:
            logger.error("test_connection: %s connection failed — %s", provider_name, exc)
            return False

    # ── 获取可用模型 ───────────────────────────

    def get_available_models(self) -> list[tuple[str, str]]:
        """返回所有可用模型列表，每项为 (provider_name, model_name)。"""
        result: list[tuple[str, str]] = []
        for provider in self._providers.values():
            for model in provider.models:
                result.append((provider.name, model))
        return result

    # ── 根据模型名查找 API key ─────────────────

    def get_api_key(self, model_name: str) -> Optional[str]:
        """根据模型名（纯名称或 provider/model 格式）查找 API key。"""
        # 如果传入了 provider/model 格式，先按 provider 查
        if "/" in model_name:
            pname, _ = model_name.split("/", 1)
            provider = self._providers.get(pname)
            if provider:
                return provider.api_key
            return None

        # 纯模型名 — 遍历所有 provider 找到第一个匹配
        for provider in self._providers.values():
            if model_name in provider.models:
                return provider.api_key
        return None

    def get_base_url(self, model_name: str) -> Optional[str]:
        """根据模型名获取 base_url。"""
        if "/" in model_name:
            pname, _ = model_name.split("/", 1)
            provider = self._providers.get(pname)
            if provider:
                return provider.base_url
            return None
        for provider in self._providers.values():
            if model_name in provider.models:
                return provider.base_url
        return None

    def is_anthropic(self, model_name: str) -> bool:
        """判断模型是否走 Anthropic API。"""
        if "/" in model_name:
            pname, _ = model_name.split("/", 1)
            return pname.lower() == "anthropic"
        provider = self._get_provider_by_model(model_name)
        return provider is not None and provider.name.lower() == "anthropic"

    # ── 内部 helpers ───────────────────────────

    def _get_provider_by_model(self, model_name: str) -> Optional[ProviderConfig]:
        for provider in self._providers.values():
            if model_name in provider.models:
                return provider
        return None

    @staticmethod
    def _build_headers(provider: ProviderConfig) -> dict[str, str]:
        headers: dict[str, str] = {}
        if provider.name.lower() == "anthropic":
            headers["x-api-key"] = provider.api_key
            headers["anthropic-version"] = "2023-06-01"
        else:
            headers["Authorization"] = f"Bearer {provider.api_key}"
        headers["Content-Type"] = "application/json"
        return headers


# ──────────────────────────────────────────────
# send_message — 统一消息发送
# ──────────────────────────────────────────────

# Anthropic 消息格式转换
_ANTHROPIC_ROLE_MAP = {
    "user": "user",
    "assistant": "assistant",
    "system": "system",
}


def _to_anthropic_messages(messages: list[dict], system_prompt: Optional[str] = None) -> dict:
    """将 OpenAI 格式消息转为 Anthropic Messages API 格式。"""
    system_content: Optional[str] = system_prompt
    anthro_messages: list[dict] = []

    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "system":
            system_content = content  # Anthropic 用顶层 system 参数
        else:
            anthro_messages.append({"role": _ANTHROPIC_ROLE_MAP.get(role, "user"), "content": content})

    payload: dict[str, object] = {
        "model": "",  # 由调用者填充
        "messages": anthro_messages,
        "max_tokens": 4096,
        "stream": False,
    }
    if system_content:
        payload["system"] = system_content
    return payload


def _to_openai_payload(
    model: str,
    messages: list[dict],
    system_prompt: Optional[str] = None,
    stream: bool = False,
) -> dict:
    """构建 OpenAI 兼容 API 的请求体。"""
    msgs = list(messages)
    if system_prompt:
        # 如果已有 system 消息，替换第一个；否则插入到开头
        system_inserted = False
        for i, m in enumerate(msgs):
            if m.get("role") == "system":
                msgs[i] = {"role": "system", "content": system_prompt}
                system_inserted = True
                break
        if not system_inserted:
            msgs.insert(0, {"role": "system", "content": system_prompt})

    return {
        "model": model,
        "messages": msgs,
        "stream": stream,
    }


async def send_message(
    model_name: str,
    messages: list[dict],
    system_prompt: Optional[str] = None,
    stream: bool = False,
    provider_manager: Optional[ProviderManager] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
) -> dict | AsyncGenerator[dict, None]:
    """统一发送消息到模型 API。

    Args:
        model_name: 模型名，支持 "deepseek/deepseek-chat" 格式或纯模型名。
        messages: OpenAI 格式消息列表 [{"role": "user", "content": "..."}, ...]。
        system_prompt: 可选的系统提示词。
        stream: 是否启用流式输出。
        provider_manager: 用于自动查找 api_key / base_url。
        api_key: 直接指定 API key（优先级高于 provider_manager）。
        base_url: 直接指定 base URL（优先级高于 provider_manager）。

    Returns:
        非流式: dict（完整响应）。
        流式: AsyncGenerator[dict, None]（每个 chunk 为 {"content": str, "done": bool}）。

    Raises:
        ValueError: 当必要参数缺失时。
        aiohttp.ClientError: 网络请求失败。
    """
    # ── 解析目标地址 ──────────────────────────
    resolved_key = api_key
    resolved_url = base_url
    resolved_model = model_name

    if provider_manager and (api_key is None or base_url is None):
        if "/" in model_name:
            parts = model_name.split("/", 1)
            pname, mname = parts[0], parts[1]
            provider = provider_manager.get_provider(pname)
            if provider:
                resolved_key = resolved_key or provider.api_key
                resolved_url = resolved_url or provider.base_url
                resolved_model = mname
        else:
            # 纯模型名 — 遍历查找
            resolved_key = resolved_key or provider_manager.get_api_key(model_name)
            resolved_url = resolved_url or provider_manager.get_base_url(model_name)

    if not resolved_key:
        raise ValueError(f"无法找到模型 '{model_name}' 的 API key")
    if not resolved_url:
        raise ValueError(f"无法找到模型 '{model_name}' 的 base URL")

    # ── Anthropic 特殊处理 ────────────────────
    is_anthropic = provider_manager and provider_manager.is_anthropic(model_name)
    if not is_anthropic and "/" in model_name:
        is_anthropic = model_name.split("/", 1)[0].lower() == "anthropic"

    if is_anthropic:
        result = await _send_anthropic(
            model=resolved_model,
            messages=messages,
            system_prompt=system_prompt,
            api_key=resolved_key,
            base_url=resolved_url,
            stream=stream,
        )
        return result

    # ── OpenAI 兼容 API ──────────────────────
    payload = _to_openai_payload(resolved_model, messages, system_prompt, stream=stream)
    headers = {
        "Authorization": f"Bearer {resolved_key}",
        "Content-Type": "application/json",
    }

    endpoint = f"{resolved_url.rstrip('/')}/chat/completions"

    if stream:
        return _send_stream_openai(endpoint, headers, payload)
    else:
        return await _send_sync_openai(endpoint, headers, payload)


# ── OpenAI 兼容：非流式 ──────────────────────


async def _send_sync_openai(endpoint: str, headers: dict, payload: dict) -> dict:
    """非流式调用 OpenAI 兼容 API。"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120),
            ) as resp:
                body = await resp.json()
                if resp.status == 200:
                    return _normalize_openai_response(body)
                else:
                    return _build_error_response(resp.status, body)
    except asyncio.TimeoutError:
        return _build_error_response(408, {"error": {"message": "请求超时，请检查网络连接"}})
    except aiohttp.ClientError as exc:
        return _build_error_response(0, {"error": {"message": f"网络错误: {exc}"}})
    except json.JSONDecodeError:
        return _build_error_response(0, {"error": {"message": "API 返回了非 JSON 格式的响应"}})


# ── OpenAI 兼容：流式 ────────────────────────


async def _send_stream_openai(
    endpoint: str, headers: dict, payload: dict
) -> AsyncGenerator[dict, None]:
    """流式调用 OpenAI 兼容 API，逐 chunk 产出。"""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=300),
            ) as resp:
                if resp.status != 200:
                    body = await resp.json()
                    yield _build_error_response(resp.status, body)
                    return

                # SSE 必须逐行读取 —— aiohttp.StreamReader.__aiter__ 产出的是字节块而非行
                while True:
                    line_bytes = await resp.content.readline()
                    if not line_bytes:
                        break  # EOF
                    decoded = line_bytes.decode("utf-8", errors="replace").strip()
                    if not decoded or decoded.startswith(":"):
                        continue  # SSE 注释行 / 空行
                    if decoded.startswith("data: "):
                        data_str = decoded[6:]
                        if data_str == "[DONE]":
                            yield {"content": "", "done": True}
                            return
                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        content = delta.get("content", "")
                        yield {"content": content, "done": False}
    except asyncio.TimeoutError:
        yield _build_error_response(408, {"error": {"message": "流式请求超时"}})
    except aiohttp.ClientError as exc:
        yield _build_error_response(0, {"error": {"message": f"流式网络错误: {exc}"}})
    except Exception as exc:
        yield _build_error_response(0, {"error": {"message": f"流式处理异常: {exc}"}})


# ── Anthropic ────────────────────────────────


async def _send_anthropic(
    model: str,
    messages: list[dict],
    system_prompt: Optional[str] = None,
    api_key: str = "",
    base_url: str = "https://api.anthropic.com/v1",
    stream: bool = False,
) -> dict | AsyncGenerator[dict, None]:
    """调用 Anthropic Messages API。"""
    base = base_url.rstrip("/")
    payload = _to_anthropic_messages(messages, system_prompt)
    payload["model"] = model
    payload["stream"] = stream

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    endpoint = f"{base}/messages"

    if stream:
        return _send_stream_anthropic(endpoint, headers, payload)
    else:
        return await _send_sync_anthropic(endpoint, headers, payload)


async def _send_sync_anthropic(endpoint: str, headers: dict, payload: dict) -> dict:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120),
            ) as resp:
                body = await resp.json()
                if resp.status == 200:
                    return _normalize_anthropic_response(body)
                else:
                    return _build_error_response(resp.status, body)
    except asyncio.TimeoutError:
        return _build_error_response(408, {"error": {"message": "Anthropic 请求超时"}})
    except aiohttp.ClientError as exc:
        return _build_error_response(0, {"error": {"message": f"Anthropic 网络错误: {exc}"}})


async def _send_stream_anthropic(
    endpoint: str, headers: dict, payload: dict
) -> AsyncGenerator[dict, None]:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                endpoint,
                headers=headers,
                json=payload,
                timeout=aiohttp.ClientTimeout(total=300),
            ) as resp:
                if resp.status != 200:
                    body = await resp.json()
                    yield _build_error_response(resp.status, body)
                    return

                while True:
                    line_bytes = await resp.content.readline()
                    if not line_bytes:
                        break
                    decoded = line_bytes.decode("utf-8", errors="replace").strip()
                    if not decoded or decoded.startswith(":"):
                        continue
                    if decoded.startswith("data: "):
                        data_str = decoded[6:]
                        if data_str == "[DONE]":
                            yield {"content": "", "done": True}
                            return
                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        if chunk.get("type") == "content_block_delta":
                            delta = chunk.get("delta", {})
                            yield {"content": delta.get("text", ""), "done": False}
                        elif chunk.get("type") == "message_stop":
                            yield {"content": "", "done": True}
                            return
    except asyncio.TimeoutError:
        yield _build_error_response(408, {"error": {"message": "Anthropic 流式请求超时"}})
    except aiohttp.ClientError as exc:
        yield _build_error_response(0, {"error": {"message": f"Anthropic 流式网络错误: {exc}"}})
    except Exception as exc:
        yield _build_error_response(0, {"error": {"message": f"Anthropic 流式异常: {exc}"}})


# ── 响应标准化 ──────────────────────────────


def _normalize_openai_response(body: dict) -> dict:
    """将 OpenAI 兼容 API 的响应标准化为统一格式。"""
    choice = body.get("choices", [{}])[0]
    message = choice.get("message", {})
    return {
        "role": message.get("role", "assistant"),
        "content": message.get("content", ""),
        "model": body.get("model", ""),
        "finish_reason": choice.get("finish_reason", ""),
        "usage": body.get("usage", {}),
        "raw": body,
    }


def _normalize_anthropic_response(body: dict) -> dict:
    """将 Anthropic API 的响应标准化为统一格式。"""
    content_blocks = body.get("content", [])
    full_text = "".join(block.get("text", "") for block in content_blocks if block.get("type") == "text")
    return {
        "role": "assistant",
        "content": full_text,
        "model": body.get("model", ""),
        "finish_reason": body.get("stop_reason", ""),
        "usage": {
            "input_tokens": body.get("usage", {}).get("input_tokens", 0),
            "output_tokens": body.get("usage", {}).get("output_tokens", 0),
        },
        "raw": body,
    }


def _build_error_response(status_code: int, body: dict) -> dict:
    """构造统一的错误响应。"""
    error = body.get("error", body) if isinstance(body, dict) else {"message": str(body)}
    if isinstance(error, dict):
        msg = error.get("message", str(error))
    else:
        msg = str(error)

    logger.warning("API error: status=%s msg=%s", status_code, msg[:200])

    # 友好提示
    if status_code == 401:
        friendly = "API Key 无效，请检查配置"
    elif status_code == 404:
        friendly = "模型不存在或 API 端点错误"
    elif status_code == 429:
        friendly = "请求频率超限，请稍后重试"
    elif status_code == 408 or status_code == 0:
        friendly = msg
    else:
        friendly = f"API 错误 ({status_code}): {msg}"

    return {
        "role": "system",
        "content": f"⚠️ {friendly}",
        "model": "",
        "finish_reason": "error",
        "usage": {},
        "raw": body,
        "error": True,
    }


# ── 默认 Provider 常量 ──────────────────────

DEFAULT_PROVIDERS: dict[str, dict] = {
    "deepseek": {
        "api_key": "",
        "base_url": "https://api.deepseek.com/v1",
        "models": ["deepseek-chat", "deepseek-reasoner"],
    },
    "openai": {
        "api_key": "",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
    },
    "anthropic": {
        "api_key": "",
        "base_url": "https://api.anthropic.com/v1",
        "models": ["claude-3-5-sonnet-20241022", "claude-3-haiku-20240307"],
    },
}
