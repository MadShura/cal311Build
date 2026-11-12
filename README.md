# forPlayGameWeb

本项目包含多个游戏相关的计算与配置修改工具。子项目均为命令行脚本工具，不是 Web 前端应用。也不能转化为 pwa 使用

## 子项目

| 子项目 | 用途 | 技术栈 | 详见 |
|---|---|---|---|
| `src/311build` | 三国志11 建设方案最优计算器 | TypeScript | [readme](src/311build/readme.md) |
| `src/tkf398` | 逃离塔科夫(SPT 3.9.8) 配置修改工具 | TypeScript | [readme](src/tkf398/readme.md) |
| `src/dnf清风1031` | DNF 清风1031 活动时间与燃烧疲劳修改 | TypeScript | [readme](src/dnf清风1031/readme.md) |
| `src/dnf模拟端` | DNF 夜空魅影服务端修改工具 | C# + PowerShell | [readme](src/dnf模拟端/readme.md) |

## 为什么是脚本工具而不是 PWA

- **311build** — 纯计算工具，输入参数 → 输出最优方案，无本地文件依赖，**不适合未来改造为 PWA** 计算容易爆栈
- **tkf398** — 修改 `d:/game/tkf` 下的游戏 JSON 配置文件 + 拷贝 mod 文件，依赖本地文件系统读写，**不适合 PWA**（浏览器沙箱无法访问任意本地路径）
- **dnf清风1031** — 解析/修改 PVF 二进制文件，依赖本地文件读写，**不适合 PWA**
- **dnf模拟端** — C# 服务端代码修改 + PVF 重打包，非 Web 技术，**不适合 PWA**