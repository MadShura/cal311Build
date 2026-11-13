---
name: lint-code
description: Lint（ESLint / oxlint）配置文件规范。当需要修改 eslint.config.mjs / oxlint.config.ts、处理 lint 规则冲突、分析 lint-es.log / lint-ox.log 报告时使用。
---

# Lint（ESLint / oxlint）规范

`eslint.config.mjs` 是本项目给 eslint 使用的规则集
`oxlint.config.ts` 是本项目给 oxlint 使用的规则集
两个规则集都来自 `axl-lint` 项目。因此不允许修改配置文件，遇到以下状况时，必须告知用户方案，让用户去修改 `axl-lint` 项目代码：
- 若是某些规则互相冲突。导致 lint 错误一直存在
- 若是某些文件不需要某些规则。

项目根目录的 `lint-es.log` `lint-ox.log` 是用户执行 `pnpm lint` 产生的 lint 报告，因此只需要阅读这两个文件即可分析 lint 错误。

## 配置文件修改（eslint/oxlint）

- **禁止修改** `eslint.config.mjs` / `oxlint.config.ts`（来自 `axl-lint` 项目）。
- 禁止通过注释禁用 Lint 规则，禁止修改 `project.setting.ts` / `oxlint.config.ts` / `eslint.config.mjs` 等 `ignore` 字段屏蔽规则。
- 规则冲突 / 某文件不需要某规则时，**必须告知用户方案**，由用户去 `axl-lint` 项目修改。