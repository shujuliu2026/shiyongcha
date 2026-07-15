/**
 * 官方实用信息查询导航（外链）
 * 探测说明见仓库 docs 备注：部分站点对爬虫返回 412/521，浏览器可正常打开。
 */

/** @typedef {{ id: string, title: string, desc: string, href: string, host: string }} OfficialNavItem */

/** @type {OfficialNavItem[]} */
export const OFFICIAL_NAV_LINKS = [
  {
    id: 'chsi',
    title: '查学历 / 学籍',
    desc: '学信网 · 入职考公必查',
    href: 'https://www.chsi.com.cn/',
    host: 'www.chsi.com.cn'
  },
  {
    id: 'pbccrc',
    title: '查个人征信',
    desc: '央行征信中心 · 买房贷款前先看',
    href: 'https://www.pbccrc.org.cn/',
    host: 'www.pbccrc.org.cn'
  },
  {
    id: 'gsxt',
    title: '查企业底细',
    desc: '国家企业信用公示 · 经营异常与股东',
    href: 'https://www.gsxt.gov.cn/',
    host: 'www.gsxt.gov.cn'
  },
  {
    id: 'si12333',
    title: '查社保记录',
    desc: '社保公共服务平台 · 核对单位缴费',
    href: 'https://si.12333.gov.cn/',
    host: 'si.12333.gov.cn'
  },
  {
    id: 'beian',
    title: '查网站备案',
    desc: '工信部 ICP 备案 · 防钓鱼',
    href: 'https://beian.miit.gov.cn/',
    host: 'beian.miit.gov.cn'
  },
  {
    id: 'wenshu',
    title: '查裁判文书',
    desc: '中国裁判文书网 · 案由与判决',
    href: 'https://wenshu.court.gov.cn/',
    host: 'wenshu.court.gov.cn'
  },
  {
    id: 'zxgk',
    title: '查老赖 / 执行',
    desc: '执行信息公开网 · 失信被执行人',
    href: 'https://zxgk.court.gov.cn/',
    host: 'zxgk.court.gov.cn'
  },
  {
    id: 'creditchina',
    title: '查行政处罚',
    desc: '信用中国 · 黑名单与行政处罚',
    href: 'https://www.creditchina.gov.cn/',
    host: 'www.creditchina.gov.cn'
  },
  {
    id: 'creprice',
    title: '查房价行情',
    desc: '城市房价网 · 成交价与走势参考',
    href: 'https://www.creprice.cn/',
    host: 'www.creprice.cn'
  },
  {
    id: 'neea',
    title: '查四六级 / 等级考试',
    desc: '中国教育考试网 · 四六级与计算机等级',
    href: 'https://www.neea.edu.cn/',
    host: 'www.neea.edu.cn'
  },
  {
    id: 'sbj',
    title: '查商标注册',
    desc: '商标局 · 起名前先查，避免侵权',
    href: 'https://sbj.cnipa.gov.cn/',
    host: 'sbj.cnipa.gov.cn'
  },
  {
    id: 'osta',
    title: '查职业证书',
    desc: '人社部技能人才评价证书全国联网查询',
    href: 'https://zscx.osta.org.cn/',
    host: 'zscx.osta.org.cn'
  },
  {
    id: 'nhc',
    title: '查医生资质',
    desc: '国家卫健委 · 医师执业资格查询',
    href: 'https://zgcx.nhc.gov.cn/',
    host: 'zgcx.nhc.gov.cn'
  },
  {
    id: 'ccopyright',
    title: '查软件著作权',
    desc: '中国版权保护中心',
    href: 'https://www.ccopyright.com.cn/',
    host: 'www.ccopyright.com.cn'
  },
  {
    id: 'nmpa',
    title: '查药品 / 化妆品',
    desc: '国家药监局 · 注册与备案信息',
    href: 'https://www.nmpa.gov.cn/',
    host: 'www.nmpa.gov.cn'
  },
  {
    id: 'flk',
    title: '查法律法规',
    desc: '国家法律法规数据库 · 权威原文',
    href: 'https://flk.npc.gov.cn/',
    host: 'flk.npc.gov.cn'
  },
  {
    id: 'chinatax',
    title: '查纳税信用',
    desc: '国家税务总局 · A 级纳税人等',
    href: 'https://www.chinatax.gov.cn/',
    host: 'www.chinatax.gov.cn'
  },
  {
    id: 'stats',
    title: '查统计数据',
    desc: '国家统计局数据 · 宏观一手数据',
    href: 'https://data.stats.gov.cn/',
    host: 'data.stats.gov.cn'
  },
  {
    id: 'cnipa',
    title: '查专利信息',
    desc: '国家知识产权局 · 专利公布公告入口（原 epub 站不稳定已改挂官网）',
    href: 'https://www.cnipa.gov.cn/',
    host: 'www.cnipa.gov.cn'
  },
  {
    id: 'ceb',
    title: '查招投标',
    desc: '中国招标投标公共服务平台 · 项目公告查询',
    href: 'http://www.cebpubservice.com/',
    host: 'www.cebpubservice.com'
  }
]
