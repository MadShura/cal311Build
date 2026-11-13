---
name: clean-tc-errors
description: 清理项目的 TypeScript 类型检查错误。当用户说"清理 tc 错误"、"修复类型错误"、"看看 tc.log"、"typecheck 报错" 、"修复 typecheck 报错" 、"修复 tc 报错" 时使用。直接读取项目根目录的 tc.log，解析其中的 TS 报错并逐个修复。
---

# 清理 tc 错误

## 核心规则

- 类型检查结果已在项目根目录 `tc.log`，**修复阶段直接读文件，不要重跑 `pnpm tc`**。
- **仅在第 4 步「修复后验证」时**才执行 `pnpm tc`，用于确认修复效果。
- 不要自己猜错误，一切以 `tc.log` 内容为准。
- 运行环境是 **Windows**，命令一律用 PowerShell，不要用 grep / sed / awk。

## 流程

### 1 先量行数，决定策略

```powershell
(Get-Content tc.log).Count
```
注意：日志里有些错误是多行展开的（比如 TS2345、TS2769），所以行数 ≠ 错误数，只用来判断"要不要直接读"。

行数少（参考值 ≤ 100）：直接 Read 整个 tc.log，一条条看完就修。

行数多（> 100）：进入第 2 步，先统计再分批啃。

### 2（行数多时才做）只看错误码分布

```powershell
# 总错误数
(Select-String -Path tc.log -Pattern 'error TS').Count

# 按错误码分布（从多到少）
Select-String -Path tc.log -Pattern 'error TS\d+' -AllMatches |
  ForEach-Object { $_.Matches.Value } |
  Group-Object | Sort-Object Count -Descending |
  Format-Table Count, Name -AutoSize
```

### 3（行数多时才做）按错误码分批捞原文
按错误码筛出文件:行清单，然后用 Read 工具打开源文件对应行看上下文

### 4 修复方案
- 1. **禁止使用非空断言`!`**

### 5. 修复后验证
- 1. 执行 `pnpm tc`。
- 2. `$LASTEXITCODE -eq 0` 且输出无 `error TS` → 通过，结束。
- 3. 否则回到第 2/3 步继续修，**循环上限 3 轮**；超限则停止并告知用户。
- 4. tc 通过后，若项目有 lint 任务，建议再跑一次 lint 验证。