#!/bin/bash
set -e

# =============================================================================
# TermWorkspace 安装脚本
# =============================================================================
# 兼容 macOS 12+ (Monterey, Ventura, Sonoma, Sequoia) 和 Linux
#
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/sunjmjmx/termworkspace/main/install.sh | bash
#   # 或本地运行:
#   bash install.sh [--venv DIR] [--no-launch]
#
# =============================================================================

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }
section() { echo; echo -e "${CYAN}━━━ $1 ━━━${NC}"; }

# Parse CLI args
USE_VENV=""
VENV_DIR=""
NO_LAUNCH=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --venv) USE_VENV="yes"; VENV_DIR="$2"; shift 2 ;;
    --no-launch) NO_LAUNCH=true; shift ;;
    --help)
      echo "Usage: bash install.sh [--venv DIR] [--no-launch]"
      echo "  --venv DIR     Install inside a virtualenv at DIR (default: ~/.termworkspace/venv)"
      echo "  --no-launch    Skip the launch prompt at the end"
      exit 0
      ;;
    *) error "Unknown option: $1"; exit 1 ;;
  esac
done

# ── Cleanup on failure ──────────────────────────────────────────────────────
cleanup() {
  if [ $? -ne 0 ]; then
    echo
    error "安装过程中出现错误，请检查上面的输出信息。"
    error "如有问题，请前往 https://github.com/sunjmjmx/termworkspace/issues 反馈。"
  fi
}
trap cleanup EXIT

# =============================================================================
# Step 1: Check system compatibility
# =============================================================================
section "Step 1: 检查系统环境"

OS=""
case "$(uname -s)" in
  Darwin) OS="macos" ;;
  Linux)  OS="linux" ;;
  *)
    error "不支持的操作系统: $(uname -s)。仅支持 macOS 和 Linux。"
    exit 1
    ;;
esac
info "操作系统: $OS"

# macOS version check (for Terminal/Textual compatibility)
if [ "$OS" = "macos" ]; then
  SW_VERSION=$(sw_vers -productVersion 2>/dev/null || echo "0")
  info "macOS 版本: $SW_VERSION"
  MAJOR=$(echo "$SW_VERSION" | cut -d. -f1)
  if [ "$MAJOR" -lt 12 ]; then
    warn "TermWorkspace 官方支持 macOS 12+。当前版本可能兼容但未经过充分测试。"
  fi
fi

# =============================================================================
# Step 2: Check Python version
# =============================================================================
section "Step 2: 检查 Python 版本"

PYTHON=""
for cmd in python3 python; do
  if command -v "$cmd" &> /dev/null; then
    PYTHON="$cmd"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  error "未找到 Python。请安装 Python 3.12+"
  echo "  推荐: brew install python@3.12"
  echo "  或从 https://www.python.org/downloads/ 下载"
  exit 1
fi

PYTHON_VERSION=$($PYTHON --version 2>&1 | awk '{print $2}')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || { [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 12 ]; }; then
  error "需要 Python 3.12+，当前版本: $PYTHON_VERSION"
  echo "  升级方法: brew upgrade python@3.12"
  exit 1
fi

info "Python 版本 $PYTHON_VERSION ✓"

# =============================================================================
# Step 3: Check if pip-installed version exists
# =============================================================================
section "Step 3: 检测安装方式"

# Determine script directory for local install
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IS_LOCAL=false
if [ -f "$SCRIPT_DIR/pyproject.toml" ] && [ -d "$SCRIPT_DIR/src/termworkspace" ]; then
  IS_LOCAL=true
  info "使用本地源码安装 (来自 $SCRIPT_DIR)"
fi

# =============================================================================
# Step 4: Create config directory
# =============================================================================
section "Step 4: 创建配置目录"

CONFIG_DIR="$HOME/.termworkspace"
mkdir -p "$CONFIG_DIR/sessions"
info "配置目录: $CONFIG_DIR"

# =============================================================================
# Step 5: Install Python dependencies
# =============================================================================
section "Step 5: 安装 Python 依赖"

$PYTHON -m pip install --upgrade pip -q

if [ "$IS_LOCAL" = true ]; then
  # Local install from source
  if [ -n "$USE_VENV" ]; then
    VENV_PATH="${VENV_DIR:-$HOME/.termworkspace/venv}"
    info "创建虚拟环境: $VENV_PATH"
    $PYTHON -m venv "$VENV_PATH"
    source "$VENV_PATH/bin/activate"
    info "已激活虚拟环境 ✓"
    PYTHON="$(dirname "$VENV_PATH/bin/python3")/python3"
  fi

  info "正在安装 TermWorkspace (本地源码)..."
  $PYTHON -m pip install -e "$SCRIPT_DIR"
  info "本地安装完成 ✓"
