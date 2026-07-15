/**
 * 实用查 · 激活码 / 套餐商业化配置
 */
export const LICENSE_PLANS = Object.freeze({
  once: {
    id: 'once',
    label: '按次套餐',
    desc: '按批量查询行数扣次，适合偶发对公对账',
    default_quota: 100,
    type: 'count'
  },
  month: {
    id: 'month',
    label: '包月',
    desc: '自激活起 31 天内批量不限次（单次上限内）',
    days: 31,
    type: 'time'
  },
  quarter: {
    id: 'quarter',
    label: '包季',
    desc: '自激活起 93 天内批量不限次（单次上限内）',
    days: 93,
    type: 'time'
  }
})

/** 对外展示价（文案，实际收款走微信客服） */
export const LICENSE_PRICE_COPY = Object.freeze({
  once: '按次 · 联系客服按用量开通（如 100 次）',
  month: '包月 · 联系客服开通',
  quarter: '包季 · 联系客服开通'
})

export function getSupportConfig () {
  return {
    wechat: String(process.env.CS_WECHAT || process.env.VITE_CS_WECHAT || '请配置 CS_WECHAT').trim(),
    tip: String(process.env.CS_TIP || '添加微信客服，说明批量查询需求，核实后发放激活码解锁').trim(),
    free_single_daily: Number(process.env.FREE_SINGLE_DAILY || 30),
    batch_max_lines: Number(process.env.BATCH_MAX_LINES || 200)
  }
}
