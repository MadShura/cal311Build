import type {BaseStat0,BuildingBase,Moving,stat,WujiangItem} from "./types.js";

export const 能接受的最大治安 = 98;
export const maxturn = 12; // 要计算的最大回合数
export const 造币厂能影响几个市场 = 6;
export const cityBaseIncome = 225;

// 多少次打印一次 剪枝统计
export const PRUNE_REPORT_INTERVAL = 100_0000;

// 只放固定值,每次使用都要改 在代码中这些值都不需要改
export const baseStat0: BaseStat0 = {
  moving: {
    人才府: {
      cost:        200,
      isBuilding:  [],
      mustBuildIn: 0,
      pointCost:   20,
      每月收入:        0,
      耐久:          338
    },
    兵舍: {
      cost:        300,
      isBuilding:  [],
      mustBuildIn: 0,
      pointCost:   20,
      每月收入:        0,
      耐久:          600
    },
    军事府: {
      cost:        200,
      isBuilding:  [],
      mustBuildIn: 0,
      pointCost:   20,
      每月收入:        0,
      耐久:          338
    },
    厩舍: {
      cost:        300,
      isBuilding:  [],
      mustBuildIn: 0,
      pointCost:   20,
      每月收入:        0,
      耐久:          600
    },
    吸收合并: {
      cost:        100,
      isBuilding:  [],
      mustBuildIn: 0,
      pointCost:   10,
      每月收入:        0,
      耐久:          70
    },
    啥都不做: {
      cost:        0,
      isBuilding:  [],
      mustBuildIn: 100,
      pointCost:   0,
      每月收入:        0,
      耐久:          0
    },
    大市场: {
      cost:        400,
      isBuilding:  [],
      mustBuildIn: 0,
      pointCost:   20,
      每月收入:        225,
      耐久:          567
    },
    市场: {
      cost:        200,
      isBuilding:  [],
      mustBuildIn: 6,
      pointCost:   20,
      每月收入:        75,
      耐久:          375
    },
    巡查: {
      cost:        100,
      isBuilding:  [0], // 默认必须0
      mustBuildIn: 100,
      pointCost:   20,
      每月收入:        0,
      耐久:          0
    },
    造币厂: {
      cost:        400,
      isBuilding:  [],
      mustBuildIn: 1,
      pointCost:   20,
      每月收入:        0,
      耐久:          750
    },
    锻冶场: {
      cost:        300,
      isBuilding:  [],
      mustBuildIn: 0,
      pointCost:   20,
      每月收入:        0,
      耐久:          600
    },
    鱼市: {
      cost:        400,
      isBuilding:  [],
      mustBuildIn: 0,
      pointCost:   20,
      每月收入:        150,
      耐久:          567
    },
    黑市: {
      cost:        50,
      isBuilding:  [],
      mustBuildIn: 0,
      pointCost:   20,
      每月收入:        60,
      耐久:          150
    }
  },
  thisTurnMustDo: [
    {
      行动力消耗:  40,
      设置武将空闲: {公孙度: 100,公孙康: 100},
      金币消耗:   500
    }, // 第1回合
    null, // 第2回合
    null, // 第3回合
    null, // 第4回合
    null, // 第5回合
    null, // 第6回合
    null, // 第7回合
    null, // 第8回合
    null, // 第9回合
    {行动力消耗: 20,金币消耗: 300}, // 第10回合
    null, // 第11回合
    null  // 第12回合
  ],
  wujiangData: {
    伦直: {
      free: 0,
      政治:   64,
      统帅:   46
    },
    公孙度: {
      free: 0,
      政治:   51,
      统帅:   67
    },
    公孙康: {
      free: 0,
      政治:   58,
      统帅:   72
    },
    公孙恭: {
      free: 0,
      政治:   61,
      统帅:   39
    },
    公孙渊: {
      free: 0,
      政治:   35,
      统帅:   65
    },
    卑衍: {
      free: 0,
      政治:   30,
      统帅:   60
    },
    徐荣: {
      free: 0,
      政治:   43,
      统帅:   80
    },
    杨祚: {
      free: 0,
      政治:   32,
      统帅:   53
    },
    贾范: {
      free: 0,
      政治:   62,
      统帅:   60
    }
  },
  初始行动力:    44,
  每回合回复行动力: 44
};

