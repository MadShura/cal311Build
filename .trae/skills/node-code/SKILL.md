---
name: node-code
description: Node 技术栈项目规范。当编写、修改或审查 monorepo 内的纯 Node/TS 工具库、脚本、CLI（无浏览器 UI）项目的测试、README 理解、eslint.ignores 过滤时使用。
---

# Node 项目规范

> 适用：monorepo 内的纯 Node/TS 工具库、脚本、CLI（无浏览器 UI）项目。


## 1. 测试
- 单元测试用 Vitest；Node 环境用 `node` testEnvironment；涉及文件/网络用 mock 避免真实副作用。