import { sileo } from "sileo"

const make = (fn) => (title, description) => {
  let id
  id = fn({ title, description, onDismiss: () => sileo.dismiss(id) })
  return id
}

export const toast = {
  success: make(sileo.success.bind(sileo)),
  error: make(sileo.error.bind(sileo)),
  warning: make(sileo.warning.bind(sileo)),
  info: make(sileo.info.bind(sileo)),
}
