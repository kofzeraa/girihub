import { all, run } from '../core/db.js';
import { permissionsOf } from '../core/misc.js';

export const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  display_name: u.display_name,
  avatar_url: u.avatar_url,
  verified: !!u.verified,
});

export const selfUser = (u) => ({
  ...publicUser(u),
  email: u.email,
  role: u.role,
  balance: u.balance,
  bio: u.bio,
  cover_url: u.cover_url,
  permissions: permissionsOf(u),
});

export const tagsFor = (userId) =>
  all('SELECT t.id, t.name FROM user_tags ut JOIN tags t ON t.id=ut.tag_id WHERE ut.user_id=? AND t.active=1 ORDER BY t.name', userId);

export const badgesFor = (userId) =>
  all(
    `SELECT b.id, b.name, b.icon, b.description, b.source FROM user_badges ub JOIN badges b ON b.id=ub.badge_id
     WHERE ub.user_id=? AND b.active=1 ORDER BY ub.granted_at`,
    userId,
  );

export const awardBadge = (userId, badgeId) =>
  run('INSERT OR IGNORE INTO user_badges(user_id,badge_id,granted_at) VALUES(?,?,?)', userId, badgeId, Date.now()).changes > 0;

export const awardBadgeByCode = (userId, code) => {
  const b = all('SELECT id FROM badges WHERE code=? AND active=1', code)[0];
  return b ? awardBadge(userId, b.id) : false;
};
