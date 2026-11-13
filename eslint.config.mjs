/// <reference types="node" />
// 这是为了让 mjs 也有类型检验
import {createConfig} from "axl-lint";
import {projectSetting} from "./project.setting.ts";

// 因为 oxlint 只能接受一个配置对象,所以所有的 外部规则统一写入 overrides,不能展开 createConfig
// 所以 ESLint 和 oxlint 统一写法 也写入 overrides 里面
export default createConfig({
  linter:          "eslint",
  ignore:          projectSetting.lint.ignores,
  tsconfigRootDir: import.meta.dirname,
  types:           ["tsfile","jsfile"], // jsfile 可以局限 eslint.config.mjs 文件
  overrides:       [
    {
      files: ["scripts/**/*.ts"],
      rules: {"unicorn/no-process-exit": "off","max-lines": "off"}
    },{
      files: ["src/**/*.ts","src1/**/*.ts","src2/**/*.ts","src3/**/*.ts","bench.mjs"],
      rules: {"custom-rules/no-native-api": "off"}
    }
  ]
});