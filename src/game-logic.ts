import type {EachTrunStatWithMoney,Moving,stat} from "./types.js";
import {baseStat0,cityBaseIncome,造币厂能影响几个市场} from "./data.js";
import {getAllCombinations} from "axl-utils/js/array";

// 建筑的优化执行组合
// 假设有3武将 100 100 1 的政治 ,最后一个人无需参加到建造中.因为不影响建造的结果时间
export const buildCache: Partial<Record<string,string[]>> = {};

// 巡查的优化执行组合
// 假设有3武将 100 100 1 的统帅 ,最后一个人无需参加到建造中.因为不影响建造的结果时间
export const xunchaCache: Partial<Record<number,string[]>> = {};

// 空闲做市场缓存 - 外层键是空闲武将名,内层键是选中武将名,值是建造时间
export const freeWuJiangBuildMarketCache = new Map<string,Map<string,number>>();

// 空闲武将做造币厂缓存 - 外层键是空闲武将名,内层键是选中武将名,值是建造时间
export const freeWuJiangBuildZaoBiChangCache = new Map<string,Map<string,number>>();

// 所有武将姓名数组
export const AllWujiangNameArr = Object.keys(baseStat0.wujiangData);

// 空闲武将做巡查缓存 - 键是空闲武将名组合,值是选中的武将名组合
export const freeWuJiangXunchaCache = new Map<string,string>();

// 武将组合巡查值缓存
export const queryXunchaZhiFronWuJiangComBoCache = new Map<string,number>();
export const 最大巡查值 = getfreeWuJiangXuncha(AllWujiangNameArr)[1];

// 武将组合建造时间值缓存
export const queryBuildTimeFronWuJiangComBoCache = new Map<string,number>();
export const 造币厂最小时间 = getSortedBuildCombinations(getfreeWuJiangBuild(AllWujiangNameArr,"造币厂"),0).minBuildTime;
export const 市场最小时间 = getSortedBuildCombinations(getfreeWuJiangBuild(AllWujiangNameArr,"市场"),0).minBuildTime;

/**
 * 计算建筑总收入
 * @param stat 当前状态
 * @param trun 目标回合数,
 * @param zhian 收入提升值,默认 100
 * 当造币厂完成后,受影响的市场收入增加 50%
 * @returns 加成收入
 */
export function calMonthIncome (stat: stat,trun?: number,zhian?: number): number {
  if (trun && trun < stat.turn) {
    console.log("给的回合小于等于状态回合！");
  }
  const mintBuilding = stat.moving["造币厂"].isBuilding;
  let buildingIncome = 0;
  const marketBuilding = stat.moving["市场"];
  const moreTurn = trun ? trun - stat.turn : 0;

  // If (generateXindongCacheKey(stat) === "10 回合,治安99,行动力200 市场[2,2,0,0,0,0]造币厂[0]巡查[0]伦直2贾范2公孙恭2公孙康91公孙度91徐荣2公孙渊2杨祚0卑衍0") {
  // Console.log(stat.turn,"calMonthIncome1",trun,stat.moving["造币厂"].isBuilding,stat.moving["市场"],moreTurn);
  // }
  const completedMarkets = marketBuildEdCount(stat,"市场",moreTurn);
  const mintFirst = mintBuilding[0];
  const zaobichangAddon = mintFirst !== undefined && Math.max(0,mintFirst - moreTurn) === 0 ? 1.5 : 1;
  buildingIncome += Math.min(completedMarkets,造币厂能影响几个市场) * marketBuilding.每月收入 * zaobichangAddon +
    Math.max(completedMarkets - 造币厂能影响几个市场,0) * marketBuilding.每月收入 + cityBaseIncome;
  if (zhian) {
    return Math.floor(buildingIncome * zhian / 100);
  }
  return Math.floor(buildingIncome * stat.治安 / 100);
}

