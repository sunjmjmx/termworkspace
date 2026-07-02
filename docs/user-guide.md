# TermWorkspace 使用指南

用终端干活，累了转头问 AI，关掉再打开一切还在——这就是 TermWorkspace。

---

## 📦 快速安装

```bash
# 1. 下载代码
git clone https://github.com/sunjmjmx/termworkspace.git
cd termworkspace

# 2. 安装依赖（等 1-2 分钟）
npm install

# 3. 配置 AI 密钥（没密钥也能用终端，只是不能用 AI 对话）
echo 'DEEPSEEK_API_KEY=sk-your-key-here' > .env

# 4. 构建并启动
npm run build
npm start
```

> **需要什么？** 一台 macOS 电脑，装好 Node.js 18+ 和 Git。  
> **首次启动时** Gatekeeper 可能会拦截——去 系统设置 → 隐私与安全性 → 点"仍然打开"。

---

## 🔑 配置 AI 密钥

AI 对话需要配置 API 密钥。两种方式二选一：

### 方式一：.env 文件（推荐）

在项目根目录创建 `.env` 文件：

```bash
# DeepSeek（便宜，速度快）
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx

# 或者 Kimi（长上下文，适合读代码）
KIMI_API_KEY=sk-xxxxxxxxxxxxxxxx
```

**两个都写也行**，程序按 KIMI → DEEPSEEK 优先级选第一个可用的。

### 方式二：环境变量

```bash
export DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxx
npx electron .
```

### 验证是否生效

启动后打开 AI 面板（点终端右上角的 🤖 按钮），输入任意内容发送。如果看到 `❌ No API key found` 的提示，说明没读到密钥——检查 `.env` 文件名和位置。

---

## 🚀 日常使用场景

### 场景一：打开项目开始写代码

这是最常用的流程：

```
1. 启动 TermWorkspace
2. 弹出"选择项目文件夹"对话框 → 选你的代码目录
3. 左侧文件树自动展开，终端自动 cd 到项目目录
4. 开始敲命令
```

**快捷键：**
- `⌘N` — 新建 Tab
- `⌘W` — 关闭当前 Tab
- `⌘1-9` — 切到第 N 个 Tab
- 点 Tab 标题 → 重命名

**小技巧：** 选了项目后，每次启动自动恢复上次的项目，不用再选。

### 场景二：同时跑多个任务

```
Tab 1:  npm run dev          # 前台开发服务器
Tab 2:  npx vitest watch     # 测试监听
Tab 3:  cd backend && npm start  # 后端服务
```

点击 Tab 栏的 `+` 按钮新建，或者 `⌘N`。  
需要分屏？目前一个 Tab 一个终端，多个任务用多个 Tab 管理。

### 场景三：遇到问题问 AI

代码跑不通了，不想切浏览器：

```
1. 点当前终端右上角的 🤖 按钮（或 ⌘I）
2. 终端变为 AI 对话面板
3. 输入：'这个报错是什么意思：Error: ENOENT'
4. AI 回答后，点 🖥️ 按钮切回终端继续干活
```

**自动保存：** 关闭 TermWorkspace 后，AI 对话记录会自动存到 `~/.termworkspace/chats/`，下次打开自动恢复。

### 场景四：换个主题换心情

点 TabBar 右侧的 🌙/☀️ 按钮切换 Dark/Light 主题。  
选一次就记住了，下次启动还是这个主题。

---

## 🧭 界面导航

```
┌──────────────────────────────────────────┐
│ [项目路径]  Tab 1 │ Tab 2 │ + │ [🌙/☀️] │ ← TabBar
├──────────┬───────────────────────────────┤
│           │                               │
│  📂 docs  │  $ npm run dev                │
│  📂 src   │  > vite dev                   │
│    📄 ... │                               │
│  📄 .env  │  [🤖 → AI 对话面板切换]        │
│           │                               │
│  ← 折叠   │                               │
└──────────┴───────────────────────────────┘
   文件树          终端 / AI 面板
```

| 区域 | 作用 |
|:-----|:-----|
| **文件树**（左侧） | 浏览项目文件，点文件在终端显示路径 |
| **终端**（主区域） | 命令行操作，支持多 Tab |
| **AI 面板**（终端内切换） | 流式 AI 对话，不离开编辑器 |
| **TabBar**（顶部） | Tab 管理、主题切换、项目路径 |
| **拖拽区域**（无标题栏） | 顶部任意位置拖拽移动窗口 |

---

## 📁 项目配置存储位置

所有用户数据保存在 `~/.termworkspace/`：

```
~/.termworkspace/
├── app-config.json     # 主题、项目路径
├── layout.json          # Tab 布局、分屏结构
└── chats/
    ├── tab_1.json       # Tab 1 的 AI 对话记录
    ├── tab_2.json       # Tab 2 的 AI 对话记录
    └── ...              # 每个 AI Tab 一个文件
```

**重置出厂设置：** 关掉应用，跑 `rm -rf ~/.termworkspace/`，下次启动跟第一次一样。

---

## ❓ 常见问题

### Q: 终端一点反应都没有，光标也不闪

等几秒钟，PTY 初始化需要时间。如果超过 10 秒没反应，关掉重开。

### Q: AI 对话提示 "No API key found"

`.env` 文件没生效。检查：
1. 文件名是不是 `.env`（不是 `.env.txt` 或 `.env.production`）
2. 内容格式对不对：`DEEPSEEK_API_KEY=sk-xxx`（等号两边不要空格）
3. 文件在项目根目录（跟 `package.json` 同目录）

### Q: 启动时弹窗说"应用程序未签名"

正常。macOS Gatekeeper 不认识这个应用。去 系统设置 → 隐私与安全性 → 点"仍然打开"。  
或者按住 `⌃Control` 键点应用图标 → 打开。

### Q: 布局数据和对话记录存在哪？会不会丢？

存在 `~/.termworkspace/`，纯 JSON 文件，不会自己丢。  
担心数据安全可以定期备份这个目录。

### Q: 怎么更新到最新版？

```bash
cd termworkspace
git pull
npm install
npm run build
npm start
```

### Q: 退出时要不要手动保存会话？

不需要。关闭窗口时自动保存：Tab 布局 + AI 对话 + 主题 + 项目路径，下次打开一一恢复。  
**注意：** 终端里正在运行的进程（如 dev server）不会自动恢复——关了就没了。

---

## 🐞 已知限制

- 目前只支持 **macOS**（Electron × xterm.js，Linux/Windows 未测试）
- 终端 **不支持滚动回看**（后续版本会加）
- 分屏 **一个 Tab 只能一个终端**（后续版本支持 SplitPane 真正分屏）
- 窗口关闭 **直接退出**，没有确认对话框
- AI 对话 **最多保留 500 条**，超过后自动丢弃最早的
