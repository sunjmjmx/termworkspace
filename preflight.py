#!/usr/bin/env python3
"""
preflight.py — Kanban Worker Pre-Handoff Validation

Worker 在调用 kanban_block(reason="review-required: ...") 之前必须运行此脚本。
自动检测 6 类问题：基线过期、范围越界、函数不存在、缺少测试、代码风格、安全漏洞。

Usage:
    python3 preflight.py --task-id t_xxx [--branch feat/xxx] [--target main]

Exit codes:
    0 → 全部通过（可安全 block）
    1 → 有失败项（必须修复后才能 block）
    2 → 警告项（建议修复，不强制）
"""

import argparse
import os
import re
import subprocess
import sys
import json
from pathlib import Path
from datetime import datetime


def log(msg: str, level: str = "INFO") -> None:
    timestamp = datetime.now().strftime("%H:%M:%S")
    print(f"[{timestamp}] [{level}] {msg}")


def run(cmd: str, cwd: str | None = None) -> tuple[str, int]:
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, cwd=cwd)
    return result.stdout.strip(), result.returncode


def get_task_info(task_id: str) -> str:
    """Get full task info from Hermes kanban."""
    out, rc = run(f"hermes kanban show {task_id}")
    if rc != 0:
        log(f"无法读取任务 {task_id}: {out}", "ERROR")
        sys.exit(1)
    return out


def extract_task_body(task_info: str) -> str:
    """提取任务 body 部分。"""
    # Body: 之后到下一个顶格关键词之前
    body_match = re.search(
        r'Body:\n(.*?)(?=\n\S+\s*\(|\nLatest|\nComments|\nEvents|\nRuns)',
        task_info, re.DOTALL
    )
    return body_match.group(1).strip() if body_match else ""


def extract_comments(task_info: str) -> list[str]:
    """提取所有 comment 正文。"""
    comments = []
    in_comments = False
    for line in task_info.split('\n'):
        stripped = line.strip()
        if stripped.startswith('Comments'):
            in_comments = True
            continue
        if stripped.startswith('Events'):
            in_comments = False
            continue
        if in_comments and stripped.startswith('[') and '] ' in stripped:
            # [2026-07-01 08:40] default: body
            body = stripped.split('] ', 1)[1] if '] ' in stripped else ''
            # Remove profile prefix: "default: body" → "body"
            if ': ' in body:
                body = body.split(': ', 1)[1]
            comments.append(body)
    return comments


def extract_allowed_files(task_body: str) -> set[str]:
    """从 task body 中提取允许修改的文件模式。

    识别规则（按优先级）：
    1. 代码块中写 ``window.py`` 或 src/termworkspace/window.py
    2. 「需要做」列表中的文件名引用
    3. 「需要做」列表中提取的模块名
    """
    allowed = set()

    # 1. 代码块中的文件引用 ``file.py``
    for m in re.finditer(r'`([^`]+\.\w+)`', task_body):
        allowed.add(m.group(1))

    # 2. 冒号前的文件描述（含 .py / .yaml / .toml / .rb / .sh）
    for m in re.finditer(r'(\S+\.(?:py|yaml|toml|rb|sh|md))', task_body):
        allowed.add(m.group(1))

    # 3. 「需要做」列表中每一行末尾描述的模块
    in_todo = False
    for line in task_body.split('\n'):
        if '需要做' in line or '需要做：' in line:
            in_todo = True
            continue
        if in_todo:
            if line.startswith(' ') or line.startswith('-'):
                # 提取文件名引用
                for m in re.finditer(r'(\w+\.\w+)', line):
                    allowed.add(m.group(1))
            else:
                in_todo = False

    # 4. 如果都没提取到，放宽到任何 .py 文件（只做增加检查）
    return allowed


def extract_claimed_functions(comments: list[str]) -> list[str]:
    """从 comment 中提取 Worker 声称的函数/方法名。"""
    functions = set()

    for comment in comments:
        # def function_name() 模式
        for m in re.finditer(r'def\s+(\w+)\s*\(', comment):
            functions.add(m.group(1))
        # function_name() 调用模式（在代码示例中）
        for m in re.finditer(r'(?<!def )(\w+)\([^)]*\)', comment):
            # 排除关键词
            if m.group(1) not in ('self', 'print', 'len', 'type', 'list', 'dict',
                                  'str', 'int', 'range', 'open', 'import', 'get',
                                  'set', 'super', 'isinstance', 'hasattr', 'getattr'):
                functions.add(m.group(1))

    return list(functions)


# ── Checks ──────────────────────────────────────────────────