// Region 手动深拷贝 stat
export function deepCloneStat (original: stat): stat {

  // 优化:使用直接属性赋值,避免 Object.fromEntries 的开销
  const cloneWujiangData: typeof original.wujiangData = {};
  for (const key in original.wujiangData) {
    const source = original.wujiangData[key];
    if (source === undefined) {continue;}
    cloneWujiangData[key] = {...source};
  }
  const cloneMoving: Partial<Moving> = {};
  for (const key in original.moving) {
    const building = original.moving[key as keyof Moving];
    cloneMoving[key as keyof Moving] = {
      ...building,
      isBuilding: [...building.isBuilding]
    };
  }
  const clone: stat = {
    eachTrunStatWithMoney: cloneEachTrunStatWithMoney(original),
    flag:                  {...original.flag},
    isDoMustDo:            [...original.isDoMustDo],
    moving:                cloneMoving as Moving,
    movingSortArr:         [...original.movingSortArr],
    turn:                  original.turn,
    wujiangData:           cloneWujiangData,
    xunchaEd:              original.xunchaEd,
    实时金:                   original["实时金"],
    治安:                    original["治安"],
    行动:                    [...original["行动"]],
    行动力:                   original["行动力"]
  };
  return clone;
}

/**
 * 生成 全行动缓存的 key
 * @param stat 当前状态
 * @returns xindongCacheKey 字符串
 */
export function generateXindongCacheKey (stat: stat): string {
  const {moving,wujiangData} = stat;
  const parts: string[] = [`${stat.turn.toString()} 回合,治安${stat.治安.toString()} `];

  // 建筑部分
  for (const mov in moving) {
    if (mov === "啥都不做") {continue;}
    const eachIsBuilding = moving[mov as keyof Moving].isBuilding;
    parts.push(`${mov}[${eachIsBuilding.join(",")}]`);
  }

  // 武将部分
  for (const wujiangName in wujiangData) {
    const info = wujiangData[wujiangName];
    if (info === undefined) {continue;}
    parts.push(`${wujiangName}${info.free.toString()}`);
  }
  return parts.join("");
}

// #region 拿武将组合建造时间
/**
 * @description 获取武将组合的建造时间 武将组合默认政治高到低排列 无需再排列
 * @param wujiangCombo 武将组合.
 * @param buildingName 建筑名称
 * @returns 建造时间
 */
export function getBuildTimeFronWuJiangComBo (wujiangCombo: string | string[],buildingName: string): number {
  let _wujiangCombo: string;
  let len: number;
  let N1: string;
  let N2: string;
  let N3: string;
  if (typeof wujiangCombo === "string") {
    _wujiangCombo = `${wujiangCombo},${buildingName}`;
    const arr = wujiangCombo.split(",");
    len = arr.length;
    N1 = arr[0] ?? "";
    N2 = arr[1] ?? "";
    N3 = arr[2] ?? "";
  } else {
    _wujiangCombo = `${wujiangCombo.join(",")},${buildingName}`;
    len = wujiangCombo.length;
    N1 = wujiangCombo[0] ?? "";
    N2 = wujiangCombo[1] ?? "";
    N3 = wujiangCombo[2] ?? "";
  }
  const cached = queryBuildTimeFronWuJiangComBoCache.get(_wujiangCombo);
  if (cached !== undefined) {
    return cached;
  }
  let buildingAility = 0;
  if (len === 3) {
    buildingAility = Math.floor((baseStat0.wujiangData[N1]?.政治 ?? 0) * 1.5 +  // 先兜底再乘
      (baseStat0.wujiangData[N2]?.政治 ?? 0) * 0.5 +  // 先兜底再乘
      (baseStat0.wujiangData[N3]?.政治 ?? 0) * 0.5);   // 先兜底再乘
  } else if (len === 2) {
    buildingAility = Math.floor((baseStat0.wujiangData[N1]?.政治 ?? 0) * 1.5 +  // 先兜底再乘
      (baseStat0.wujiangData[N2]?.政治 ?? 0) * 0.5);   // 先兜底再乘
  } else if (len === 1) {
    buildingAility = Math.floor((baseStat0.wujiangData[N1]?.政治 ?? 0) * 1.5);   // 先兜底再乘
  }
  const result = Math.min(Math.ceil(baseStat0.moving[buildingName as keyof Moving].耐久 / buildingAility),10);
  queryBuildTimeFronWuJiangComBoCache.set(_wujiangCombo,result);
  return result;
}

