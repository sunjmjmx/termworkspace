#!/bin/bash
set -e

# =============================================================================
# TermWorkspace 安装脚本
# =============================================================================

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# --- Helper functions ---
info()    { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }
section() { echo; echo -e "${CYAN}━━━ $1 ━━━${NC}"; }

# --- Cleanup on failure ---
cleanup() {
  if [ $? -ne 0 ]; then
    echo
    error "安装过程中出现错误，请检查上面的输出信息。"
    error "如有问题，请前往 https://github.com/termworkspace/termworkspace/issues 反馈。"
  fi
}
trap cleanup EXIT

# =============================================================================
# Step 1: Check Python version
# =============================================================================
section "Step 1: 检查 Python 版本"

PYTHON=""
for cmd in python3 python; do
  if command -v "$cmd" &> /dev/null; then
    PYTHON="$cmd"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  error "未找到 Python。请安装 Python 3.12+ (推荐: https://www.python.org/downloads/)"
  exit 1
fi

PYTHON_VERSION=$($PYTHON --version 2>&1 | awk '{print $2}')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)

if [ "$PYTHON_MAJOR" -lt 3 ] || { [ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 12 ]; }; then
  error "需要 Python 3.12+，当前版本: $PYTHON_VERSION"
  error "请升级 Python: https://www.python.org/downloads/"
  exit 1
fi

info "Python 版本 $PYTHON_VERSION ✓"

# =============================================================================
# Step 2: Create config directory
# =============================================================================
section "Step 2: 创建配置目录"

CONFIG_DIR="$HOME/.termworkspace"
if [ -d "$CONFIG_DIR" ]; then
  info "配置目录已存在: $CONFIG_DIR"
else
  mkdir -p "$CONFIG_DIR"
  info "已创建配置目录: $CONFIG_DIR"
fi

# 同时创建 sessions 子目录
mkdir -p "$CONFIG_DIR/sessions"

# =============================================================================
# Step 3: Install pip dependencies
# =============================================================================
section "Step 3: 安装 Python 依赖"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQUIREMENTS="$SCRIPT_DIR/requirements.txt"

if [ ! -f "$REQUIREMENTS" ]; then
  warn "未找到 requirements.txt，尝试从当前目录查找..."
  REQUIREMENTS="./requirements.txt"
fi

if [ ! -f "$REQUIREMENTS" ]; then
  error "找不到 requirements.txt 文件。"
  error "请确保 install.sh 和 requirements.txt 在同一目录下。"
  exit 1
fi

info "正在安装依赖 (来自 $REQUIREMENTS)..."
$PYTHON -m pip install --upgrade pip -q
$PYTHON -m pip install -r "$REQUIREMENTS"
info "依赖安装完成 ✓"

# =============================================================================
# Step 4: Copy example config if not exists
# =============================================================================
section "Step 4: 初始化配置文件"

CONFIG_FILE="$CONFIG_DIR/config.yaml"
EXAMPLE_CONFIG="$SCRIPT_DIR/config.yaml.example"

if [ ! -f "$EXAMPLE_CONFIG" ]; then
  warn "未找到 config.yaml.example，尝试从当前目录查找..."
  EXAMPLE_CONFIG="./config.yaml.example"
fi

if [ ! -f "$EXAMPLE_CONFIG" ]; then
  error "找不到 config.yaml.example 文件。"
  error "请确保 install.sh 和 config.yaml.example 在同一目录下。"
  exit 1
fi

if [ -f "$CONFIG_FILE" ]; then
  info "配置文件已存在: $CONFIG_FILE (跳过)"
  warn "如需重置为默认配置，请手动删除该文件后重新运行此脚本。"
else
  cp "$EXAMPLE_CONFIG" "$CONFIG_FILE"
  info "已复制示例配置文件到: $CONFIG_FILE"
fi

# =============================================================================
# Step 5: Done — prompt user to edit config
# =============================================================================
section "✅ 安装完成！"

echo
info "请在启动前配置你的 API Key："
echo
echo -e "   ${YELLOW}nano $CONFIG_FILE${NC}"
echo -e "   或"
echo -e "   ${YELLOW}vim $CONFIG_FILE${NC}"
echo
info "你需要替换以下占位符："
echo "   - providers.deepseek.api_key   → 你的 DeepSeek API Key"
echo "   - providers.openai.api_key     → 你的 OpenAI API Key"
echo
info "获取 API Key 的地址："
echo "   - DeepSeek: https://platform.deepseek.com/api_keys"
echo "   - OpenAI:   https://platform.openai.com/api-keys"
echo

# --- Ask user if they want to launch now ---
read -rp "$(echo -e "${YELLOW}是否现在编辑配置文件？(y/n) ${NC}")" EDIT_NOW
if [[ "$EDIT_NOW" =~ ^[Yy]$ ]]; then
  # Try common editors
  if command -v nano &> /dev/null; then
    nano "$CONFIG_FILE"
  elif command -v vim &> /dev/null; then
    vim "$CONFIG_FILE"
  elif command -v vi &> /dev/null; then
    vi "$CONFIG_FILE"
  else
    error "未找到 nano/vim 编辑器，请手动编辑: $CONFIG_FILE"
  fi
fi

read -rp "$(echo -e "${YELLOW}是否现在启动 TermWorkspace？(y/n) ${NC}")" START_NOW
if [[ "$START_NOW" =~ ^[Yy]$ ]]; then
  info "正在启动 TermWorkspace..."
  echo
  $PYTHON -m termworkspace
else
  echo
  info "你可以稍后通过以下命令启动："
  echo -e "   ${CYAN}cd $(dirname "$REQUIREMENTS") && $PYTHON -m termworkspace${NC}"
  echo
  info "或者直接运行："
  echo -e "   ${CYAN}$PYTHON -m termworkspace${NC}"
  echo
fi
