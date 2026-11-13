---
name: typescript-code
description: TypeScript 编写代码规范。当编写、修改或审查 `.ts` / `.mts` 文件时使用。
---

# TypeScript 行为规范

> 适用对象：所有 `.ts` / `.mts` / `.mjs` / `.cjs` 文件。


根目录的 `tc.log` 是执行 `pnpm tc` 后进行校验后的结果文件，核查该文件即可查看有什么类型错误。



## 3. 配置文件修改（tsconfig）

- 修改任何 `tsconfig*.json` 前**必须先完整读取当前内容**，严格遵守注释中的禁令（"严禁""禁止""不允许""勿""不要""不可"等字样为硬性约束，不得违反或删除）。
- 若禁令与任务冲突，必须经用户同意后方可修改。
- 修改后执行 `pnpm tc`（`tsc --noEmit`）校验类型；检查根目录 `tc.log` 确认无类型错误。