// #region 获取所有空闲的武将姓名
/**
 * 获取所有免费的武将姓名
 * @param stat 状态对象
 * @returns 所有免费的武将姓名数组
 */
export function getFreeWujiang (stat: stat) {
  return AllWujiangNameArr.filter(name => stat.wujiangData[name]?.free);
}

// Region 空闲武将做建筑
export function getfreeWuJiangBuild (freeWujiangNameArr: string[],buildName: keyof Moving) {
  const key = freeWujiangNameArr.join(",");
  if (buildName === "市场" && freeWuJiangBuildMarketCache.has(key)) {
    return freeWuJiangBuildMarketCache.get(key);
  }
  if (buildName === "造币厂" && freeWuJiangBuildZaoBiChangCache.has(key)) {
    return freeWuJiangBuildZaoBiChangCache.get(key);
  }

  // 只对空闲武将按政治排序
  const sortedFreeWujiangArr = [...freeWujiangNameArr].toSorted(
    (a,b) => (baseStat0.wujiangData[b]?.政治 ?? 0) - (baseStat0.wujiangData[a]?.政治 ?? 0)
  );
  const allCombinations = getAllCombinations(sortedFreeWujiangArr,3);

  // 筛选并缓存函数
  function filterAndCache (cache: Map<string,Map<string,number>>) {
    const subCache = new Map<string,number>();
    for (const wujiangArr of allCombinations) {
      const wujiangArrStr = wujiangArr.join(",");
      const buildTime = getBuildTimeFronWuJiangComBo(wujiangArrStr,buildName);

      // 筛选掉较差的组合
      let shouldKeep = true;
      if (wujiangArr.length === 3) {
        const buildTime2 = getBuildTimeFronWuJiangComBo([wujiangArr[0],wujiangArr[2]].join(","),buildName);
        if (buildTime2 === buildTime) {shouldKeep = false;}
        if (shouldKeep) {
          const buildTime3 = getBuildTimeFronWuJiangComBo([wujiangArr[0],wujiangArr[1]].join(","),buildName);
          if (buildTime3 === buildTime) {shouldKeep = false;}
        }
        if (shouldKeep) {
          const buildTime4 = getBuildTimeFronWuJiangComBo([wujiangArr[0] ?? ""],buildName);
          if (buildTime4 === buildTime) {shouldKeep = false;}
        }
        if (shouldKeep) {
          const buildTime5 = getBuildTimeFronWuJiangComBo([wujiangArr[1] ?? ""],buildName);
          if (buildTime5 === buildTime) {shouldKeep = false;}
        }
        if (shouldKeep) {
          const buildTime6 = getBuildTimeFronWuJiangComBo([wujiangArr[2] ?? ""],buildName);
          if (buildTime6 === buildTime) {shouldKeep = false;}
        }
      } else if (wujiangArr.length === 2) {
        const buildTime4 = getBuildTimeFronWuJiangComBo([wujiangArr[0] ?? ""],buildName);
        if (buildTime4 === buildTime) {shouldKeep = false;}
        if (shouldKeep) {
          const buildTime5 = getBuildTimeFronWuJiangComBo([wujiangArr[1] ?? ""],buildName);
          if (buildTime5 === buildTime) {shouldKeep = false;}
        }
      }
      if (shouldKeep) {
        subCache.set(wujiangArrStr,buildTime);
      }
    }
    cache.set(key,subCache);
    return subCache;
  }
  if (buildName === "市场") {
    return filterAndCache(freeWuJiangBuildMarketCache);
  }
  if (buildName === "造币厂") {
    return filterAndCache(freeWuJiangBuildZaoBiChangCache);
  }
  return {};
}

