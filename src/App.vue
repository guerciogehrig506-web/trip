<script setup lang="ts">
import { ref } from 'vue'
import MapView from '@/components/MapView.vue'
import AuthConfigModal from '@/components/AuthConfigModal.vue'

const showConfig = ref(false)

function openConfig() {
  showConfig.value = true
}
</script>

<template>
  <div class="fixed inset-0 overflow-hidden bg-slate-900">
    <MapView @request-config="openConfig" />
    <AuthConfigModal v-model="showConfig" />
  </div>
</template>
