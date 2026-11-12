interface ProjectSetting {
  lint: {
    disableTypeCheckedFiles: string[];
    ignores:                 string[];
  };
}
export const projectSetting: ProjectSetting = {
  lint: {
    disableTypeCheckedFiles: [],
    ignores:                 [
    ".codeartsdoer/**", // 华为编辑器的内置玩意
    ".codegraph/**" // 华为编辑器的内置玩意
    ]
  }
};