// Region 空闲武将数组名
// 获取空闲武将名数组
// @param stat 当前状态
// @returns 空闲武将名数组
export function getFreeWujiangNameIsArr (stat: stat): string[] {
  const result: string[] = [];
  for (const wujiangName in stat.wujiangData) {
    const element = stat.wujiangData[wujiangName];
    if (element === undefined) {continue;}
    if (element.free === 0) {
      result.push(wujiangName);
    }
  }
  return result;
}

// Region 空闲武将做巡查
export function getfreeWuJiangXuncha (freeWujiangNameArr: string[]): [string[],number] {
  const key = freeWujiangNameArr.join(",");

  // 检查缓存
  const cachedSelected = freeWuJiangXunchaCache.get(key);
  if (cachedSelected) {
    const wujiangArr = cachedSelected.split(",");

    // 从 queryXunchaZhiFronWuJiangComBoCache 获取巡查值
    const xunchaZhi = getXunchaZhiFronWuJiangComBo(wujiangArr);
    return [wujiangArr,xunchaZhi];
  }

  // 只对空闲武将按统帅排序
  const sortedFreeWujiangArr = [...freeWujiangNameArr].toSorted((a,b) => (baseStat0.wujiangData[b]?.统帅 ?? 0) - (baseStat0.wujiangData[a]?.统帅 ?? 0));

  // 取统帅最高的前3个(不够3个就取所有)
  const selectedWujiangArr = sortedFreeWujiangArr.slice(0,3);

  // 使用 getXunchaZhiFronWuJiangComBo 计算巡查值(内部有缓存)
  const xunchaZhi = getXunchaZhiFronWuJiangComBo(selectedWujiangArr);

  // 存入缓存 - 只存选中的武将组合,巡查值从 queryXunchaZhiFronWuJiangComBoCache 获取
  freeWuJiangXunchaCache.set(key,selectedWujiangArr.join(","));
  return [selectedWujiangArr,xunchaZhi];
}

// #region 武将组合巡查缓存
/**
 * @description 获取武将组合的巡查值
 * @param wujiangCombo 武将组合
 * @returns 巡查值
 */
export function getXunchaZhiFronWuJiangComBo (wujiangCombo: string | string[]): number {
  let _wujiangCombo: string[];
  let key: string;
  if (typeof wujiangCombo === "string") {
    _wujiangCombo = wujiangCombo.split(",");
    key = wujiangCombo;
    const cache = queryXunchaZhiFronWuJiangComBoCache.get(key);
    if (cache !== undefined) {
      return cache;
    }
  } else {
    _wujiangCombo = wujiangCombo;
    key = wujiangCombo.join(",");
  }
  let sum = 0;
  for (const wujaingName of _wujiangCombo) {
    sum += baseStat0.wujiangData[wujaingName]?.统帅 ?? 0;
  }
  const result = Math.floor(sum / 28) + 2;
  queryXunchaZhiFronWuJiangComBoCache.set(key,result);
  return result;
}

// 计算市场已完成建筑数量
// @param stat 当前状态
// @param buildName 建筑名称
// @param moreTurn 额外回合数
// @returns 已完成建筑数量
export function marketBuildEdCount (stat: stat,buildName: keyof Moving,moreTurn: number): number {
  return stat.moving[buildName].isBuilding.filter(t => Math.max(0,t - moreTurn) === 0).length;
}
function cloneEachTrunStatWithMoney (original: stat): EachTrunStatWithMoney[] {
  const result = [];
  for (let i = 0,len = original.eachTrunStatWithMoney.length; i < len; i++) {
    const item = original.eachTrunStatWithMoney[i];
    if (item === undefined) {continue;}
    result.push({// 每回合完成度的缓存
      市场:  [...item.市场],
      治安:  item.治安,
      造币厂: [...item.造币厂]
    });
  }
  return result;
}
export const isCheckFlag = (stat: stat): boolean => Object.values(stat.flag).every(Boolean);