def check_baseline(branch: str, target: str = "main", repo: str | None = None) -> dict:
    """Check 1: 基线检查 — branch 是否基于 target 的最新 HEAD。"""
    log(f"检查基线: {branch} → {target}")

    baseline, rc1 = run(f"git merge-base {branch} {target}", cwd=repo)
    if rc1 != 0 or not baseline:
        return {"check": "baseline", "status": "ERROR", "detail": f"无法获取 merge base: {baseline}"}

    target_head, _ = run(f"git rev-parse {target}", cwd=repo)

    if baseline.strip() == target_head.strip():
        return {"check": "baseline", "status": "PASS",
                "detail": f"✅ 分支基于 {target} 最新 commit ({target_head[:12]})"}
    else:
        behind, _ = run(f"git rev-list --count {branch}..{target}", cwd=repo)
        return {"check": "baseline", "status": "FAIL",
                "detail": f"❌ 分支落后 {target} {behind} 个 commit。merge base: {baseline[:12]}, {target} HEAD: {target_head[:12]}。需要 rebase。",
                "commits_behind": int(behind)}


def check_scope(branch: str, target: str, allowed_files: set[str], repo: str | None = None) -> dict:
    """Check 2: 范围门禁 — 只改了该改的文件。"""
    log(f"检查范围: 允许 {len(allowed_files)} 个文件模式")

    changed, rc = run(f"git diff {target} {branch} --name-only --diff-filter=AM", cwd=repo)
    if rc != 0:
        return {"check": "scope", "status": "ERROR", "detail": f"diff 失败: {changed}"}

    changed_files = [f.strip() for f in changed.split('\n') if f.strip()]

    if not allowed_files:
        return {"check": "scope", "status": "WARN",
                "detail": "⚠️ 任务 body 中未定义允许文件模式，无法检查范围。建议在 body 中注明。",
                "changed": changed_files}

    # 排除公共文件
    always_allowed = {'.gitignore', '.gitkeep', 'README.md', 'pyproject.toml'}
    violations = []
    for f in changed_files:
        if f in always_allowed:
            continue
        allowed = False
        for pattern in allowed_files:
            if pattern in f or Path(f).match(pattern):
                allowed = True
                break
        if not allowed:
            violations.append(f)

    if violations:
        return {"check": "scope", "status": "FAIL",
                "detail": f"❌ {len(violations)} 个文件不在允许范围内: {violations}",
                "violations": violations,
                "allowed": list(allowed_files),
                "changed": changed_files}

    return {"check": "scope", "status": "PASS",
            "detail": f"✅ 全部 {len(changed_files)} 个改动文件在允许范围内",
            "changed": changed_files}


def check_functions(branch: str, claimed_functions: list[str], repo: str | None = None) -> dict:
    """Check 3: 函数验证 — handoff 声称的函数真实存在。"""
    if not claimed_functions:
        return {"check": "functions", "status": "SKIP", "detail": "未发现 handoff 声明的函数"}

    log(f"检查函数: {len(claimed_functions)} 个声称函数")

    # 获取分支上改动的 .py 文件
    py_files_str, _ = run(f"git diff --name-only --diff-filter=AM {branch}~1 {branch} -- '*.py' 2>/dev/null", cwd=repo)
    py_files = [f.strip() for f in py_files_str.split('\n') if f.strip()]

    if not py_files:
        py_files_str, _ = run(f"git diff main {branch} --name-only -- '*.py' 2>/dev/null", cwd=repo)
        py_files = [f.strip() for f in py_files_str.split('\n') if f.strip()]

    found = []
    missing = []
    for func in claimed_functions:
        func_found = False
        for py_file in py_files:
            count_str, _ = run(f"git show {branch}:{py_file} 2>/dev/null | grep -c 'def {func}\\|async def {func}'", cwd=repo)
            if count_str.strip().isdigit() and int(count_str.strip()) > 0:
                found.append(f"{func} ({py_file})")
                func_found = True
                break
        if not func_found:
            missing.append(func)

    if missing:
        return {"check": "functions", "status": "FAIL",
                "detail": f"❌ {len(missing)} 个声称的函数/方法在代码中不存在: {missing}. 在文件中搜索过: {py_files}",
                "missing": missing, "found": found}

    return {"check": "functions", "status": "PASS",
            "detail": f"✅ {len(found)} 个声称函数全部在代码中找到",
            "found": found}


