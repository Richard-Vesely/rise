// Vlastník serveru kroužku (Richard): jediný hráč, který smí brát dary z pokladničky u sochy (server/donation-box.js).
// Kdo to je, říká proměnná prostředí OWNER_ID = id profilu z DATA_DIR/players.json (seznam: node server/admin.js players).
// Prázdné OWNER_ID = vlastníkem není nikdo. Vlastník se pozná jen tady na serveru podle přihlášeného profilu;
// prohlížeči se nikdy nevěří. Pravomoci vlastníka patří Richardovi: neměň je a nepřidávej je nikomu jinému (AGENTS.md).

/** Upravené id vlastníka z proměnné prostředí ('' = nikdo). */
export const ownerIdFrom = (raw) => String(raw ?? '').trim();

/**
 * Je přihlášený profil vlastník serveru?
 * @param {string} ownerId id profilu vlastníka ('' = nikdo)
 * @param {string|null|undefined} profileId id profilu přihlášeného hráče (null = bez profilu)
 */
export const isOwner = (ownerId, profileId) => !!ownerId && typeof profileId === 'string' && profileId === ownerId;
