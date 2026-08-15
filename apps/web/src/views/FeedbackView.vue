<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import SubNav from '../components/SubNav.vue'
import { postFeedback } from '../composables/useOpsPublic.js'

const route = useRoute()
const type = ref('suggest')
const content = ref('')
const contact = ref('')
const loading = ref(false)
const error = ref('')
const ok = ref(false)

async function submit () {
  loading.value = true
  error.value = ''
  ok.value = false
  try {
    await postFeedback({
      type: type.value,
      content: content.value,
      contact: contact.value,
      page: String(route.query.from || route.fullPath || '/feedback')
    })
    ok.value = true
    content.value = ''
  } catch (e) {
    error.value = e?.message || String(e)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  const t = String(route.query.type || '')
  if (['bug', 'suggest', 'content', 'other'].includes(t)) type.value = t
})
</script>

<template>
  <div class="page">
    <SubNav title="意见反馈" />
    <div class="page__body">
      <p class="lead">功能建议、内容纠错或合作联系 · 运营后台可查收处理</p>

      <div class="form form--stack">
        <label>
          类型
          <select v-model="type">
            <option value="suggest">功能建议</option>
            <option value="bug">功能异常</option>
            <option value="content">内容纠错</option>
            <option value="other">其他</option>
          </select>
        </label>
        <label>
          内容
          <textarea
            v-model="content"
            rows="5"
            maxlength="1000"
            placeholder="请描述问题或建议（至少 4 字）"
          />
        </label>
        <label>
          联系方式（选填）
          <input v-model="contact" type="text" maxlength="80" placeholder="微信 / 手机 / 邮箱">
        </label>
        <button type="button" class="btn" :disabled="loading" @click="submit">
          {{ loading ? '提交中…' : '提交反馈' }}
        </button>
        <p v-if="ok" class="ok-msg">已收到，感谢反馈。</p>
        <p v-if="error" class="err">{{ error }}</p>
      </div>
    </div>
  </div>
</template>