def check_tests(branch: str, target: str = "main", repo: str | None = None) -> dict:
    """Check 4: 测试覆盖 — 新增/改动的 .py 文件有对应测试。"""
    log("检查测试覆盖")

    src_files_str, _ = run(f"git diff {target} {branch} --name-only --diff-filter=AM -- '*.py'", cwd=repo)
    src_files = [f.strip() for f in src_files_str.split('\n') if f.strip()]
    # 排除测试文件本身
    src_files = [f for f in src_files if not f.startswith('tests/') and f != 'preflight.py']

    if not src_files:
        return {"check": "tests", "status": "SKIP", "detail": "无新增/改动的 .py 文件"}

    missing_tests = []
    for src_file in src_files:
        basename = Path(src_file).stem
        test_file = f"tests/test_{basename}.py"
        exists_str, _ = run(f"git show {branch}:{test_file} 2>/dev/null | head -1", cwd=repo)
        if not exists_str.strip():
            missing_tests.append(f"{src_file} → 缺少 {test_file}")

    if missing_tests:
        return {"check": "tests", "status": "WARN",
                "detail": f"⚠️ {len(missing_tests)} 个文件无测试: {missing_tests}",
                "missing": missing_tests}

    return {"check": "tests", "status": "PASS",
            "detail": "✅ 全部改动文件有对应测试"}


def check_style(branch: str, target: str = "main", repo: str | None = None) -> dict:
    """Check 5a: 代码风格审查 — 调用 code-reviewer 进行静态分析。"""
    log("检查代码风格（code-reviewer）")

    reviewer_script = os.path.expanduser(
        "~/.hermes/skills/software-development/code-reviewer/scripts/code_reviewer.py"
    )
    if not os.path.exists(reviewer_script):
        return {"check": "style", "status": "SKIP",
                "detail": "⚠️ code-reviewer 未安装，跳过风格检查"}

    output_path = os.path.join(repo or os.getcwd(), "review_results.json")

    try:
        r = subprocess.run(
            ["python3", reviewer_script, "--input-dir", repo or os.getcwd(),
             "--output", output_path],
            capture_output=True, text=True, timeout=60,
        )
    except subprocess.TimeoutExpired:
        return {"check": "style", "status": "WARN",
                "detail": "⚠️ code-reviewer 超时（60s），跳过风格检查"}

    if r.returncode != 0:
        return {"check": "style", "status": "WARN",
                "detail": f"⚠️ code-reviewer 异常退出: {r.stderr[:200]}"}

    try:
        with open(output_path) as f:
            data = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return {"check": "style", "status": "WARN",
                "detail": "⚠️ code-reviewer 输出解析失败"}

    critical = len(data["issues"]["critical"])
    normal = len(data["issues"]["normal"])
    optimize = len(data["issues"]["optimize"])
    total = critical + normal + optimize

    if total == 0:
        return {"check": "style", "status": "PASS",
                "detail": "✅ 代码风格审查通过（0 问题）"}

    detail_parts = [f"共 {total} 个问题: 严重 {critical}, 一般 {normal}, 优化 {optimize}"]
    for sev in ["critical", "normal"]:
        for issue in data["issues"][sev][:3]:
            detail_parts.append(f"  [{sev}] {issue['file']}:{issue['line']} — {issue['description']}")
    detail = "\n".join(detail_parts)

    return {"check": "style", "status": "PASS" if total < 3 else ("WARN" if critical == 0 else "FAIL"),
            "detail": detail,
            "issues": {"critical": critical, "normal": normal, "optimize": optimize}}


