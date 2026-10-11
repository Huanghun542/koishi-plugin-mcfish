// SPDX-License-Identifier: AGPL-3.0-only
// Item data adapted from FloatTech/zbpdata, McFish/articlesInfo.json.
export type Category = 'pole' | 'fish' | 'waste' | 'treasure';
export interface ItemDefinition { name: string; category: Category; weight: number; maxDurability: number; price: number }
export const ITEMS: ItemDefinition[] = [
  {
    "name": "木竿",
    "category": "pole",
    "weight": 70,
    "maxDurability": 30,
    "price": 100
  },
  {
    "name": "铁竿",
    "category": "pole",
    "weight": 20,
    "maxDurability": 50,
    "price": 300
  },
  {
    "name": "金竿",
    "category": "pole",
    "weight": 6,
    "maxDurability": 70,
    "price": 700
  },
  {
    "name": "钻石竿",
    "category": "pole",
    "weight": 3,
    "maxDurability": 100,
    "price": 1500
  },
  {
    "name": "下界合金竿",
    "category": "pole",
    "weight": 1,
    "maxDurability": 150,
    "price": 3100
  },
  {
    "name": "三叉戟",
    "category": "pole",
    "weight": 0,
    "maxDurability": 301,
    "price": 4000
  },
  {
    "name": "鳕鱼",
    "category": "fish",
    "weight": 69,
    "maxDurability": 0,
    "price": 10
  },
  {
    "name": "鲑鱼",
    "category": "fish",
    "weight": 20,
    "maxDurability": 0,
    "price": 50
  },
  {
    "name": "热带鱼",
    "category": "fish",
    "weight": 6,
    "maxDurability": 0,
    "price": 100
  },
  {
    "name": "河豚",
    "category": "fish",
    "weight": 3,
    "maxDurability": 0,
    "price": 300
  },
  {
    "name": "鹦鹉螺",
    "category": "fish",
    "weight": 1,
    "maxDurability": 0,
    "price": 500
  },
  {
    "name": "墨鱼",
    "category": "fish",
    "weight": 1,
    "maxDurability": 0,
    "price": 500
  },
  {
    "name": "海草",
    "category": "waste",
    "weight": 10,
    "maxDurability": 0,
    "price": 10
  },
  {
    "name": "木棍",
    "category": "waste",
    "weight": 10,
    "maxDurability": 0,
    "price": 10
  },
  {
    "name": "帽子",
    "category": "waste",
    "weight": 10,
    "maxDurability": 0,
    "price": 10
  },
  {
    "name": "鞋子",
    "category": "waste",
    "weight": 10,
    "maxDurability": 0,
    "price": 10
  },
  {
    "name": "瓶子",
    "category": "waste",
    "weight": 10,
    "maxDurability": 0,
    "price": 10
  },
  {
    "name": "绊线钩",
    "category": "waste",
    "weight": 10,
    "maxDurability": 0,
    "price": 10
  },
  {
    "name": "骨头",
    "category": "waste",
    "weight": 10,
    "maxDurability": 0,
    "price": 10
  },
  {
    "name": "皮革",
    "category": "waste",
    "weight": 10,
    "maxDurability": 0,
    "price": 10
  },
  {
    "name": "腐肉",
    "category": "waste",
    "weight": 10,
    "maxDurability": 0,
    "price": 10
  },
  {
    "name": "碗",
    "category": "waste",
    "weight": 10,
    "maxDurability": 0,
    "price": 10
  },
  {
    "name": "诱钓",
    "category": "treasure",
    "weight": 25,
    "maxDurability": 0,
    "price": 1000
  },
  {
    "name": "海之眷顾",
    "category": "treasure",
    "weight": 10,
    "maxDurability": 0,
    "price": 2500
  },
  {
    "name": "海豚",
    "category": "treasure",
    "weight": 19,
    "maxDurability": 0,
    "price": 1000
  },
  {
    "name": "宝藏诅咒",
    "category": "treasure",
    "weight": 25,
    "maxDurability": 0,
    "price": 0
  },
  {
    "name": "净化书",
    "category": "treasure",
    "weight": 19,
    "maxDurability": 0,
    "price": 5000
  },
  {
    "name": "唱片",
    "category": "treasure",
    "weight": 1,
    "maxDurability": 0,
    "price": 3000
  },
  {
    "name": "美西螈",
    "category": "treasure",
    "weight": 1,
    "maxDurability": 999,
    "price": 3000
  }
]
export const CATALOG = new Map(ITEMS.map(item => [item.name, item]));
export const RODS = ITEMS.filter(item => item.category === 'pole').map(item => item.name);
export const FISH = ITEMS.filter(item => item.category === 'fish').map(item => item.name);
export const WASTE = ITEMS.filter(item => item.category === 'waste').map(item => item.name);
export const EQUIPPABLE = [...RODS, '美西螈'];
export const ZONE_WEIGHTS = { treasure: 1, pole: 4, fish: 25, waste: 30 };
