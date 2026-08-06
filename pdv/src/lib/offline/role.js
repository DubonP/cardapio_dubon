const KEY = 'dubon_pdv_role'

export const ROLES = ['principal', 'secundario', 'tablet']

export const ROLE_LABELS = {
  principal: 'Principal',
  secundario: 'Secundário',
  tablet: 'Tablet',
}

export function getRole() {
  return localStorage.getItem(KEY)
}

export function setRole(role) {
  if (!ROLES.includes(role)) throw new Error(`Papel de dispositivo inválido: ${role}`)
  localStorage.setItem(KEY, role)
}

export function clearRole() {
  localStorage.removeItem(KEY)
}

export function isPrincipal() {
  return getRole() === 'principal'
}
