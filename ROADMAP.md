# TermWorkspace — Phase 1 路线图

> 项目领导：Dark（AI Agent）
> 汇报对象：SUN（用户/产品负责人）
> 启动时间：2026.06.30

---

## 总体目标

交付一个**可运行、可分发的终端多模型 AI 工作台**。用户安装后配好自己的 API Key，即可在多个 Tab 多个窗口中同时使用不同模型。

## 团队分工

| 分身 | 角色 | 负责人 |
|------|------|--------|
| Dark | 项目领导 + 集成 | 总体架构、代码集成、最终交付 |
| Dev-UI | TUI 开发 | app.py、workspace.py、window.py |
| Dev-Backend | 后端开发 | providers.py、config.py、storage.py |
| QA-Test | 质量检测 | 代码审查、边界测试、运行验证 |
| Doc | 文档撰写 | README、配置指南、安装脚本 |

## Phase 1 里程碑

### Milestone 1：骨架就绪（Day 1）
- [ ] 项目目录结构
- [ ] requirements.txt
- [ ] config.yaml 示例
- [ ] 核心模块接口定义

### Milestone 2：三个模块并行开发（Day 1-2）
- [ ] TUI 界面：多 Tab + 窗口拆分 + 对话输入输出
- [ ] API 层：OpenAI 兼容接口 + 多 Provider 管理
- [ ] 配置层：YAML 读写 + 首次运行向导
- [ ] 持久化：SQLite 对话历史

### Milestone 3：集成联调（Day 2）
- [ ] 各模块连通测试
- [ ] 后台任务不中断验证
- [ ] 多窗口多模型同时工作测试

### Milestone 4：产品化（Day 3）
- [ ] 安装脚本
- [ ] README 文档
- [ ] 错误处理完善
- [ ] 最终交付物确认

## 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| TUI 框架 | Textual | 最成熟的 Python TUI，Tab+Split 原生支持 |
| 模型接口 | OpenAI 兼容 API | 统一接口，所有模型通用 |
| 配置格式 | YAML | 人类可读写 |
| 持久化 | SQLite | 零配置，Python 内置 |
| 异步 | asyncio | Textual 原生异步 |

## 交付物清单

- [ ] `src/app.py` — 应用入口
- [ ] `src/workspace.py` — 工作区管理
- [ ] `src/window.py` — AI 对话窗口
- [ ] `src/providers.py` — 模型 API 抽象
- [ ] `src/config.py` — 配置管理
- [ ] `src/storage.py` — 持久化
- [ ] `requirements.txt` — 依赖清单
- [ ] `config.yaml.example` — 配置示例
- [ ] `install.sh` — 一键安装脚本
- [ ] `README.md` — 项目文档
- [ ] 可运行验证

## 风险管理

| 风险 | 概率 | 应对 |
|------|------|------|
| Textual 兼容性问题 | 低 | 备选 Rich + prompt_toolkit |
| 模型 API 差异大 | 中 | 统一走 OpenAI 格式，差异在 provider 层隔离 |
| 后台任务管理复杂 | 中 | asyncio.TaskGroup + 状态机 |
