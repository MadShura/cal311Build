export interface ActionChoice {
  actionType: "无人空闲" | BuildingType;
  needtime:   number;
  wujiangArr: string[];
}
export interface BaseStat0 {
  moving:         Moving;
  thisTurnMustDo: (null | TurnAction)[];
  wujiangData:    Record<string,WujiangItem>; // 武将数据
  初始行动力:          number;
  每回合回复行动力:       number;
}
export interface BuildingBase {
  cost:        number;
  isBuilding:  number[]; // 正在建造的项目,0表示已完成,或者对象包含天数和武将
  mustBuildIn: number; // 必须建造几个
  pointCost:   number; // 行动力的消耗
  每月收入:        number;
  耐久:          number;
}
export type BuildingType = keyof Moving;
export interface EachTrunStatWithMoney {
    市场:  number[];
    治安:  number;
    造币厂: number[];
}
export interface Moving {
  人才府:  BuildingBase;
  兵舍:   BuildingBase;
  军事府:  BuildingBase;
  厩舍:   BuildingBase;
  吸收合并: BuildingBase;
  啥都不做: BuildingBase;
  大市场:  BuildingBase;
  市场:   BuildingBase;
  巡查:   BuildingBase;
  造币厂:  BuildingBase;
  锻冶场:  BuildingBase;
  鱼市:   BuildingBase;
  黑市:   BuildingBase;
}
export interface stat {
  eachTrunStatWithMoney: EachTrunStatWithMoney[]; // 每回合完成度的缓存
  flag:                  Record<string,boolean>; // 标记各个建筑是否已完成
  isDoMustDo:            number[]; // 标记那些必做操作是否已完成
  moving:                Moving;
  movingSortArr:         (keyof Moving)[]; // 可建造的建筑类型数组
  turn:                  number; // 记录回合数
  wujiangData:           Record<string,WujiangItem>;
  xunchaEd:              boolean;// 本回合执行了巡查
  实时金:                   number;
  治安:                    number;
  行动:                    string[];
  行动力:                   number;
}
export interface TurnAction {
  行动力消耗?:  null | number;
  设置武将空闲?: null | Record<string,number>; // 武将名 -> free 值
  金币消耗?:   null | number;
}

// 防止 infinity 的 JSON 错误,直接 使用比较大的数字代替 比如 100
export interface WujiangItem {
  free: number; // 0 表示空闲
  政治:   number;
  统帅:   number;
}