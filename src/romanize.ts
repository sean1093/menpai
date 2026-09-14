import type { Romanization } from "./types.js";

/** Every toneless Hanyu Pinyin syllable that appears in Big5 character readings. */
const SYLLABLE_LIST =
  "a ai an ang ao ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu ca cai can cang cao " +
  "ce cen ceng cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui " +
  "chun chuo ci cong cou cu cuan cui cun cuo da dai dan dang dao de dei den deng di dia dian diao die " +
  "ding diu dong dou du duan dui dun duo e ei en eng er fa fan fang fei fen feng fo fou fu ga gai gan " +
  "gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo ha hai han hang hao he hei hen " +
  "heng hong hou hu hua huai huan huang hui hun huo ji jia jian jiang jiao jie jin jing jiong jiu ju " +
  "juan jue jun ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo la lai " +
  "lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lun luo ma " +
  "mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu n na nai nan nang nao ne nei " +
  "nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nuo o ou pa pai pan pang pao pei " +
  "pen peng pi pian piao pie pin ping po pou pu qi qia qian qiang qiao qie qin qing qiong qiu qu quan que " +
  "qun ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo sa sai san sang sao se sen seng " +
  "sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si " +
  "song sou su suan sui sun suo ta tai tan tang tao te tei teng ti tian tiao tie ting tong tou tu tuan " +
  "tui tun tuo wa wai wan wang wei wen weng wo wu xi xia xian xiang xiao xie xin xing xiong xiu xu xuan " +
  "xue xun ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun za zai zan zang zao ze zei zen " +
  "zeng zha zhai zhan zhang zhao zhe zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo " +
  "zi zong zou zu zuan zui zun zuo";

let syllableSet: Set<string> | undefined;

function isSyllable(text: string): boolean {
  if (!syllableSet) syllableSet = new Set(SYLLABLE_LIST.split(" "));
  return syllableSet.has(text);
}

/**
 * Splits a Hanyu Pinyin word (e.g. `"Zhongxiao"`, `"Da'an"`) into syllables.
 * Follows the Chunghwa Post convention: a syllable starting with a/e/o that is
 * not the first syllable must be preceded by an apostrophe, so `"Jingan"` is
 * `jin·gan`, never `jing·an`.
 *
 * Returns `null` when the word is not fully segmentable (conventional
 * spellings such as `Keelung`, `Roosevelt`, `Civic`).
 */
export function splitSyllables(word: string): string[] | null {
  const text = word.toLowerCase();
  const out: string[] = [];
  const walk = (pos: number): boolean => {
    if (pos === text.length) return true;
    let start = pos;
    let afterApostrophe = false;
    if (text[start] === "'") {
      afterApostrophe = true;
      start++;
      if (start === text.length) return false;
    }
    for (let len = Math.min(6, text.length - start); len >= 1; len--) {
      const candidate = text.slice(start, start + len);
      if (!isSyllable(candidate)) continue;
      if (start > 0 && !afterApostrophe && /^[aeo]/.test(candidate)) continue;
      out.push(candidate);
      if (walk(start + len)) return true;
      out.pop();
    }
    return false;
  };
  return walk(0) ? out : null;
}

const INITIALS = [
  "zh",
  "ch",
  "sh",
  "b",
  "p",
  "m",
  "f",
  "d",
  "t",
  "n",
  "l",
  "g",
  "k",
  "h",
  "j",
  "q",
  "x",
  "r",
  "z",
  "c",
  "s",
];

function splitInitial(syllable: string): [string, string] {
  for (const initial of INITIALS) {
    if (syllable.startsWith(initial)) return [initial, syllable.slice(initial.length)];
  }
  return ["", syllable];
}

const TONGYONG_STANDALONE: Record<string, string> = { wen: "wun", weng: "wong" };
const TONGYONG_INITIAL: Record<string, string> = { zh: "jh", q: "c", x: "s" };

export function toTongyong(syllable: string): string {
  const standalone = TONGYONG_STANDALONE[syllable];
  if (standalone) return standalone;
  const [initial, final] = splitInitial(syllable);
  if (initial === "") return syllable;
  let f = final;
  if (f === "i" && /^(zh|ch|sh|r|z|c|s)$/.test(initial)) f = "ih";
  else if (f === "iu") f = "iou";
  else if (f === "ui") f = "uei";
  else if (f === "iong") f = "yong";
  else if (f === "eng" && initial === "f") f = "ong";
  else if (/^[jqx]$/.test(initial)) {
    if (f === "u") f = "yu";
    else if (f === "ue") f = "yue";
    else if (f === "uan") f = "yuan";
    else if (f === "un") f = "yun";
  }
  return (TONGYONG_INITIAL[initial] ?? initial) + f;
}

