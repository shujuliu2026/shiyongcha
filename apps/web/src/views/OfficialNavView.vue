<script setup>
import SubNav from '../components/SubNav.vue'
import CorrectBtn from '../components/CorrectBtn.vue'
import { OFFICIAL_NAV_LINKS } from '../data/officialNav.js'

function openLink (href) {
  window.open(href, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="page">
    <SubNav title="官方信息查询" />
    <div class="page__body">
      <p class="lead">
        常用官方 / 权威站点导航。点击在新窗口打开；本站不采集账号，也不代查结果。
      </p>
      <p><CorrectBtn item="官方信息查询" :compact="false" /></p>

      <ul class="official-nav">
        <li v-for="item in OFFICIAL_NAV_LINKS" :key="item.id">
          <button
            type="button"
            class="official-nav__btn"
            :title="item.host"
            @click="openLink(item.href)"
          >
            <span class="official-nav__main">
              <strong>{{ item.title }}</strong>
              <small>{{ item.desc }}</small>
            </span>
          </button>
        </li>
      </ul>

      <p class="foot muted">
        外链以各站最新页面为准。部分政务站有人机验证，若打不开可换网络或稍后重试。
        房价等第三方行情仅供参考，不构成交易建议。
      </p>
    </div>
  </div>
</template>
