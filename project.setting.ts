interface ProjectSetting {
  lint: {
    disableTypeCheckedFiles: string[];
    ignores:                 string[];
  };
  push: {
    exceptDir:  string[];
    exceptName: string[];
  };
}
export const projectSetting: ProjectSetting = {
  lint: {
    disableTypeCheckedFiles: [],
    ignores:                 ["**/node_modules/**","**/dist/**","**/dist-ssr/**","**/coverage/**","*.cache","**/otherProject/**",
    ".codeartsdoer/**", // 华为编辑器的内置玩意
    ".codegraph/**", // 华为编辑器的内置玩意,
    "src/tkf398/spt398server",// 别人的项目
    "src/tkf398/反编译398", // 其他语言
    "src/挂机手游模拟器/反编译",// 其他语言
    "src/tkf398/自改配置&mod/user/mods/" // 别人写的 mod
  ]
  },
  push: {
    exceptDir:  [],
    exceptName: [
    "_gen-weapon-parts.json",
    "Script.pvf"
  ]
  }
};