const WG_STANDALONE: Record<string, string> = {
  yi: "yi",
  ye: "yeh",
  you: "yu",
  yan: "yen",
  yong: "yung",
  yue: "yueh",
  e: "o",
  er: "erh",
  zi: "tzu",
  ci: "tzu",
  si: "ssu",
  shuo: "shuo",
};
const WG_INITIAL: Record<string, string> = {
  b: "p",
  d: "t",
  g: "k",
  j: "ch",
  q: "ch",
  x: "hs",
  zh: "ch",
  r: "j",
  z: "ts",
  c: "ts",
};

/**
 * Wade-Giles in the simplified form used on Taiwanese signage and passports:
 * no aspiration apostrophes, no diaeresis, no hyphens.
 */
export function toWadeGiles(syllable: string): string {
  const standalone = WG_STANDALONE[syllable];
  if (standalone) return standalone;
  const [initial, final] = splitInitial(syllable);
  if (initial === "") return syllable;
  let f = final;
  if (f === "i" && /^(zh|ch|sh|r)$/.test(initial)) f = "ih";
  else if (f === "e" && /^[gkh]$/.test(initial)) f = "o";
  else if (f === "ian") f = "ien";
  else if (f === "ie") f = "ieh";
  else if (f === "iong") f = "iung";
  else if (f === "ong") f = "ung";
  else if (f === "er") f = "erh";
  else if (f === "uo" && /^(zh|ch|r|z|c|s|d|t|n|l)$/.test(initial)) f = "o";
  else if (f === "ui" && /^[gk]$/.test(initial)) f = "uei";
  else if (f === "ue") f = "ueh";
  return (WG_INITIAL[initial] ?? initial) + f;
}

/** Joins syllables into one capitalized word with the a/e/o apostrophe rule. */
export function joinSyllables(syllables: readonly string[]): string {
  let out = "";
  for (const s of syllables) {
    if (out.length > 0 && /^[aeo]/.test(s)) out += "'";
    out += s;
  }
  return out.length > 0 ? out.charAt(0).toUpperCase() + out.slice(1) : out;
}

/** Tokens that look like pinyin but are English abbreviations / conventional words. */
const STRUCTURAL: Record<string, true> = {
  sec: true,
  rd: true,
  st: true,
  blvd: true,
  ln: true,
  lane: true,
  aly: true,
  vil: true,
  dist: true,
  township: true,
  city: true,
  county: true,
  no: true,
  f: true,
  rm: true,
  e: true,
  w: true,
  s: true,
  n: true,
  neighborhood: true,
  sub: true,
  alley: true,
  taiwan: true,
  islands: true,
  island: true,
  new: true,
  road: true,
  market: true,
  park: true,
  farm: true,
  bridge: true,
  bldg: true,
  mt: true,
  zone: true,
  villa: true,
  community: true,
  sun: true,
  civic: true,
  university: true,
  industrial: true,
};

/**
 * Converts every pinyin-segmentable word in an English name (`"Sec. 4, Zhongxiao E. Rd."`)
 * to the requested romanization. Words that do not segment (conventional
 * spellings) and structural abbreviations are left untouched.
 */
export function convertRomanization(english: string, system: Romanization): string {
  if (system === "hanyu") return english;
  const convert = system === "tongyong" ? toTongyong : toWadeGiles;
  return english.replace(/[A-Za-z][a-z']*/g, (word, offset: number) => {
    if (english.charAt(offset + word.length) === ".") return word;
    if (STRUCTURAL[word.toLowerCase()]) return word;
    const syllables = splitSyllables(word);
    if (!syllables) return word;
    return joinSyllables(syllables.map(convert));
  });
}

export type CharLookup = (char: string) => string | undefined;

export interface Romanized {
  /** Capitalized pinyin word, with untranslatable characters kept in place. */
  text: string;
  /** Characters that had no reading. */
  unknown: string[];
}

/**
 * Character-by-character Hanyu Pinyin of a Chinese name. Characters without a
 * reading are kept in place and reported in `unknown`.
 */
export function romanizeChars(name: string, lookup: CharLookup): Romanized {
  const unknown: string[] = [];
  let out = "";
  let pending: string[] = [];
  for (const ch of name) {
    const reading = lookup(ch);
    if (reading === undefined) {
      out += joinSyllables(pending) + ch;
      pending = [];
      unknown.push(ch);
    } else {
      pending.push(reading);
    }
  }
  out += joinSyllables(pending);
  return { text: out, unknown };
}