def check_security(branch: str, target: str = "main", repo: str | None = None) -> dict:
    """Check 5b: 国标安全审计 — 调用 zzcp-gbt-code-audit 扫描安全漏洞。"""
    log("检查安全漏洞（zzcp-gbt-code-audit）")

    zzcp_script = os.path.expanduser(
        "~/.hermes/skills/software-development/zzcp-gbt-code-audit/scripts/skill.py"
    )
    if not os.path.exists(zzcp_script):
        return {"check": "security", "status": "SKIP",
                "detail": "⚠️ zzcp-gbt-code-audit 未安装，跳过安全审计"}

    scan_dir = repo or os.getcwd()
    try:
        r = subprocess.run(
            ["python3", zzcp_script, "quick_scan", "--target", scan_dir],
            capture_output=True, text=True, timeout=120,
            cwd=os.path.dirname(zzcp_script),
        )
    except subprocess.TimeoutExpired:
        return {"check": "security", "status": "WARN",
                "detail": "⚠️ zzcp 安全审计超时（120s），跳过"}

    if r.returncode != 0:
        return {"check": "security", "status": "WARN",
                "detail": f"⚠️ zzcp 异常退出: {r.stderr[:200]}"}

    # 解析 stdout——zzcp 输出 JSON summary 行
    summary = {}
    for line in r.stdout.split("\n"):
        line = line.strip()
        if line.startswith("{"):
            try:
                summary = json.loads(line)
            except json.JSONDecodeError:
                continue

    if not summary or not summary.get("success"):
        return {"check": "security", "status": "SKIP",
                "detail": "⚠️ zzcp 扫描未产生有效结果"}

    total = summary.get("total_findings", 0)
    severity_stats = summary.get("severity_stats", {})
    baseline_dir = summary.get("baseline_dir", "")

    if total == 0:
        return {"check": "security", "status": "PASS",
                "detail": "✅ 国标安全审计通过（0 个安全漏洞）"}

    # 按严重级别统计
    crit = severity_stats.get("严重", 0)
    high = severity_stats.get("高危", 0)
    mid = severity_stats.get("中危", 0)
    low = severity_stats.get("低危", 0)

    detail_parts = [f"共 {total} 个安全发现: 严重 {crit}, 高危 {high}, 中危 {mid}, 低危 {low}"]
    if baseline_dir:
        detail_parts.append(f"  baseline 已保存: {baseline_dir}")
    detail = "\n".join(detail_parts)

    has_critical_or_high = crit > 0 or high > 0
    return {"check": "security", "status": "FAIL" if has_critical_or_high else "WARN",
            "detail": detail,
            "issues": {"total": total, "严重": crit, "高危": high, "中危": mid, "低危": low}}


# ── Main ────────────────────────────────────────────────────


def main():
    parser = argparse.ArgumentParser(
        description="Kanban Worker Pre-Handoff Validation",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Exit codes:
  0  All checks passed
  1  At least one FAIL (must fix)
  2  WARN only (recommended fix, not blocking)
        """,
    )
    parser.add_argument("--task-id", required=True, help="Kanban task ID (t_xxx)")
    parser.add_argument("--branch", default=None, help="Git branch (default: auto-detect)")
    parser.add_argument("--target", default="main", help="Target branch (default: main)")
    parser.add_argument("--repo", default=None, help="Repository path (default: CWD)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()

    repo = args.repo or os.getcwd()
    branch = args.branch
    if not branch:
        branch, _ = run("git branch --show-current", cwd=repo)

    log(f"=== preflight.py ===")
    log(f"Task: {args.task_id}")
    log(f"Branch: {branch} → {args.target}")
    log(f"Repo: {repo}")
    print()

    # ── 获取任务信息 ──
    task_info = get_task_info(args.task_id)
    task_body = extract_task_body(task_info)
    comments = extract_comments(task_info)
    allowed_files = extract_allowed_files(task_body)
    claimed_functions = extract_claimed_functions(comments)

    log(f"任务 body 长度: {len(task_body)} chars")
    log(f"提取到 {len(allowed_files)} 个允许文件模式, {len(claimed_functions)} 个声称函数")
    print()

    # ── 执行 6 项检查 ──
    results = [
        check_baseline(branch, args.target, repo),
        check_scope(branch, args.target, allowed_files, repo),
        check_functions(branch, claimed_functions, repo),
        check_tests(branch, args.target, repo),
        check_style(branch, args.target, repo),
        check_security(branch, args.target, repo),
    ]

    # ── 输出 ──
    print()
    print("=" * 60)
    print("  PREFLIGHT 结果")
    print("=" * 60)

    has_fail = False
    has_warn = False
    for r in results:
        icon = {"PASS": "✅", "FAIL": "❌", "WARN": "⚠️", "SKIP": "⏭️", "ERROR": "💥"}
        status = r.get("status", "ERROR")
        print(f"\n  {icon.get(status, '❓')} [{r['check']}] {status}")
        print(f"    {r['detail']}")
        if status == "FAIL":
            has_fail = True
        elif status == "WARN":
            has_warn = True

    print()
    print("=" * 60)

    if args.json:
        print()
        print(json.dumps({
            "task_id": args.task_id,
            "branch": branch,
            "target": args.target,
            "timestamp": datetime.now().isoformat(),
            "results": results,
            "exit_code": 1 if has_fail else (2 if has_warn else 0),
        }, indent=2, ensure_ascii=False))
    else:
        if has_fail:
            print("  ❌ 有失败项。修复后才能 block。")
        elif has_warn:
            print("  ⚠️ 全部通过但含警告。建议修复后 block。")
        else:
            print("  ✅ 全部通过。可以安全 kanban_block。")
        print("=" * 60)

    sys.exit(1 if has_fail else (2 if has_warn else 0))


if __name__ == "__main__":
    main()