else
  # Remote install — from PyPI
  info "正在通过 PyPI 安装 TermWorkspace..."
  if [ -n "$USE_VENV" ]; then
    VENV_PATH="${VENV_DIR:-$HOME/.termworkspace/venv}"
    info "创建虚拟环境: $VENV_PATH"
    $PYTHON -m venv "$VENV_PATH"
    source "$VENV_PATH/bin/activate"
    PYTHON="$(dirname "$VENV_PATH/bin/python3")/python3"
  fi

  $PYTHON -m pip install termworkspace
  info "PyPI 安装完成 ✓"
fi

# =============================================================================
# Step 6: Initialize config file
# =============================================================================
section "Step 6: 初始化配置文件"

CONFIG_FILE="$CONFIG_DIR/config.yaml"

# Try to find example config
EXAMPLE_CONFIG=""
if [ "$IS_LOCAL" = true ] && [ -f "$SCRIPT_DIR/config.yaml.example" ]; then
  EXAMPLE_CONFIG="$SCRIPT_DIR/config.yaml.example"
elif [ -f "./config.yaml.example" ]; then
  EXAMPLE_CONFIG="./config.yaml.example"
fi

if [ -n "$EXAMPLE_CONFIG" ]; then
  if [ -f "$CONFIG_FILE" ]; then
    info "配置文件已存在: $CONFIG_FILE (跳过)"
  else
    cp "$EXAMPLE_CONFIG" "$CONFIG_FILE"
    info "已创建配置文件: $CONFIG_FILE"
  fi
else
  if [ ! -f "$CONFIG_FILE" ]; then
    info "未找到示例配置，创建空白配置文件..."
    cat > "$CONFIG_FILE" << 'CFGEOF'
# TermWorkspace 配置
# 替换 YOUR_API_KEY_HERE 为你的真实 API Key

providers:
  deepseek:
    api_key: "YOUR_API_KEY_HERE"
    base_url: "https://api.deepseek.com/v1"
    model: "deepseek-chat"

  openai:
    api_key: "YOUR_API_KEY_HERE"
    base_url: "https://api.openai.com/v1"
    model: "gpt-4o"

theme: dark
CFGEOF
    info "已创建默认配置文件: $CONFIG_FILE"
  fi
fi

# =============================================================================
# Step 7: Verify installation
# =============================================================================
section "Step 7: 验证安装"

if command -v termworkspace &> /dev/null; then
  VERSION=$(termworkspace --version 2>&1 || echo "installed")
  info "TermWorkspace 已就绪 ✓ ($VERSION)"
else
  warn "termworkspace 命令未在 PATH 中找到。"
  warn "请确保 Python 的 bin 目录在 PATH 中:"
  echo "   export PATH=\"\$($PYTHON -m site --user-base)/bin:\$PATH\""
  if [ -n "$USE_VENV" ]; then
    echo "   或激活虚拟环境: source $VENV_PATH/bin/activate"
  fi
fi

# =============================================================================
# Done
# =============================================================================
section "✅ 安装完成！"

echo
info "请在启动前配置你的 API Key："
echo
echo -e "   ${YELLOW}nano $CONFIG_FILE${NC}"
echo
info "需要替换以下占位符："
echo "   - providers.deepseek.api_key  → 你的 DeepSeek API Key"
echo "   - providers.openai.api_key    → 你的 OpenAI API Key"
echo
info "获取 API Key："
echo "   DeepSeek: https://platform.deepseek.com/api_keys"
echo "   OpenAI:   https://platform.openai.com/api-keys"
echo

if [ "$NO_LAUNCH" = false ]; then
  read -rp "$(echo -e "${YELLOW}是否现在编辑配置文件？(y/n) ${NC}")" EDIT_NOW
  if [[ "$EDIT_NOW" =~ ^[Yy]$ ]]; then
    if command -v nano &> /dev/null; then
      nano "$CONFIG_FILE"
    elif command -v vim &> /dev/null; then
      vim "$CONFIG_FILE"
    elif command -v vi &> /dev/null; then
      vi "$CONFIG_FILE"
    else
      warn "未找到 nano/vim 编辑器，请手动编辑: $CONFIG_FILE"
    fi
  fi

  read -rp "$(echo -e "${YELLOW}是否现在启动 TermWorkspace？(y/n) ${NC}")" START_NOW
  if [[ "$START_NOW" =~ ^[Yy]$ ]]; then
    echo
    info "正在启动 TermWorkspace..."
    termworkspace
  else
    echo
    info "稍后可通过以下命令启动："
    echo -e "   ${CYAN}termworkspace --help${NC}"
    echo
  fi
fi
