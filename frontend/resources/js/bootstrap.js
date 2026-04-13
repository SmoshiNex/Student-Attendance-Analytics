import axios from "axios"
window.axios = axios

window.axios.defaults.headers.common["X-Requested-With"] = "XMLHttpRequest"
window.axios.defaults.headers.common["Accept"] = "application/json"
window.axios.defaults.withCredentials = true

if (!window.__axiosLoadingInterceptorsInstalled) {
  let activeRequests = 0

  const emitLoadingState = () => {
    window.dispatchEvent(
      new CustomEvent("app:network-loading", {
        detail: {
          active: activeRequests,
        },
      }),
    )
  }

  window.axios.interceptors.request.use(
    (config) => {
      activeRequests += 1
      emitLoadingState()
      return config
    },
    (error) => {
      emitLoadingState()
      return Promise.reject(error)
    },
  )

  window.axios.interceptors.response.use(
    (response) => {
      activeRequests = Math.max(0, activeRequests - 1)
      emitLoadingState()
      return response
    },
    (error) => {
      activeRequests = Math.max(0, activeRequests - 1)
      emitLoadingState()
      return Promise.reject(error)
    },
  )

  window.__axiosLoadingInterceptorsInstalled = true
}
