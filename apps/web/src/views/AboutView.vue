<script setup>
import { RouterLink } from 'vue-router'
import SubNav from '../components/SubNav.vue'

const buildStamp = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : ''
</script>

<template>
  <div class="page">
    <SubNav title="关于" :correct="false" />
    <div class="page__body">
      <h2 class="page__h2">实用查</h2>
      <p class="lead">
        独立实用信息查询工具箱，默认服务城市为临沂。本地服务约占六成，全国通用工具约占四成。
      </p>

      <h2 class="page__h2">本地服务分类（临沂）</h2>
      <ul class="about-list">
        <li><strong>人社社保</strong>：社保区划 · 户籍电话（窗口/自助可搜索） · 社保卡制卡网点 · 职业培训 · 办事指南</li>
        <li><strong>出行交通</strong>：出行提示 · 公交 · IC卡 · 站亭 · 客运场站 · 货运场站 · 驾校</li>
        <li><strong>生活便民</strong>：历史上的今天 · 临沂旧时光（精选老照片） · 医院 · 便民电话 · 区划邮编</li>
        <li><strong>气象环境</strong>：临沂天气 · 空气质量</li>
        <li><strong>金融银行</strong>：本地银行网点</li>
      </ul>
      <h2 class="page__h2">开放网脱敏数据</h2>
      <ul class="about-list">
        <li><strong>货运场站地址</strong>、<strong>培训机构电话/地址</strong>：源表脱敏；配置 <code>AMAP_WEB_KEY</code> 后 <code>npm run enrich:places -- freight|training</code></li>
        <li>清单见 <code>data/local/linyi/open-data-inventory.json</code>（<code>npm run import:open-data</code>）</li>
      </ul>

      <h2 class="page__h2">全国工具</h2>
      <ul class="about-list">
        <li><strong>官方信息查询</strong>：学信/征信/企信/裁判/备案等权威外链导航（新窗口打开）</li>
        <li><strong>身份证归属</strong>：公开区划码库 + 校验位算法（不联网核验身份）</li>
        <li><strong>油价速查</strong>：山东成品油最高零售价参考</li>
        <li><strong>菜蛋肉价</strong>：商务部「商务预报」鸡蛋 / 肉类 / 蔬菜批发日度价</li>
        <li><strong>台风天气</strong>：浙江水利厅路径 · RainViewer 雨层 · 距离告警；与临沂天气双向联动</li>
        <li><strong>地震通报</strong>：中国地震台网列表（Wolfx 聚合）· 距临沂距离 · EEW 试推</li>
        <li><strong>银行联行号</strong>：本地种子库；可选 <code>JUHE_INTERBANK_KEY</code></li>
        <li><strong>坐标转换</strong>：WGS84 / GCJ02 / BD09 本地算法</li>
        <li><strong>节假日</strong>：2025-2026 国务院放假安排简化版</li>
      </ul>

      <h2 class="page__h2">技术说明</h2>
      <ul class="about-list">
        <li>前端：Vue 3 + Vite + Leaflet（CARTO/OSM 底图）</li>
        <li>API：Node HTTP · 端口 5180 · Web 开发端口 5176</li>
        <li>默认城市配置：<code>packages/shared/config.mjs</code></li>
        <li>访问统计：前台路由自动上报 <code>page.view</code>（JSONL · <code>data/analytics/</code>）</li>
        <li>运营后台：<code>/admin</code>（工具、数据源 API、公告、反馈、PV/UV）· 需 <code>ADMIN_TOKEN</code></li>
        <li>意见反馈：页面 <code>/feedback</code> · API <code>POST /api/v1/feedback</code></li>
      </ul>

      <h2 class="page__h2">随用宝桌面系列</h2>
      <p class="lead">
        实用查为 H5 信息查询；同系列桌面软件（备份、同步、截图等）见
        <RouterLink to="/suite">软件介绍与下载</RouterLink>，统一跳转官方 hub，不在本站嵌入桌面能力。
      </p>

      <h2 class="page__h2">免责声明</h2>
      <p class="muted">
        气象、地震、菜价、联行号、便民电话、办事指南、出行信息、地方史条目等均为参考用途，不构成官方预警、报价、银行结算、政务办事或史学定论依据。
        防灾请以中央气象台 / 中国地震台网 / 应急管理部门公告为准；批发价以商务部公示及当地市场为准；资金汇路以银行柜台或网银为准；史实细节请核对地方志与权威档案。
      </p>
      <p v-if="buildStamp" class="muted">build {{ buildStamp }}</p>
    </div>
  </div>
</template>
