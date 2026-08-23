/*
 * 翻译加载器
 *
 * 按 locale 加载 src/translation/ 下对应的 xx-YY.ini,
 * 解析 [translation] 节键值,未命中回退默认语言。
 * 键值与加载行为遵循 docs/tech-spec/translation-ini.md。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_LANGUAGE, FALLBACK_LANGUAGE, TRANSLATION_DIR } from '../constants.ts'

/** 当前文件所在目录(构建产物位于 dist/ 下) */
const MODULE_DIR = dirname(fileURLToPath(import.meta.url))

/** 插件包根目录,即 MODULE_DIR 上溯两级 */
const PACKAGE_ROOT = join(MODULE_DIR, '..', '..')

interface TranslationTable {
  [key: string]: string
}

/** 解析 INI 文本,仅返回 [translation] 节键值 */
function parseTranslationSection(text: string): TranslationTable {
  const table: TranslationTable = {}
  let inSection = false
  for (const line of text.split(/\r?\n/)) {
    const sectionMatch = line.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      inSection = sectionMatch[1] === 'translation'
      continue
    }
    if (!inSection) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (key) table[key] = value
  }
  return table
}

export class TranslationManager {
  private tables: Record<string, TranslationTable> = {}
  private language: string = DEFAULT_LANGUAGE

  /** 加载指定语言的翻译表,文件缺失时回退空表 */
  load(locale: string): TranslationTable {
    if (this.tables[locale]) return this.tables[locale]
    let table: TranslationTable = {}
    const filePath = join(PACKAGE_ROOT, TRANSLATION_DIR, `${locale}.ini`)
    try {
      const text = readFileSync(filePath, 'utf-8')
      table = parseTranslationSection(text)
    } catch {
      // 文件缺失时使用空表,由主逻辑兜底
    }
    this.tables[locale] = table
    return table
  }

  /** 切换当前语言 */
  setLanguage(locale: string): void {
    this.language = locale
    this.load(locale)
  }

  /** 取翻译文本,未命中回退默认语言,仍未命中返回键名 */
  translate(key: string): string {
    const current = this.tables[this.language] ?? this.load(this.language)
    const fallback = this.tables[FALLBACK_LANGUAGE] ?? this.load(FALLBACK_LANGUAGE)
    return current[key] ?? fallback[key] ?? key
  }
}

/** 翻译文本快捷方法(使用默认实例) */
export const translation = new TranslationManager()