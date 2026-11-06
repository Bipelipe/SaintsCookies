export const roleNames = { admin:'Admin', owner:'Dono', customer:'Cliente' };
export async function rolesReady(db) {
  const row=await db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table' AND name IN ('account_roles','role_changes')").first();
  return row.total===2;
}
export async function effectiveUser(db,user) {
  if(!await rolesReady(db)) return user;
  const assignment=await db.prepare('SELECT role FROM account_roles WHERE user_id=?').bind(user.id).first();
  return {...user,role:assignment?.role || user.role};
}
export function capabilities(role) {
  return { manage_users:role==='admin', manage_orders:role==='admin'||role==='owner' };
}