// 合并 baseStat0 和可变值初始化 stat0
const stat0: stat = {
  eachTrunStatWithMoney: [{
    市场:  [],
    治安:  80,// 默认值就是上方的治安
    造币厂: []
  },{
    市场:  [],
    治安:  80,// 需要写两份
    造币厂: []
  }],
  flag:          {},
  isDoMustDo:    [], // 记录已经执行了什么必做
  moving:        cloneMoving(baseStat0.moving),
  movingSortArr: ["军事府","大市场","鱼市","市场","造币厂","吸收合并","黑市","巡查","锻冶场","兵舍","人才府","厩舍","啥都不做"],
  turn:          1,
  wujiangData:   cloneWujiangData(baseStat0.wujiangData),
  xunchaEd:      false,
  实时金:           4200,
  治安:            80,
  行动:            [],
  行动力:           baseStat0["初始行动力"]
};

/**
 * 深拷贝 moving 对象
 * @param moving 原始 moving 对象
 * @returns 深拷贝后的 moving 对象
 */
function cloneMoving (moving: Moving): Moving {
  return Object.fromEntries(Object.entries(moving).map(([key,building]: [string,BuildingBase]) => [
    key,
    {
      ...building,
      isBuilding: [...building.isBuilding]
    }
  ])) as unknown as Moving;
}

/**
 * 深拷贝 wujiangData 对象
 * @param wujiangData 原始 wujiangData 对象
 * @returns 深拷贝后的 wujiangData 对象
 */
function cloneWujiangData (wujiangData: Record<string,WujiangItem>): Record<string,WujiangItem> {
  return Object.fromEntries(Object.entries(wujiangData).map(([key,value]) => [key,{...value}]));
}

/**
 * 初始化数据处理函数 功能:
 * 1. 过滤掉不需要建造的建筑(mustBuildIn === isBuilding.length 的建筑)
 * @param stat 初始状态
 * @returns 处理后的状态
 */
function slimInitData (stat: stat): stat {
  const newMoving: Partial<Moving> = {};
  for (const mov in stat.moving) {
    const mmm = stat.moving[mov as keyof Moving];
    if (mmm.mustBuildIn === mmm.isBuilding.length) {
      continue;
    }
    newMoving[mov as keyof Moving] = mmm;
    if (mov !== "啥都不做") {
      stat.flag[mov] = false;
    }
  }
  const sortedMoving: Partial<Moving> = {};
  const filteredSortArr: (keyof Moving)[] = [];
  for (const buildingType of stat.movingSortArr) {
    if (!Object.hasOwn(newMoving,buildingType)) {
    	continue;
    }
    sortedMoving[buildingType] = newMoving[buildingType];
    filteredSortArr.push(buildingType);
  }
  stat.moving = sortedMoving as Moving;
  stat.movingSortArr = filteredSortArr;
  return stat;
}
export const initStat = slimInitData(stat0);

// 保存初始的建筑状态和治安值(用于剪枝)
interface InitialStateSnapshot {
  建筑初始状态: string;
  治安:     number;
}
export const initialStateSnapshot: InitialStateSnapshot = {
  建筑初始状态: "",
  治安:     initStat.治安
};
for (const index in initStat.moving) {
  if (index !== "啥都不做") {initialStateSnapshot.建筑初始状态 += `${index}[]`;}
}

// 状态可做的操作名数组
export const allMovingArr: (keyof Moving)[] = [];
for (const index in initStat.moving) {
  if (initStat.moving[index as keyof Moving].mustBuildIn > 0) {
    allMovingArr.push(index as keyof Moving);
  }
}
export const maxLastTurnIncome = baseStat0.moving["市场"].每月收入 * 造币厂能影响几个市场 * 1.5 + (baseStat0.moving["市场"].mustBuildIn - 造币厂能影响几个市场) * baseStat0.moving["市场"].每月收入 + cityBaseIncome;