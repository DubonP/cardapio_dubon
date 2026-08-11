export const getRole = () => localStorage.getItem('dubon_role') || 'admin'
export const isAdmin = () => getRole() === 'admin'
