---
name: clean-lint-errors
description: 清理项目的 lint 错误(eslint + oxlint).当用户说"清理 lint 错误"、"修 lint"、"看看 lint-es.log / lint-ox.log"、"eslint 报错"、"oxlint 报错" 、"修复 lint 报错" 时使用.直接读取项目根目录的 lint-es.log(eslint)和 lint-ox.log(oxlint),解析后逐条修复.
---

# 清理 lint 错误

## 核心规则

- 执行 `pnpm lint` 时必须使用本地的 Node 版本,不能使用 AI 内置的低等级版本,否则启动不了.
- eslint 结果在 **`lint-es.log`**,oxlint 结果在 **`lint-ox.log`**,都在项目根目录.**直接读文件即可**.
- **不要运行 `pnpm lint` / `eslint` / `oxlint`**,不要跑任何重新生成日志的命令.用户已经跑过了.
- 两个文件**分别处理**,不要混在一起算总数.
- 运行环境是 **Windows**,命令一律用 PowerShell,不要用 grep / sed / awk.
- **绝对不要运行 `pnpm lint` / `pnpm lint:es` / `pnpm lint:ox`**.这三条都带 `--fix`,跑起来会**再次改动代码**,把你刚修好的东西覆盖掉或改坏.

## 流程

### 1 先各量一次行数

```powershell
(Get-Content lint-es.log).Count
(Get-Content lint-ox.log).Count
```

某个文件不存在就跳过它,只处理存在的那个.

行数少(参考值 ≤ 100):直接 Read 整个文件,一条条看完就修.

行数多(> 100):进入第 2 步,先统计再分批啃.

### 2 (行数多时才做)按规则名统计
两个日志分开统计,各自用各自的格式与正则.

#### 2.1 eslint
一条命令:总数 + 位置清单 + 按规则分布

```powershell
$f = ""; $rows = @()
Get-Content lint-es.log | ForEach-Object {
  if ($_ -match '^\S.*\.\w+$') { $f = $_; return }
  if ($_ -match '^\s+(\d+):(\d+)\s+(?:error|warning)\s+.+\s+([\w@/.-]+)\s*$') {
      $m = $matches
      $rows += [pscustomobject]@{ 文件 = $f; 行 = $m[1]; 列 = $m[2]; 规则 = $m[3] }
  }
}
"共 $($rows.Count) 个错误"
$rows | ForEach-Object { "$($_.文件):$($_.行):$($_.列)  $($_.规则)" }
$rows | Group-Object 规则 | Sort-Object Count -Descending | Format-Table Count,Name -AutoSize
```

#### 2.2 oxlint
一条命令:总数 + 位置清单 + 按规则分布

```powershell
$e = Select-String -Path lint-ox.log -Pattern '^\s+[x×]\s+([^\s:]+):'
$f = Select-String -Path lint-ox.log -Pattern ',\s*-[[](.+):(\d+):(\d+)[]]'
"共 $($e.Count) 个错误"
for ($i = 0; $i -lt $e.Count; $i++) {
  if ($f.Count -ne $e.Count) { Write-Warning "位置行与规则行数量不一致:$($f.Count) vs $($e.Count)" }
  "$($f[$i].Matches[0].Groups[1].Value):$($f[$i].Matches[0].Groups[2].Value):$($f[$i].Matches[0].Groups[3].Value)  $($e[$i].Matches[0].Groups[1].Value)"
}
$e | ForEach-Object { $_.Matches[0].Groups[1].Value } | Group-Object | Sort-Object Count -Descending | Format-Table Count,Name -AutoSize
```

汇总行(eslint 的 `✖ N problems`、oxlint 的 `Found N errors` / `Finished`)不会被以上正则误计.
若发现部分规则互相冲突,务必告知.

### 3 核查规则配置
当前项目执行 `pnpm lint-rules <规则名> <eslint|oxlint>` 即可查看此规则的详细配置(仅支持单个规则,规则名用双引号包裹).

### 4 修复后验证 
1. 读取 package.json 的 `lint:es` / `lint:ox`,**去掉 `--fix`**(保留其余参数).
2. **先 echo 最终命令确认不含 `--fix`**,再执行,例如:

```powershell
pnpm exec eslint . --cache   # 若原 script 是 eslint . --fix --cache
```
3. 用 $LASTEXITCODE 判断:0 通过,非 0 仍有错误,回到第 2 步继续修.

4. 最后执行 pnpm tc(typecheck),确认类型检查无错误.

5. lint 与 tc 都通过才算完成；若 tc 报错,说明修复方式与类型冲突,回退重改.
