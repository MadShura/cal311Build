# 项目文件生成规范

本项目指 packages/projects/forPlayGameWeb。在此项目生成文件时需要遵循本文件

## 〇、项目地图

- `src`：项目源码根目录
- `src`：311 构建结果
- `src/dnf模拟端`：DNF 模拟端
- `src/dnf清风1031`：DNF 清风 1031
- `src/tkf398`：tkf398 子项目
- `src/挂机手游模拟器`：挂机手游模拟器分析






## 一、本项目脚本生成文件

- `src/result.json`（`pnpm 311b`）
- `src/tkf398/lab.json`、`bosstemplate.json` 等（`tkf398:gen:*`、`tkf398:translate`）
- `src/tkf398/tkfCheck/output/*.txt`（`tkfcheck`）

<!-- syncskill:standards:start 由 scripts/skill-manager.ts 生成, 勿手改 -->
# 0 文档先行
- 项目根目录必须有 `DESIGN.md`,无则新增空文件.
- `DESIGN.md` 为项目设计契约文档,仅用户可编辑。每次回复务必阅读一次了解修改了什么，按照修改进行操作

# 1 环境与命令
- 本地系统为 Windows 11,包管理器必须用 `pnpm`,`npx` 改为 `pnpm exec`,删除文件用 `rimraf`.
- PowerShell 不支持 `&&`,请用 `;` 分隔多个命令.

# 2 需求确认流程
- 每次修改代码或新建文件**务必提问**，用户确认后方可落位。除非用户提出**写 补充** 等描述
- 修改代码**必须**遵守文件头部相关注释(如果有)
- 严禁修改 Lint 规则,严禁在代码中通过注释禁用 Lint 规则,严禁修改 `project.setting.ts`,`oxlint.config.ts`,`eslint.config.mjs` 等 `ignore` 字段屏蔽规则

# 3. 需要要求的是核查类型的
- 禁止猜测，能够用脚本准确算出的必须使用脚本，能够实际测试的必须实际测试.测试用的脚本测试完毕**必须删除** 。测试用脚本**无需经过 2 向用户提问**。调用  `script-code` skill

# 4. 代码生成前
- 先执行 `git commit` 保存当前进度(不顾忌之前的修改内容,直接 commit), commit 内容写 `准备...`
- **先判断要生成/修改的代码类型,必须执行对应 code skill 后按其规范编写**:

`.ts` / `.mts` 等 TS 代码执行 `typescript-code` skill
`.vue` 组件 / Composable执行 `vue-code`  skill
原子类 / `uno.config.ts` / 图标类执行  `unocss-code` skill
`vite.config.ts` / `vite.lib.config.ts` `vite-code` skill
React 组件 / Hooks / 状态执行  `react-code` skill
Nuxt 项目(app/server/pages 等)执行  `nuxt-code` skill
NestJS 后端(module/service/测试) 执行 `nestjs-code` skill
Electron 主进程 / preload / 渲染层执行  `electron-code` skill
纯 Node/TS 工具库 / CLI 脚本执行  `node-code` skill
Lint 配置 / lint 日志分析执行  `lint-code` skill
vitest 编写测试文件或者修改 `vitest` 配置执行  `vitest-code` skill
Playwright e2e 测试执行  `playwright-code` skill
pnpm-workspace / monorepo 结构执行  `monorepo-code` skill
清理 lint / 修改lint 规则执行 `clean-lint-errors` skill
tc 错误执行  / `clean-tc-errors` skill
axios 请求 / axios 封装执行  `axios-code` skill
硬编码 / 常量 / 界面文案执行  `constants-code` skill
函数执行  `shared-utils-code` skill
Vue 组件执行  `shared-vue-code` skill
代码注释写作 / #region 分区执行  `comment-code` skill

# 5. 代码生成后
- 执行 `pnpm tc` 检查类型错误.不允许执行其他校验和测试,除非用户明确指示使用.

# 6 执行 pnpm 命令
- pnpm 命令必须改成一条一条执行不可并行,**必须**加`--config.verify-deps-before-run=false` 跳过前置 install
<!-- syncskill:standards:end -->