/**
 * 将 getfreeWuJiangBuild 返回的 Map 按优先度排序
 * 优先度: 建造时间短 > 建造时间长, 同时考虑发钱回合优先级
 * @param buildMap getfreeWuJiangBuild 返回的 Map
 * @param currentTurn 当前回合数
 * @returns 包含排序后的数组和最小建造时间的对象
 */
export function getSortedBuildCombinations (
  buildMap: Map<string,number> | Record<string,never> | undefined,
  currentTurn: number
): {combinations: {buildTime: number; wujiangArr: string[]}[]; minBuildTime: number} {
  if (!buildMap || !(buildMap instanceof Map) || buildMap.size === 0) {
    return {combinations: [],minBuildTime: 11};
  }

  // 计算建造天数的优先级分数 (越小越优先)
  // (currentTurn + days) % 3 === 0 → 建完恰好在发钱回合,最优,分数 0
  // (currentTurn + days) % 3 === 2 → 建完差1回合到发钱,次优,分数 1
  // (currentTurn + days) % 3 === 1 → 建完差2回合到发钱,最差,分数 2
  const getPriorityScore = (buildTime: number): number => {
    const remainder = (currentTurn + buildTime) % 3;
    if (remainder === 0) {return 0;}
    if (remainder === 2) {return 1;}
    return 2;
  };
  const result: {buildTime: number; score: number; wujiangArr: string[]}[] = [];
  let minBuildTime = 11;
  for (const [wujiangArrStr,buildTime] of buildMap) {
    const wujiangArr = wujiangArrStr.split(",");
    const score = getPriorityScore(buildTime);
    result.push({buildTime,score,wujiangArr});
    if (buildTime < minBuildTime) {
      minBuildTime = buildTime;
    }
  }

  // 按优先级排序: 先按 score 排序,再按 buildTime 排序
  result.sort((a,b) => {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    return a.buildTime - b.buildTime;
  });

  // 移除 score 字段
  const combinations = result.map(({buildTime,wujiangArr}) => ({buildTime,wujiangArr}));
  return {combinations,minBuildTime};
}

// 传入结果的市场 或造币厂建造数组 用当前状态的建筑状态和最佳结果的同回合做对比
// 假如最好 [1,3,4] 5 回合 0 2 3
// 来的是 [5,6,6,6,5] 不行
// 来的是 [0,3,3,3] 行
// 来的是 [0,2,3,3] 行
// 来的是 [0,2] 不行
// 市场[1,4,4] 0 3 3
// 市场[1,4,5] 0 3 4
export function isCalBestBuildingEd (bestB: number[],nowB: number[],turn: number): boolean {
  if (bestB.length > 0) {
    const needTrun = turn % 3;

    // Console.log(bestB,nowB,needTrun);
    // If (bestB.length > nowB.length) {
    // Return false;
    // }
    // 同长度情况下 最好的比新的要小
    let q = 0;
    let w = 0;
    for (const val of bestB) {

      // Const _ = bestB[i];
      if (val - needTrun <= 3) {
        q++;
      }
    }
    for (const val of nowB) {

      // Const _ = nowB[i];
      if (val - needTrun <= 3) {
        w++;
      }
    }
    if (q > w) {
      return false;
    }

    // For (let i = 0; i < nowB.length; i++) {
    // Const _ = bestB[i] ?? -99;
    // If (nowB[i] + needTrun === _) {
    // Return false;
    // }
    // }
  }
  return true;
}