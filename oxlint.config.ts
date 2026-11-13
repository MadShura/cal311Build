import {createConfig} from "axl-lint";
import {projectSetting} from "./project.setting.ts";

// oxlint 只能接受一个配置对象,所以所有的 外部规则统一写入 overrides,不能展开 createConfig
export default createConfig({
  ignore:    projectSetting.lint.ignores,
  linter:    "oxlint",
  overrides: [
    {
      files: ["scripts/**/*.ts"],
      rules: {"max-lines": "off","no-magic-numbers": "off","unicorn/no-process-exit": "off"}
    },{
      files: ["src/tkf398/config.ts"],
      rules: {"max-lines": "off"}
    },{
      files: ["src/**/*.ts","src1/**/*.ts","src2/**/*.ts","src3/**/*.ts"],
      rules: {"axl-custom-rules/no-native-api": "off"}
    },{
      files: ["src/**/*.ts","src1/**/*.ts","src2/**/*.ts","src3/**/*.ts"],
      rules: {"no-magic-numbers": "off"}
    }
  ],
  types: ["tsfile","jsfile"]
});