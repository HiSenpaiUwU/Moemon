import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONTENT,
  config,
  escapeHtml,
  formatNumber,
  validateEmail,
  validatePassword,
  validateUsername,
  createUser,
  authenticateUser,
  createSession,
  createSignedDeviceSave,
  destroySession,
  flushPendingWorldBackup,
  getUserBySessionToken,
  inspectSignedDeviceSave,
  requestPasswordReset,
  resetPasswordWithToken,
  getHubState,
  getTrainerCardState,
  getCollectionEntry,
  getPersistentInventory,
  createRunForUser,
  getRunSnapshot,
  performRunAction,
  handleRewardAction,
  abandonRun,
  renameCollectionMonster,
  toggleStarterFlag,
  toggleCollectionFavorite,
  setCollectionHeldItem,
  teachCollectionMove,
  setCollectionAbility,
  evolveCollectionMonster,
  useCollectionProgressionItem,
  useCollectionStashItem,
  setCollectionBox,
  setPersistentPartySlot,
  clearPersistentPartySlot,
  setPersistentPartyOrder,
  adminGrantCash,
  adminGrantItem,
  adminGrantMonster,
  adminSetMonsterLevel,
  adminAdjustMonsterBonusStat,
  adminSetRunWave,
  adminSetRole,
  adminUnlockMode,
  adminClearRun,
  getAdminOverview,
  createAdmin,
  purchasePersistentItem,
  persistentItemUnitPrice,
  getWorldState,
  setPlayerAvatar,
  setPartnerMonster,
  setTrainerGearEquip,
  startIncubatorEgg,
  claimIncubatorEgg,
  removeIncubatorEgg,
  performHubActivity,
  getGymState,
  startGymChallenge,
  getSocialState,
  postChatMessage,
  startArenaChallenge,
  getMiniGamesState,
  playMiniGame,
  redeemMiniGameReward,
  exchangeMiniGameInventoryItem,
  exchangeMiniGameMonster,
  getNewsState,
  getEventsState,
  getMapState,
  searchMapRoute,
  startMapSearchEncounter,
  fleeMapSearchEncounter,
  startMapAdventure,
  getSettingsState,
  updatePlayerSettings,
  setTrainerClass,
  setTrainerTitle,
  upgradeTrainerSkill,
  resetTrainerSkills,
  claimMissionReward,
  restoreSignedDeviceSave,
  transformationModesForSpecies,
} from './core.js';
import { getBuildDexState } from './builddex.js';

const PUBLIC_DIR = path.join(process.cwd(), 'public');

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

async function parseForm(request) {
  const raw = await readBody(request);
  const params = new URLSearchParams(raw);
  return {
    raw,
    params,
    data: Object.fromEntries(params),
    getAll(name) {
      return params.getAll(name);
    },
  };
}

async function parseJson(request) {
  const raw = await readBody(request);
  if (!raw.trim()) {
    return {};
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON payload.');
  }
}

function parseDeviceBackupField(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return null;
  }
  try {
    return JSON.parse(rawValue);
  } catch {
    return null;
  }
}

function loginMatchesSignedDeviceSave(loginValue, deviceSave) {
  if (!deviceSave) {
    return false;
  }
  const normalizedLogin = String(loginValue || '').trim().toLowerCase();
  if (!normalizedLogin) {
    return false;
  }
  try {
    const identity = inspectSignedDeviceSave(deviceSave?.backup || deviceSave);
    return [identity.username, identity.email].some((candidate) => String(candidate || '').trim().toLowerCase() === normalizedLogin);
  } catch {
    return false;
  }
}

async function authenticateWithOptionalDeviceRestore(form) {
  let signedIn = authenticateUser(form.data.login, form.data.password);
  if (!signedIn) {
    const deviceBackup = parseDeviceBackupField(form.data.deviceBackup);
    if (loginMatchesSignedDeviceSave(form.data.login, deviceBackup)) {
      try {
        restoreSignedDeviceSave(deviceBackup?.backup || deviceBackup);
        signedIn = authenticateUser(form.data.login, form.data.password);
      } catch (error) {
        console.error('[moemon] Automatic device restore during login failed:', error);
      }
    }
  }
  return signedIn;
}

function isAdminAccount(user) {
  return user?.role === 'admin';
}

function parseCookies(request) {
  const header = request.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    if (!part.trim()) {
      continue;
    }
    const [key, ...rest] = part.trim().split('=');
    cookies[key] = decodeURIComponent(rest.join('='));
  }
  return cookies;
}

function setCookie(response, name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || '/'}`);
  parts.push(`SameSite=${options.sameSite || 'Lax'}`);
  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
    parts.push(`Expires=${new Date(Date.now() + options.maxAge * 1000).toUTCString()}`);
  }
  if (options.httpOnly !== false) {
    parts.push('HttpOnly');
  }
  if (options.secure || config.appOrigin.startsWith('https://')) {
    parts.push('Secure');
  }
  const existing = response.getHeader('Set-Cookie');
  response.setHeader('Set-Cookie', existing ? [].concat(existing, parts.join('; ')) : parts.join('; '));
}

function clearCookie(response, name) {
  setCookie(response, name, '', { maxAge: 0 });
}

function setFlash(response, message, level = 'info') {
  const encoded = Buffer.from(JSON.stringify({ message, level }), 'utf8').toString('base64url');
  setCookie(response, 'moemon_flash', encoded, { maxAge: 15, httpOnly: false });
}

function consumeFlash(request, response) {
  const cookies = parseCookies(request);
  if (!cookies.moemon_flash) {
    return null;
  }
  clearCookie(response, 'moemon_flash');
  try {
    return JSON.parse(Buffer.from(cookies.moemon_flash, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function html(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(body);
}

function json(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function serveStatic(response, pathname) {
  if (!pathname.startsWith('/public/')) {
    return false;
  }
  const relativePath = pathname.replace('/public/', '');
  const filePath = path.join(PUBLIC_DIR, relativePath);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
    return false;
  }
  const extension = path.extname(filePath).toLowerCase();
  const contentType = extension === '.css'
    ? 'text/css; charset=utf-8'
    : extension === '.js'
      ? 'text/javascript; charset=utf-8'
      : 'application/octet-stream';
  response.writeHead(200, { 'Content-Type': contentType });
  response.end(fs.readFileSync(filePath));
  return true;
}

function money(value) {
  return `$${formatNumber(Math.max(0, Math.round(value || 0)))}`;
}

function statTotal(stats) {
  return ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].reduce((sum, key) => sum + Number(stats?.[key] || 0), 0);
}

function statSpreadSummary(spread, scaleLabel = '') {
  const labels = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
  return ['hp', 'atk', 'def', 'spa', 'spd', 'spe']
    .map((key) => `${labels[key]} ${formatNumber(spread?.[key] || 0)}${scaleLabel}`)
    .join(' / ');
}

function formatTimerMinutes(totalMinutes) {
  const minutes = Math.max(0, Number(totalMinutes || 0));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours}h ${remainder}m` : `${remainder}m`;
}

function renderSpriteAvatar(sprite, options = {}) {
  if (!sprite) {
    return '';
  }
  return `
    <div class="sprite-avatar ${options.large ? 'large' : ''} palette-${escapeHtml(sprite.palette)}">
      <span>${escapeHtml(sprite.glyph || sprite.name.slice(0, 2).toUpperCase())}</span>
      <small>${escapeHtml(sprite.accent || 'Scout')}</small>
    </div>
  `;
}

function badge(label, tone = 'default') {
  return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
}

function monsterLabel(monster) {
  return monster.nickname ? `${monster.nickname} (${monster.name})` : monster.name;
}

function natureInfo(monster) {
  const labels = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Speed' };
  const nature = CONTENT.natureMap.get(monster.nature);
  if (!nature) {
    return null;
  }
  return {
    name: nature.name,
    upLabel: nature.up ? '+' + labels[nature.up] : null,
    downLabel: nature.down ? '-' + labels[nature.down] : null,
  };
}

function natureBadges(monster) {
  const info = natureInfo(monster);
  if (!info) {
    return '';
  }
  const mood = info.upLabel && info.downLabel
    ? `${badge(info.name, 'success')} ${badge(info.upLabel, 'up')} ${badge(info.downLabel, 'down')}`
    : `${badge(info.name, 'success')} ${badge('Neutral', 'default')}`;
  return '<div class="badge-row">' + mood + '</div>';
}

function auraInfo(monster) {
  return CONTENT.specialAuraMap.get(monster?.auraKey) || CONTENT.specialAuraMap.get('normal') || null;
}

function auraBadges(monster) {
  const aura = auraInfo(monster);
  if (!aura) {
    return '';
  }
  return '<div class="badge-row">' + badge(aura.name, aura.tone || 'default') + ' ' + badge(monster.auraPalette || 'Classic', 'default') + '</div>';
}

function evolutionOptionsForSpecies(species) {
  const options = [];
  if (species?.evolvesTo) {
    const target = CONTENT.speciesMap.get(species.evolvesTo);
    if (target) {
      options.push({ target, via: `Lv ${formatNumber(species.evolveLevel || 0)}` });
    }
  }
  Object.entries(species?.stoneEvolutionMap || {}).forEach(([stoneSlug, targetId]) => {
    const target = CONTENT.speciesMap.get(targetId);
    const stone = CONTENT.itemMap.get(stoneSlug);
    if (target && stone && !options.some((entry) => entry.target.id === target.id && entry.via === stone.name)) {
      options.push({ target, via: stone.name });
    }
  });
  return options;
}

function serializeJsonForHtml(value) {
  return JSON.stringify(value).replace(/[<>&]/g, (character) => {
    if (character === '<') {
      return '\\u003c';
    }
    if (character === '>') {
      return '\\u003e';
    }
    return '\\u0026';
  });
}

function titleLabel(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function paletteForType(type) {
  const palettes = {
    fire: 'sunset',
    water: 'tide',
    electric: 'volt',
    grass: 'forest',
    ice: 'mist',
    fighting: 'sunset',
    poison: 'grave',
    ground: 'sunset',
    flying: 'mist',
    psychic: 'aurora',
    bug: 'forest',
    rock: 'steel',
    ghost: 'grave',
    dragon: 'aurora',
    dark: 'grave',
    steel: 'steel',
    fairy: 'aurora',
    normal: 'mist',
  };
  return palettes[type] || 'mist';
}

const SIGNATURE_PORTRAIT_GLYPHS = new Map([
  [1, '^_^'],
  [4, '/\\*'],
  [7, '~~~'],
  [13, 'ZZ'],
  [16, '@@'],
  [43, '##'],
  [49, '++'],
  [52, '><'],
]);

function portraitGlyphForSpecies(species, initials) {
  if (!species) {
    return initials;
  }
  if (SIGNATURE_PORTRAIT_GLYPHS.has(species.id)) {
    return SIGNATURE_PORTRAIT_GLYPHS.get(species.id);
  }
  if (species.limitedEdition) {
    return 'LT';
  }
  if (species.rarity === 'mythic') {
    return 'MY';
  }
  if (species.rarity === 'legendary') {
    return 'LG';
  }
  return initials;
}

function renderMonsterPortrait(species, options = {}) {
  if (!species) {
    return '';
  }
  const initials = String(species.name || '??').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '??';
  const glyph = portraitGlyphForSpecies(species, initials);
  const hasSignature = glyph !== initials;
  const caption = options.caption || species.types.map((type) => titleLabel(type)).join(' / ');
  return `
    <div class="monster-portrait ${options.small ? 'small' : ''} ${hasSignature ? 'has-signature' : ''} palette-${escapeHtml(paletteForType(species.types?.[0]))}">
      <span class="monster-portrait-sprite">${escapeHtml(glyph)}</span>
      <span>${escapeHtml(initials)}</span>
      <small>${escapeHtml(caption)}</small>
    </div>
  `;
}

function generationForSpecies(species) {
  const familyIndex = Number(species?.family || species?.id || 1);
  return Math.max(1, Math.min(6, Math.ceil(familyIndex / 31)));
}

function typeMultiplier(moveType, targetTypes = []) {
  return (targetTypes || []).reduce((multiplier, targetType) => multiplier * (CONTENT.typeChart?.[moveType]?.[targetType] ?? 1), 1);
}

function matchupSummary(types = []) {
  const safeTypes = Array.isArray(types) && types.length ? types : ['normal'];
  const defense = CONTENT.types.map((type) => ({ type, multiplier: typeMultiplier(type, safeTypes) }));
  const offense = CONTENT.types.map((type) => ({
    type,
    multiplier: Math.max(...safeTypes.map((sourceType) => typeMultiplier(sourceType, [type]))),
  }));
  return {
    defenseWeaknesses: defense.filter((entry) => entry.multiplier > 1).sort((left, right) => right.multiplier - left.multiplier || left.type.localeCompare(right.type)),
    defenseResistances: defense.filter((entry) => entry.multiplier < 1).sort((left, right) => left.multiplier - right.multiplier || left.type.localeCompare(right.type)),
    offensePressure: offense.filter((entry) => entry.multiplier > 1).sort((left, right) => right.multiplier - left.multiplier || left.type.localeCompare(right.type)),
    offenseWalls: offense.filter((entry) => entry.multiplier < 1).sort((left, right) => left.multiplier - right.multiplier || left.type.localeCompare(right.type)),
  };
}

function renderMatchupBadges(entries, tone = 'default', emptyLabel = 'Balanced') {
  if (!entries.length) {
    return badge(emptyLabel, tone);
  }
  return entries.slice(0, 6).map((entry) => badge(`${titleLabel(entry.type)} x${Number(entry.multiplier.toFixed(2))}`, tone)).join(' ');
}

function favoriteTypeFromEntries(entries) {
  const counts = new Map();
  entries.forEach((entry) => {
    (entry.species?.types || []).forEach((type) => counts.set(type, (counts.get(type) || 0) + 1));
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || 'normal';
}

function trainerSnapshot(state) {
  const allEntries = state.allCollectionEntries || [];
  const favorites = state.favoriteEntries || [];
  const seenCount = (state.seenSpeciesIds || []).length;
  const caughtCount = (state.caughtSpeciesIds || []).length;
  const partyCount = (state.partySlots || []).filter(Boolean).length;
  const battleWins = Number(state.user.meta.classicClears || 0)
    + Number(state.user.meta.challengeClears || 0)
    + Number(state.user.meta.arenaRecord?.wins || 0)
    + Object.keys(state.user.meta.gymWins || {}).length;
  return {
    seenCount,
    caughtCount,
    partyCount,
    battleWins,
    favoriteCount: favorites.length,
    favoriteType: titleLabel(favoriteTypeFromEntries(allEntries)),
    achievements: [
      { label: 'Caught 10 Pokemon', unlocked: caughtCount >= 10 },
      { label: 'Built a full team', unlocked: partyCount === CONTENT.partySlotCount },
      { label: 'Used all types', unlocked: new Set(allEntries.flatMap((entry) => entry.species?.types || [])).size === CONTENT.types.length },
      { label: 'Seen 50 entries', unlocked: seenCount >= 50 },
    ],
  };
}

function buildCollectionDashboardData(state) {
  return {
    types: CONTENT.types,
    typeChart: CONTENT.typeChart,
    party: (state.partySlots || []).filter(Boolean).map((entry) => entry.id),
    collection: (state.capturedCollection || []).map((entry) => ({
      id: entry.id,
      name: monsterLabel(entry.monster),
      speciesId: entry.species.id,
      speciesName: entry.species.name,
      level: entry.monster.level,
      types: entry.species.types,
      stats: entry.monster.stats,
      totalStats: statTotal(entry.monster.stats),
      favorite: !!entry.favorite,
    })),
    species: CONTENT.species.map((species) => ({
      id: species.id,
      name: species.name,
      types: species.types,
      baseStats: species.baseStats,
      totalStats: statTotal(species.baseStats),
      generation: generationForSpecies(species),
    })),
  };
}

function renderCommandMenu(label, items) {
  const menuSlug = String(label || 'menu').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'menu';
  const panelId = `command-menu-panel-${menuSlug}`;
  return `
    <div class="command-menu command-menu-${escapeHtml(menuSlug)}" data-command-menu>
      <button class="command-menu-trigger" type="button" data-command-menu-trigger aria-expanded="false" aria-controls="${panelId}">
        <span class="command-menu-label">${escapeHtml(label)}</span>
        <span class="command-menu-count">${formatNumber(items.length)}</span>
      </button>
      <div class="command-menu-panel" id="${panelId}" data-command-menu-panel hidden>
        <div class="command-menu-panel-head">
          <p class="eyebrow">Quick Actions</p>
          <strong>${escapeHtml(label)} deck</strong>
          <span>${formatNumber(items.length)} shortcuts ready</span>
        </div>
        ${items.map((item) => `
          <a class="command-link tone-${escapeHtml(item.tone || 'default')}" href="${escapeHtml(item.href)}">
            <span class="command-link-icon" aria-hidden="true">${escapeHtml(item.glyph || item.label.slice(0, 2).toUpperCase())}</span>
            <span class="command-link-copy">
              <span class="command-link-topline">
                <strong>${escapeHtml(item.label)}</strong>
                <span class="command-link-tag">${escapeHtml(item.tag || 'Open')}</span>
              </span>
              <small>${escapeHtml(item.description)}</small>
            </span>
          </a>
        `).join('')}
        <div class="command-menu-foot">
          <span>Tap outside to close</span>
          <span>Built for quick mobile jumps</span>
        </div>
      </div>
    </div>
  `;
}

function hasDurableAccountStorage() {
  return Boolean(config.worldBackupKvRestUrl)
    || !process.env.VERCEL
    || (process.env.MOEMON_DB_PATH && !String(process.env.MOEMON_DB_PATH).startsWith('/tmp'));
}

function renderViewModePanel(scope = 'view-mode') {
  const safeScope = String(scope || 'view-mode').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'view-mode';
  const groupName = safeScope + '-view-mode';
  const options = [
    { value: 'auto', label: 'Auto', description: 'Follow the current screen size.' },
    { value: 'mobile', label: 'Mobile', description: 'Force a tighter 360dp-friendly fit.' },
    { value: 'desktop', label: 'Desktop', description: 'Keep the roomier PC spacing.' },
  ];
  return `
    <section class='panelish settings-card view-mode-card' data-view-mode-controls>
      <div class='card-top'>
        <div>
          <h2>Screen Fit</h2>
          <p class='muted'>If the page feels too large, too tight, or misaligned, switch the fit here.</p>
        </div>
        <span class='badge badge-default' data-view-mode-status>Auto</span>
      </div>
      <div class='settings-choice-grid view-mode-choice-grid'>
        ${options.map((entry, index) => `
          <label class='settings-choice view-mode-choice' data-view-mode-choice>
            <input
              type='radio'
              name='${escapeHtml(groupName)}'
              value='${escapeHtml(entry.value)}'
              data-view-mode-input
              ${index === 0 ? 'checked' : ''}
            />
            <strong>${escapeHtml(entry.label)}</strong>
            <span class='muted'>${escapeHtml(entry.description)}</span>
          </label>
        `).join('')}
      </div>
    </section>
  `;
}

function renderDeviceTransferImportPanel(mode = 'player') {
  const durableSaveStorage = hasDurableAccountStorage();
  return `
    <section class='panelish settings-card device-transfer-card' data-device-transfer-panel data-device-transfer-mode='${escapeHtml(mode)}'>
      <div class='card-top'>
        <div>
          <h2>Move From Another Device</h2>
          <p class='muted'>${escapeHtml(durableSaveStorage
            ? 'Normal login should work on any phone or PC here. If the live server copy is missing, paste a transfer code from the device that still has your account.'
            : 'This deployment can fall back to browser-only recovery. To move from phone to PC or PC to phone, paste the transfer code from the device that still has your account.')}</p>
        </div>
        ${badge(durableSaveStorage ? 'Cross-device ready' : 'Transfer code fallback', durableSaveStorage ? 'success' : 'warning')}
      </div>
      <label>
        <span>Transfer code</span>
        <textarea rows='6' data-device-transfer-input spellcheck='false' placeholder='Paste the account transfer code from your other device'></textarea>
      </label>
      <div class='button-row'>
        <button class='button accent' type='button' data-device-transfer-restore>Restore Here</button>
        <button class='button ghost' type='button' data-device-transfer-use-login>Fill Login</button>
      </div>
      <p class='muted device-transfer-status' data-device-transfer-status>${escapeHtml(durableSaveStorage
        ? 'Restore signs this browser in immediately. Use Fill Login if you want to keep your password flow.'
        : 'Copy the code on the old device, then restore it here so the new device can keep the account.')}</p>
    </section>
  `;
}

function renderDeviceTransferExportPanel() {
  const durableSaveStorage = hasDurableAccountStorage();
  return `
    <div class='device-transfer-export' data-device-transfer-export>
      <div class='card-top'>
        <div>
          <h3>Cross-device transfer code</h3>
          <p class='muted'>${escapeHtml(durableSaveStorage
            ? 'You can still log in with username or email plus password on other devices. This code is the backup path if the server copy ever disappears.'
            : 'Copy this from the device that still has your account, then paste it into the login page on the next device.')}</p>
        </div>
        ${badge(durableSaveStorage ? 'Backup fallback' : 'Move code', durableSaveStorage ? 'default' : 'warning')}
      </div>
      <label>
        <span>Transfer code</span>
        <textarea rows='6' readonly data-device-transfer-output spellcheck='false' placeholder='Open this page while signed in to generate a transfer code.'></textarea>
      </label>
      <div class='button-row'>
        <button class='button accent' type='button' data-device-transfer-copy>Copy Code</button>
        <button class='button ghost' type='button' data-device-transfer-select>Select Code</button>
      </div>
      <p class='muted device-transfer-status' data-device-transfer-export-status>Keep this private. Anyone with the code can restore this account.</p>
    </div>
  `;
}

function layout({ title, user, flash, body, wide = false, world = null }) {
  const worldState = world || getWorldState(user?.id || 0);
  const userSprite = user ? (CONTENT.playerSpriteMap.get(user.meta.avatarSlug) || CONTENT.playerSprites[0]) : null;
  const activeRun = user ? getRunSnapshot(user.id) : null;
  const pageSlug = String(title || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'page';
  const isAdminUser = user?.role === 'admin';
  const commandMenus = user ? [
    renderCommandMenu('Maps', [
      { label: 'Hub', href: '/hub', description: 'Main command deck, missions, and current activity.', glyph: 'HB', tag: 'Live', tone: 'maps' },
      { label: 'Maps', href: '/maps', description: 'Route searches, region boards, and world atlas tools.', glyph: 'MP', tag: 'Routes', tone: 'maps' },
      { label: 'News', href: '/news', description: 'Daily event rotation, spotlights, and notices.', glyph: 'NW', tag: 'Today', tone: 'maps' },
    ]),
    renderCommandMenu('Profile', [
      { label: 'Trainer Card', href: '/trainer-card', description: 'Classes, titles, missions, and overall trainer progress.', glyph: 'TC', tag: 'Stats', tone: 'profile' },
      { label: 'Settings', href: '/settings', description: 'Theme, controls, HUD, and player preferences.', glyph: 'ST', tag: 'UI', tone: 'profile' },
      { label: 'Social', href: '/social', description: 'Chat, ladder activity, and arena challenge feeds.', glyph: 'SO', tag: 'Chat', tone: 'profile' },
    ]),
    renderCommandMenu('Pokemon', [
      { label: 'Storage', href: '/collection', description: 'Party setup, summary tools, and box management.', glyph: 'PC', tag: 'Boxes', tone: 'pokemon' },
      { label: 'Builds', href: '/builds', description: 'Clear species guides with EV, IV, move, and item plans.', glyph: 'EV', tag: 'Guides', tone: 'pokemon' },
      { label: 'New Run', href: '/play/new', description: 'Start a draft or partner-style route climb.', glyph: 'GO', tag: 'Start', tone: 'pokemon' },
    ]),
    renderCommandMenu('Battle', [
      { label: 'Active Run', href: '/play', description: 'Resume your current wave, battle, or reward step.', glyph: 'AR', tag: 'Resume', tone: 'battle' },
      { label: 'Gyms', href: '/gyms', description: 'League badge routes and boss-oriented battles.', glyph: 'GY', tag: 'Boss', tone: 'battle' },
      { label: 'Mini Games', href: '/minigames', description: 'Arcade loops, reward tokens, and side progression.', glyph: 'MG', tag: 'Arcade', tone: 'battle' },
    ]),
    renderCommandMenu('Trade', [
      { label: 'Market', href: '/market', description: 'Permanent stash buys, gear, and account items.', glyph: 'MK', tag: 'Shop', tone: 'trade' },
      { label: 'Mini Games', href: '/minigames', description: 'Exchange tokens into rare upgrades and cosmetics.', glyph: 'TK', tag: 'Tokens', tone: 'trade' },
      { label: 'Collection', href: '/collection', description: 'Prep teams and held items before spending resources.', glyph: 'PR', tag: 'Prep', tone: 'trade' },
    ]),
    renderCommandMenu('Misc', [
      { label: 'News', href: '/news', description: 'Keep up with rotating bosses, routes, and world effects.', glyph: 'FX', tag: 'World', tone: 'misc' },
      { label: 'Settings', href: '/settings', description: 'Tweak the presentation so the game feels easier to parse.', glyph: 'UI', tag: 'Tune', tone: 'misc' },
      { label: 'Events', href: '/events', description: 'See limited banners, RNG catches, save status, and live rotations.', glyph: 'EV', tag: 'Live', tone: 'misc' },
      ...(isAdminUser
        ? [{ label: 'Admin', href: '/admin', description: 'Moderation, grants, and account-side game controls.', glyph: 'AD', tag: 'Tools', tone: 'misc' }]
        : []),
    ]),
  ].join('') : '';
  const publicLinks = [
    ['Login', '/login'],
    ['Register', '/register'],
    ['Reset', '/forgot-password'],
  ];
  const publicNav = publicLinks.map(([label, href]) => `<a href="${href}">${escapeHtml(label)}</a>`).join('');
  const mobileDock = user ? `
    <nav class="mobile-command-dock" aria-label="Quick navigation">
      <a class="mobile-command-link mobile-command-hub" href="/hub">Hub</a>
      <a class="mobile-command-link mobile-command-profile" href="/trainer-card">Profile</a>
      <a class="mobile-command-link mobile-command-pokemon" href="/collection">Pokemon</a>
      <a class="mobile-command-link mobile-command-battle" href="/play">Battle</a>
      <a class="mobile-command-link mobile-command-trade" href="/market">Trade</a>
    </nav>
  ` : '';
  const deviceSavePayload = user ? createSignedDeviceSave(user.id) : null;
  const deviceSaveScript = deviceSavePayload ? `
      <script id="moemon-device-save" type="application/json">${serializeJsonForHtml(deviceSavePayload)}</script>
  ` : '';
  const durableSaveStorage = hasDurableAccountStorage();
  const commandStatus = user ? `
    <div class="command-status panelish">
      ${renderSpriteAvatar(userSprite, { large: true })}
      <div class="command-status-copy">
        <strong>${escapeHtml(user.username)}</strong>
        <span>${money(user.cash)} saved</span>
        <span>${escapeHtml(worldState.phaseLabel)} in ${escapeHtml(worldState.activeRegion.name)}</span>
      </div>
      <form method="post" action="/logout" class="inline-form">
        <button class="button danger command-logout" type="submit">Logout</button>
      </form>
    </div>
  ` : '';
  const mobileQuickTray = user ? `
    <section class="mobile-quick-tray" aria-label="Fast mobile actions">
      <a class="mobile-quick-card tone-battle" href="${activeRun ? '/play' : '/play/new'}">
        <strong>${activeRun ? 'Resume Run' : 'Start Run'}</strong>
        <small>${activeRun ? 'Continue the current wave fast.' : 'Launch a fresh climb.'}</small>
      </a>
      <a class="mobile-quick-card tone-profile" href="/trainer-card">
        <strong>Missions</strong>
        <small>Trainer goals, class progress, and rewards.</small>
      </a>
      <a class="mobile-quick-card tone-pokemon" href="/collection">
        <strong>Storage</strong>
        <small>Party, boxes, items, and rebuild tools.</small>
      </a>
      <a class="mobile-quick-card tone-trade" href="/minigames">
        <strong>Arcade</strong>
        <small>Tokens, jackpots, and reward redemptions.</small>
      </a>
      <a class="mobile-quick-card tone-maps" href="/events">
        <strong>Save Status</strong>
        <small>${durableSaveStorage ? 'Durable save is active.' : 'Browser backup is your safety net.'}</small>
      </a>
    </section>
  ` : '';
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>${escapeHtml(title)} | Moemon Arena</title>
      <link rel="stylesheet" href="/public/styles.css" />
      <script src="/public/app.js" defer></script>
    </head>
    <body class="phase-${escapeHtml(worldState.phase)} hud-${escapeHtml(user?.meta?.hudMode || 'cozy')} motion-${escapeHtml(user?.meta?.motionMode || 'full')} theme-${escapeHtml(user?.meta?.displayTheme || 'pokemon')} color-${escapeHtml(user?.meta?.colorMode || 'dark')} font-${escapeHtml(user?.meta?.fontMode || 'pixel')} page-${escapeHtml(pageSlug)} ${user ? 'signed-in-shell' : 'signed-out-shell'}">
      <div class="page-shell ${wide ? 'wide' : ''}">
        <header class="topbar ${user ? 'topbar-command' : 'topbar-public'}">
          <div class="topbar-brand">
            <a class="brand" href="${user ? '/hub' : '/'}">Moemon Arena</a>
            <p class="brand-sub">${escapeHtml(worldState.phaseLabel)} over ${escapeHtml(worldState.activeRegion.name)}. ${escapeHtml(worldState.event.effect)}</p>
          </div>
          ${user ? commandStatus : `<nav class="topnav auth-topnav">${publicNav}</nav>`}
          ${user ? `<nav class="topnav command-bar" aria-label="Primary command bar">${commandMenus}</nav>` : ''}
          ${mobileQuickTray}
        </header>
        <section class="world-marquee panelish">
          <p class="world-marquee-ribbon">Live event relay: ${escapeHtml(worldState.event.label)}</p>
          <div class="world-marquee-main">
            <div>
              <strong>${escapeHtml(worldState.event.label)}</strong>
              <p class="muted">Daily boss: ${escapeHtml(worldState.dailyBoss?.name || 'Astravault Omega')} - Market rotation resets in ${escapeHtml(formatTimerMinutes(worldState.marketRotation.minutesRemaining))}</p>
            </div>
            <div class="badge-row">
              ${badge(worldState.phaseLabel, worldState.phase === 'night' ? 'ghost' : worldState.phase === 'dawn' || worldState.phase === 'dusk' ? 'warning' : 'success')}
              ${badge(worldState.activeRegion.name, 'default')}
            </div>
          </div>
        </section>
        ${flash ? `<div class="flash flash-${escapeHtml(flash.level || 'info')}">${escapeHtml(flash.message)}</div>` : ''}
        <main>${body}</main>
      </div>
      ${mobileDock}
      ${deviceSaveScript}
    </body>
  </html>`;
}

function authCard(title, intro, fields, footer = '', restoreSlotAttributes = '') {
  return `
    <section class="auth-card panel">
      <h1>${escapeHtml(title)}</h1>
      <p class="muted">${escapeHtml(intro)}</p>
      ${fields}
      <div class="device-restore-slot" data-device-restore-slot ${restoreSlotAttributes} hidden></div>
      ${footer}
    </section>
  `;
}

function renderLanding() {
  const challenges = CONTENT.challenges.map((challenge) => `
    <article class="panelish landing-challenge-card">
      <div class="card-top">
        <div>
          <h3>${escapeHtml(challenge.name)}</h3>
          <p class="muted">${escapeHtml(challenge.description)}</p>
        </div>
        ${badge('Rule', 'default')}
      </div>
    </article>`).join('');
  return `
    <section class="hero panel hero-panel landing-hero-panel">
      <div class="hero-copy landing-hero-copy">
        <p class="eyebrow">Playable foundation</p>
        <h1>Build runs, collect monsters, push endless, and manage the whole ecosystem.</h1>
        <p class="lead">Moemon Arena is a full-stack browser game foundation inspired by PokeRogue's progression flow: starter drafting, wave battles, between-wave rewards, a live shop, persistent accounts, saveable runs, collection storage, and admin controls.</p>
        <div class="hero-actions">
          <a class="button primary" href="/register">Create Account</a>
          <a class="button ghost" href="/login">Player Login</a>
          <a class="button warning" href="/admin-login">Admin Login</a>
          <a class="button accent" href="#landing-loop">See Core Loop</a>
        </div>
        <div class="badge-row landing-chip-row">
          ${badge('Persistent accounts', 'success')}
          ${badge('Trainer classes', 'warning')}
          ${badge('Mission board', 'default')}
          ${badge('Build guides', 'electric')}
        </div>
      </div>
      <div class="landing-hero-stack">
        <article class="panelish landing-spotlight-card">
          <p class="eyebrow">What You Manage</p>
          <h2>One clean game hub for runs, storage, builds, and progression.</h2>
          <p class="muted">The landing page now frames the same systems more clearly instead of throwing everything into plain blocks.</p>
        </article>
        <div class="hero-stats landing-hero-stats">
          <div class="stat-card"><strong>${formatNumber(CONTENT.species.length)}</strong><span>monsters generated</span></div>
          <div class="stat-card"><strong>${formatNumber(CONTENT.moves.length)}</strong><span>moves generated</span></div>
          <div class="stat-card"><strong>3</strong><span>run modes</span></div>
          <div class="stat-card"><strong>${formatNumber(CONTENT.challenges.length)}</strong><span>challenge rules</span></div>
        </div>
      </div>
    </section>
    <section class="landing-feature-strip">
      <article class="panelish landing-feature-card">
        <p class="eyebrow">Starter Draft</p>
        <h3>Draft under a cap</h3>
        <p class="muted">Choose starters under cost rules, then build your route from there.</p>
      </article>
      <article class="panelish landing-feature-card">
        <p class="eyebrow">Persistent Storage</p>
        <h3>Grow the long-term box</h3>
        <p class="muted">Caught monsters stay with your account so each run feeds the next.</p>
      </article>
      <article class="panelish landing-feature-card">
        <p class="eyebrow">Build Preview</p>
        <h3>Guides for every species</h3>
        <p class="muted">Preview roles, nature picks, items, and move paths without leaving the site.</p>
      </article>
      <article class="panelish landing-feature-card">
        <p class="eyebrow">Live Systems</p>
        <h3>Market, missions, socials</h3>
        <p class="muted">Between-run systems are visible up front so the whole game feels connected.</p>
      </article>
    </section>
    <section class="grid-two landing-story-grid" id="landing-loop">
      <article class="panel landing-panel">
        <p class="eyebrow">Core Loop</p>
        <h2>What a run feels like</h2>
        <ul class="clean-list">
          <li>Select starters under a run cost cap.</li>
          <li>Battle through wilds, trainers, and bosses.</li>
          <li>Spend wave cash in the shop between encounters.</li>
          <li>Capture new monsters and grow your persistent storage.</li>
        </ul>
      </article>
      <article class="panel landing-panel">
        <p class="eyebrow">Modes</p>
        <h2>How the pressure scales</h2>
        <ul class="clean-list">
          <li><strong>Classic</strong>: 30-wave run with boss checkpoints.</li>
          <li><strong>Endless</strong>: scaling wave climb after a classic clear.</li>
          <li><strong>Challenge</strong>: modifier-driven runs with altered rules.</li>
        </ul>
      </article>
    </section>
    <section class="panel landing-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Challenge Deck</p>
          <h2>Extra rules that change the rhythm</h2>
          <p class="muted">Your original challenge list is still here, just presented as a cleaner preview deck.</p>
        </div>
        ${badge(`${formatNumber(CONTENT.challenges.length)} rules`, 'warning')}
      </div>
      <div class="grid-three landing-challenge-grid">${challenges}</div>
    </section>
  `;
}

function renderProfileHeader(state) {
  const user = state.user;
  const trainer = trainerSnapshot(state);
  const progression = state.progression || { profile: { level: 1, expIntoLevel: 0, expForNextLevel: 1 }, progressPercent: 0, selectedTitle: { name: 'Rookie Tamer' }, activeClass: { name: 'Collector' }, winRate: 0, totalRuns: 0 };
  const userSprite = CONTENT.playerSpriteMap.get(user.meta.avatarSlug) || CONTENT.playerSprites[0];
  const modes = user.meta.unlockedModes.map((mode) => badge(mode)).join(' ');
  const gymWins = user.meta.gymWins || {};
  const badgeLeagues = CONTENT.gymLeagues.map((league) => ({
    name: league.name,
    ownedBadges: league.leaders.filter((leader) => gymWins[`${league.slug}-leader-${leader.slug}`]),
    totalBadges: league.leaders.length,
  }));
  const totalBadges = badgeLeagues.reduce((sum, league) => sum + league.ownedBadges.length, 0);
  const badgeCards = badgeLeagues.map((league) => `
    <article class="panelish badge-collector-card">
      <div class="card-top">
        <h3>${escapeHtml(league.name)}</h3>
        ${badge(`${formatNumber(league.ownedBadges.length)}/${formatNumber(league.totalBadges)}`, league.ownedBadges.length ? 'success' : 'default')}
      </div>
      <div class="badge-row compact-row">
        ${league.ownedBadges.length
          ? league.ownedBadges.map((entry) => badge(entry.badgeName, entry.type)).join(' ')
          : badge('No badges yet', 'default')}
      </div>
    </article>
  `).join('');
  const achievementBadges = trainer.achievements.map((entry) => badge(entry.label, entry.unlocked ? 'success' : 'default')).join(' ');
  const shortcutLinks = [
    { label: 'Trainer Card', href: '/trainer-card', summary: 'Classes, titles, missions, and overall trainer progression.' },
    { label: 'Storage', href: '/collection', summary: 'Party slots, PC boxes, summary tools, and move changes.' },
    { label: 'Maps', href: '/maps', summary: 'Route searches, live world boards, and encounter chains.' },
    { label: 'Builds', href: '/builds', summary: 'Species builds with clearer EV, IV, and move guidance.' },
    { label: 'Settings', href: '/settings', summary: 'Tune the HUD, motion, colors, and layout readability.' },
    { label: 'Social', href: '/social', summary: 'Chat boards, online activity, and challenge traffic.' },
  ].map((entry) => `
    <a class="profile-shortcut-link" href="${escapeHtml(entry.href)}">
      <strong>${escapeHtml(entry.label)}</strong>
      <span>${escapeHtml(entry.summary)}</span>
    </a>
  `).join('');
  return `
    <section class="panel profile-panel stack">
      <div class="grid-two profile-command-grid">
        <article class="panelish profile-identity-card">
          <div class="profile-identity-head">
            ${renderSpriteAvatar(userSprite, { large: true })}
            <div>
              <p class="eyebrow">Commander profile</p>
              <h1>${escapeHtml(user.username)}</h1>
              <p class="muted">${escapeHtml(user.email)} - ${escapeHtml(user.role)}</p>
            </div>
          </div>
          <div class="badge-row compact-row">${modes} ${badge(`${trainer.favoriteType} trainer`, 'default')} ${badge(progression.selectedTitle?.name || 'Rookie Tamer', 'warning')} ${badge(progression.activeClass?.name || 'Collector', 'success')}</div>
          ${renderProgressMeter(progression.progressPercent || 0, `${formatNumber(progression.profile?.expIntoLevel || 0)} / ${formatNumber(progression.profile?.expForNextLevel || 1)} EXP to next level`)}
          <p class="muted gap-top">Trainer level ${formatNumber(progression.profile?.level || 1)} - ${formatNumber(progression.winRate || 0)}% win rate across ${formatNumber(progression.totalRuns || 0)} runs.</p>
        </article>
        <article class="panelish profile-shortcuts-card">
          <p class="eyebrow">Quick access</p>
          <h2>Command shortcuts</h2>
          <p class="muted">The profile board now doubles as a cleaner command menu so the important parts of the game are easier to find without hunting through dense pages.</p>
          <div class="profile-shortcut-grid">${shortcutLinks}</div>
        </article>
      </div>
      <div class="profile-economy">
        <div class="stat-card"><strong>${money(user.cash)}</strong><span>account cash</span></div>
        <div class="stat-card"><strong>${formatNumber(trainer.caughtCount)}</strong><span>pokemon caught</span></div>
        <div class="stat-card"><strong>${formatNumber(trainer.battleWins)}</strong><span>battles won</span></div>
        <div class="stat-card"><strong>Lv ${formatNumber(progression.profile?.level || 1)}</strong><span>trainer level</span></div>
      </div>
      <div class="grid-two">
        <article class="panelish">
          <p class="eyebrow">Trainer card</p>
          <h2>Seen vs. caught</h2>
          <div class="badge-row compact-row">
            ${badge(`${formatNumber(trainer.seenCount)} seen`, trainer.seenCount ? 'default' : 'warning')}
            ${badge(`${formatNumber(trainer.caughtCount)} caught`, trainer.caughtCount ? 'success' : 'warning')}
            ${badge(`${formatNumber(trainer.favoriteCount)} favorites`, trainer.favoriteCount ? 'warning' : 'default')}
            ${badge(`${formatNumber(totalBadges)} badges`, totalBadges ? 'warning' : 'default')}
          </div>
          <p class="muted gap-top">Roster growth, run history, and long-term trainer identity live together here now, so the board reads more like a useful profile and less like a stat dump.</p>
          <div class="badge-row compact-row gap-top">${achievementBadges}</div>
        </article>
        <article class="panelish">
          <p class="eyebrow">League progress</p>
          <h2>Badge overview</h2>
          <p class="muted">Keep every league visible from the hub while you prepare teams for routes, gyms, arena scrims, and late-game rebuilds.</p>
          <div class="badge-row compact-row gap-top">${badge(`${formatNumber(totalBadges)} collected`, totalBadges ? 'warning' : 'default')}</div>
        </article>
      </div>
      <div class="badge-collector">
        <div class="section-head">
          <div>
            <p class="eyebrow">Badge collector</p>
            <h2>League progress</h2>
            <p class="muted">Check every badge you already own without leaving the hub command board.</p>
          </div>
          ${badge(`${formatNumber(totalBadges)} collected`, totalBadges ? 'warning' : 'default')}
        </div>
        <div class="grid-three">${badgeCards}</div>
      </div>
    </section>
  `;
}

function renderWorldBoard(world) {
  const regionCards = world.regions.map((region) => `
    <article class="region-card ${region.unlocked ? '' : 'is-locked'}">
      <div class="card-top">
        <h3>${escapeHtml(region.name)}</h3>
        ${badge(region.weatherNow || 'clear', region.weatherNow === 'rain' ? 'water' : region.weatherNow === 'fog' ? 'ghost' : 'success')}
      </div>
      <p class="muted">${escapeHtml(region.flavor)}</p>
      <div class="badge-row compact-row">
        ${region.preferredTypes.map((type) => badge(type, type)).join(' ')}
      </div>
      <p class="muted">${region.unlocked ? `${escapeHtml(region.npcTitle)} roam this route.` : `Unlocks around wave ${formatNumber(region.unlockWave)}.`}</p>
    </article>
  `).join('');
  return `
    <section class="panel" id="world-board">
      <div class="section-head">
        <div>
          <p class="eyebrow">Living World</p>
          <h2>Map Regions</h2>
          <p class="muted">${escapeHtml(world.event.label)} ${escapeHtml(world.activeRegion.flavor)}</p>
        </div>
        <div class="badge-row">
          ${badge(world.phaseLabel, world.phase === 'night' ? 'ghost' : 'warning')}
          ${badge(world.activeRegion.name, 'success')}
        </div>
      </div>
      <div class="region-grid">${regionCards}</div>
    </section>
  `;
}

function mapSearchChanceRatioLabel(chance) {
  const value = Number(chance || 0);
  if (!Number.isFinite(value) || value <= 0) {
    return 'Standby';
  }
  return `1 in ${formatNumber(Math.max(1, Math.round(1 / value)))}`;
}

function mapSearchToneForSpecies(species) {
  const primaryType = species?.types?.[0] || 'normal';
  if (['legendary', 'mythic'].includes(species?.rarity)) {
    return 'psychic';
  }
  if (species?.rarity === 'rare') {
    return 'warning';
  }
  if (['water', 'ice'].includes(primaryType)) {
    return 'water';
  }
  if (['grass', 'bug', 'fairy'].includes(primaryType)) {
    return 'success';
  }
  return 'default';
}

function renderMapSearchFeaturedSignal(species) {
  const safeSpecies = CONTENT.speciesMap.get(species.id) || species;
  return `
    <article class="map-search-featured-signal tone-${escapeHtml(mapSearchToneForSpecies(safeSpecies))}">
      ${renderMonsterPortrait(safeSpecies, { small: true, caption: `${titleLabel(safeSpecies.rarity || 'common')} signal` })}
      <strong>${escapeHtml(safeSpecies.name)}</strong>
      <small>${escapeHtml(safeSpecies.biome || 'Unknown biome')}</small>
    </article>
  `;
}

function renderMapSearchScene(region, searchBoard) {
  if (!searchBoard) {
    return '';
  }
  const category = region?.category || 'default';
  const weatherLabel = titleLabel(region?.weatherNow || 'clear');
  const biomeLabels = (region?.biomeHints?.length ? region.biomeHints : [searchBoard.biome || region?.name || 'Unknown route']).slice(0, 3);
  const markers = (searchBoard.featuredSightings || []).slice(0, 4).map((species, index) => {
    const initials = String(species.name || '??').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || '??';
    return `
      <div class="map-search-scene-marker is-${index + 1} tone-${escapeHtml(mapSearchToneForSpecies(species))}">
        <span>${escapeHtml(initials)}</span>
      </div>
    `;
  }).join('');
  return `
    <section class="map-search-scene-shell theme-${escapeHtml(category)}">
      <div class="map-search-scene-topline">
        <strong>${escapeHtml(searchBoard.searchMomentum || searchBoard.personalityLabel || 'Adventure Route')}</strong>
        <span>${escapeHtml(weatherLabel)} weather</span>
      </div>
      <div class="map-search-scene" aria-hidden="true">
        <div class="map-search-scene-layer layer-water"></div>
        <div class="map-search-scene-layer layer-path"></div>
        <div class="map-search-scene-layer layer-grove"></div>
        <div class="map-search-scene-layer layer-landmark"></div>
        <div class="map-search-scene-layer layer-signal"></div>
        ${markers}
        <div class="map-search-scene-scout">YOU</div>
        <div class="map-search-scene-hotspot">${escapeHtml(searchBoard.pendingEncounter ? 'LIVE' : 'SCAN')}</div>
      </div>
      <div class="map-search-scene-labels">
        ${biomeLabels.map((label) => `<span>${escapeHtml(label)}</span>`).join('')}
      </div>
    </section>
  `;
}

function renderMaps(state) {
  const searchBoard = state.searchBoard || null;
  const regionGroupMeta = [
    { slug: 'sanctuary', title: 'Sanctuary Fields', summary: 'Wish gardens, lakes, and mythic refuge routes.' },
    { slug: 'ruins', title: 'Ancient Ruins', summary: 'Temples, palaces, and relic-heavy legendary boards.' },
    { slug: 'peak', title: 'Peaks & Towers', summary: 'Mountain climbs, towers, and sky pressure routes.' },
    { slug: 'depths', title: 'Depths & Caverns', summary: 'Harder cave boards with heavier enemy scaling.' },
    { slug: 'island', title: 'Island Routes', summary: 'Remote island circuits with low-RNG drops and rarer sightings.' },
  ];
  const selectedRegion = state.regions.find((region) => region.selected) || state.regions.find((region) => region.unlocked) || state.regions[0] || null;
  const searchBoardRegion = searchBoard ? state.regions.find((region) => region.slug === searchBoard.regionSlug) || selectedRegion || null : null;
  const renderRegionActions = (region, options = {}) => {
    if (!region) {
      return '';
    }
    return `
      <div class="action-strip gap-top ${options.compact ? 'compact-row' : ''}">
        <form method="post" action="/maps/select" class="inline-form">
          <input type="hidden" name="regionSlug" value="${escapeHtml(region.slug)}" />
          <button class="button ghost" type="submit" ${region.unlocked ? '' : 'disabled'}>${region.selected ? 'Selected' : 'Set Active'}</button>
        </form>
        ${region.adventureModes.map((mode) => `
          <form method="post" action="/maps/adventure" class="inline-form">
            <input type="hidden" name="regionSlug" value="${escapeHtml(region.slug)}" />
            <input type="hidden" name="adventureMode" value="${escapeHtml(mode.slug)}" />
            <button class="button ${mode.slug === 'wild' ? 'accent' : mode.slug === 'boss' ? 'primary' : 'ghost'}" type="submit" ${mode.available ? '' : 'disabled'}>${escapeHtml(mode.label)}</button>
          </form>
        `).join('')}
      </div>
    `;
  };
  const featuredSignals = (searchBoard?.featuredSightings || []).map((species) => renderMapSearchFeaturedSignal(species)).join('');
  const encounterRatio = searchBoard ? mapSearchChanceRatioLabel(searchBoard.encounterChance) : '';
  const rareRatio = searchBoard ? mapSearchChanceRatioLabel(searchBoard.rareChance) : '';
  const legendRatio = searchBoard?.legendaryChance ? mapSearchChanceRatioLabel(searchBoard.legendaryChance) : 'Legends asleep';
  const legendSignalLabel = legendRatio === 'Legends asleep' ? legendRatio : `${legendRatio} legendary`;
  const routeAdventureLog = searchBoard?.adventureLog?.length
    ? searchBoard.adventureLog.map((entry) => `<li class="map-log-row tone-${escapeHtml(entry.tone || 'default')}"><span>${escapeHtml(entry.text)}</span><small class="muted">${escapeHtml(formatDateTime(entry.at))}</small></li>`).join('')
    : '<li class="map-log-row"><span>No route events logged yet.</span></li>';
  const routeStory = (searchBoard?.storySteps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join('');
  const rewardSummary = [
    searchBoard?.lastItemReward ? `${searchBoard.lastItemReward.itemName} x${formatNumber(searchBoard.lastItemReward.quantity || 1)}` : '',
    searchBoard?.lastCashGain ? `${formatNumber(searchBoard.lastCashGain)} credits` : '',
    searchBoard?.lastTrainerExpGain ? `+${formatNumber(searchBoard.lastTrainerExpGain)} Trainer EXP` : '',
    searchBoard?.lastExpGain ? `+${formatNumber(searchBoard.lastExpGain)} Map EXP` : '',
  ].filter(Boolean).join(' | ');
  const radioLog = state.activityLog.length
    ? state.activityLog.map((entry) => `<li>${escapeHtml(entry.text)} <span class="muted">${escapeHtml(formatDateTime(entry.at))}</span></li>`).join('')
    : '<li>No route activity yet.</li>';
  const routeChat = state.chatPreview?.length
    ? renderChatMessages(state.chatPreview, state.user.id)
    : '<p class="muted">Global route radio is quiet right now.</p>';
  const renderRegionCard = (region) => `
    <article class="region-card map-region-card ${region.unlocked ? '' : 'is-locked'} ${region.selected ? 'is-selected' : ''}">
      <div class="card-top">
        <div>
          <h3>${escapeHtml(region.name)}</h3>
          <p class="muted">${escapeHtml(region.flavor)}</p>
        </div>
        <div class="badge-row compact-row">
          ${badge(region.categoryLabel || 'Region', region.categoryTone || 'default')}
          ${badge(region.weatherNow || 'clear', region.weatherNow === 'rain' ? 'water' : region.weatherNow === 'fog' ? 'ghost' : 'success')}
        </div>
      </div>
      <div class="badge-row compact-row">
        ${region.preferredTypes.map((type) => badge(type, type)).join(' ')}
        ${badge(region.searchMood || 'Adventure Route', region.categoryTone || 'default')}
        ${badge(`Chain x${formatNumber(region.chain || 0)}`, region.chain ? 'success' : 'default')}
        ${badge(`${formatNumber(region.rareMeter || 0)}% rare`, 'warning')}
      </div>
      <p class="muted">${region.unlocked ? `${escapeHtml(region.npcTitle)} roam this zone and routes scale around Lv ${formatNumber(region.routeLevel)}.` : `Unlocks around wave ${formatNumber(region.unlockWave)}.`}</p>
      ${renderRegionActions(region)}
    </article>
  `;
  const regionCards = state.regions.map((region) => renderRegionCard(region)).join('');
  const groupedRegionCards = regionGroupMeta.map((group) => {
    const groupRegions = state.regions.filter((region) => region.category === group.slug);
    if (!groupRegions.length) {
      return '';
    }
    return `
      <article class="panelish gap-top">
        <div class="section-head">
          <div>
            <h2>${escapeHtml(group.title)}</h2>
            <p class="muted">${escapeHtml(group.summary)}</p>
          </div>
          ${badge(`${formatNumber(groupRegions.length)} areas`, 'default')}
        </div>
        <div class="region-grid">${groupRegions.map((region) => renderRegionCard(region)).join('')}</div>
      </article>
    `;
  }).join('');
  const atlasTiles = regionGroupMeta.map((group) => {
    const groupRegions = state.regions.filter((region) => region.category === group.slug);
    if (!groupRegions.length) {
      return '';
    }
    const unlockedCount = groupRegions.filter((region) => region.unlocked).length;
    const selected = groupRegions.some((region) => region.selected);
    return `
      <article class="map-atlas-tile ${selected ? 'is-active' : ''}">
        <strong>${escapeHtml(group.title)}</strong>
        <span>${formatNumber(groupRegions.length)} areas</span>
        <small>${escapeHtml(group.summary)}</small>
        <div class="badge-row compact-row">
          ${badge(`${formatNumber(unlockedCount)} unlocked`, unlockedCount ? 'success' : 'default')}
          ${badge(selected ? 'Active route inside' : 'Standby', selected ? 'warning' : 'default')}
        </div>
      </article>
    `;
  }).join('');
  return `
    <section class="panel map-page-shell">
      <div class="section-head map-page-head">
        <div>
          <p class="eyebrow">Adventure board</p>
          <h1>Maps</h1>
          <p class="muted">The map flow is reorganized into a clearer route console, atlas panel, search board, and archive so it feels closer to an actual browser RPG board instead of a stack of generic cards.</p>
        </div>
        <div class="badge-row">
          ${badge(state.world.phaseLabel, state.world.phase === 'night' ? 'ghost' : 'warning')}
          ${badge(state.world.activeRegion.name, 'success')}
          ${badge(state.world.event.label, 'default')}
        </div>
      </div>
      <section class="grid-two map-command-grid">
        <article class="panelish map-command-card">
          <p class="eyebrow">Route console</p>
          <h2>${escapeHtml(selectedRegion?.name || state.world.activeRegion.name)}</h2>
          <p class="muted">${escapeHtml(selectedRegion?.flavor || state.world.activeRegion.flavor || 'Set an active region to start planning searches.')}</p>
          <div class="badge-row compact-row">
            ${(selectedRegion?.preferredTypes || []).map((type) => badge(type, type)).join(' ')}
            ${selectedRegion ? badge(selectedRegion.weatherNow || 'clear', selectedRegion.weatherNow === 'rain' ? 'water' : selectedRegion.weatherNow === 'fog' ? 'ghost' : 'success') : ''}
            ${selectedRegion ? badge(`${formatNumber(selectedRegion.rareMeter || 0)}% rare`, 'warning') : ''}
            ${selectedRegion ? badge(`Chain x${formatNumber(selectedRegion.chain || 0)}`, selectedRegion.chain ? 'success' : 'default') : ''}
          </div>
          <div class="summary-facts gap-top">
            <p><strong>Route level:</strong> ${formatNumber(selectedRegion?.routeLevel || 0)} &middot; ${escapeHtml(selectedRegion?.searchMood || 'Adventure Route')}</p>
            <p><strong>Route guide:</strong> ${escapeHtml(selectedRegion?.npcTitle || 'Scouts are rotating in')}</p>
            <p><strong>Status:</strong> ${selectedRegion?.unlocked ? 'Unlocked and playable now.' : `Unlocks around wave ${formatNumber(selectedRegion?.unlockWave || 0)}.`}</p>
          </div>
          ${selectedRegion ? renderRegionActions(selectedRegion) : ''}
          <div class="button-row gap-top">
            ${searchBoard ? '<a class="button accent" href="#map-search-console">Open search console</a>' : '<a class="button accent" href="#adventure-routes">Jump to route list</a>'}
            <a class="button ghost" href="#route-archive">Browse route archive</a>
          </div>
        </article>
        <article class="panelish map-atlas-card">
          <div class="section-head">
            <div>
              <p class="eyebrow">Atlas board</p>
              <h2>Region categories</h2>
              <p class="muted">These grouped tiles make the world easier to scan before you dive into the full archive below.</p>
            </div>
            ${badge(`${formatNumber(state.regions.filter((region) => region.unlocked).length)} unlocked`, 'success')}
          </div>
          <div class="map-atlas-grid">${atlasTiles}</div>
        </article>
      </section>
      ${renderWorldBoard(state.world)}
      ${searchBoard ? `
        <section class="grid-two summary-grid gap-top" id="map-search-console">
          <article class="panelish map-search-board retro-route-board">
            <div class="map-search-arcade-frame">
              <div class="map-search-arcade-titlebar">
                <strong>${escapeHtml(searchBoard.regionName)}</strong>
                <span>${escapeHtml(searchBoard.personalityLabel || 'Adventure Route')}</span>
              </div>
              <div class="map-search-arcade-subhead">Special Pokemon</div>
              <div class="map-search-featured-row">${featuredSignals || '<p class="muted map-search-empty-note">Special sightings will fill in as this board rotates.</p>'}</div>
              <div class="map-search-scoreboard">
                <div class="map-search-score-row">
                  <span>Current Chances</span>
                  <strong>${escapeHtml(encounterRatio)} encounter</strong>
                  <small>${escapeHtml(searchBoard.currentChanceLabel)}</small>
                </div>
                <div class="map-search-score-row">
                  <span>Rare Signal</span>
                  <strong>${escapeHtml(rareRatio)} rare</strong>
                  <small>${escapeHtml(searchBoard.currentRareLabel)} / ${escapeHtml(legendSignalLabel)}</small>
                </div>
                <div class="map-search-score-row map-search-score-row--level">
                  <span>Map Level</span>
                  <div class="map-search-score-progress">
                    <strong>Lv ${formatNumber(searchBoard.mapLevel)}</strong>
                    <div class="map-search-level-track"><span style="width:${Math.max(8, searchBoard.expPercent || 0)}%"></span></div>
                  </div>
                  <small>${formatNumber(searchBoard.expIntoLevel || 0)} / ${formatNumber(searchBoard.expForNextLevel || 1)} Map EXP</small>
                </div>
                <div class="map-search-score-row">
                  <span>Total Searches</span>
                  <strong>${formatNumber(searchBoard.totalSearches)}</strong>
                  <small>Best chain ${formatNumber(searchBoard.bestChain || 0)} / ${escapeHtml(searchBoard.chainLabel || 'Chain cold')}</small>
                </div>
                <div class="map-search-score-row">
                  <span>Last Encounter</span>
                  <strong>${escapeHtml(searchBoard.lastEncounter || 'None logged yet')}</strong>
                  <small>${escapeHtml(searchBoard.biome)} / ${escapeHtml(searchBoard.searchMomentum || '')}</small>
                </div>
              </div>
              ${renderMapSearchScene(searchBoardRegion, searchBoard)}
              <div class="button-row gap-top map-search-action-row">
                <form method="post" action="/maps/search" class="inline-form">
                  <input type="hidden" name="action" value="search" />
                  <input type="hidden" name="regionSlug" value="${escapeHtml(searchBoard.regionSlug)}" />
                  <button class="button primary" type="submit" ${searchBoard.pendingEncounter || searchBoard.runLocked ? 'disabled' : ''}>Search Adventure</button>
                </form>
                ${searchBoard.pendingEncounter ? `
                  <form method="post" action="/maps/search" class="inline-form">
                    <input type="hidden" name="action" value="battle" />
                    <input type="hidden" name="regionSlug" value="${escapeHtml(searchBoard.regionSlug)}" />
                    <button class="button accent" type="submit">Battle ${escapeHtml(searchBoard.pendingEncounter.species.name)}</button>
                  </form>
                  <form method="post" action="/maps/search" class="inline-form">
                    <input type="hidden" name="action" value="flee" />
                    <input type="hidden" name="regionSlug" value="${escapeHtml(searchBoard.regionSlug)}" />
                    <button class="button ghost" type="submit">Release Signal</button>
                  </form>
                ` : ''}
              </div>
              ${searchBoard.runLocked ? '<p class="muted gap-top map-search-lock-note">Finish your current run before launching another route event.</p>' : ''}
              <div class="map-search-result tone-${escapeHtml(searchBoard.lastResultTone || 'default')} gap-top" data-search-story-result>
                <strong>${escapeHtml(searchBoard.pendingEncounter?.species?.name || searchBoard.lastRewardLabel || 'Route sweep complete')}</strong>
                <span>${escapeHtml(searchBoard.lastResult || '')}</span>
                ${searchBoard.lastRewardDetail ? `<small>${escapeHtml(searchBoard.lastRewardDetail)}</small>` : ''}
              </div>
              <p class="map-search-reward-summary">${escapeHtml(rewardSummary || 'Every route search now grants map progress and can trigger real side rewards even without a battle.')}</p>
              <div class="grid-two compact-grid map-search-detail-grid gap-top">
                <article class="panelish map-search-story-card" data-search-story ${searchBoard.storyFresh ? 'data-search-story-fresh="true"' : ''}>
                  <div class="section-head">
                    <div>
                      <h3>Search story</h3>
                      <p class="muted">Each scan now plays out like a route beat instead of a plain result line.</p>
                    </div>
                    ${badge(searchBoard.lastRewardLabel || 'Route sweep', searchBoard.lastRewardTone || 'default')}
                  </div>
                  <ol class="clean-list map-search-story-list" data-search-story-list>${routeStory || '<li>The route is waiting for the next search.</li>'}</ol>
                </article>
                <article class="panelish map-search-log-card">
                  <div class="section-head">
                    <div>
                      <h3>Adventure log</h3>
                      <p class="muted">Chains, clues, items, and fake-outs stay visible so progress feels alive.</p>
                    </div>
                    ${badge(searchBoard.rareMeterLabel || '0% rare signal', 'warning')}
                  </div>
                  <ul class="clean-list compact scroll-list map-adventure-log">${routeAdventureLog}</ul>
                </article>
              </div>
            </div>
          </article>          <article class="panelish map-radio-board">
            <div class="section-head">
              <div>
                <p class="eyebrow">Route radio</p>
                <h2>Latest activity and chat</h2>
                <p class="muted">The route board now shares live activity with world chat so maps feel connected to the rest of the game.</p>
              </div>
              <div class="badge-row compact-row">
                ${badge('Live Feed', 'success')}
                ${badge(`Global ${formatNumber(state.chatPreview?.length || 0)}`, 'default')}
              </div>
            </div>
            <div class="chat-feed scroll-list map-radio-chat">${routeChat}</div>
            <ul class="clean-list compact gap-top">${radioLog}</ul>
          </article>
        </section>
      ` : ''}
      <section class="panel gap-top" id="route-archive">
        <div class="section-head">
          <div>
            <p class="eyebrow">Region archive</p>
            <h2>Categorized legendary areas</h2>
            <p class="muted">Every area carries its own search mood, chain state, and rare signal so the world feels less repetitive and easier to browse.</p>
          </div>
          <div class="badge-row compact-row">
            ${badge(`${formatNumber(state.regions.length)} total areas`, 'default')}
            ${badge(`${formatNumber(state.regions.filter((region) => region.unlocked).length)} unlocked`, 'success')}
          </div>
        </div>
        ${groupedRegionCards}
      </section>
      <section class="market-section" id="adventure-routes">
        <h2>Adventure routes</h2>
        <div class="region-grid map-region-grid">${regionCards}</div>
      </section>
    </section>
  `;
}

function renderSettings(state) {
  const durableSaveStorage = hasDurableAccountStorage();
  const regionOptions = state.world.regions.map((region) => `<option value="${region.slug}" ${state.user.meta.preferredRegionSlug === region.slug ? 'selected' : ''} ${region.unlocked ? '' : 'disabled'}>${escapeHtml(region.name)}${region.unlocked ? '' : ' (Locked)'}</option>`).join('');
  const leagueOptions = state.leagues.map((league) => `<option value="${league.slug}" ${state.user.meta.favoriteLeagueSlug === league.slug ? 'selected' : ''}>${escapeHtml(league.name)}</option>`).join('');
  const emojiSetCards = state.emojiSets.map((entry) => `
    <label class="settings-choice ${state.user.meta.chatEmojiSet === entry.slug ? 'is-active' : ''}">
      <input type="radio" name="chatEmojiSet" value="${escapeHtml(entry.slug)}" ${state.user.meta.chatEmojiSet === entry.slug ? 'checked' : ''} />
      <strong>${escapeHtml(entry.name)}</strong>
      <span class="emoji-preview">${entry.emojis.slice(0, 8).join(' ')}</span>
    </label>
  `).join('');
  const themeCards = (state.displayThemes || []).map((entry) => `
    <label class="settings-choice ${state.user.meta.displayTheme === entry.slug ? 'is-active' : ''}">
      <input type="radio" name="displayTheme" value="${escapeHtml(entry.slug)}" ${state.user.meta.displayTheme === entry.slug ? 'checked' : ''} />
      <strong>${escapeHtml(entry.name)}</strong>
      <span class="muted">${escapeHtml(entry.description)}</span>
    </label>
  `).join('');
  const colorCards = (state.colorModes || []).map((entry) => `
    <label class="settings-choice ${state.user.meta.colorMode === entry.slug ? 'is-active' : ''}">
      <input type="radio" name="colorMode" value="${escapeHtml(entry.slug)}" ${state.user.meta.colorMode === entry.slug ? 'checked' : ''} />
      <strong>${escapeHtml(entry.name)}</strong>
      <span class="muted">${escapeHtml(entry.description)}</span>
    </label>
  `).join('');
  const fontCards = (state.fontModes || []).map((entry) => `
    <label class="settings-choice ${state.user.meta.fontMode === entry.slug ? 'is-active' : ''}">
      <input type="radio" name="fontMode" value="${escapeHtml(entry.slug)}" ${state.user.meta.fontMode === entry.slug ? 'checked' : ''} />
      <strong>${escapeHtml(entry.name)}</strong>
      <span class="muted">${escapeHtml(entry.description)}</span>
    </label>
  `).join('');
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Player Settings</p>
          <h1>Settings</h1>
          <p class="muted">Tune the route board, UI vibe, typography, and motion profile without touching your progress.</p>
        </div>
        <div class="badge-row">
          ${badge(state.world.activeRegion.name, 'success')}
          ${badge(`Arena ${state.arenaRecord.wins}-${state.arenaRecord.losses}`, 'default')}
          ${badge(state.progression?.selectedTitle?.name || 'Rookie Tamer', 'warning')}
        </div>
      </div>
      <section class="grid-two settings-grid gap-top">
        <article class="panelish settings-card">
          <p class="eyebrow">Trainer Summary</p>
          <h2>${escapeHtml(state.progression?.activeClass?.name || 'Collector')}</h2>
          <p class="muted">${escapeHtml(state.progression?.selectedTitle?.name || 'Rookie Tamer')} &middot; Lv ${formatNumber(state.progression?.profile?.level || 1)}</p>
          ${renderProgressMeter(state.progression?.progressPercent || 0, `${formatNumber(state.progression?.profile?.expIntoLevel || 0)} / ${formatNumber(state.progression?.profile?.expForNextLevel || 1)} EXP to next level`)}
          <p class="muted gap-top">Your current vibe: ${escapeHtml((state.displayThemes || []).find((entry) => entry.slug === state.user.meta.displayTheme)?.name || 'Pokemon Vibe')} / ${escapeHtml((state.colorModes || []).find((entry) => entry.slug === state.user.meta.colorMode)?.name || 'Dark')} / ${escapeHtml((state.fontModes || []).find((entry) => entry.slug === state.user.meta.fontMode)?.name || 'Pixel')}.</p>
        </article>
        <article class="panelish settings-card">
          <p class="eyebrow">Mission Board</p>
          <h2>Return Loop</h2>
          <div class="badge-row compact-row">
            ${badge(`${formatNumber((state.missions?.daily || []).filter((entry) => entry.complete && !entry.claimed).length)} daily ready`, 'success')}
            ${badge(`${formatNumber((state.missions?.weekly || []).filter((entry) => entry.complete && !entry.claimed).length)} weekly ready`, 'warning')}
          </div>
          <p class="muted gap-top">Daily and weekly boards now refresh automatically and can be claimed from the trainer card page.</p>
          <div class="button-row gap-top">
            <a class="button ghost" href="/trainer-card">Open Trainer Card</a>
            <a class="button ghost" href="/builds">Open Build Dex</a>
            <a class="button ghost" href="/events">Open Events</a>
          </div>
        </article>
      </section>
      <form method="post" action="/settings" class="stack-form settings-form">
        <section class="grid-two settings-grid">
          <article class="panelish settings-card">
            <h2>Adventure</h2>
            <label>
              <span>Preferred Region</span>
              <select name="preferredRegionSlug">${regionOptions}</select>
            </label>
            <label>
              <span>Favorite League</span>
              <select name="favoriteLeagueSlug">${leagueOptions}</select>
            </label>
          </article>
          <article class="panelish settings-card">
            <h2>Display Basics</h2>
            <label>
              <span>HUD Density</span>
              <select name="hudMode">
                <option value="cozy" ${state.user.meta.hudMode === 'cozy' ? 'selected' : ''}>Cozy</option>
                <option value="minimal" ${state.user.meta.hudMode === 'minimal' ? 'selected' : ''}>Minimal</option>
                <option value="compact" ${state.user.meta.hudMode === 'compact' ? 'selected' : ''}>Compact</option>
                <option value="immersive" ${state.user.meta.hudMode === 'immersive' ? 'selected' : ''}>Immersive</option>
              </select>
            </label>
            <label>
              <span>Motion</span>
              <select name="motionMode">
                <option value="full" ${state.user.meta.motionMode === 'full' ? 'selected' : ''}>Full</option>
                <option value="soft" ${state.user.meta.motionMode === 'soft' ? 'selected' : ''}>Soft</option>
                <option value="reduced" ${state.user.meta.motionMode === 'reduced' ? 'selected' : ''}>Reduced</option>
              </select>
            </label>
            <label class="checkbox-row-inline">
              <input type="hidden" name="soundEnabled" value="false" />
              <input type="checkbox" name="soundEnabled" value="true" ${state.user.meta.soundEnabled !== false ? 'checked' : ''} />
              <span>Sound toggle</span>
            </label>
          </article>
        </section>
        <section class="panelish settings-card nested-panel">
          <h2>Interface Vibe</h2>
          <div class="settings-choice-grid">${themeCards}</div>
        </section>
        <section class="grid-two settings-grid">
          <article class="panelish settings-card nested-panel">
            <h2>Color Mode</h2>
            <div class="settings-choice-grid">${colorCards}</div>
          </article>
          <article class="panelish settings-card nested-panel">
            <h2>Font Mode</h2>
            <div class="settings-choice-grid">${fontCards}</div>
          </article>
        </section>
        ${renderViewModePanel('settings')}
        <section class="panelish settings-card nested-panel">
          <h2>Chat Emoji Strip</h2>
          <div class="settings-choice-grid">${emojiSetCards}</div>
        </section>
        <section class="grid-two settings-grid">
          <article class="panelish settings-card nested-panel">
            <h2>Save & Recovery</h2>
            <p class="muted">${escapeHtml(durableSaveStorage
              ? 'Accounts, trainer progress, collection, inventory, and runs save automatically. Username or email plus password should work across phone and PC on this deployment.'
              : 'Accounts, trainer progress, collection, inventory, and runs save automatically, but this deployment may fall back to browser-only recovery. Copy a transfer code before moving to another device.')}</p>
            <div class="badge-row compact-row gap-top">
              ${badge(`Lv ${formatNumber(state.progression?.profile?.level || 1)}`, 'success')}
              ${badge(`${formatNumber(state.capturedCollection?.length || 0)} stored`, 'default')}
              ${badge(`${formatNumber(state.favoriteEntries?.length || 0)} favorites`, 'warning')}
              ${badge(durableSaveStorage ? 'Cross-device login' : 'Browser backup fallback', durableSaveStorage ? 'success' : 'warning')}
            </div>
            ${renderDeviceTransferExportPanel()}
          </article>
          <article class="panelish settings-card nested-panel">
            <h2>Event Relay</h2>
            <p class="muted">Need the current limited anime banner, RNG catch targets, or event timers? The Events page now lives beside Settings in Misc.</p>
            <div class="button-row gap-top">
              <a class="button ghost" href="/events">Open Events</a>
              <a class="button ghost" href="/news">Open News</a>
            </div>
          </article>
        </section>
        <div class="button-row gap-top">
          <button class="button primary" type="submit">Save Settings</button>
          <a class="button ghost" href="/hub">Back to Hub</a>
        </div>
      </form>
    </section>
  `;
}

function renderIdentityStudio(state) {
  const identity = state.identity;
  const partner = identity.partner;
  const gear = identity.trainerGear || {
    auraInventory: [],
    hatInventory: [],
    equippedAura: null,
    equippedHat: null,
  };
  const equippedAura = gear.equippedAura || null;
  const equippedHat = gear.equippedHat || null;
  const activeBonusSummary = identity.trainerBonuses?.hasBoost
    ? statSpreadSummary(identity.trainerBonuses.statBoosts)
    : 'No loadout stat bonus active.';
  const spriteCards = identity.sprites.map((sprite) => {
    const spriteBonus = CONTENT.playerSpriteBonusMap.get(sprite.slug) || null;
    return `
    <form method="post" action="/hub/identity" class="sprite-choice ${state.user.meta.avatarSlug === sprite.slug ? 'is-active' : ''}">
      <input type="hidden" name="action" value="avatar" />
      <input type="hidden" name="avatarSlug" value="${escapeHtml(sprite.slug)}" />
      ${renderSpriteAvatar(sprite)}
      <strong>${escapeHtml(sprite.name)}</strong>
      <p class="muted">${escapeHtml(sprite.accent)}</p>
      <p class="muted">${escapeHtml(spriteBonus?.description || 'Balanced trainer profile.')}</p>
      <p class="muted">${escapeHtml(statSpreadSummary(spriteBonus?.statBoosts || {}))}</p>
      <button class="button ghost" type="submit">Use Sprite</button>
    </form>
  `;
  }).join('');
  const ownedAuras = gear.auraInventory.filter((entry) => entry.quantity > 0);
  const ownedHats = gear.hatInventory.filter((entry) => entry.quantity > 0);
  const auraCards = ownedAuras.length
    ? ownedAuras.map((entry) => `
      <article class="panelish gear-card ${entry.equipped ? 'is-equipped' : ''}">
        <div class="card-top">
          <h3>${escapeHtml(entry.name)}</h3>
          ${badge(`x${formatNumber(entry.quantity)}`, entry.tone || 'default')}
        </div>
        <p class="muted">${escapeHtml(entry.description)}</p>
        <p class="muted">${escapeHtml(statSpreadSummary(entry.statBoosts))}</p>
        <form method="post" action="/hub/identity" class="inline-form gap-top">
          <input type="hidden" name="action" value="equip-aura" />
          <input type="hidden" name="auraSlug" value="${escapeHtml(entry.slug)}" />
          <button class="button ${entry.equipped ? 'accent' : 'ghost'}" type="submit">${entry.equipped ? 'Equipped' : 'Equip Aura'}</button>
        </form>
      </article>
    `).join('')
    : '<article class="panelish gear-card"><h3>No Auras Yet</h3><p class="muted">Roll Aura Jackpot in Mini Games to collect aura loadout items.</p></article>';
  const hatCards = ownedHats.length
    ? ownedHats.map((entry) => `
      <article class="panelish gear-card ${entry.equipped ? 'is-equipped' : ''}">
        <div class="card-top">
          <h3>${escapeHtml(entry.name)}</h3>
          ${badge(`x${formatNumber(entry.quantity)}`, entry.tone || 'default')}
        </div>
        <p class="muted">${escapeHtml(entry.description)}</p>
        <p class="muted">${escapeHtml(statSpreadSummary(entry.statBoosts))}</p>
        <form method="post" action="/hub/identity" class="inline-form gap-top">
          <input type="hidden" name="action" value="equip-hat" />
          <input type="hidden" name="hatSlug" value="${escapeHtml(entry.slug)}" />
          <button class="button ${entry.equipped ? 'accent' : 'ghost'}" type="submit">${entry.equipped ? 'Equipped' : 'Equip Hat'}</button>
        </form>
      </article>
    `).join('')
    : '<article class="panelish gear-card"><h3>No Hats Yet</h3><p class="muted">Aura Jackpot can also drop hat gear with run stat boosts.</p></article>';
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Player Identity</p>
          <h2>Avatar Studio</h2>
          <p class="muted">Pick a fixed-size sprite card, set loadout gear, and keep your trainer identity visible at all times.</p>
        </div>
        <div class="badge-row">
          ${badge(identity.sprite.name, 'default')}
          ${identity.spriteBonus ? badge(identity.spriteBonus.name, 'warning') : badge('No sprite bonus', 'default')}
          ${partner ? badge(monsterLabel(partner.monster), 'success') : badge('No partner set', 'warning')}
          ${equippedAura ? badge(equippedAura.name, equippedAura.tone || 'default') : badge('No aura equipped', 'default')}
          ${equippedHat ? badge(equippedHat.name, equippedHat.tone || 'default') : badge('No hat equipped', 'default')}
        </div>
      </div>
      <div class="sprite-grid">${spriteCards}</div>
      <section class="panelish nested-panel gap-top">
        <div class="section-head">
          <div>
            <p class="eyebrow">Loadout Inventory</p>
            <h3>Auras and Hats</h3>
            <p class="muted">Equipped gear adds run-start stat boosts to your party.</p>
          </div>
          <div class="badge-row compact-row">
            ${badge(`Auras ${formatNumber(ownedAuras.length)}`, 'default')}
            ${badge(`Hats ${formatNumber(ownedHats.length)}`, 'default')}
          </div>
        </div>
        <p class="muted">${escapeHtml(activeBonusSummary)}</p>
        <div class="button-row">
          <form method="post" action="/hub/identity" class="inline-form">
            <input type="hidden" name="action" value="unequip-aura" />
            <button class="button ghost" type="submit">Unequip Aura</button>
          </form>
          <form method="post" action="/hub/identity" class="inline-form">
            <input type="hidden" name="action" value="unequip-hat" />
            <button class="button ghost" type="submit">Unequip Hat</button>
          </form>
          <a class="button accent" href="/minigames">Open Aura Jackpot</a>
        </div>
        <h3 class="gap-top">Aura Inventory</h3>
        <div class="grid-three gear-grid">${auraCards}</div>
        <h3 class="gap-top">Hat Inventory</h3>
        <div class="grid-three gear-grid">${hatCards}</div>
      </section>
    </section>
  `;
}

function renderIncubatorPanel(identity) {
  const eggCards = identity.incubator.length
    ? identity.incubator.map((egg) => `
      <article class="panelish incubator-card">
        <h3>${escapeHtml(egg.label)}</h3>
        <p class="muted">${escapeHtml(egg.species?.name || 'Mystery Hatch')} &middot; ${egg.ready ? 'Ready now' : `${formatNumber(egg.remainingMinutes)}m remaining`}</p>
        ${egg.ready ? `
          <div class="button-row">
            <form method="post" action="/hub/incubator" class="inline-form">
              <input type="hidden" name="action" value="claim" />
              <input type="hidden" name="eggId" value="${escapeHtml(egg.id)}" />
              <button class="button primary" type="submit">Claim Hatch</button>
            </form>
            <form method="post" action="/hub/incubator" class="inline-form">
              <input type="hidden" name="action" value="discard" />
              <input type="hidden" name="eggId" value="${escapeHtml(egg.id)}" />
              <button class="button danger" type="submit">Discard Egg</button>
            </form>
          </div>
        ` : `
          <div class="incubator-timer"></div>
          <form method="post" action="/hub/incubator" class="inline-form gap-top">
            <input type="hidden" name="action" value="discard" />
            <input type="hidden" name="eggId" value="${escapeHtml(egg.id)}" />
            <button class="button danger" type="submit">Discard Egg</button>
          </form>
        `}
      </article>
    `).join('')
    : '<article class="panelish incubator-card"><h3>Empty Incubator</h3><p class="muted">Start an egg and let it hatch in real time.</p></article>';
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Real-Time System</p>
          <h2>Egg Incubator</h2>
          <p class="muted">Eggs hatch in real time. Keep up to three cycling in the nursery with random non-legendary hatches.</p>
        </div>
        <form method="post" action="/hub/incubator" class="inline-form">
          <input type="hidden" name="action" value="start" />
          <button class="button primary" type="submit" ${identity.incubator.length >= 3 ? 'disabled' : ''}>Start Mystery Egg</button>
        </form>
      </div>
      <div class="grid-three">${eggCards}</div>
    </section>
  `;
}

function renderActivityBoard(state) {
  const cooldownSeconds = (slug) => Number(state.cooldowns?.[slug] || 0);
  const activityLog = state.activityLog.length
    ? state.activityLog.map((entry) => `<li>${escapeHtml(entry.text)} <span class="muted">${escapeHtml(formatDateTime(entry.at))}</span></li>`).join('')
    : '<li>No side activity progress yet.</li>';
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Side Activities</p>
          <h2>Mining, Dice, and Jackpot</h2>
          <p class="muted">Run side gameplay for permanent rewards, stash items, and gambling drops between battles.</p>
        </div>
        <div class="badge-row">
          ${badge(`Mining ${formatNumber(state.activityStats.miningTrips)}`, 'success')}
          ${badge(`Dice ${formatNumber(state.activityStats.diceGames)}`, 'warning')}
          ${badge(`Wins ${formatNumber(state.activityStats.diceWins)}`, 'default')}
          ${badge(`Jackpot Spins ${formatNumber(state.activityStats.auraGambles || 0)}`, 'default')}
          ${badge(`Jackpots ${formatNumber(state.activityStats.gambleJackpots || 0)}`, 'warning')}
        </div>
      </div>
      <div class="grid-three summary-grid">
        <article class="panelish">
          <h3>Mining Tunnel</h3>
          <p class="muted">Dig for gold, candy, poke balls, and evolution stones.</p>
          <form method="post" action="/hub/activity" class="inline-form">
            <input type="hidden" name="action" value="mine" />
            <button class="button primary" type="submit" ${cooldownSeconds('mine') > 0 ? 'disabled' : ''}>${cooldownSeconds('mine') > 0 ? `Cooling ${formatNumber(cooldownSeconds('mine'))}s` : 'Go Mining'}</button>
          </form>
        </article>
        <article class="panelish">
          <h3>Dice Table</h3>
          <p class="muted">Pay $80, roll 1-6, and try to win gold or a jackpot candy.</p>
          <form method="post" action="/hub/activity" class="inline-form">
            <input type="hidden" name="action" value="dice" />
            <button class="button accent" type="submit" ${cooldownSeconds('dice') > 0 ? 'disabled' : ''}>${cooldownSeconds('dice') > 0 ? `Cooling ${formatNumber(cooldownSeconds('dice'))}s` : 'Roll Dice'}</button>
          </form>
        </article>
        <article class="panelish">
          <h3>Aura Jackpot</h3>
          <p class="muted">Spin the gambling table for aura and hat loadout gear.</p>
          <a class="button ghost" href="/minigames">Open Mini Games</a>
        </article>
      </div>
      <ul class="clean-list compact gap-top">${activityLog}</ul>
    </section>
  `;
}

function renderPersistentPartyPanel(state) {
  const slotOptions = Array.from({ length: CONTENT.partySlotCount }, (_, index) => `<option value="${index}">Party slot ${index + 1}</option>`).join('');
  const withdrawDisabled = !state.capturedCollection.length;
  const slots = state.partySlots.map((entry, index) => `
    <article class="panelish">
      <div class="card-top">
        <h3>Slot ${index + 1}</h3>
        ${entry ? badge(entry.monster.name, 'success') : badge('Empty', 'default')}
      </div>
      ${entry ? `
        <p class="muted">Lv ${entry.monster.level} - ${escapeHtml(entry.monster.boxTag || 'Box 1')}</p>
        <div class="button-row">
          <a class="button ghost" href="/collection/summary?id=${entry.id}">Inspect</a>
          <form method="post" action="/collection/party" class="inline-form">
            <input type="hidden" name="action" value="clear" />
            <input type="hidden" name="slotIndex" value="${index}" />
            <button class="button danger" type="submit">Store</button>
          </form>
        </div>
      ` : `
        <p class="muted">Withdraw a monster from the PC boxes into this slot.</p>
      `}
    </article>
  `).join('');
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">PC Party</p>
          <h2>Persistent Team</h2>
          <p class="muted">Withdraw, store, or switch specific monsters just like a classic PC party box.</p>
        </div>
        <div class="badge-row">${state.partySlots.filter(Boolean).map((entry) => badge(monsterLabel(entry.monster), 'default')).join(' ')}</div>
      </div>
      <div class="grid-three">${slots}</div>
      <form method="post" action="/collection/party" class="stack-form compact-form gap-top">
        <input type="hidden" name="action" value="set" />
        <label>
          <span>Quick withdraw from storage</span>
          <select name="collectionId">${state.capturedCollection.map((entry) => `<option value="${entry.id}">${escapeHtml(monsterLabel(entry.monster))} - Lv ${formatNumber(entry.monster.level)}</option>`).join('') || '<option value="">No stored monsters</option>'}</select>
        </label>
        <label>
          <span>To slot</span>
          <select name="slotIndex">${slotOptions}</select>
        </label>
        <button class="button primary" type="submit" ${withdrawDisabled ? 'disabled' : ''}>Withdraw / Switch</button>
      </form>
    </section>
  `;
}

function renderTimedSpotlightCard(spotlight, hasActiveRun) {
  if (!spotlight) {
    return '';
  }
  const inputs = Object.entries(spotlight.fields || {}).map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(String(value))}" />`).join('');
  const progress = Math.max(8, Math.min(100, Math.round((Number(spotlight.minutesRemaining || 1) / 10) * 100)));
  return `
    <aside class="side-spotlight panelish">
      <p class="eyebrow">Timed Challenger</p>
      <h3>${escapeHtml(spotlight.title)}</h3>
      <p><strong>${escapeHtml(spotlight.label)}</strong></p>
      <p class="muted">${escapeHtml(spotlight.description)}</p>
      <div class="badge-row compact-row">
        ${badge(spotlight.expiresAtLabel || `${formatNumber(spotlight.minutesRemaining || 0)}m left`, 'warning')}
        ${badge(spotlight.kind, spotlight.tone || 'default')}
      </div>
      <div class="spotlight-timer gap-top"><span style="width:${progress}%"></span></div>
      <form method="post" action="${escapeHtml(spotlight.actionPath)}" class="stack-form gap-top">
        ${inputs}
        <button class="button primary" type="submit" ${hasActiveRun ? 'disabled' : ''}>${hasActiveRun ? 'Finish current run first' : escapeHtml(spotlight.ctaLabel || 'Open')}</button>
      </form>
    </aside>
  `;
}

function renderProgressMeter(percent, label = '') {
  return `
    <div class="exp-meter${label ? ' has-label' : ''}">
      <span style="width:${Math.max(0, Math.min(100, Number(percent || 0)))}%"></span>
      ${label ? `<small>${escapeHtml(label)}</small>` : ''}
    </div>
  `;
}

function renderMissionBoard(scopeLabel, missions = []) {
  if (!missions.length) {
    return '<article class="panelish"><h3>No missions</h3><p class="muted">Mission board is still syncing.</p></article>';
  }
  return missions.map((mission) => `
    <article class="panelish mission-card ${mission.complete ? 'is-complete' : ''} ${mission.claimed ? 'is-claimed' : ''}">
      <div class="card-top">
        <div>
          <p class="eyebrow">${escapeHtml(scopeLabel)}</p>
          <h3>${escapeHtml(mission.name)}</h3>
        </div>
        ${badge(mission.claimed ? 'Claimed' : mission.complete ? 'Ready' : `${formatNumber(mission.progress)}/${formatNumber(mission.target)}`, mission.claimed ? 'default' : mission.complete ? 'success' : 'warning')}
      </div>
      <p class="muted">${escapeHtml(mission.description)}</p>
      ${renderProgressMeter(mission.progressPercent, mission.rewardLabel || 'Reward pending')}
      <form method="post" action="/trainer-card" class="stack-form gap-top">
        <input type="hidden" name="action" value="claim-mission" />
        <input type="hidden" name="scope" value="${escapeHtml(mission.scope)}" />
        <input type="hidden" name="missionSlug" value="${escapeHtml(mission.slug)}" />
        <button class="button ${mission.complete && !mission.claimed ? 'primary' : 'ghost'}" type="submit" ${mission.complete && !mission.claimed ? '' : 'disabled'}>${mission.claimed ? 'Claimed' : mission.complete ? 'Claim Reward' : 'In Progress'}</button>
      </form>
    </article>
  `).join('');
}

function renderLeaderboardPreview(board, options = {}) {
  const entries = board?.entries || [];
  if (!entries.length) {
    return '<p class="muted">No leaderboard entries yet.</p>';
  }
  return entries.slice(0, options.limit || entries.length).map((entry) => `
    <article class="panelish leaderboard-card ${entry.isCurrentUser ? 'is-self' : ''}">
      <div class="card-top">
        <div>
          <p class="eyebrow">Rank #${formatNumber(entry.rank)}</p>
          <h3>${escapeHtml(entry.username)}</h3>
        </div>
        ${badge(entry.title, entry.isCurrentUser ? 'warning' : 'default')}
      </div>
      <p class="muted">${escapeHtml(entry.className)} &middot; Lv ${formatNumber(entry.level)} &middot; Score ${formatNumber(entry.score)}</p>
      <div class="badge-row compact-row">
        ${badge(entry.arenaRankLabel || 'Bronze V', entry.arenaRankTone || 'default')}
        ${badge(`${formatNumber(entry.arenaPoints || 0)} arena pts`, entry.arenaRankTone || 'default')}
        ${entry.arenaPointsToNext > 0 ? badge(`${formatNumber(entry.arenaPointsToNext)} to ${entry.arenaNextRankLabel || 'next rank'}`, 'default') : badge('Arena Cap', 'success')}
      </div>
      <div class="badge-row compact-row">
        ${badge(`${formatNumber(entry.totalWins)} wins`, 'success')}
        ${badge(`Best wave ${formatNumber(entry.bestWave)}`, 'default')}
        ${badge(`${formatNumber(entry.monstersCaught)} caught`, 'warning')}
      </div>
      ${entry.isCurrentUser ? '<p class="muted gap-top">Your live record and ladder points are being tracked on this board.</p>' : `
        <form method="post" action="/social/challenge" class="stack-form gap-top">
          <input type="hidden" name="source" value="leaderboard" />
          <input type="hidden" name="value" value="${escapeHtml(String(entry.userId))}" />
          <button class="button accent" type="submit">Battle Ghost</button>
        </form>
      `}
    </article>
  `).join('');
}

function renderTrainerCardPage(state) {
  const trainer = state.progression;
  const favoriteMonster = state.favoriteMonster;
  const favoriteLabel = favoriteMonster ? monsterLabel(favoriteMonster) : 'Not set yet';
  const currentRank = state.leaderboard?.currentUser?.rank || null;
  const classCards = (trainer.allClasses || []).map((entry) => `
    <article class="panelish trainer-build-card ${entry.equipped ? 'is-active' : ''} ${entry.unlocked ? '' : 'is-locked'}">
      <div class="card-top">
        <div>
          <p class="eyebrow">Unlock Lv ${formatNumber(entry.unlockLevel)}</p>
          <h3>${escapeHtml(entry.name)}</h3>
        </div>
        ${badge(`Class Lv ${formatNumber(entry.masteryLevel || 1)}/100`, entry.equipped ? 'warning' : entry.unlocked ? 'success' : 'default')}
      </div>
      <p class="muted">${escapeHtml(entry.description)}</p>
      <p class="muted">${escapeHtml(entry.vibe)}</p>
      ${renderProgressMeter(entry.masteryPercent || 0, `Mastery ${formatNumber(entry.masteryLevel || 1)}/100`)}
      <form method="post" action="/trainer-card" class="inline-form gap-top">
        <input type="hidden" name="action" value="set-class" />
        <input type="hidden" name="classSlug" value="${escapeHtml(entry.slug)}" />
        <button class="button ${entry.equipped ? 'ghost' : entry.unlocked ? 'primary' : 'ghost'}" type="submit" ${entry.unlocked && !entry.equipped ? '' : 'disabled'}>${entry.equipped ? 'Equipped' : entry.unlocked ? 'Equip Class' : `Unlocks Lv ${formatNumber(entry.unlockLevel)}`}</button>
      </form>
    </article>
  `).join('');
  const subclassCards = (trainer.allSubclasses || []).map((entry) => `
    <article class="panelish trainer-build-card ${entry.equipped ? 'is-active' : ''} ${entry.unlocked ? '' : 'is-locked'} ${entry.matchesActiveClass ? '' : 'is-muted'}">
      <div class="card-top">
        <div>
          <p class="eyebrow">Unlock Lv ${formatNumber(entry.unlockLevel)}</p>
          <h3>${escapeHtml(entry.name)}</h3>
        </div>
        ${badge(entry.matchesActiveClass ? 'Active class path' : 'Other class path', entry.matchesActiveClass ? 'success' : 'default')}
      </div>
      <p class="muted">${escapeHtml(entry.description)}</p>
      <p class="muted">Works with ${escapeHtml(entry.classSlugs.map((slug) => titleLabel(String(slug || '').replace(/-/g, ' '))).join(', '))}</p>
      <form method="post" action="/trainer-card" class="inline-form gap-top">
        <input type="hidden" name="action" value="set-subclass" />
        <input type="hidden" name="subclassSlug" value="${escapeHtml(entry.slug)}" />
        <button class="button ${entry.equipped ? 'ghost' : entry.unlocked ? 'accent' : 'ghost'}" type="submit" ${entry.matchesActiveClass && entry.unlocked && !entry.equipped ? '' : 'disabled'}>${entry.equipped ? 'Equipped' : entry.matchesActiveClass ? entry.unlocked ? 'Equip Subclass' : `Unlocks Lv ${formatNumber(entry.unlockLevel)}` : 'Switch class first'}</button>
      </form>
    </article>
  `).join('');
  const titleCards = (trainer.allTitles || []).map((entry) => `
    <form method="post" action="/trainer-card" class="panelish compact-form trainer-build-card ${entry.equipped ? 'is-active' : ''} ${entry.unlocked ? '' : 'is-locked'}">
      <input type="hidden" name="action" value="set-title" />
      <input type="hidden" name="titleSlug" value="${escapeHtml(entry.slug)}" />
      <strong>${escapeHtml(entry.name)}</strong>
      <p class="muted">${escapeHtml(entry.description)}</p>
      <button class="button ${entry.equipped ? 'ghost' : entry.unlocked ? 'accent' : 'ghost'}" type="submit" ${entry.unlocked && !entry.equipped ? '' : 'disabled'}>${entry.equipped ? 'Using Title' : entry.unlocked ? 'Use Title' : `Unlocks Lv ${formatNumber(entry.unlockLevel)}`}</button>
    </form>
  `).join('');
  const skillCards = (trainer.skillNodes || []).map((node) => `
    <article class="panelish trainer-skill-card ${node.rank ? 'is-active' : ''} ${node.unlocked ? '' : 'is-locked'}">
      <div class="card-top">
        <div>
          <p class="eyebrow">Unlock Lv ${formatNumber(node.unlockLevel || 1)}</p>
          <h3>${escapeHtml(node.name)}</h3>
          <p class="muted">${escapeHtml(node.description)}</p>
        </div>
        ${badge(`Rank ${formatNumber(node.rank)}/${formatNumber(node.maxRank)}`, node.rank ? 'success' : 'default')}
      </div>
      <p class="muted">${Object.entries(node.totalBonuses || {}).filter(([, value]) => Number(value || 0) > 0).map(([key, value]) => `${key} +${value}`).join(' / ') || 'No bonuses invested yet.'}</p>
      <form method="post" action="/trainer-card" class="inline-form gap-top">
        <input type="hidden" name="action" value="upgrade-skill" />
        <input type="hidden" name="skillSlug" value="${escapeHtml(node.slug)}" />
        <button class="button ${node.canUpgrade ? 'primary' : 'ghost'}" type="submit" ${node.canUpgrade ? '' : 'disabled'}>${node.canUpgrade ? 'Spend Point' : node.unlocked ? 'Locked / Maxed' : `Unlocks Lv ${formatNumber(node.unlockLevel || 1)}`}</button>
      </form>
    </article>
  `).join('');
  const missionCards = `
    <section class="market-section">
      <h2>Daily Missions</h2>
      <div class="grid-three">${renderMissionBoard('Daily', state.missions?.daily || [])}</div>
    </section>
    <section class="market-section">
      <h2>Weekly Missions</h2>
      <div class="grid-three">${renderMissionBoard('Weekly', state.missions?.weekly || [])}</div>
    </section>
    <section class="market-section">
      <h2>Monthly Missions</h2>
      <div class="grid-three">${renderMissionBoard('Monthly', state.missions?.monthly || [])}</div>
    </section>
  `;
  const rebirthChecklist = (trainer.rebirthRequirements || []).map((entry) => `
    <article class="panelish achievement-card ${entry.met ? 'is-unlocked' : ''}">
      <strong>${escapeHtml(entry.label)}</strong>
      <span>${entry.met ? 'Ready' : 'Missing'}</span>
    </article>
  `).join('');
  return `
    <section class="panel trainer-card-page">
      <div class="section-head">
        <div>
          <p class="eyebrow">Trainer Card</p>
          <h1>${escapeHtml(state.user.username)}</h1>
          <p class="muted">${escapeHtml(trainer.selectedTitle?.name || 'Rookie Tamer')} - ${escapeHtml(trainer.activeClass?.name || 'Collector')}${trainer.activeSubclass ? ' / ' + escapeHtml(trainer.activeSubclass.name) : ''} - ${escapeHtml(state.user.email)}</p>
        </div>
        <div class="badge-row">
          ${badge(`Lv ${formatNumber(trainer.profile.level)}/100`, 'warning')}
          ${badge(`Class Lv ${formatNumber(trainer.activeClassMastery?.level || 1)}/100`, 'success')}
          ${badge(`Rebirth ${formatNumber(trainer.profile.rebirths || 0)}`, 'default')}
          ${currentRank ? badge(`Rank #${formatNumber(currentRank)}`, 'success') : badge('Unranked', 'default')}
          ${badge(`${formatNumber(state.badgesEarned || 0)} badges`, 'default')}
        </div>
      </div>
      <section class="grid-two trainer-card-hero">
        <article class="panelish trainer-card-identity">
          <div class="identity-hero">
            ${renderSpriteAvatar(state.identity?.sprite, { large: true })}
            <div>
              <p class="eyebrow">Favorite Monster</p>
              <h2>${escapeHtml(favoriteLabel)}</h2>
              <p class="muted">Avatar ${escapeHtml(state.identity?.sprite?.name || 'Unknown')} - Favorite Pokemon ${escapeHtml(favoriteLabel)}</p>
              <div class="badge-row compact-row gap-top">
                ${badge(`${formatNumber(trainer.totalWins || 0)} total wins`, 'success')}
                ${badge(`${formatNumber(trainer.totalRuns || 0)} runs`, 'default')}
                ${badge(`${formatNumber(trainer.winRate || 0)}% win rate`, 'warning')}
              </div>
            </div>
          </div>
          ${renderProgressMeter(trainer.progressPercent, `${formatNumber(trainer.profile.expIntoLevel)} / ${formatNumber(trainer.profile.expForNextLevel)} EXP to next trainer level`)}
          ${renderProgressMeter(Math.max(0, Math.min(100, Math.round(((trainer.activeClassMastery?.expIntoLevel || 0) / Math.max(1, trainer.activeClassMastery?.expForNextLevel || 1)) * 100))), `${formatNumber(trainer.activeClassMastery?.expIntoLevel || 0)} / ${formatNumber(trainer.activeClassMastery?.expForNextLevel || 0)} EXP to next class level`)}
        </article>
        <article class="panelish trainer-card-identity">
          <p class="eyebrow">Build Summary</p>
          <h2>${escapeHtml(trainer.activeClass?.name || 'Collector')}${trainer.activeSubclass ? ` / ${escapeHtml(trainer.activeSubclass.name)}` : ''}</h2>
          <p class="muted">${escapeHtml(trainer.activeClass?.description || 'No class selected.')}</p>
          <div class="badge-row compact-row gap-top">
            ${(trainer.sources || []).length ? trainer.sources.map((entry) => badge(entry.label, entry.type === 'class' ? 'warning' : entry.type === 'subclass' ? 'success' : 'default')).join(' ') : badge('No passives', 'default')}
          </div>
          <p class="muted gap-top">Available skill points: ${formatNumber(trainer.profile.availableSkillPoints || 0)}</p>
          <p class="muted">Rebirth difficulty multiplier: x${escapeHtml(String((trainer.rebirthDifficultyMultiplier || 1).toFixed ? trainer.rebirthDifficultyMultiplier.toFixed(2) : trainer.rebirthDifficultyMultiplier || 1))}</p>
          <form method="post" action="/trainer-card" class="inline-form gap-top">
            <input type="hidden" name="action" value="reset-skills" />
            <button class="button ghost" type="submit">Reset Skill Tree</button>
          </form>
        </article>
      </section>
      ${missionCards}
      <section class="market-section">
        <h2>Rebirth Chamber</h2>
        <div class="grid-two">
          <article class="panelish trainer-card-identity">
            <p class="eyebrow">Permanent Loop</p>
            <h3>Rebirth Perks</h3>
            <p class="muted">Every rebirth makes future routes harder, but permanently boosts trainer income, growth, and catch pace.</p>
            <div class="badge-row compact-row gap-top">
              ${badge(`EXP +${formatNumber(Math.round((trainer.rebirthBonuses?.expBonus || 0) * 100))}%`, 'default')}
              ${badge(`Cash +${formatNumber(Math.round((trainer.rebirthBonuses?.cashBonus || 0) * 100))}%`, 'warning')}
              ${badge(`Catch +${formatNumber(Math.round((trainer.rebirthBonuses?.captureBonus || 0) * 100))}%`, 'success')}
              ${badge(`Damage +${formatNumber(Math.round((trainer.rebirthBonuses?.playerDamageBonus || 0) * 100))}%`, 'default')}
            </div>
            <form method="post" action="/trainer-card" class="inline-form gap-top">
              <input type="hidden" name="action" value="rebirth" />
              <button class="button ${trainer.rebirthReady ? 'primary' : 'ghost'}" type="submit" ${trainer.rebirthReady ? '' : 'disabled'}>${trainer.rebirthReady ? 'Perform Rebirth' : 'Not Ready Yet'}</button>
            </form>
          </article>
          <div class="achievement-grid">${rebirthChecklist}</div>
        </div>
      </section>
      <section class="market-section">
        <h2>Trainer Classes</h2>
        <div class="grid-three">${classCards}</div>
      </section>
      <section class="market-section">
        <h2>Subclasses</h2>
        <div class="grid-three">${subclassCards}</div>
      </section>
      <section class="market-section">
        <h2>Titles</h2>
        <div class="grid-three">${titleCards}</div>
      </section>
      <section class="market-section">
        <h2>Skill Tree</h2>
        <div class="grid-two">${skillCards}</div>
      </section>
      <section class="market-section">
        <h2>Live Leaderboard</h2>
        <div class="grid-three">${renderLeaderboardPreview(state.leaderboard, { limit: 6 })}</div>
      </section>
    </section>
  `;
}
function renderHub(state) {
  const previewSource = state.capturedCollection;
  const collectionPreview = previewSource.slice(0, 8).map((entry) => {
    const perk = starterPerkInfo(entry.monster);
    return `
      <article class="monster-card mini">
        <h3>${escapeHtml(monsterLabel(entry.monster))}</h3>
        <p>${entry.species.types.map((type) => badge(type, type)).join(' ')}</p>
        ${natureBadges(entry.monster)}
        ${auraBadges(entry.monster)}
        <p class="muted">Lv ${entry.monster.level} - ${escapeHtml(entry.monster.metLocation || entry.species.biome)}</p>
        ${perk ? `<p class="muted">${escapeHtml(perk.name)}</p>` : ''}
      </article>
    `;
  }).join('');
  const recentRuns = state.lastRuns.length
    ? state.lastRuns.map((run) => `<li>${escapeHtml(run.mode)} - ${escapeHtml(run.status)} - wave ${formatNumber(run.summary?.wave || 0)}</li>`).join('')
    : '<li>No completed runs yet.</li>';
  const activeRunCard = state.activeRun
    ? `
      <article class="panel highlight-panel">
        <p class="eyebrow">Active run</p>
        <h2>${escapeHtml(state.activeRun.mode)} wave ${formatNumber(state.activeRun.wave)}</h2>
        <p class="muted">Cash ${money(state.activeRun.money)} - party ${state.activeRun.party.length} - captures ${state.activeRun.captures}</p>
        <div class="button-row gap-top">
          <a class="button primary" href="/play">Resume run</a>
          <a class="button ghost" href="/trainer-card">Trainer card</a>
        </div>
      </article>
    `
    : `
      <article class="panel highlight-panel">
        <p class="eyebrow">No active run</p>
        <h2>Start a new climb</h2>
        <p class="muted">Pick a starter draft, lock one monster, and push a fresh route.</p>
        <div class="button-row gap-top">
          <a class="button primary" href="/play/new">Start run</a>
          ${state.user.meta.lastRunSummary ? '<a class="button ghost" href="/play/summary">Last summary</a>' : ''}
        </div>
      </article>
    `;
  const inventoryGroups = state.persistentInventory.reduce((map, entry) => {
    const key = entry.item.group || entry.item.category || 'general';
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(entry);
    return map;
  }, new Map());
  const inventoryCards = [...inventoryGroups.entries()].slice(0, 6).map(([group, entries]) => `
    <article class="panelish">
      <div class="card-top">
        <h3>${escapeHtml(titleLabel(group.replace(/-/g, ' ')))}</h3>
        ${badge(`${formatNumber(entries.length)} items`, 'default')}
      </div>
      <ul class="clean-list compact">
        ${entries.slice(0, 5).map((entry) => `<li>${escapeHtml(entry.item.name)} x${formatNumber(entry.quantity)}</li>`).join('')}
      </ul>
    </article>
  `).join('') || '<article class="panelish"><h3>No Inventory Yet</h3><p class="muted">Market buys and mission rewards will start filling your stash.</p></article>';
  const regionNamesFor = (category, fallback = 'Routes are still rotating in') => {
    const matches = (state.world?.regions || []).filter((region) => region.category === category).slice(0, 3).map((region) => region.name);
    return matches.length ? matches.join(' / ') : fallback;
  };
  const navigationSections = [
    {
      title: 'Explore',
      summary: 'Battle Area, legendary boards, and island routes stay grouped together now.',
      entries: [
        { title: 'Battle Area', href: '/social', tone: 'primary', body: 'Casual, ranked, hard, and advanced arena queues plus live activity.' },
        { title: 'Legendary Areas', href: '/maps#route-archive', tone: 'accent', hardNav: true, body: `${regionNamesFor('sanctuary')} / ${regionNamesFor('ruins')}` },
        { title: 'Island Routes', href: '/maps#route-archive', tone: 'ghost', hardNav: true, body: regionNamesFor('island', 'Island expeditions unlock deeper in the world board.') },
      ],
    },
    {
      title: 'Facilities',
      summary: 'Storage, rebuilding, stones, and summary tools are separated from the run board.',
      entries: [
        { title: 'Pokemon Center', href: '/collection', tone: 'ghost', body: 'Party checks, summary review, movesets, and storage sorting.' },
        { title: 'DNA Center', href: '/collection', tone: 'accent', body: 'IV, EV, nature, ability, and held-item rebuilds from summary stash tools.' },
        { title: 'Rock Trade-In', href: '/market', tone: 'ghost', body: 'Evolution stones, relic gear, and permanent item pickups.' },
      ],
    },
    {
      title: 'Arcade & Rewards',
      summary: 'Mining, lottery spins, whack boards, reward-shop redemptions, and token turn-ins live together.',
      entries: [
        { title: 'Mines', href: '/minigames', tone: 'primary', body: 'Mining Tunnel, Dice Table, and harder low-token side loops.' },
        { title: 'Lottery', href: '/minigames', tone: 'accent', body: 'Prize Wheel and Aura Jackpot now sit on the same arcade board.' },
        { title: 'Reward Shop', href: '/minigames', tone: 'ghost', body: 'Redeem exclusive auras, hats, mints, maxers, and account items.' },
      ],
    },
    {
      title: 'Progression',
      summary: 'Keep fresh runs, trainer systems, and the market in their own lane.',
      entries: [
        { title: 'Run Setup', href: '/play/new', tone: 'primary', body: 'Launch a new route with draft or partner style.' },
        { title: 'Trainer Card', href: '/trainer-card', tone: 'accent', body: 'Classes, subclasses, skills, missions, rebirth, and identity loadout.' },
        { title: 'Market', href: '/market', tone: 'ghost', body: 'Permanent stash items and late-game battle tools.' },
      ],
    },
  ].map((section) => `
    <article class="panelish">
      <div class="card-top">
        <div>
          <h3>${escapeHtml(section.title)}</h3>
          <p class="muted">${escapeHtml(section.summary)}</p>
        </div>
        ${badge(`${formatNumber(section.entries.length)} routes`, 'default')}
      </div>
      <div class="grid-three compact-grid gap-top">
        ${section.entries.map((entry) => `
          <article class="panelish hub-link-card">
            <h3>${escapeHtml(entry.title)}</h3>
            <p class="muted">${escapeHtml(entry.body)}</p>
            <a class="button ${escapeHtml(entry.tone)}" href="${escapeHtml(entry.href)}"${entry.hardNav ? ' data-hard-nav="true"' : ''}>Open</a>
          </article>
        `).join('')}
      </div>
    </article>
  `).join('');
  return `
    <div class="hub-page">
    ${renderProfileHeader(state)}
    <section class="grid-two">
      <article class="panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Mission Board</p>
            <h2>Daily / Weekly / Monthly</h2>
            <p class="muted">Your live progression board now rotates across all three cadences and stays claimable from the trainer page.</p>
          </div>
          <a class="button ghost" href="/trainer-card">Open Trainer Card</a>
        </div>
        <div class="grid-three">${renderMissionBoard('Daily', (state.missions?.daily || []).slice(0, 3))}</div>
        <div class="grid-three gap-top">${renderMissionBoard('Weekly', (state.missions?.weekly || []).slice(0, 3))}</div>
        <div class="grid-three gap-top">${renderMissionBoard('Monthly', (state.missions?.monthly || []).slice(0, 2))}</div>
      </article>
      <article class="panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Live Board</p>
            <h2>Leaderboard</h2>
            <p class="muted">Top trainers update live from wins, wave depth, catches, arena pressure, and trainer progression.</p>
          </div>
          ${state.leaderboard?.currentUser ? badge(`You are #${formatNumber(state.leaderboard.currentUser.rank)}`, 'warning') : badge('Unranked', 'default')}
        </div>
        <div class="grid-three">${renderLeaderboardPreview(state.leaderboard, { limit: 3 })}</div>
      </article>
    </section>
    ${renderTimedSpotlightCard(state.challengeSpotlight, !!state.activeRun)}
    <section class="panel hub-quick-nav">
      <div class="section-head">
        <div>
          <p class="eyebrow">Navigation Hub</p>
          <h2>Categorized Routes</h2>
          <p class="muted">Explore, facilities, arcade, and progression boards are segmented so Battle Area, Legendary Areas, Mines, Pokemon Center, DNA Center, Rock Trade-In, and Lottery are easier to reach.</p>
        </div>
      </div>
      <div class="grid-two">${navigationSections}</div>
    </section>
    <section class="grid-two identity-world-grid">
      <article class="panel highlight-panel">
        <p class="eyebrow">Commander Board</p>
        <h2>${escapeHtml(state.identity.sprite.name)}</h2>
        <div class="identity-hero">
          ${renderSpriteAvatar(state.identity.sprite, { large: true })}
          <div>
            <p class="muted">Partner ${escapeHtml(state.identity.partner ? monsterLabel(state.identity.partner.monster) : 'not set')}</p>
            <p class="muted">Class ${escapeHtml(state.progression?.activeClass?.name || 'Collector')}${state.progression?.activeSubclass ? ' / ' + escapeHtml(state.progression.activeSubclass.name) : ''}</p>
            <p class="muted">Aura: ${escapeHtml(state.identity.trainerGear?.equippedAura?.name || 'none')}</p>
            <p class="muted">Hat: ${escapeHtml(state.identity.trainerGear?.equippedHat?.name || 'none')}</p>
            <p class="muted">Daily boss: ${escapeHtml(state.dailyBoss?.name || 'Astravault Omega')}</p>
          </div>
        </div>
      </article>
      <article class="panel highlight-panel">
        <p class="eyebrow">Inventory Locker</p>
        <h2>Player Inventory</h2>
        <p class="muted">Permanent stash items are grouped by type so the hub stays cleaner than one long dump list.</p>
        <div class="grid-three compact-grid gap-top">${inventoryCards}</div>
        <div class="button-row gap-top">
          <a class="button ghost" href="/market">Open market</a>
          <a class="button accent" href="/collection">Open storage</a>
        </div>
      </article>
    </section>
    ${renderWorldBoard(state.world)}
    ${renderIncubatorPanel(state.identity)}
    ${renderPersistentPartyPanel(state)}
    <section class="grid-two">
      ${activeRunCard}
      <article class="panel">
        <p class="eyebrow">Unlock progress</p>
        <h2>Best waves</h2>
        <div class="stat-grid">
          <div class="stat-card"><strong>${formatNumber(state.user.meta.bestWave.classic || 0)}</strong><span>classic</span></div>
          <div class="stat-card"><strong>${formatNumber(state.user.meta.bestWave.endless || 0)}</strong><span>endless</span></div>
          <div class="stat-card"><strong>${formatNumber(state.user.meta.bestWave.challenge || 0)}</strong><span>challenge</span></div>
        </div>
      </article>
    </section>
    ${renderActivityBoard(state)}
    ${renderIdentityStudio(state)}
    <section class="grid-two">
      <article class="panel">
        <h2>Recent Runs</h2>
        <ul class="clean-list compact">${recentRuns}</ul>
      </article>
      <article class="panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">Stable Preview</p>
            <h2>Storage Preview</h2>
            <p class="muted">${formatNumber(state.capturedCollection.length)} visible storage monsters. Starter reserve and actual catches stay separated from old legacy gift clutter.</p>
          </div>
          <a class="button ghost" href="/collection">View full storage</a>
        </div>
        <div class="monster-grid">${collectionPreview || '<p class="muted">No captured monsters in visible storage yet.</p>'}</div>
      </article>
    </section>
    </div>
  `;
}
function renderRunSetup(state, preferredDraftSlug = '') {
  const activeRunNote = state.activeRun ? '<p class="flash flash-warning">Starting a new run will abandon your current active run.</p>' : '';
  const starterDrafts = state.starterDrafts || [];
  const savedRunEntries = [];
  const seenSavedIds = new Set();
  const pushSavedEntry = (entry, meta = {}) => {
    if (!entry || seenSavedIds.has(entry.id)) {
      return;
    }
    seenSavedIds.add(entry.id);
    savedRunEntries.push({
      entry,
      isPartner: !!meta.isPartner,
      partySlotIndex: Number.isInteger(meta.partySlotIndex) ? meta.partySlotIndex : -1,
    });
  };
  if (state.identity?.partner) {
    pushSavedEntry(state.identity.partner, { isPartner: true, partySlotIndex: state.partySlots.findIndex((slot) => slot?.id === state.identity.partner.id) });
  }
  (state.partySlots || []).forEach((entry, index) => {
    if (entry) {
      pushSavedEntry(entry, { isPartner: state.identity?.partner?.id === entry.id, partySlotIndex: index });
    }
  });
  const savedRosterPack = {
    slug: 'partner-party-style',
    name: 'Partner Style',
    rarity: 'legendary',
    description: 'Launch the run with your visible partner and the Pokemon already parked in your persistent party slots. This uses your saved squad instead of a one-pick starter draft.',
    entries: savedRunEntries,
  };
  const runStyles = [];
  starterDrafts.forEach((draft) => {
    runStyles.push({ kind: 'draft', draft });
    if (draft.slug === 'mythic-style') {
      runStyles.push({ kind: 'saved-squad', draft: savedRosterPack });
    }
  });
  if (!runStyles.some((style) => style.draft.slug === savedRosterPack.slug)) {
    runStyles.push({ kind: 'saved-squad', draft: savedRosterPack });
  }
  const selectedDraftSlug = (
    runStyles.find((style) => style.draft.slug === preferredDraftSlug && (style.kind !== 'saved-squad' || style.draft.entries.length))
    || runStyles.find((style) => style.kind !== 'saved-squad' || style.draft.entries.length)
    || runStyles[0]
  )?.draft.slug || '';
  const partnerReady = savedRosterPack.entries.length > 0;
  const draftCards = runStyles.map((style, index) => {
    const draft = style.draft;
    const isSavedSquad = style.kind === 'saved-squad';
    const tone = draft.rarity === 'legendary' ? 'warning' : draft.rarity === 'rare' ? 'psychic' : 'success';
    const disabled = isSavedSquad && !draft.entries.length;
    const isSelected = draft.slug === selectedDraftSlug;
    const compactBadges = isSavedSquad
      ? [
          badge(draft.entries.length ? `${formatNumber(draft.entries.length)} saved` : 'No saved squad', draft.entries.length ? 'success' : 'default'),
          state.identity?.partner ? badge('Partner linked', 'default') : badge('Partner optional', 'default'),
        ].join(' ')
      : draft.starters.map((starter) => badge(starter.species.name, 'default')).join(' ');
    return `
      <label class="draft-card ${isSelected ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}">
        <input type="radio" name="draftSlug" value="${draft.slug}" ${isSelected ? 'checked' : ''} ${disabled ? 'disabled' : ''} data-draft-radio />
        <div class="card-top">
          <h3>${escapeHtml(draft.name)}</h3>
          ${badge(isSavedSquad ? 'saved squad' : draft.rarity, tone)}
        </div>
        <p class="muted">${escapeHtml(draft.description)}</p>
        <div class="badge-row compact-row">${compactBadges}</div>
      </label>
    `;
  }).join('');
  const draftPanels = runStyles.map((style, draftIndex) => {
    const draft = style.draft;
    if (style.kind === 'saved-squad') {
      const savedCards = draft.entries.map((slot) => {
        const entry = slot.entry;
        const monster = entry.monster;
        return `
          <article class="monster-card panelish collection-card-expanded">
            <div class="card-top">
              <h3>${escapeHtml(monsterLabel(monster))}</h3>
              <div class="badge-row compact-row">
                ${slot.isPartner ? badge('Partner', 'success') : ''}
                ${slot.partySlotIndex >= 0 ? badge(`Party ${slot.partySlotIndex + 1}`, 'warning') : ''}
              </div>
            </div>
            ${renderMonsterPortrait(entry.species, { caption: `Lv ${monster.level}` })}
            <div class="badge-row compact-row">${entry.species.types.map((type) => badge(type, type)).join(' ')}</div>
            ${natureBadges(monster)}
            ${auraBadges(monster)}
            <p class="muted">This monster enters the run exactly from your saved roster instead of the draft reserve.</p>
          </article>
        `;
      }).join('');
      return `
        <section class="starter-draft-panel ${draft.slug === selectedDraftSlug ? 'is-active' : ''}" data-draft-panel="${draft.slug}">
          <div class="section-head">
            <div>
              <p class="eyebrow">Saved Squad</p>
              <h2>Partner / Party Slot Run</h2>
              <p class="muted">Your visible partner is loaded first, then your persistent party slots. If the partner is already in a slot, it is only loaded once.</p>
            </div>
            <p>${formatNumber(draft.entries.length)} ready</p>
          </div>
          ${draft.entries.length ? `
            <div class="monster-grid">${savedCards}</div>
          ` : `
            <article class="panelish muted-block">
              <h3>No saved squad yet</h3>
              <p class="muted">Set a visible partner or assign at least one monster to a persistent party slot from the collection screen, then come back here.</p>
              <a class="button ghost" href="/collection">Open collection</a>
            </article>
          `}
        </section>
      `;
    }
    const starterCards = draft.starters.map((starter, starterIndex) => {
      const entry = starter.entry;
      const species = starter.species;
      const perk = starter.perk;
      const checked = draft.slug === selectedDraftSlug && starterIndex === 0 ? 'checked' : '';
      return `
        <label class="monster-card selectable starter-choice-card ${entry ? '' : 'is-disabled'}">
          <input type="radio" name="starter" value="${entry?.id || ''}" ${checked} ${entry ? '' : 'disabled'} />
          <div class="card-top">
            <h3>${escapeHtml(entry ? monsterLabel(entry.monster) : species.name)}</h3>
            ${badge('Pick 1', 'warning')}
          </div>
          <p>${species.types.map((type) => badge(type, type)).join(' ')}</p>
          ${entry ? natureBadges(entry.monster) : ''}
          ${entry ? auraBadges(entry.monster) : ''}
          <div class="badge-row compact-row">
            ${perk ? badge(perk.name, 'default') : ''}
            ${badge(species.rarity, 'default')}
          </div>
          <p class="muted">${escapeHtml(perk?.description || 'Balanced run opener.')}</p>
          <p class="muted">Lv ${entry?.monster.level || 5} - ${escapeHtml(species.biome)}</p>
        </label>
      `;
    }).join('');
    return `
      <section class="starter-draft-panel ${draft.slug === selectedDraftSlug ? 'is-active' : ''}" data-draft-panel="${draft.slug}">
        <div class="section-head">
          <div>
            <p class="eyebrow">Starter Draft</p>
            <h2>Pick 1 starter</h2>
            <p class="muted">Only this three-card pack is available for the run. Unchosen cards stay in the hidden starter reserve.</p>
          </div>
          <p>${formatNumber(draft.starters.length)} choices</p>
        </div>
        <div class="monster-grid">${starterCards}</div>
      </section>
    `;
  }).join('');
  const partnerFocusCard = `
    <section class="panelish run-setup-spotlight">
      <div>
        <p class="eyebrow">Quick Launch</p>
        <h2>${partnerReady ? 'Partner Style is ready' : 'Build a Partner Style squad'}</h2>
        <p class="muted">${partnerReady ? `Launch straight from your saved partner and party slots with ${formatNumber(savedRosterPack.entries.length)} ready monster${savedRosterPack.entries.length === 1 ? '' : 's'}.` : 'Set a visible partner or save party-slot monsters first, then this lane becomes a one-tap launch.'}</p>
      </div>
      <div class="badge-row compact-row">
        ${badge(partnerReady ? `${formatNumber(savedRosterPack.entries.length)} saved` : 'No saved squad', partnerReady ? 'success' : 'default')}
        ${state.identity?.partner ? badge(monsterLabel(state.identity.partner.monster), 'warning') : badge('No visible partner', 'default')}
        ${badge('Arcade rewards live', 'psychic')}
      </div>
      <div class="button-row">
        <a class="button ${partnerReady ? 'accent' : 'ghost'}" href="${partnerReady ? '/play/new?draft=partner-party-style' : '/collection'}">${partnerReady ? 'Open Partner Style' : 'Set Partner Squad'}</a>
        <a class="button ghost" href="/collection">${partnerReady ? 'Tune Saved Squad' : 'Open Collection'}</a>
        <a class="button ghost" href="/minigames">Arcade Break</a>
      </div>
    </section>
  `;
  const challengeOptions = CONTENT.challenges.map((challenge) => `<option value="${challenge.slug}">${escapeHtml(challenge.name)} - ${escapeHtml(challenge.description)}</option>`).join('');
  return `
    <section class="panel">
      <h1>Start a Run</h1>
      <p class="muted">Each run can start from a curated starter draft or from your saved partner / party squad. Pick a launch style, lock the setup, then start climbing.</p>
      ${activeRunNote}
      ${partnerFocusCard}
      <form method="post" action="/play/new" class="stack-form">
        <div class="grid-three mode-grid">
          <label class="mode-card"><input type="radio" name="mode" value="classic" checked /><strong>Classic</strong><span>30 waves, bosses every 10.</span></label>
          <label class="mode-card"><input type="radio" name="mode" value="endless" /><strong>Endless</strong><span>Long-form scaling climb.</span></label>
          <label class="mode-card"><input type="radio" name="mode" value="challenge" /><strong>Challenge</strong><span>Special run rules and modifiers.</span></label>
        </div>
        <label>
          <span>Challenge rule</span>
          <select name="challengeSlug">
            <option value="">No extra challenge</option>
            ${challengeOptions}
          </select>
        </label>
        <section class="starter-draft-picker" data-draft-switcher>
          <div class="section-head">
            <div>
              <p class="eyebrow">Starter Selection System</p>
              <h2>Launch Styles</h2>
              <p class="muted">Classic draft packs stay intact, and Partner Style now sits beside Mythic Style for saved-roster runs.</p>
            </div>
            <p>${formatNumber(runStyles.length)} styles</p>
          </div>
          <div class="grid-three draft-grid">${draftCards}</div>
          ${draftPanels}
        </section>
        <button class="button primary" type="submit">Launch Run</button>
      </form>
    </section>
  `;
}
function formatDateTime(value) {
  if (!value) {
    return 'Unknown';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return escapeHtml(String(value));
  }
  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function moveUnlockLevel(species, index) {
  const unlocks = [1, 4, 7, 10, 13, 16, 19, 22, 25, 29, 33, 37, 41, 46, 51, 56, 61, 67, 73, 79, 85, 91, 96, 100];
  const stageShift = species?.stage === 1 ? 0 : species?.stage === 2 ? -4 : species?.stage === 3 ? -8 : -12;
  return Math.max(1, Math.min(100, (unlocks[index] || 100) + stageShift));
}

function moveTeachingPrice(move) {
  const prices = { 1: 180, 2: 320, 3: 520, 4: 800, 5: 1200 };
  return prices[move?.tier] || 1200;
}

function outcomeTone(outcome) {
  if (outcome === 'victory') {
    return 'success';
  }
  if (outcome === 'defeat' || outcome === 'abandoned') {
    return 'warning';
  }
  return 'default';
}

function abilityInfo(monster) {
  return CONTENT.abilityMap.get(monster.abilitySlug) || null;
}

function heldItemInfo(monster) {
  return monster?.heldItemSlug ? CONTENT.itemMap.get(monster.heldItemSlug) || null : null;
}

function starterPerkInfo(monsterOrSpeciesId) {
  if (monsterOrSpeciesId && typeof monsterOrSpeciesId === 'object' && monsterOrSpeciesId.starterPerk) {
    return monsterOrSpeciesId.starterPerk;
  }
  const speciesId = typeof monsterOrSpeciesId === 'object' ? monsterOrSpeciesId?.speciesId : monsterOrSpeciesId;
  return CONTENT.starterPerks?.[Number(speciesId)] || null;
}

function battleMonsterName(monster) {
  const baseName = monster.formName || monster.name;
  return monster.nickname ? `${monster.nickname} (${baseName})` : baseName;
}

function renderMoveCard(moveState, options = {}) {
  const move = CONTENT.moveMap.get(moveState.id);
  if (!move) {
    return '';
  }
  const title = moveState.displayName || move.name;
  const description = moveState.displayDescription || move.description;
  const powerLabel = move.category === 'status' ? 'Status' : `Power ${move.power}`;
  const roleLabel = move.role || (move.category === 'status' ? 'Support' : 'Attack');
  const zReady = !!options.zReady && move.category !== 'status';
  const actionButtons = options.actionable
    ? `
      <div class="move-card-actions">
        <form method="post" action="/play/action" class="stack-form move-submit-form">
          <input type="hidden" name="action" value="move" />
          <input type="hidden" name="moveIndex" value="${options.moveIndex}" />
          <button class="button ${move.category === 'status' ? 'ghost' : 'primary'}" type="submit">Use Move</button>
        </form>
        ${zReady ? `
          <form method="post" action="/play/action" class="stack-form move-submit-form">
            <input type="hidden" name="action" value="move" />
            <input type="hidden" name="moveIndex" value="${options.moveIndex}" />
            <input type="hidden" name="battleMode" value="z" />
            <button class="button accent" type="submit">Z-Move</button>
          </form>
        ` : ''}
      </div>
    `
    : '';
  return `
    <article class="move-card ${options.compact ? 'compact' : ''}">
      <div class="card-top">
        <h3>${escapeHtml(title)}</h3>
        ${badge(move.type, move.type)}
      </div>
      <div class="badge-row">
        ${badge(move.category, move.category === 'status' ? 'default' : 'success')}
        ${badge(roleLabel, 'default')}
        ${badge(`Tier ${move.tier}`, 'default')}
        ${badge(powerLabel, move.category === 'status' ? 'default' : 'warning')}
        ${badge(`Acc ${move.accuracy}`, 'default')}
        ${badge(`PP ${moveState.pp}/${moveState.maxPp}`, 'default')}
      </div>
      <p class="muted move-copy">${escapeHtml(description)}</p>
      ${actionButtons}
    </article>
  `;
}

function renderBuildGuideMoveCard(row, options = {}) {
  if (!row) {
    return '';
  }
  return `
    <article class="move-card ${options.compact ? 'compact' : ''} build-move-card ${options.core ? 'is-core' : ''}">
      <div class="card-top">
        <div>
          <h3>${escapeHtml(row.name)}</h3>
          <p class="muted">Unlocks at Lv ${formatNumber(row.unlockLevel)}</p>
        </div>
        ${badge(titleLabel(row.type), row.type)}
      </div>
      <div class="badge-row compact-row">
        ${badge(options.core ? 'Core move' : 'Flex move', options.core ? 'warning' : 'default')}
        ${badge(titleLabel(row.category), row.category === 'status' ? 'default' : 'success')}
        ${badge(row.role || 'Utility', 'default')}
        ${badge(`Tier ${formatNumber(row.tier)}`, 'default')}
        ${badge(row.category === 'status' ? 'Status' : `Power ${formatNumber(row.power)}`, row.category === 'status' ? 'default' : 'warning')}
        ${badge(`Acc ${formatNumber(row.accuracy)}`, 'default')}
      </div>
      <p class="muted move-copy">${escapeHtml(row.description)}</p>
    </article>`;
}

function renderTransformationBadges(modes = []) {
  const labels = {
    mega: 'Mega',
    ultra: 'Ultra Burst',
    dynamax: 'Dynamax',
    variant: 'Variant',
  };
  return modes.length
    ? modes.map((mode) => badge(labels[mode] || titleLabel(mode), 'default')).join(' ')
    : badge('No transformations', 'default');
}

function renderBuildDexPage(state) {
  const selected = state.selected;
  if (!selected) {
    return '<section class="panel"><h1>Build Dex</h1><p class="muted">Build data is not available right now.</p></section>';
  }
  const selectedSpecies = CONTENT.speciesMap.get(selected.speciesId);
  const matchup = matchupSummary(selected.types);
  const altAbilities = selected.altAbilities.length
    ? selected.altAbilities.map((entry) => badge(entry.name, 'default')).join(' ')
    : badge('No alternate ability path', 'default');
  const altItems = selected.altItems.length
    ? selected.altItems.map((entry) => badge(entry.name, 'default')).join(' ')
    : badge('No alternate item path', 'default');
  const evolutionBadges = selected.evolutions.length
    ? selected.evolutions.map((entry) => badge(`${entry.name} via ${entry.via}`, 'warning')).join(' ')
    : badge('No further evolution', 'default');
  const noteList = selected.notes.length
    ? selected.notes.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')
    : '<li>Solid all-around entry with no extra pilot warnings.</li>';
  const transformationBadges = renderTransformationBadges(selected.transformation?.modes || []);
  const limitedUnitBadges = selected.limitedEdition
    ? `${badge(selected.limitedSeries || 'Limited', 'warning')} ${badge(selected.limitedBanner || 'Special Rotation', 'default')}`
    : badge('Standard roster', 'default');
  const previewCards = state.guides.map((guide) => `
    <article class="panelish build-preview-card ${guide.slug === selected.slug ? 'is-active' : ''}" data-build-card data-search="${escapeHtml(guide.searchText)}" data-types="${escapeHtml(guide.types.join(','))}" data-role="${escapeHtml(guide.roleKey)}" data-stage="${formatNumber(guide.stage)}">
      <div class="build-preview-head">
        ${renderMonsterPortrait(CONTENT.speciesMap.get(guide.speciesId), { small: true, caption: `#${formatNumber(guide.speciesId)} - Gen ${formatNumber(guide.generation)}` })}
        <div>
          <div class="card-top">
            <div>
              <h3>${escapeHtml(guide.name)}</h3>
              <p class="muted">${escapeHtml(guide.roleLabel)} &middot; Base total ${formatNumber(guide.total)}</p>
            </div>
            ${badge(`Stage ${formatNumber(guide.stage)}`, 'default')}
          </div>
          <div class="badge-row compact-row">${guide.types.map((type) => badge(titleLabel(type), type)).join(' ')} ${guide.limitedEdition ? badge('Limited', 'warning') : ''}</div>
        </div>
      </div>
      <p class="muted build-preview-line">${escapeHtml(guide.ability?.name || 'Battle Aura')} &middot; ${escapeHtml(guide.nature?.name || 'Neutral')} &middot; ${escapeHtml(guide.item?.name || 'No item')}</p>
      <p class="muted build-preview-line"><strong>EV:</strong> ${escapeHtml(guide.evSummary || 'No EV build')}</p>
      <p class="muted build-preview-line"><strong>IV:</strong> ${escapeHtml(guide.ivSummary || '31 all')}</p>
      <p class="muted build-preview-line"><strong>Transform:</strong> ${escapeHtml(guide.transformation?.primaryLabel || 'Base Form Only')}</p>
      <div class="badge-row compact-row build-preview-badges">${guide.coreMoves.slice(0, 4).map((move) => badge(move.name, move.category === 'status' ? 'default' : 'success')).join(' ')}</div>
      <div class="button-row gap-top">
        <a class="button ${guide.slug === selected.slug ? 'primary' : 'ghost'}" href="/builds/${escapeHtml(guide.slug)}">${guide.slug === selected.slug ? 'Viewing Guide' : 'Open Guide'}</a>
      </div>
    </article>`).join('');

  return `
    <section class="panel build-dex-shell">
      <div class="section-head">
        <div>
          <p class="eyebrow">Build Dex</p>
          <h1>Pokemon Build Guides</h1>
          <p class="muted">Every species now has a preview build guide with role, nature, ability, item path, EV build, IV build, and move recommendations. If you open a build by ID or slug, it now resolves here instead of falling into 404.</p>
        </div>
        <div class="badge-row">
          ${badge(`${formatNumber(state.guides.length)} guides`, 'success')}
          ${badge(`${formatNumber(selected.moveCount)} moves listed`, 'warning')}
          ${badge(selected.roleLabel, 'default')}
          ${selected.limitedEdition ? badge('Limited', 'warning') : ''}
        </div>
      </div>

      <section class="panelish build-focus-card" id="build-focus">
        <div class="build-focus-hero">
          <div class="build-focus-ident">
            ${renderMonsterPortrait(selectedSpecies, { caption: `#${formatNumber(selected.speciesId)} - Gen ${formatNumber(selected.generation)}` })}
            <div>
              <p class="eyebrow">Guide Preview</p>
              <h2>${escapeHtml(selected.name)}</h2>
              <p class="muted">${escapeHtml(selected.stageLabel)} &middot; ${escapeHtml(selected.roleLabel)} &middot; Base total ${formatNumber(selected.total)}</p>
              <div class="badge-row compact-row">
                ${selected.types.map((type) => badge(titleLabel(type), type)).join(' ')}
                ${badge(selected.rarity, selected.rarity === 'legendary' || selected.rarity === 'mythic' ? 'warning' : selected.rarity === 'epic' ? 'psychic' : 'default')}
                ${badge(`Stage ${formatNumber(selected.stage)}`, 'default')}
                ${limitedUnitBadges}
              </div>
            </div>
          </div>
          <div class="build-focus-summary">
            <div class="stat-card"><strong>${escapeHtml(selected.ability?.name || 'Battle Aura')}</strong><span>best ability</span></div>
            <div class="stat-card"><strong>${escapeHtml(selected.nature?.name || 'Neutral')}</strong><span>recommended nature</span></div>
            <div class="stat-card"><strong>${escapeHtml(selected.item?.name || 'No item')}</strong><span>main held item</span></div>
            <div class="stat-card"><strong>${escapeHtml(selected.transformation?.primaryLabel || 'Base Form Only')}</strong><span>transform path</span></div>
            <div class="stat-card"><strong>${formatNumber(selected.moveCount)}</strong><span>moves in learnset</span></div>
            <div class="stat-card"><strong>${escapeHtml(selected.evSummary || 'No EV build')}</strong><span>recommended EV build</span></div>
            <div class="stat-card"><strong>${escapeHtml(selected.ivSummary || '31 all')}</strong><span>recommended IV build</span></div>
          </div>
        </div>

        <div class="build-focus-grid">
          <article class="panelish build-copy-card">
            <h3>How To Pilot</h3>
            <p class="muted">${escapeHtml(selected.plan)}</p>
            <div class="badge-row compact-row">${selected.statLeaders.map((entry) => badge(`${entry.label} ${formatNumber(entry.value)}`, 'default')).join(' ')}</div>
            <ul class="clean-list compact gap-top">${noteList}</ul>
          </article>
          <article class="panelish build-copy-card">
            <h3>Alternative Paths</h3>
            <p class="muted"><strong>Other abilities:</strong></p>
            <div class="badge-row compact-row">${altAbilities}</div>
            <p class="muted gap-top"><strong>Other items:</strong></p>
            <div class="badge-row compact-row">${altItems}</div>
            <p class="muted gap-top"><strong>Evolution path:</strong></p>
            <div class="badge-row compact-row">${evolutionBadges}</div>
            <p class="muted gap-top"><strong>Transformation path:</strong></p>
            <div class="badge-row compact-row">${transformationBadges}</div>
            <p class="muted gap-top">${escapeHtml(selected.transformation?.summary || 'This build stays in base form.')}</p>
            ${selected.acquisitionNote ? `<p class="muted gap-top">${escapeHtml(selected.acquisitionNote)}</p>` : ''}
          </article>
          <article class="panelish build-copy-card">
            <h3>Type Profile</h3>
            <p class="muted"><strong>Pressure:</strong></p>
            <div class="badge-row compact-row">${renderMatchupBadges(matchup.offensePressure.slice(0, 6), 'success', 'Neutral offense')}</div>
            <p class="muted gap-top"><strong>Resists:</strong></p>
            <div class="badge-row compact-row">${renderMatchupBadges(matchup.defenseResistances.slice(0, 6), 'default', 'No standout resists')}</div>
            <p class="muted gap-top"><strong>Watch out for:</strong></p>
            <div class="badge-row compact-row">${renderMatchupBadges(matchup.defenseWeaknesses.slice(0, 6), 'warning', 'Few clean weaknesses')}</div>
          </article>
          <article class="panelish build-copy-card">
            <h3>Training Build</h3>
            <p class="muted"><strong>EV spread:</strong> ${escapeHtml(statSpreadSummary(selected.evSpread || {}))}</p>
            <p class="muted">${escapeHtml(selected.evRationale || 'Build the EVs into the stats this role actually uses.')}</p>
            <div class="badge-row compact-row">${badge(selected.evSummary || 'No EV build', 'warning')} ${badge(`${formatNumber(selected.evTotal || 0)} / 508 EV`, 'default')}</div>
            <p class="muted gap-top"><strong>IV spread:</strong> ${escapeHtml(statSpreadSummary(selected.ivSpread || {}))}</p>
            <p class="muted">${escapeHtml(selected.ivRationale || 'Max every IV unless the build clearly drops one unused attack stat.')}</p>
            <div class="badge-row compact-row">${badge(selected.ivSummary || '31 all', 'default')}</div>
          </article>
        </div>
      </section>

      <section class="market-section">
        <div class="section-head">
          <div>
            <h2>Core Moves</h2>
            <p class="muted">These are the cleanest four to start with for this build lane.</p>
          </div>
          ${badge(`${formatNumber(selected.coreMoves.length)} core picks`, 'warning')}
        </div>
        <div class="grid-two build-move-grid">${selected.coreMoves.map((row) => renderBuildGuideMoveCard(row, { core: true })).join('')}</div>
      </section>

      <section class="market-section">
        <div class="section-head">
          <div>
            <h2>Flex Moves</h2>
            <p class="muted">Swap these in when you want more control, coverage, or matchup-specific pressure.</p>
          </div>
          ${badge(`${formatNumber(selected.flexMoves.length)} flex picks`, 'default')}
        </div>
        <div class="grid-three build-move-grid">${selected.flexMoves.map((row) => renderBuildGuideMoveCard(row, { compact: true })).join('') || '<article class="panelish"><p class="muted">No extra flex moves were generated for this one yet.</p></article>'}</div>
      </section>

      <section class="market-section">
        <div class="section-head">
          <div>
            <h2>Full Learnset Preview</h2>
            <p class="muted">Full move path so you can plan ahead instead of guessing what unlocks next.</p>
          </div>
          ${badge(`Gen ${formatNumber(selected.generation)}`, 'default')}
        </div>
        <div class="grid-three build-learnset-grid">${selected.allMoves.map((row) => renderBuildGuideMoveCard(row, { compact: true })).join('')}</div>
      </section>

      <section class="panelish build-filter-panel" data-build-controls>
        <div class="section-head">
          <div>
            <h2>All Build Previews</h2>
            <p class="muted">Filter the whole dex by name, type, role, or stage and jump straight into the guide you need.</p>
          </div>
          <strong data-build-result-count>${formatNumber(state.guides.length)} entries</strong>
        </div>
        <div class="grid-two build-filter-grid">
          <label><span>Search</span><input type="search" placeholder="Search Pokemon, type, role, item" data-build-search /></label>
          <label><span>Type</span><select data-build-type><option value="">All types</option>${state.typeOptions.map((entry) => `<option value="${escapeHtml(entry.key)}">${escapeHtml(entry.label)}</option>`).join('')}</select></label>
          <label><span>Role</span><select data-build-role><option value="">All roles</option>${state.roleOptions.map((entry) => `<option value="${escapeHtml(entry.key)}">${escapeHtml(entry.label)} (${formatNumber(entry.count)})</option>`).join('')}</select></label>
          <label><span>Stage</span><select data-build-stage><option value="">All stages</option><option value="1">Stage 1</option><option value="2">Stage 2</option><option value="3">Stage 3</option><option value="4">Stage 4</option></select></label>
        </div>
      </section>

      <section class="grid-three build-preview-grid">${previewCards}</section>
    </section>
  `;
}

function buildBattleChat(run, encounter) {
  const activePlayer = run.party[encounter.playerIndex];
  const activeEnemy = encounter.enemyParty[encounter.enemyIndex];
  const heldItem = heldItemInfo(activePlayer);
  const transformModes = transformationModesForSpecies(CONTENT.speciesMap.get(activePlayer.speciesId));
  const lines = [];
  if (encounter.weather?.type && encounter.weather.type !== 'clear') {
    lines.push(`${CONTENT.weatherLabels[encounter.weather.type]} is active. ${encounter.weather.type === 'rain' ? 'Water moves are stronger.' : 'Fire moves are stronger.'}`);
  }
  if (activePlayer.currentHp <= activePlayer.stats.hp * 0.35) {
    lines.push('Medic: HP is low. A heal, defensive buff, or retreat could save this turn.');
  }
  if (activeEnemy.status) {
    lines.push(`Scout: The enemy is ${activeEnemy.status.type}. Keep pressure on.`);
  }
  if (heldItem?.holdEffect === 'z-crystal' && !activePlayer.zMoveUsed) {
    lines.push('Tech: Your Z-Move is online for a matching attack.');
  }
  if (heldItem?.holdEffect === 'mega-stone' && !activePlayer.megaEvolved && transformModes.includes('mega')) {
    lines.push('Coach: Mega Evolution is ready if you want a tempo swing.');
  }
  if (heldItem?.holdEffect === 'ultra-core' && !activePlayer.ultraBurst && transformModes.includes('ultra')) {
    lines.push('Analyst: Ultra Burst is available for a fully evolved power spike.');
  }
  if (heldItem?.holdEffect === 'dynamax-band' && !activePlayer.dynamaxed && transformModes.includes('dynamax')) {
    lines.push('Command: Dynamax is available if you need a bulk and pressure spike.');
  }
  if (heldItem?.holdEffect === 'variant-core' && !activePlayer.variantShift && transformModes.includes('variant')) {
    lines.push('Research: Variant Form can swap you into a different move kit on demand.');
  }
  if (activeEnemy.currentHp <= activeEnemy.stats.hp * 0.3 && encounter.canCapture) {
    lines.push('Capture Team: The target is weak enough to try a stronger ball.');
  }
  if (!lines.length) {
    lines.push('Field Notes: The squad is stable. Keep trading efficiently and watch PP.');
  }
  return lines.slice(0, 4);
}

function renderMonsterBattleCard(monster, active = false) {
  const species = CONTENT.speciesMap.get(monster.speciesId);
  const hpPercent = Math.max(0, Math.round((monster.currentHp / Math.max(1, monster.stats.hp)) * 100));
  const ability = abilityInfo(monster);
  const heldItem = heldItemInfo(monster);
  const aura = auraInfo(monster);
  const statusBits = [
    active ? badge('Active', 'success') : '',
    monster.status?.type ? badge(monster.status.type, 'warning') : '',
    monster.megaEvolved ? badge('Mega', 'success') : '',
    monster.ultraBurst ? badge('Ultra', 'warning') : '',
    monster.dynamaxed ? badge('Dynamax', 'warning') : '',
    monster.variantShift ? badge('Variant', 'psychic') : '',
  ].filter(Boolean).join(' ');
  return `
    <article class="monster-card battle-monster-card aura-${escapeHtml(aura?.slug || 'normal')} ${active ? 'active' : ''}">
      <div class="card-top">
        <h3>${escapeHtml(battleMonsterName(monster))}</h3>
        ${statusBits}
      </div>
      <div class="monster-pulse">${escapeHtml((monster.nickname || monster.name).slice(0, 2).toUpperCase())}</div>
      <p>${species.types.map((type) => badge(type, type)).join(' ')}</p>
      ${natureBadges(monster)}
      ${auraBadges(monster)}
      <div class="badge-row compact-row">
        ${ability ? badge(ability.name, 'default') : ''}
        ${heldItem ? badge(heldItem.name, 'warning') : badge('No held item', 'default')}
      </div>
      <p class="muted">Lv ${monster.level} - HP ${monster.currentHp}/${monster.stats.hp}</p>
      <div class="health hp-bar"><span style="width:${hpPercent}%"></span></div>
      <div class="stat-line">Atk ${monster.stats.atk} / Def ${monster.stats.def} / SpA ${monster.stats.spa} / SpD ${monster.stats.spd} / Spe ${monster.stats.spe}</div>
      <div class="stat-line">Total ${formatNumber(statTotal(monster.stats))}</div>
    </article>
  `;
}

function renderRewardView(run) {
  const rewardCards = run.pendingReward.rewardChoices.map((reward, index) => `
    <form method="post" action="/play/reward" class="reward-card panel">
      <input type="hidden" name="action" value="claim" />
      <input type="hidden" name="rewardIndex" value="${index}" />
      <h3>${escapeHtml(reward.label)}</h3>
      <p class="muted">${reward.kind === 'cash' ? 'Immediate run cash.' : reward.kind === 'heal' ? 'Recover the whole team.' : 'Add this to your run bag.'}</p>
      <button class="button primary" type="submit">Claim</button>
    </form>
  `).join('');
  const shopCards = run.pendingReward.shopOffers.map((offer) => {
    const item = CONTENT.itemMap.get(offer.slug);
    const canBuyThree = run.money >= offer.price * 3;
    return `
      <form method="post" action="/play/reward" class="shop-card panel">
        <input type="hidden" name="action" value="buy" />
        <input type="hidden" name="itemSlug" value="${escapeHtml(offer.slug)}" />
        <h3>${escapeHtml(item.name)}</h3>
        <p class="muted">${escapeHtml(item.description)}</p>
        <p>${money(offer.price)} each</p>
        <div class="quantity-selector compact">
          <button class="button ghost" type="submit" name="quantity" value="1">Buy x1</button>
          <button class="button ${canBuyThree ? 'primary' : 'ghost'}" type="submit" name="quantity" value="3" ${canBuyThree ? '' : 'disabled'}>Buy x3</button>
        </div>
      </form>
    `;
  }).join('');
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Between waves</p>
          <h1>Reward and Shop</h1>
        </div>
        <form method="post" action="/play/reward" class="inline-form">
          <input type="hidden" name="action" value="continue" />
          <button class="button primary" type="submit">Continue to wave ${formatNumber(run.wave + 1)}</button>
        </form>
      </div>
      <p class="muted">Run cash ${money(run.money)} - bag items ${Object.keys(run.bag).length}</p>
      <div class="grid-two">${rewardCards}</div>
      <div class="section-head gap-top">
        <h2>Wave Shop</h2>
        <form method="post" action="/play/reward" class="inline-form">
          <input type="hidden" name="action" value="reroll" />
          <button class="button ghost" type="submit">Reroll offers</button>
        </form>
      </div>
      <div class="grid-three">${shopCards}</div>
    </section>
  `;
}

function renderRunSummaryScreen(summary, user) {
  if (!summary) {
    return `
      <section class="panel">
        <h1>Run Summary</h1>
        <p class="muted">No recent run summary is available yet.</p>
        <div class="button-row gap-top">
          <a class="button primary" href="/play/new">Start a run</a>
          <a class="button ghost" href="/hub">Back to menu</a>
        </div>
      </section>
    `;
  }
  return `
    <section class="panel run-summary-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Run Summary</p>
          <h1>${escapeHtml(summary.label || `${summary.mode} run`)} - ${escapeHtml(summary.outcome || 'complete')}</h1>
          <p class="muted">Ended ${escapeHtml(formatDateTime(summary.endedAt))}. Remaining run cash has been banked into persistent account cash.</p>
        </div>
        <div class="badge-row">
          ${badge(summary.outcome || 'complete', outcomeTone(summary.outcome))}
          ${badge(`Wave ${formatNumber(summary.wave || 0)}`, 'default')}
          ${badge(`Account Cash ${money(summary.endingAccountCash || user.cash)}`, 'warning')}
        </div>
      </div>
      <div class="stat-grid run-summary-grid">
        <div class="stat-card"><strong>${money(summary.runCash || 0)}</strong><span>run cash left</span></div>
        <div class="stat-card"><strong>${money(summary.bankedCash || 0)}</strong><span>banked on finish</span></div>
        <div class="stat-card"><strong>${money(summary.battleAccountCash || 0)}</strong><span>battle cash earned</span></div>
        <div class="stat-card"><strong>${money(summary.totalAccountCashEarned || 0)}</strong><span>total account payout</span></div>
        <div class="stat-card"><strong>${formatNumber(summary.captures || 0)}</strong><span>captures</span></div>
        <div class="stat-card"><strong>${formatNumber(summary.party?.length || 0)}</strong><span>party members</span></div>
      </div>
      <div class="grid-two summary-grid gap-top">
        <article class="panelish summary-panel">
          <h2>Party Snapshot</h2>
          <ul class="clean-list compact learnset-list">
            ${(summary.party || []).map((monster) => `<li class="learnset-row"><strong>${escapeHtml(monster.name)}</strong><span>Lv ${formatNumber(monster.level || 0)} - HP ${formatNumber(monster.hp || 0)}</span></li>`).join('') || '<li class="learnset-row"><strong>No party data</strong><span>The last run ended before a party snapshot was saved.</span></li>'}
          </ul>
        </article>
        <article class="panelish summary-panel">
          <h2>Next Step</h2>
          <p class="muted">Jump right back in, tune your monsters in storage, or return to the menu before your next draft.</p>
          <div class="button-row gap-top">
            <a class="button primary" href="/play/new">Rerun</a>
            <a class="button ghost" href="/hub">Back to menu</a>
            <a class="button ghost" href="/collection">Open collection</a>
          </div>
        </article>
      </div>
    </section>
  `;
}

function battleMonsterStateBadges(monster, options = {}) {
  return [
    options.active ? badge('Active', 'success') : '',
    monster.status?.type ? badge(titleLabel(monster.status.type), 'warning') : '',
    monster.megaEvolved ? badge('Mega', 'success') : '',
    monster.ultraBurst ? badge('Ultra', 'warning') : '',
    monster.dynamaxed ? badge('Dynamax', 'warning') : '',
    monster.variantShift ? badge('Variant', 'psychic') : '',
  ].filter(Boolean).join(' ');
}

function renderBattleFaceoffPanel(monster, options = {}) {
  const species = CONTENT.speciesMap.get(monster.speciesId);
  if (!species) {
    return '';
  }
  const side = options.side === 'enemy' ? 'enemy' : 'player';
  const hpPercent = Math.max(0, Math.round((monster.currentHp / Math.max(1, monster.stats.hp)) * 100));
  const ability = abilityInfo(monster);
  const heldItem = heldItemInfo(monster);
  const aura = auraInfo(monster);
  const nature = natureInfo(monster);
  const identityBadges = `${species.types.map((type) => badge(titleLabel(type), type)).join(' ')} ${battleMonsterStateBadges(monster, { active: options.active })}`.trim();
  return `
    <article class="battle-active-panel battle-active-panel-${side}">
      <div class="battle-active-head">
        <div>
          <p class="eyebrow">${escapeHtml(options.label || (side === 'enemy' ? 'Opponent active' : 'Your active monster'))}</p>
          <h2>${escapeHtml(battleMonsterName(monster))}</h2>
        </div>
        <div class="battle-active-vitals">
          <strong>Lv ${formatNumber(monster.level)}</strong>
          <span>HP ${formatNumber(monster.currentHp)}/${formatNumber(monster.stats.hp)}</span>
        </div>
      </div>
      <div class="battle-active-body">
        <div class="battle-active-art battle-active-art-${side}">
          ${renderMonsterPortrait(species, { caption: species.types.map((type) => titleLabel(type)).join(' / ') })}
        </div>
        <div class="battle-active-copy">
          <div class="badge-row compact-row">${identityBadges}</div>
          <div class="health hp-bar battle-active-health"><span style="width:${hpPercent}%"></span></div>
          <p class="battle-active-note">${escapeHtml(ability?.name || 'Battle Aura')} - ${escapeHtml(heldItem?.name || 'No held item')}</p>
          <p class="battle-active-note">${escapeHtml(aura?.name || 'Standard aura')} - ${escapeHtml(nature?.name || 'Neutral nature')}</p>
          <div class="battle-active-stats">
            <span>Atk ${formatNumber(monster.stats.atk)}</span>
            <span>Def ${formatNumber(monster.stats.def)}</span>
            <span>SpA ${formatNumber(monster.stats.spa)}</span>
            <span>SpD ${formatNumber(monster.stats.spd)}</span>
            <span>Spe ${formatNumber(monster.stats.spe)}</span>
            <span>Total ${formatNumber(statTotal(monster.stats))}</span>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderBattleMoveTile(moveState, options = {}) {
  const move = CONTENT.moveMap.get(moveState.id);
  if (!move) {
    return '';
  }
  const palette = paletteForType(move.type);
  const title = moveState.displayName || move.name;
  const description = moveState.displayDescription || move.description;
  const powerLabel = move.category === 'status' ? 'Status' : `Power ${formatNumber(move.power)}`;
  const tileShell = `
    <div class="battle-move-tile-shell palette-${escapeHtml(palette)}">
      <div class="battle-move-tile-top">
        <div>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(description)}</span>
        </div>
        <span class="battle-move-type-badge">${escapeHtml(titleLabel(move.type))}</span>
      </div>
      <div class="battle-move-tile-meta">
        <span>${escapeHtml(titleLabel(move.category))}</span>
        <span>${escapeHtml(powerLabel)}</span>
        <span>Acc ${formatNumber(move.accuracy)}</span>
        <span>PP ${formatNumber(moveState.pp)}/${formatNumber(moveState.maxPp)}</span>
      </div>
    </div>
  `;
  if (options.readonly) {
    return `<article class="battle-move-tile battle-move-tile-readonly">${tileShell}</article>`;
  }
  return `
    <article class="battle-move-tile ${options.zReady ? 'z-ready' : ''}">
      ${tileShell}
      <div class="battle-move-actions">
        <form method="post" action="/play/action" class="battle-move-form">
          <input type="hidden" name="action" value="move" />
          <input type="hidden" name="moveIndex" value="${options.moveIndex}" />
          <button class="button ${move.category === 'status' ? 'ghost' : 'primary'} battle-move-submit" type="submit">Use Move</button>
        </form>
        ${options.zReady ? `
          <form method="post" action="/play/action" class="battle-move-form">
            <input type="hidden" name="action" value="move" />
            <input type="hidden" name="moveIndex" value="${options.moveIndex}" />
            <input type="hidden" name="battleMode" value="z" />
            <button class="button accent battle-move-submit" type="submit">Z-Move</button>
          </form>
        ` : ''}
      </div>
    </article>
  `;
}

function renderBattleRosterCard(monster, options = {}) {
  const species = CONTENT.speciesMap.get(monster.speciesId);
  if (!species) {
    return '';
  }
  const hpPercent = Math.max(0, Math.round((monster.currentHp / Math.max(1, monster.stats.hp)) * 100));
  const stateLabel = options.active ? 'Active' : monster.currentHp <= 0 ? 'KO' : options.side === 'enemy' ? 'Seen' : 'Ready';
  return `
    <article class="battle-roster-card ${options.active ? 'is-active' : ''} ${monster.currentHp <= 0 ? 'is-fainted' : ''}">
      <div class="battle-roster-icon palette-${escapeHtml(paletteForType(species.types?.[0]))}">${escapeHtml((monster.nickname || monster.name).slice(0, 2).toUpperCase())}</div>
      <div class="battle-roster-copy">
        <strong>${escapeHtml(battleMonsterName(monster))}</strong>
        <span>Lv ${formatNumber(monster.level)} - HP ${formatNumber(monster.currentHp)}/${formatNumber(monster.stats.hp)}</span>
        <div class="health hp-bar battle-roster-health"><span style="width:${hpPercent}%"></span></div>
      </div>
      <span class="battle-roster-state">${escapeHtml(stateLabel)}</span>
    </article>
  `;
}

function renderBattleSwitchCard(monster, index, activeIndex) {
  const species = CONTENT.speciesMap.get(monster.speciesId);
  if (!species) {
    return '';
  }
  const disabled = monster.currentHp <= 0 || index === activeIndex;
  const hpPercent = Math.max(0, Math.round((monster.currentHp / Math.max(1, monster.stats.hp)) * 100));
  const actionLabel = index === activeIndex ? 'Active Now' : monster.currentHp <= 0 ? 'Fainted' : 'Switch In';
  return `
    <form method="post" action="/play/action" class="battle-switch-card ${index === activeIndex ? 'is-active' : ''} ${monster.currentHp <= 0 ? 'is-disabled' : ''}">
      <input type="hidden" name="action" value="switch" />
      <input type="hidden" name="targetIndex" value="${index}" />
      <div class="battle-switch-card-head">
        <div class="battle-roster-icon palette-${escapeHtml(paletteForType(species.types?.[0]))}">${escapeHtml((monster.nickname || monster.name).slice(0, 2).toUpperCase())}</div>
        <div class="battle-roster-copy">
          <strong>${escapeHtml(monsterLabel(monster))}</strong>
          <span>Lv ${formatNumber(monster.level)} - HP ${formatNumber(monster.currentHp)}/${formatNumber(monster.stats.hp)}</span>
        </div>
      </div>
      <div class="health hp-bar battle-roster-health"><span style="width:${hpPercent}%"></span></div>
      <button class="button ${index === activeIndex ? 'accent' : 'ghost'}" type="submit" ${disabled ? 'disabled' : ''}>${escapeHtml(actionLabel)}</button>
    </form>
  `;
}

function renderBattleView(run) {
  const encounter = run.encounter;
  const activePlayer = run.party[encounter.playerIndex];
  const activeEnemy = encounter.enemyParty[encounter.enemyIndex];
  const activeHeldItem = heldItemInfo(activePlayer);
  const species = CONTENT.speciesMap.get(activePlayer.speciesId);
  const transformModes = transformationModesForSpecies(species);
  const specialLocked = activePlayer.megaEvolved || activePlayer.ultraBurst || activePlayer.dynamaxed || activePlayer.variantShift;
  const canMega = activeHeldItem?.holdEffect === 'mega-stone' && !specialLocked && species?.stage >= 2 && transformModes.includes('mega');
  const canUltra = activeHeldItem?.holdEffect === 'ultra-core' && !specialLocked && species?.stage >= 3 && transformModes.includes('ultra');
  const canDynamax = activeHeldItem?.holdEffect === 'dynamax-band' && !specialLocked && transformModes.includes('dynamax');
  const canVariant = activeHeldItem?.holdEffect === 'variant-core' && !specialLocked && transformModes.includes('variant');
  const latestMessage = encounter.latestMessage || encounter.log[encounter.log.length - 1] || 'Awaiting the next command...';
  const playerMoveTiles = activePlayer.moves.length
    ? activePlayer.moves.map((moveState, index) => {
      const move = CONTENT.moveMap.get(moveState.id);
      const zReady = activeHeldItem?.holdEffect === 'z-crystal' && !activePlayer.zMoveUsed && move && activeHeldItem.holdType === move.type;
      return renderBattleMoveTile(moveState, { moveIndex: index, zReady });
    }).join('')
    : '<article class="battle-move-empty">No moves are available for the active monster.</article>';
  const enemyMoveTiles = activeEnemy.moves?.length
    ? activeEnemy.moves.map((moveState) => renderBattleMoveTile(moveState, { readonly: true })).join('')
    : '<article class="battle-move-empty">Enemy move data is still hidden.</article>';
  const switchCards = run.party.map((monster, index) => renderBattleSwitchCard(monster, index, encounter.playerIndex)).join('');
  const itemOptions = Object.entries(run.bag).map(([slug, quantity]) => {
    const item = CONTENT.itemMap.get(slug);
    if (!item || item.category === 'capture') {
      return '';
    }
    return `<option value="${slug}">${escapeHtml(item.name)} x${formatNumber(quantity)}</option>`;
  }).filter(Boolean).join('');
  const captureOptions = Object.entries(run.bag).map(([slug, quantity]) => {
    const item = CONTENT.itemMap.get(slug);
    if (!item || item.category !== 'capture') {
      return '';
    }
    return `<option value="${slug}">${escapeHtml(item.name)} x${formatNumber(quantity)}</option>`;
  }).filter(Boolean).join('');
  const playerRoster = run.party.map((monster, index) => renderBattleRosterCard(monster, { active: index === encounter.playerIndex, side: 'player' })).join('');
  const enemyRoster = encounter.enemyParty.map((monster, index) => renderBattleRosterCard(monster, { active: index === encounter.enemyIndex, side: 'enemy' })).join('');
  const log = encounter.log.map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  const chat = buildBattleChat(run, encounter).map((line) => `<li>${escapeHtml(line)}</li>`).join('');
  const weatherTone = encounter.weather?.type === 'sun' ? 'warning' : encounter.weather?.type === 'rain' ? 'success' : 'default';
  const weatherLabel = CONTENT.weatherLabels[encounter.weather?.type || 'clear'] || 'Clear Skies';
  const playerHpPercent = Math.max(0, Math.round((activePlayer.currentHp / Math.max(1, activePlayer.stats.hp)) * 100));
  const enemyHpPercent = Math.max(0, Math.round((activeEnemy.currentHp / Math.max(1, activeEnemy.stats.hp)) * 100));
  const momentumDelta = playerHpPercent - enemyHpPercent;
  const momentumLabel = momentumDelta >= 20
    ? 'Momentum: You'
    : momentumDelta <= -20
      ? 'Momentum: Enemy'
      : 'Momentum: Even';
  const momentumTone = momentumDelta >= 20 ? 'success' : momentumDelta <= -20 ? 'warning' : 'default';
  const encounterLabel = encounter.canCapture ? 'Wild Encounter' : 'Trainer Battle';
  const encounterHint = encounter.canCapture
    ? 'Weaken the target, then throw a stronger capture tool.'
    : 'Trainer-owned Pokemon cannot be captured in this battle.';

  return `
    <section class="battle-shell battle-faceoff-shell">
      <section class="panel battle-faceoff-header">
        <div>
          <p class="eyebrow">${escapeHtml(run.mode)} mode</p>
          <h1>Wave ${formatNumber(run.wave)}: ${escapeHtml(encounter.title)}</h1>
          <div class="badge-row battle-badges">
            ${badge(weatherLabel, weatherTone)}
            ${badge(`Turn ${encounter.turn}`, 'default')}
            ${badge(`Run Cash ${money(run.money)}`, 'default')}
            ${badge(encounter.region || 'Frontier', 'success')}
            ${badge(encounter.phase || 'day', encounter.phase === 'night' ? 'ghost' : 'warning')}
            ${badge(momentumLabel, momentumTone)}
          </div>
          <p class="muted">Biome ${escapeHtml(encounter.biome)} - ability ${escapeHtml(abilityInfo(activePlayer)?.name || 'Battle Aura')} - held item ${escapeHtml(activeHeldItem?.name || 'none')} - ${escapeHtml(encounter.ambientEvent?.label || 'Quiet route')}</p>
        </div>
        <form method="post" action="/play/abandon" class="inline-form">
          <button class="button danger" type="submit">Abandon run</button>
        </form>
      </section>

      <section class="panel battle-faceoff-board">
        <div class="battle-board-ribbon">
          <span class="battle-board-chip">${escapeHtml(encounterLabel)}</span>
          <span>${escapeHtml(encounter.region || 'Frontier')}</span>
          <span>${escapeHtml(encounter.biome)}</span>
        </div>
        <div class="battle-faceoff-grid">
          <div class="battle-foe-moves">
            <div class="battle-faceoff-subhead">
              <p class="eyebrow">Opponent pressure</p>
              <h2>Known Move Set</h2>
            </div>
            <div class="battle-move-grid battle-move-grid-foe">${enemyMoveTiles}</div>
          </div>

          <div class="battle-active-slot battle-active-slot-enemy">
            ${renderBattleFaceoffPanel(activeEnemy, { side: 'enemy', label: encounter.canCapture ? 'Wild target' : 'Opponent active', active: true })}
          </div>

          <div class="battle-board-message-wrap">
            <div class="battle-versus-chip">VS</div>
            <div class="battle-message-screen battle-board-message battleTextOutput impact-${escapeHtml(encounter.lastMoveType || 'normal')}" data-battle-message data-text="${escapeHtml(latestMessage)}">${escapeHtml(latestMessage)}</div>
            <div class="badge-row compact-row">
              ${badge(weatherLabel, weatherTone)}
              ${badge(`Turn ${encounter.turn}`, 'default')}
              ${badge(`Cash ${money(run.money)}`, 'warning')}
              ${badge(momentumLabel, momentumTone)}
            </div>
            <p class="battle-board-hint">${escapeHtml(encounterHint)}</p>
          </div>

          <div class="battle-active-slot battle-active-slot-player">
            ${renderBattleFaceoffPanel(activePlayer, { side: 'player', label: 'Your active monster', active: true })}
          </div>

          <section class="battle-console" data-tab-group="battle-actions">
            <div class="battle-console-head">
              <div>
                <p class="eyebrow">Battle command</p>
                <h2>Choose Your Action</h2>
              </div>
              <div class="tab-strip battle-tab-strip">
                <button class="tab-button is-active" type="button" data-tab-target="fight">Fight</button>
                <button class="tab-button" type="button" data-tab-target="item">Item</button>
                <button class="tab-button" type="button" data-tab-target="switch">Switch</button>
                <button class="tab-button" type="button" data-tab-target="special">Special</button>
                <button class="tab-button" type="button" data-tab-target="run">Run</button>
              </div>
            </div>
            <div class="tab-panel is-active" data-tab-panel="fight">
              <div class="battle-move-grid battle-move-grid-player">${playerMoveTiles}</div>
            </div>
            <div class="tab-panel" data-tab-panel="item">
              <div class="battle-console-grid">
                <form method="post" action="/play/action" class="stack-form battle-utility-card">
                  <input type="hidden" name="action" value="item" />
                  <h3>Battle Item</h3>
                  <p class="muted">Healing, buffs, and emergency tools from your run bag.</p>
                  <label>
                    <span>Choose item</span>
                    <select name="itemSlug">${itemOptions || '<option value="">No usable battle items</option>'}</select>
                  </label>
                  <button class="button ghost" type="submit">Use item</button>
                </form>
                ${encounter.canCapture ? `
                  <form method="post" action="/play/action" class="stack-form battle-utility-card">
                    <input type="hidden" name="action" value="capture" />
                    <h3>Capture Tool</h3>
                    <p class="muted">When HP is low, throw your best orb.</p>
                    <label>
                      <span>Choose orb</span>
                      <select name="itemSlug">${captureOptions || '<option value="">No capture items</option>'}</select>
                    </label>
                    <button class="button accent" type="submit">Capture</button>
                  </form>
                ` : `
                  <article class="battle-utility-card battle-utility-muted">
                    <h3>Capture Locked</h3>
                    <p class="muted">This encounter belongs to another trainer, so capturing is disabled.</p>
                  </article>
                `}
              </div>
            </div>
            <div class="tab-panel" data-tab-panel="switch">
              <div class="battle-switch-grid">${switchCards}</div>
            </div>
            <div class="tab-panel" data-tab-panel="special">
              <div class="battle-console-grid">
                <article class="battle-utility-card">
                  <h3>Transformation Deck</h3>
                  <p class="muted">Mega, Ultra, Dynamax, and Variant forms each use a different battle name and temporary move kit.</p>
                  <div class="button-row">
                    ${canMega ? `
                      <form method="post" action="/play/action" class="inline-form">
                        <input type="hidden" name="action" value="transform" />
                        <input type="hidden" name="transformMode" value="mega" />
                        <button class="button accent" type="submit">Mega Evolve</button>
                      </form>
                    ` : ''}
                    ${canUltra ? `
                      <form method="post" action="/play/action" class="inline-form">
                        <input type="hidden" name="action" value="transform" />
                        <input type="hidden" name="transformMode" value="ultra" />
                        <button class="button accent" type="submit">Ultra Burst</button>
                      </form>
                    ` : ''}
                    ${canDynamax ? `
                      <form method="post" action="/play/action" class="inline-form">
                        <input type="hidden" name="action" value="transform" />
                        <input type="hidden" name="transformMode" value="dynamax" />
                        <button class="button accent" type="submit">Dynamax</button>
                      </form>
                    ` : ''}
                    ${canVariant ? `
                      <form method="post" action="/play/action" class="inline-form">
                        <input type="hidden" name="action" value="transform" />
                        <input type="hidden" name="transformMode" value="variant" />
                        <button class="button accent" type="submit">Variant Form</button>
                      </form>
                    ` : ''}
                    ${!canMega && !canUltra && !canDynamax && !canVariant ? '<p class="muted">No special transformation is available for the active monster right now.</p>' : ''}
                  </div>
                </article>
                <article class="battle-utility-card battle-utility-muted">
                  <h3>Z-Move Routing</h3>
                  <p class="muted">Matching Z Crystals add an extra Z-Move button directly onto compatible attacks in the Fight menu.</p>
                </article>
              </div>
            </div>
            <div class="tab-panel" data-tab-panel="run">
              <div class="battle-console-grid">
                <form method="post" action="/play/action" class="stack-form battle-utility-card">
                  <input type="hidden" name="action" value="run" />
                  <h3>Retreat</h3>
                  <p class="muted">Wild fights can be escaped, but you lose run cash and skip the reward screen.</p>
                  <button class="button ghost" type="submit">Try to run</button>
                </form>
                <article class="battle-utility-card battle-utility-muted">
                  <h3>Field Notes</h3>
                  <p class="muted">Battle text, weather, momentum, and capture state are all mirrored in the arena board so you can make decisions faster.</p>
                </article>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section class="battle-team-grid">
        <article class="panel battle-team-panel battle-team-panel-enemy">
          <div class="section-head">
            <div>
              <p class="eyebrow">Opponent squad</p>
              <h2>Enemy Team Preview</h2>
            </div>
            ${badge(`${formatNumber(encounter.enemyParty.length)} slots`, 'warning')}
          </div>
          <div class="battle-roster-stack">${enemyRoster}</div>
        </article>
        <article class="panel battle-team-panel battle-team-panel-player">
          <div class="section-head">
            <div>
              <p class="eyebrow">Your squad</p>
              <h2>Your Team Preview</h2>
            </div>
            <a class="button ghost" href="/collection">Open Summary Screen</a>
          </div>
          <div class="battle-roster-stack">${playerRoster}</div>
        </article>
      </section>

      <article class="panel battle-feed-panel" data-tab-group="battle-feed">
        <div class="section-head">
          <div>
            <p class="eyebrow">Battle feed</p>
            <h2>Messages and Combat Log</h2>
          </div>
          <div class="tab-strip compact-tabs">
            <button class="tab-button is-active" type="button" data-tab-target="messages">Messages</button>
            <button class="tab-button" type="button" data-tab-target="combat-log">Combat Log</button>
            <button class="tab-button" type="button" data-tab-target="party-chat">Party Chat</button>
          </div>
        </div>
        <div class="tab-panel is-active" data-tab-panel="messages">
          <div class="battle-message-screen battle-feed-message impact-${escapeHtml(encounter.lastMoveType || 'normal')}">${escapeHtml(latestMessage)}</div>
        </div>
        <div class="tab-panel" data-tab-panel="combat-log">
          <ul class="clean-list compact scroll-list combatLog" data-autoscroll>${log}</ul>
        </div>
        <div class="tab-panel" data-tab-panel="party-chat">
          <ul class="clean-list compact fightMessages">${chat}</ul>
        </div>
      </article>
    </section>
  `;
}

function renderCollection(state) {
  const trainer = trainerSnapshot(state);
  const progression = state.progression || { profile: { level: 1, expIntoLevel: 0, expForNextLevel: 1 }, progressPercent: 0, selectedTitle: { name: 'Rookie Tamer' }, activeClass: { name: 'Collector' }, winRate: 0, totalRuns: 0 };
  const dashboardData = buildCollectionDashboardData(state);
  const caughtSet = new Set(state.caughtSpeciesIds || []);
  const seenButNotCaught = CONTENT.species
    .filter((species) => (state.seenSpeciesIds || []).includes(species.id) && !caughtSet.has(species.id))
    .slice(0, 12);
  const favoriteEntries = (state.favoriteEntries || []).filter((entry) => !entry.monster.hiddenLegacyStarter && !entry.monster.hiddenFromStable);
  const seenProgress = CONTENT.species.length ? Math.min(100, Math.round((trainer.seenCount / CONTENT.species.length) * 100)) : 0;
  const caughtProgress = CONTENT.species.length ? Math.min(100, Math.round((trainer.caughtCount / CONTENT.species.length) * 100)) : 0;
  const generationOptions = Array.from({ length: 6 }, (_, index) => index + 1);
  const statLabels = { hp: 'HP', atk: 'Attack', def: 'Defense', spa: 'Sp. Atk', spd: 'Sp. Def', spe: 'Speed' };
  const partyEntries = (state.partySlots || []).filter(Boolean);
  const teamTotals = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].reduce((summary, key) => {
    summary[key] = partyEntries.reduce((sum, entry) => sum + Number(entry.monster.stats?.[key] || 0), 0);
    return summary;
  }, {});
  const teamOffenseTypes = [...new Set(partyEntries.flatMap((entry) => entry.species?.types || []))];
  const teamOffenseSummary = matchupSummary(teamOffenseTypes.length ? teamOffenseTypes : ['normal']);
  const teamDefenseSummary = CONTENT.types.map((type) => {
    const multipliers = partyEntries.map((entry) => typeMultiplier(type, entry.species?.types || ['normal']));
    return {
      type,
      weak: multipliers.filter((value) => value > 1).length,
      resist: multipliers.filter((value) => value < 1 && value > 0).length,
      immune: multipliers.filter((value) => value === 0).length,
    };
  });
  const exposedTypes = teamDefenseSummary
    .filter((entry) => entry.weak > entry.resist + entry.immune)
    .sort((left, right) => (right.weak - right.resist) - (left.weak - left.resist) || left.type.localeCompare(right.type));
  const coveredTypes = teamDefenseSummary
    .filter((entry) => entry.resist + entry.immune >= entry.weak && (entry.resist || entry.immune))
    .sort((left, right) => (right.resist + right.immune - right.weak) - (left.resist + left.immune - left.weak) || left.type.localeCompare(right.type));
  const renderDexCard = (entry, options = {}) => {
    const monster = entry.monster;
    const ability = abilityInfo(monster);
    const heldItem = heldItemInfo(monster);
    const starterPerk = starterPerkInfo(monster);
    const aura = auraInfo(monster);
    const isPartner = state.identity.partner?.id === entry.id;
    const partySlotIndex = state.partySlots.findIndex((slot) => slot?.id === entry.id);
    const generation = generationForSpecies(entry.species);
    const searchValue = [monsterLabel(monster), entry.species.name, entry.species.types.join(' ')].join(' ').toLowerCase();
    return `
      <article
        class="monster-card panelish collection-card-expanded dex-card aura-${escapeHtml(aura?.slug || 'normal')} ${options.compact ? 'dex-card-compact' : ''}"
        data-collection-card
        data-name="${escapeHtml(searchValue)}"
        data-types="${escapeHtml((entry.species.types || []).join('|'))}"
        data-generation="${generation}"
        data-favorite="${entry.favorite ? '1' : '0'}"
        data-total="${statTotal(monster.stats)}"
        data-base-total="${statTotal(entry.species.baseStats)}"
        data-level="${Number(monster.level || 0)}"
        data-hp="${Number(monster.stats.hp || 0)}"
        data-atk="${Number(monster.stats.atk || 0)}"
        data-def="${Number(monster.stats.def || 0)}"
        data-spa="${Number(monster.stats.spa || 0)}"
        data-spd="${Number(monster.stats.spd || 0)}"
        data-spe="${Number(monster.stats.spe || 0)}"
      >
        <div class="card-top">
          <div>
            <h3>${escapeHtml(monsterLabel(monster))}</h3>
            <p class="muted">${escapeHtml(entry.species.name)} &middot; Gen ${generation}</p>
          </div>
          <div class="badge-row compact-row">
            ${entry.favorite ? badge('Favorite', 'warning') : badge('Owned', 'success')}
            ${isPartner ? badge('Partner', 'success') : ''}
            ${partySlotIndex >= 0 ? badge(`Party ${partySlotIndex + 1}`, 'warning') : ''}
          </div>
        </div>
        ${renderMonsterPortrait(entry.species, { caption: `Lv ${monster.level}` })}
        <div class="badge-row compact-row">
          ${entry.species.types.map((type) => badge(titleLabel(type), type)).join(' ')}
        </div>
        ${natureBadges(monster)}
        ${auraBadges(monster)}
        <div class="badge-row compact-row">
          ${ability ? badge(ability.name, 'default') : ''}
          ${heldItem ? badge(heldItem.name, 'warning') : badge('No held item', 'default')}
          ${starterPerk ? badge(starterPerk.name, 'default') : ''}
        </div>
        <div class="dex-stat-grid">
          <div><strong>${formatNumber(statTotal(monster.stats))}</strong><span>Total</span></div>
          <div><strong>${formatNumber(monster.stats.hp)}</strong><span>HP</span></div>
          <div><strong>${formatNumber(monster.stats.atk)}</strong><span>Atk</span></div>
          <div><strong>${formatNumber(monster.stats.spe)}</strong><span>Spe</span></div>
        </div>
        <p class="muted">${escapeHtml(monster.metLocation || entry.species.biome)} &middot; ${escapeHtml(monster.boxTag || 'Box 1')}</p>
        <div class="button-row gap-top">
          <a class="button primary" href="/collection/summary?id=${entry.id}">Details</a>
          <form method="post" action="/collection/action" class="inline-form">
            <input type="hidden" name="action" value="toggle-favorite" />
            <input type="hidden" name="collectionId" value="${entry.id}" />
            <button class="button ${entry.favorite ? 'accent' : 'ghost'}" type="submit">${entry.favorite ? 'Unfavorite' : 'Favorite'}</button>
          </form>
        </div>
      </article>
    `;
  };
  const pokedexCards = state.capturedCollection.map((entry) => renderDexCard(entry)).join('') || '<p class="muted">No captured Pokemon are registered yet.</p>';
  const favoriteCards = favoriteEntries.slice(0, 6).map((entry) => renderDexCard(entry, { compact: true })).join('');
  const seenCards = seenButNotCaught.map((species) => `
    <article class="monster-card panelish dex-card dex-card-ghost">
      <div class="card-top">
        <div>
          <h3>${escapeHtml(species.name)}</h3>
          <p class="muted">Seen in battle &middot; Gen ${generationForSpecies(species)}</p>
        </div>
        ${badge('Seen', 'default')}
      </div>
      ${renderMonsterPortrait(species, { caption: species.biome })}
      <div class="badge-row compact-row">${species.types.map((type) => badge(titleLabel(type), type)).join(' ')}</div>
      <p class="muted">Base total ${formatNumber(statTotal(species.baseStats))}</p>
    </article>
  `).join('');
  const achievementCards = trainer.achievements.map((entry) => `
    <article class="panelish achievement-card ${entry.unlocked ? 'is-unlocked' : ''}">
      <strong>${escapeHtml(entry.label)}</strong>
      <span>${entry.unlocked ? 'Unlocked' : 'In progress'}</span>
    </article>
  `).join('');
  const partySlots = Array.from({ length: CONTENT.partySlotCount }, (_, index) => {
    const entry = state.partySlots[index];
    return `
      <article
        class="panelish team-slot-card ${entry ? 'is-filled' : 'is-empty'}"
        ${entry ? 'draggable="true"' : ''}
        data-party-slot-card
        data-slot-index="${index}"
        data-collection-id="${entry?.id || ''}"
      >
        <div class="card-top">
          <h3>Slot ${index + 1}</h3>
          ${entry ? badge('Ready', 'success') : badge('Empty', 'default')}
        </div>
        ${entry ? `
          ${renderMonsterPortrait(entry.species, { caption: monsterLabel(entry.monster), small: true })}
          <p class="muted">Lv ${formatNumber(entry.monster.level)} &middot; Total ${formatNumber(statTotal(entry.monster.stats))}</p>
          <div class="badge-row compact-row">${entry.species.types.map((type) => badge(titleLabel(type), type)).join(' ')}</div>
          <p class="muted">Drag to reorder this team slot.</p>
        ` : '<p class="muted">Use the summary screen or drag another team member into this slot after it has been assigned.</p>'}
      </article>
    `;
  }).join('');
  const partyOrderInputs = Array.from({ length: CONTENT.partySlotCount }, (_, index) => `
    <input type="hidden" name="partyId" value="${state.partySlots[index]?.id || ''}" data-party-order-input="${index}" />
  `).join('');
  const clearPartyActions = state.partySlots.map((entry, index) => entry ? `
    <form method="post" action="/collection/party" class="inline-form">
      <input type="hidden" name="action" value="clear" />
      <input type="hidden" name="slotIndex" value="${index}" />
      <button class="button ghost" type="submit">Clear Slot ${index + 1}</button>
    </form>
  ` : '').join('');
  const pcBoxes = state.pcBoxes.map((box) => `
    <section class="collection-group gap-top">
      <div class="section-head">
        <div>
          <p class="eyebrow">PC Storage</p>
          <h2>${escapeHtml(box.name)}</h2>
          <p class="muted">Stored Pokemon stay here until you inspect them or assign them to the active team.</p>
        </div>
        <p>${formatNumber(box.entries.length)}</p>
      </div>
      <div class="monster-grid">${box.entries.map((entry) => renderDexCard(entry, { compact: true })).join('') || '<p class="muted">No monsters in this box.</p>'}</div>
    </section>
  `).join('');
  const battleOptions = state.capturedCollection.map((entry) => `<option value="${entry.id}">${escapeHtml(monsterLabel(entry.monster))} &middot; Lv ${formatNumber(entry.monster.level)}</option>`).join('');
  return `
    <section class="panel collection-shell" data-tab-group>
      <div class="section-head">
        <div>
          <p class="eyebrow">Pokedex Command</p>
          <h1>Storage / Team Builder / Battle Lab</h1>
          <p class="muted">Your caught Pokemon, dream team, seen-vs-caught tracker, party builder, and a lightweight duel simulator now live on one screen.</p>
        </div>
        <div class="badge-row">
          ${badge(`${formatNumber(trainer.caughtCount)}/${formatNumber(CONTENT.species.length)} caught`, 'success')}
          ${badge(`${formatNumber(trainer.seenCount)} seen`, 'default')}
          ${badge(`${escapeHtml(trainer.favoriteType)} focus`, 'warning')}
        </div>
      </div>
      <div class="collection-hero-grid">
        <article class="panelish dex-progress-card">
          <div class="card-top">
            <h2>Pokedex Tracker</h2>
            ${badge('Seen vs Caught', 'default')}
          </div>
          <div class="stat-grid summary-stat-grid">
            <div class="stat-card"><strong>${formatNumber(trainer.seenCount)}</strong><span>seen</span></div>
            <div class="stat-card"><strong>${formatNumber(trainer.caughtCount)}</strong><span>caught</span></div>
            <div class="stat-card"><strong>${formatNumber(trainer.favoriteCount)}</strong><span>favorites</span></div>
          </div>
          <div class="gap-top">
            <p class="muted">Seen progress</p>
            <div class="health hp-bar"><span style="width:${seenProgress}%"></span></div>
            <p class="muted">Caught progress</p>
            <div class="health hp-bar"><span style="width:${caughtProgress}%"></span></div>
          </div>
        </article>
        <article class="panelish dex-progress-card">
          <div class="card-top">
            <h2>Trainer Snapshot</h2>
            ${badge(`${formatNumber(trainer.battleWins)} wins`, 'success')}
          </div>
          <div class="stat-grid summary-stat-grid">
            <div class="stat-card"><strong>${formatNumber(trainer.partyCount)}</strong><span>team slots used</span></div>
            <div class="stat-card"><strong>${escapeHtml(trainer.favoriteType)}</strong><span>favorite type</span></div>
            <div class="stat-card"><strong>${formatNumber(favoriteEntries.length)}</strong><span>dream picks</span></div>
          </div>
          <div class="achievement-grid gap-top">${achievementCards}</div>
        </article>
      </div>
      <div class="tab-strip">
        <button class="tab-button is-active" type="button" data-tab-target="pokedex">Pokedex</button>
        <button class="tab-button" type="button" data-tab-target="team-builder">Team Builder</button>
        <button class="tab-button" type="button" data-tab-target="battle-lab">Battle Lab</button>
        <button class="tab-button" type="button" data-tab-target="storage-boxes">Storage Boxes</button>
      </div>
      <div class="tab-panel is-active" data-tab-panel="pokedex">
        <section class="panelish collection-filter-panel" data-collection-filters>
          <div class="collection-filter-grid">
            <label>
              <span>Search Pokemon</span>
              <input type="search" placeholder="Search by name or type" data-collection-search />
            </label>
            <label>
              <span>Type</span>
              <select data-collection-type>
                <option value="">All types</option>
                ${CONTENT.types.map((type) => `<option value="${type}">${escapeHtml(titleLabel(type))}</option>`).join('')}
              </select>
            </label>
            <label>
              <span>Generation</span>
              <select data-collection-generation>
                <option value="">All generations</option>
                ${generationOptions.map((generation) => `<option value="${generation}">Gen ${generation}</option>`).join('')}
              </select>
            </label>
            <label>
              <span>Min total stats</span>
              <input type="number" min="0" max="999" value="0" step="10" data-collection-min-total />
            </label>
            <label>
              <span>Max total stats</span>
              <input type="number" min="0" max="999" value="999" step="10" data-collection-max-total />
            </label>
            <label>
              <span>Sort by</span>
              <select data-collection-sort>
                <option value="party">Party / favorites</option>
                <option value="level-desc">Level high to low</option>
                <option value="level-asc">Level low to high</option>
                <option value="total-desc">Total stats high to low</option>
                <option value="total-asc">Total stats low to high</option>
                <option value="base-total-desc">Base total high to low</option>
                <option value="atk-desc">Attack high to low</option>
                <option value="hp-desc">HP high to low</option>
                <option value="spe-desc">Speed high to low</option>
                <option value="name-asc">Name A to Z</option>
              </select>
            </label>
            <label class="checkbox-row checkbox-row-inline">
              <span>Favorites only</span>
              <input type="checkbox" data-collection-favorites />
            </label>
          </div>
          <p class="muted">Showing <strong data-collection-count>${formatNumber(state.capturedCollection.length)}</strong> of ${formatNumber(state.capturedCollection.length)} owned Pokemon. Sort by level, total, base total, HP, Attack, Speed, or keep party/favorite priority.</p>
        </section>
        ${favoriteCards ? `
          <section class="collection-group gap-top">
            <div class="section-head">
              <div>
                <p class="eyebrow">Wishlist</p>
                <h2>Dream Team Picks</h2>
                <p class="muted">Favorites stay pinned here so your core lineup is easy to revisit.</p>
              </div>
              ${badge(`${formatNumber(favoriteEntries.length)} favorites`, favoriteEntries.length ? 'warning' : 'default')}
            </div>
            <div class="monster-grid compact-grid">${favoriteCards}</div>
          </section>
        ` : ''}
        ${seenCards ? `
          <section class="collection-group gap-top">
            <div class="section-head">
              <div>
                <p class="eyebrow">Tracker</p>
                <h2>Seen But Not Caught</h2>
                <p class="muted">These species have been spotted in battle but are still missing from your caught registry.</p>
              </div>
              ${badge(`${formatNumber(seenButNotCaught.length)} visible`, 'default')}
            </div>
            <div class="monster-grid compact-grid">${seenCards}</div>
          </section>
        ` : ''}
        <section class="collection-group gap-top">
          <div class="section-head">
            <div>
              <p class="eyebrow">Caught Pokemon</p>
              <h2>Collection Grid</h2>
              <p class="muted">Every caught entry shows portrait, typing, visible stats, favorites, and a jump to the detail page.</p>
            </div>
            ${badge(`${formatNumber(state.capturedCollection.length)} owned`, 'success')}
          </div>
          <div class="monster-grid" data-collection-results>${pokedexCards}</div>
          <p class="muted" data-collection-empty hidden>No Pokemon match the current filters.</p>
        </section>
      </div>
      <div class="tab-panel" data-tab-panel="team-builder">
        <section class="collection-group gap-top">
          <div class="section-head">
            <div>
              <p class="eyebrow">Persistent Team</p>
              <h2>Drag-and-Drop Team Builder</h2>
              <p class="muted">Drag filled slots to reorder your six-mon party, then save the layout. Party assignment still happens from each detail screen.</p>
            </div>
            ${badge(`${formatNumber(partyEntries.length)}/${CONTENT.partySlotCount} filled`, partyEntries.length === CONTENT.partySlotCount ? 'success' : 'default')}
          </div>
          <form method="post" action="/collection/party" class="stack-form" data-party-order-form>
            <input type="hidden" name="action" value="reorder" />
            <div class="team-slot-grid" data-party-builder>${partySlots}</div>
            <div class="party-order-inputs">${partyOrderInputs}</div>
            <div class="button-row gap-top">
              <button class="button primary" type="submit">Save Team Order</button>
              ${clearPartyActions}
            </div>
          </form>
        </section>
        <section class="grid-two summary-grid gap-top">
          <article class="panelish summary-panel">
            <h2>Type Synergy</h2>
            <p class="muted">Coverage is derived from the types currently represented across the six active team slots.</p>
            <p><strong>Exposed to</strong></p>
            <div class="badge-row compact-row">${exposedTypes.length ? exposedTypes.slice(0, 6).map((entry) => badge(`${titleLabel(entry.type)} ${entry.weak} weak / ${entry.resist + entry.immune} cover`, 'warning')).join(' ') : badge('No major holes', 'success')}</div>
            <p class="gap-top"><strong>Covered against</strong></p>
            <div class="badge-row compact-row">${coveredTypes.length ? coveredTypes.slice(0, 6).map((entry) => badge(`${titleLabel(entry.type)} ${entry.resist + entry.immune} cover`, 'success')).join(' ') : badge('Coverage pending', 'default')}</div>
            <p class="gap-top"><strong>Pressure types</strong></p>
            <div class="badge-row compact-row">${renderMatchupBadges(teamOffenseSummary.offensePressure, 'success', 'Neutral pressure')}</div>
          </article>
          <article class="panelish summary-panel">
            <h2>Total Team Stats</h2>
            <div class="stat-grid summary-stat-grid">
              ${Object.entries(statLabels).map(([key, label]) => `<div class="stat-card"><strong>${formatNumber(teamTotals[key] || 0)}</strong><span>${escapeHtml(label)}</span></div>`).join('')}
            </div>
            <div class="stat-grid summary-stat-grid gap-top">
              <div class="stat-card"><strong>${formatNumber(partyEntries.reduce((sum, entry) => sum + statTotal(entry.monster.stats), 0))}</strong><span>combined total</span></div>
              <div class="stat-card"><strong>${formatNumber(teamOffenseTypes.length)}</strong><span>types represented</span></div>
              <div class="stat-card"><strong>${formatNumber(favoriteEntries.filter((entry) => state.partySlots.some((slot) => slot?.id === entry.id)).length)}</strong><span>favorites on team</span></div>
            </div>
          </article>
        </section>
      </div>
      <div class="tab-panel" data-tab-panel="battle-lab">
        <section class="panelish battle-lab-panel" data-battle-lab>
          <div class="section-head">
            <div>
              <p class="eyebrow">Battle Simulator</p>
              <h2>Quick Duel Lab</h2>
              <p class="muted">Pick any two stored Pokemon, then test simple turn-based actions with attack and defend decisions.</p>
            </div>
            ${badge('Client-side simulator', 'default')}
          </div>
          ${state.capturedCollection.length >= 2 ? `
            <div class="battle-lab-controls">
              <label>
                <span>Your Pokemon</span>
                <select data-battle-player>${battleOptions}</select>
              </label>
              <label>
                <span>Opponent</span>
                <select data-battle-opponent>${battleOptions}</select>
              </label>
            </div>
            <div class="battle-lab-stage">
              <article class="panelish battle-lab-card">
                <div data-battle-player-card class="battle-lab-card-body"></div>
              </article>
              <article class="panelish battle-lab-card">
                <div data-battle-opponent-card class="battle-lab-card-body"></div>
              </article>
            </div>
            <div class="button-row gap-top">
              <button class="button primary" type="button" data-battle-action="attack">Attack</button>
              <button class="button ghost" type="button" data-battle-action="defend">Defend</button>
              <button class="button accent" type="button" data-battle-action="reset">Reset Duel</button>
            </div>
            <div class="battle-message-screen gap-top" data-battle-lab-log>Choose two Pokemon to begin the battle lab.</div>
            <script type="application/json" id="collection-dashboard-data">${serializeJsonForHtml(dashboardData)}</script>
          ` : '<p class="muted">Catch at least two Pokemon to unlock the duel lab.</p>'}
        </section>
      </div>
      <div class="tab-panel" data-tab-panel="storage-boxes">
        <section class="collection-group gap-top">
          <div class="section-head">
            <div>
              <p class="eyebrow">Storage</p>
              <h2>PC Boxes</h2>
              <p class="muted">The original storage flow still works. The only difference is that your Pokedex and team tools now sit on top of it.</p>
            </div>
            ${badge(`${formatNumber(state.capturedCollection.length)} stored`, 'success')}
          </div>
          ${pcBoxes}
        </section>
      </div>
    </section>
  `;
}
function renderCollectionSummary(entry, persistentInventory, user) {
  const monster = entry.monster;
  const species = entry.species;
  const ability = abilityInfo(monster);
  const heldItem = heldItemInfo(monster);
  const starterPerk = starterPerkInfo(monster);
  const aura = auraInfo(monster);
  const evolutionOptions = evolutionOptionsForSpecies(species);
  const typeMatchups = matchupSummary(species.types);
  const generation = generationForSpecies(species);
  const levelEvolutionTarget = species.evolvesTo ? CONTENT.speciesMap.get(species.evolvesTo) || null : null;
  const levelEvolutionReady = !!(levelEvolutionTarget && species.evolveLevel && monster.level >= species.evolveLevel);
  const stoneOptions = Object.entries(species.stoneEvolutionMap || {}).map(([slug, targetId]) => {
    const item = CONTENT.itemMap.get(slug);
    const target = CONTENT.speciesMap.get(targetId) || null;
    const owned = persistentInventory.find((stashEntry) => stashEntry.item.slug === slug)?.quantity || 0;
    return item && target ? { item, owned, target } : null;
  }).filter(Boolean);
  const familyLine = CONTENT.species
    .filter((candidate) => candidate.family === species.family)
    .sort((left, right) => left.stage - right.stage || left.id - right.id);
  const familyLinePreview = familyLine.map((candidate) => badge(candidate.name, candidate.id === species.id ? 'warning' : 'default')).join(' ');
  const moveCoverage = matchupSummary([...new Set(monster.moves.map((moveState) => CONTENT.moveMap.get(moveState.id)?.type).filter(Boolean))]);
  const moveCards = monster.moves.map((moveState) => renderMoveCard(moveState, { compact: true })).join('');
  const holdOptions = persistentInventory.filter((stashEntry) => stashEntry.item.category === 'hold').map((stashEntry) => {
    const selected = heldItem?.slug === stashEntry.item.slug ? 'selected' : '';
    return `<option value="${stashEntry.item.slug}" ${selected}>${escapeHtml(stashEntry.item.name)} x${formatNumber(stashEntry.quantity)}</option>`;
  }).join('');
  const abilityCapsuleQty = persistentInventory.find((stashEntry) => stashEntry.item.slug === 'ability-capsule')?.quantity || 0;
  const abilityPatchQty = persistentInventory.find((stashEntry) => stashEntry.item.slug === 'ability-patch')?.quantity || 0;
  const rareCandyQty = persistentInventory.find((stashEntry) => stashEntry.item.slug === 'rare-candy')?.quantity || 0;
  const delevelerQty = persistentInventory.find((stashEntry) => stashEntry.item.slug === 'deleveler')?.quantity || 0;
  const devolverQty = persistentInventory.find((stashEntry) => stashEntry.item.slug === 'devolver')?.quantity || 0;
  const ivTrainingEntries = persistentInventory.filter((stashEntry) => stashEntry.item.category === 'iv').sort((left, right) => left.item.name.localeCompare(right.item.name));
  const evTrainingEntries = persistentInventory.filter((stashEntry) => stashEntry.item.category === 'ev').sort((left, right) => left.item.name.localeCompare(right.item.name));
  const mintEntries = persistentInventory.filter((stashEntry) => stashEntry.item.category === 'mint').sort((left, right) => left.item.name.localeCompare(right.item.name));
  const ivTrainingOptions = ivTrainingEntries.map((stashEntry) => `<option value="${stashEntry.item.slug}">${escapeHtml(stashEntry.item.name)} x${formatNumber(stashEntry.quantity)} &middot; ${escapeHtml(stashEntry.item.description)}</option>`).join('');
  const evTrainingOptions = evTrainingEntries.map((stashEntry) => `<option value="${stashEntry.item.slug}">${escapeHtml(stashEntry.item.name)} x${formatNumber(stashEntry.quantity)} &middot; ${escapeHtml(stashEntry.item.description)}</option>`).join('');
  const ivTrainingBadges = ivTrainingEntries.slice(0, 6).map((stashEntry) => badge(`${stashEntry.item.name} x${formatNumber(stashEntry.quantity)}`, stashEntry.quantity ? 'warning' : 'default')).join(' ');
  const evTrainingBadges = evTrainingEntries.slice(0, 6).map((stashEntry) => badge(`${stashEntry.item.name} x${formatNumber(stashEntry.quantity)}`, stashEntry.quantity ? 'warning' : 'default')).join(' ');
  const summaryUseCategoryOrder = { level: 1, regression: 2, iv: 3, ev: 4, mint: 5, ability: 6, evolution: 7, hold: 8 };
  const summaryUseActionLabel = (item) => item.category === 'hold' ? 'Equip' : item.category === 'mint' ? 'Mint' : item.category === 'ability' ? 'Ability' : item.category === 'evolution' ? 'Evolve' : 'Use';
  const quickUseEntries = persistentInventory.filter((stashEntry) => {
    const item = stashEntry.item;
    if (!item || stashEntry.quantity <= 0) {
      return false;
    }
    if (['level', 'regression', 'iv', 'ev', 'mint', 'ability', 'hold'].includes(item.category)) {
      return true;
    }
    return item.category === 'evolution' && Object.prototype.hasOwnProperty.call(species.stoneEvolutionMap || {}, item.slug);
  }).sort((left, right) => (
    (summaryUseCategoryOrder[left.item.category] || 99) - (summaryUseCategoryOrder[right.item.category] || 99)
    || left.item.name.localeCompare(right.item.name)
  ));
  const quickUseOptions = quickUseEntries.map((stashEntry) => `<option value="${stashEntry.item.slug}">${summaryUseActionLabel(stashEntry.item)} ${escapeHtml(stashEntry.item.name)} x${formatNumber(stashEntry.quantity)} &middot; ${escapeHtml(stashEntry.item.description)}</option>`).join('');
  const quickUseBadges = quickUseEntries.slice(0, 8).map((stashEntry) => badge(`${summaryUseActionLabel(stashEntry.item)} ${stashEntry.item.name} x${formatNumber(stashEntry.quantity)}`, stashEntry.quantity ? 'warning' : 'default')).join(' ');
  const regularAbilityBadges = (species.abilityPool || []).map((slug) => {
    const info = CONTENT.abilityMap.get(slug);
    return info ? badge(info.name, monster.abilitySlug === slug ? 'success' : 'default') : '';
  }).join(' ');
  const hiddenAbility = species.hiddenAbilitySlug ? CONTENT.abilityMap.get(species.hiddenAbilitySlug) : null;
  const learnsetRows = species.movePool.map((moveId, index) => {
    const move = CONTENT.moveMap.get(moveId);
    const unlockLevel = moveUnlockLevel(species, index);
    return {
      move,
      unlockLevel,
      unlocked: monster.level >= unlockLevel,
      known: monster.moves.some((moveState) => moveState.id === moveId),
      price: moveTeachingPrice(move),
    };
  }).filter((row) => row.move);
  const nextUnlock = learnsetRows.find((row) => !row.unlocked) || null;
  const unlockedLearnsetRows = learnsetRows.filter((row) => row.unlocked);
  const learnsetOptions = unlockedLearnsetRows.map((row) => `
    <option value="${row.move.id}">${escapeHtml(row.move.name)} &middot; ${escapeHtml(row.move.role || 'Utility')} &middot; Lv ${formatNumber(row.unlockLevel)} &middot; ${row.move.category === 'status' ? 'Status' : 'Power ' + row.move.power} &middot; ${money(row.price)}${row.known ? ' &middot; Equipped' : ''}</option>
  `).join('');
  const learnsetPreview = learnsetRows.map((row) => `
    <li class="learnset-row ${row.unlocked ? 'is-unlocked' : 'is-locked'}"><strong>${escapeHtml(row.move.name)}</strong><span>Lv ${formatNumber(row.unlockLevel)} &middot; ${escapeHtml(row.move.role || 'Utility')} &middot; ${row.unlocked ? 'Teach ' + money(row.price) : 'Locked'}${row.known ? ' &middot; Equipped' : ''}</span></li>
  `).join('');
  const moveSlots = monster.moves.map((moveState, index) => `
    <option value="${index}">Replace slot ${index + 1} (${escapeHtml(moveState.displayName || CONTENT.moveMap.get(moveState.id)?.name || 'Empty')})</option>
  `).join('');
  const classLabel = starterPerk && (monster.origin === 'starter-draft' || monster.origin === 'starter-gift') ? 'Starter Candidate' : 'Captured Monster';
  const isPartner = user.meta.partnerCollectionId === entry.id;
  const partySlotIndex = (user.meta.partyCollectionIds || []).findIndex((id) => Number(id) === entry.id);
  const totalCards = [
    { label: 'Current Total', value: statTotal(monster.stats) },
    { label: 'Base Total', value: statTotal(species.baseStats) },
    { label: 'IV Total', value: statTotal(monster.ivs) },
    { label: 'EV Total', value: statTotal(monster.evs) },
    { label: 'Bonus Total', value: statTotal(monster.bonusStats) },
    { label: 'Family', value: species.family },
  ];

  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Summary Screen</p>
          <h1>${escapeHtml(monsterLabel(monster))}</h1>
          <p class="muted">${escapeHtml(species.name)} - ${species.types.map((type) => type).join(' / ')} - ${escapeHtml(monster.origin || 'Unknown origin')}</p>
        </div>
        <div class="badge-row">
          ${badge('Lv ' + monster.level + '/100', 'warning')}
          ${badge('Cash ' + money(user.cash), 'default')}
          ${badge(aura?.name || 'Normal', aura?.tone || 'default')}
          ${entry.favorite ? badge('Favorite', 'warning') : badge('Ready to favorite', 'default')}
        </div>
      </div>
      <div class="grid-two summary-grid">
        <article class="panelish summary-panel">
          <h2>Stats</h2>
          <div class="stat-grid summary-stat-grid">
            <div class="stat-card"><strong>${monster.stats.hp}</strong><span>HP</span></div>
            <div class="stat-card"><strong>${monster.stats.atk}</strong><span>Attack</span></div>
            <div class="stat-card"><strong>${monster.stats.def}</strong><span>Defense</span></div>
            <div class="stat-card"><strong>${monster.stats.spa}</strong><span>Sp. Atk</span></div>
            <div class="stat-card"><strong>${monster.stats.spd}</strong><span>Sp. Def</span></div>
            <div class="stat-card"><strong>${monster.stats.spe}</strong><span>Speed</span></div>
          </div>
          <div class="stat-grid summary-stat-grid gap-top">
            ${totalCards.map((card) => `<div class="stat-card"><strong>${formatNumber(card.value)}</strong><span>${escapeHtml(card.label)}</span></div>`).join('')}
          </div>
          ${natureBadges(monster)}
          ${auraBadges(monster)}
          <div class="summary-facts">
            <p><strong>Class:</strong> ${escapeHtml(classLabel)}</p>
            <p><strong>Generation:</strong> Gen ${formatNumber(generation)}</p>
            <p><strong>Evolution line:</strong> ${familyLine.map((candidate) => escapeHtml(candidate.name)).join(' -> ')}</p>
            <p><strong>Current ability:</strong> ${escapeHtml(ability?.name || 'Battle Aura')}</p>
            <p class="muted">${escapeHtml(ability?.description || 'No ability description available.')}</p>
            <p><strong>Starter perk:</strong> ${escapeHtml(starterPerk?.name || 'None')}</p>
            <p class="muted">${escapeHtml(starterPerk?.description || 'This monster leans on leveling, moves, abilities, and held items instead of a draft perk.')}</p>
            <p><strong>Held item:</strong> ${escapeHtml(heldItem?.name || 'None')}</p>
            <p><strong>Evolution:</strong> ${evolutionOptions.length ? evolutionOptions.map((option) => `${escapeHtml(option.target.name)} via ${escapeHtml(option.via)}`).join(' | ') : 'Final form for now'}</p>
            <p><strong>Type pressure:</strong> ${renderMatchupBadges(typeMatchups.offensePressure, 'success', 'Balanced offense')}</p>
            <p><strong>Move coverage:</strong> ${renderMatchupBadges(moveCoverage.offensePressure, 'success', 'Neutral coverage')}</p>
            <p><strong>Big threats:</strong> ${renderMatchupBadges(typeMatchups.defenseWeaknesses, 'warning', 'Few glaring weaknesses')}</p>
            <p><strong>Next unlock:</strong> ${nextUnlock ? escapeHtml(nextUnlock.move.name) + ' at Lv ' + formatNumber(nextUnlock.unlockLevel) : 'Full learnset unlocked'}</p>
          </div>
          <div class="summary-facts gap-top">
            <p><strong>Base stats:</strong> ${escapeHtml(statSpreadSummary(species.baseStats))}</p>
            <p><strong>IV spread:</strong> ${escapeHtml(statSpreadSummary(monster.ivs))}</p>
            <p><strong>EV spread:</strong> ${escapeHtml(statSpreadSummary(monster.evs))}</p>
            <p><strong>Bonus spread:</strong> ${escapeHtml(statSpreadSummary(monster.bonusStats))}</p>
            <p><strong>Special aura:</strong> ${escapeHtml(aura?.name || 'Normal')} - ${escapeHtml(aura?.description || 'No extra aura modifier.')}</p>
            <p><strong>Best resistances:</strong> ${renderMatchupBadges(typeMatchups.defenseResistances, 'default', 'Balanced defense')}</p>
            <p><strong>Palette:</strong> ${escapeHtml(monster.auraPalette || 'Classic')}</p>
          </div>
        </article>
        <article class="panelish summary-panel">
          <h2>Move Management</h2>
          <div class="move-grid move-grid-advanced">${moveCards}</div>
          <p class="muted">Teaching costs scale by move tier: ${money(180)} / ${money(320)} / ${money(520)} / ${money(800)} / ${money(1200)}.</p>
          <p class="muted">The dropdown only shows unlocked moves now, and choosing a move you already know will swap its slot instead of failing.</p>
          <form method="post" action="/collection/summary" class="stack-form gap-top">
            <input type="hidden" name="action" value="teach-move" />
            <input type="hidden" name="collectionId" value="${entry.id}" />
            <label>
              <span>Learn / Replace move</span>
              <select name="moveId">${learnsetOptions || '<option value="">No unlocked learnset moves yet</option>'}</select>
            </label>
            <label>
              <span>Replace slot</span>
              <select name="slotIndex">${moveSlots}</select>
            </label>
            <button class="button primary" type="submit" ${unlockedLearnsetRows.length ? '' : 'disabled'}>Teach move</button>
          </form>
          <ul class="clean-list compact learnset-list gap-top">${learnsetPreview}</ul>
        </article>
      </div>
      <section class="grid-two summary-grid gap-top">
        <article class="panelish summary-panel">
          <h2>Evolution Lab</h2>
          <p class="muted">Level evolutions now use the proper level milestone. Stones only appear when this species actually has a branch catalyst.</p>
          <div class="badge-row compact-row">${familyLinePreview || badge('Standalone form', 'default')}</div>
          ${levelEvolutionTarget ? `
            <div class="summary-facts gap-top">
              <p><strong>Level route:</strong> ${escapeHtml(levelEvolutionTarget.name)} at Lv ${formatNumber(species.evolveLevel || 0)}</p>
              <p><strong>Status:</strong> ${levelEvolutionReady ? 'Ready now' : `Needs Lv ${formatNumber(species.evolveLevel || 0)}`}</p>
            </div>
            <form method="post" action="/collection/summary" class="stack-form compact-form gap-top">
              <input type="hidden" name="action" value="evolve-level" />
              <input type="hidden" name="collectionId" value="${entry.id}" />
              <button class="button primary" type="submit" ${levelEvolutionReady ? '' : 'disabled'}>Trigger Level Evolution</button>
            </form>
          ` : `
            <p class="muted gap-top">This monster has no further level-based evolution.</p>
          `}
          ${stoneOptions.length ? `
            <div class="badge-row compact-row gap-top">${stoneOptions.map((entry) => badge(`${entry.item.name} -> ${entry.target.name}${entry.owned ? ` x${formatNumber(entry.owned)}` : ''}`, entry.owned ? 'warning' : 'default')).join(' ')}</div>
            <form method="post" action="/collection/summary" class="stack-form compact-form gap-top">
              <input type="hidden" name="action" value="use-stone" />
              <input type="hidden" name="collectionId" value="${entry.id}" />
              <label>
                <span>Branch catalyst</span>
                <select name="itemSlug">
                  ${stoneOptions.map((entry) => `<option value="${entry.item.slug}">${escapeHtml(entry.item.name)} -> ${escapeHtml(entry.target.name)}${entry.owned ? ` &middot; x${formatNumber(entry.owned)}` : ' &middot; not owned'}</option>`).join('')}
                </select>
              </label>
              <button class="button accent" type="submit" ${stoneOptions.some((entry) => entry.owned > 0) ? '' : 'disabled'}>Use Catalyst</button>
            </form>
          ` : `
            <p class="muted gap-top">No stone branch exists for this species.</p>
          `}
        </article>
        <article class="panelish summary-panel">
          <h2>Ability Management</h2>
          <p><strong>Standard abilities</strong></p>
          <div class="badge-row compact-row">${regularAbilityBadges || badge('Battle Aura', 'default')}</div>
          <p class="gap-top"><strong>Hidden ability</strong> ${hiddenAbility ? badge(hiddenAbility.name, monster.abilitySlug === species.hiddenAbilitySlug ? 'warning' : 'default') : badge('None', 'default')}</p>
          <p class="muted">${escapeHtml(hiddenAbility?.description || 'No hidden ability data is available for this monster.')}</p>
          <div class="action-panel-grid gap-top">
            <form method="post" action="/collection/summary" class="stack-form compact-form panelish">
              <input type="hidden" name="action" value="ability-change" />
              <input type="hidden" name="abilityMode" value="cycle" />
              <input type="hidden" name="collectionId" value="${entry.id}" />
              <h3>Ability Capsule</h3>
              <p class="muted">Switch between the monster's regular abilities. In stash: ${formatNumber(abilityCapsuleQty)}</p>
              <button class="button ghost" type="submit" ${abilityCapsuleQty ? '' : 'disabled'}>Use Ability Capsule</button>
            </form>
            <form method="post" action="/collection/summary" class="stack-form compact-form panelish">
              <input type="hidden" name="action" value="ability-change" />
              <input type="hidden" name="abilityMode" value="unlock-hidden" />
              <input type="hidden" name="collectionId" value="${entry.id}" />
              <h3>Ability Patch</h3>
              <p class="muted">Unlock and equip the hidden special ability. In stash: ${formatNumber(abilityPatchQty)}</p>
              <button class="button accent" type="submit" ${abilityPatchQty ? '' : 'disabled'}>Use Ability Patch</button>
            </form>
          </div>
        </article>
        <article class="panelish summary-panel">
          <h2>Stash Actions</h2>
          <p class="muted">Apply EV/IV tools, mints, stones, ability items, or a held item from one quick picker.</p>
          <div class="badge-row compact-row">${quickUseBadges || badge('No summary-usable items in stash', 'default')}</div>
          <form method="post" action="/collection/summary" class="stack-form compact-form gap-top">
            <input type="hidden" name="action" value="use-stash-item" />
            <input type="hidden" name="collectionId" value="${entry.id}" />
            <label>
              <span>Choose stash item</span>
              <select name="itemSlug">${quickUseOptions || '<option value="">No compatible stash items owned</option>'}</select>
            </label>
            <button class="button accent" type="submit" ${quickUseEntries.length ? '' : 'disabled'}>Apply Stash Item</button>
          </form>
          <p class="muted gap-top">${mintEntries.length ? `${formatNumber(mintEntries.length)} mints ready for nature changes.` : 'Nature mints will show up here when you own them.'}</p>
        </article>
        <article class="panelish summary-panel">
          <h2>Identity and Held Item</h2>
          <form method="post" action="/collection/summary" class="stack-form compact-form">
            <input type="hidden" name="action" value="rename" />
            <input type="hidden" name="collectionId" value="${entry.id}" />
            <label>
              <span>Nickname</span>
              <input type="text" name="nickname" placeholder="Nickname" value="${escapeHtml(monster.nickname || '')}" />
            </label>
            <button class="button ghost" type="submit">Rename</button>
          </form>
          <form method="post" action="/collection/summary" class="stack-form compact-form gap-top">
            <input type="hidden" name="action" value="toggle-favorite" />
            <input type="hidden" name="collectionId" value="${entry.id}" />
            <button class="button ${entry.favorite ? 'ghost' : 'accent'}" type="submit">${entry.favorite ? 'Remove from favorites' : 'Add to favorites'}</button>
          </form>
          <div class="summary-facts gap-top">
            <p><strong>Origin:</strong> ${escapeHtml(monster.origin || 'Unknown origin')}</p>
            <p><strong>Whereabouts:</strong> ${escapeHtml(monster.metLocation || species.biome)}</p>
            <p><strong>Met level:</strong> ${formatNumber(monster.metLevel || monster.level)}</p>
            <p><strong>Caught:</strong> ${escapeHtml(formatDateTime(monster.caughtAt))}</p>
            <p><strong>Favorite:</strong> ${entry.favorite ? 'Dream team pick' : 'Not favorited yet'}</p>
            <p><strong>Visible partner:</strong> ${isPartner ? 'Yes' : 'No'}</p>
            <p><strong>PC box:</strong> ${escapeHtml(monster.boxTag || 'Box 1')}</p>
            <p><strong>Party slot:</strong> ${partySlotIndex >= 0 ? `Slot ${partySlotIndex + 1}` : 'Stored in PC'}</p>
          </div>
          <form method="post" action="/hub/identity" class="stack-form compact-form gap-top">
            <input type="hidden" name="action" value="partner" />
            <input type="hidden" name="collectionId" value="${entry.id}" />
            <button class="button ${isPartner ? 'ghost' : 'accent'}" type="submit">${isPartner ? 'Keep as partner' : 'Set as partner'}</button>
          </form>
          <form method="post" action="/collection/party" class="stack-form compact-form gap-top">
            <input type="hidden" name="action" value="set" />
            <input type="hidden" name="collectionId" value="${entry.id}" />
            <label>
              <span>Withdraw / Switch to party slot</span>
              <select name="slotIndex">${Array.from({ length: CONTENT.partySlotCount }, (_, index) => `<option value="${index}" ${partySlotIndex === index ? 'selected' : ''}>Slot ${index + 1}</option>`).join('')}</select>
            </label>
            <button class="button primary" type="submit">Set Party Slot</button>
          </form>
          <form method="post" action="/collection/summary" class="stack-form compact-form gap-top">
            <input type="hidden" name="action" value="move-box" />
            <input type="hidden" name="collectionId" value="${entry.id}" />
            <label>
              <span>Move to PC box</span>
              <select name="boxTag">${CONTENT.pcBoxLabels.map((boxName) => `<option value="${boxName}" ${monster.boxTag === boxName ? 'selected' : ''}>${escapeHtml(boxName)}</option>`).join('')}</select>
            </label>
            <button class="button ghost" type="submit">Move Box</button>
          </form>
          <form method="post" action="/collection/summary" class="stack-form compact-form gap-top">
            <input type="hidden" name="action" value="equip-item" />
            <input type="hidden" name="collectionId" value="${entry.id}" />
            <label>
              <span>Equip from stash</span>
              <select name="itemSlug">
                <option value="">${heldItem ? 'Unequip current item' : 'No held item'}</option>
                ${holdOptions || '<option value="">No hold items in stash</option>'}
              </select>
            </label>
            <button class="button primary" type="submit">Update held item</button>
          </form>
          <p class="muted gap-top">Collection edits update this stored monster and carry into future runs.</p>
        </article>
      </section>
      <section class="grid-two summary-grid gap-top">
        <article class="panelish summary-panel">
          <h2>Training</h2>
          <p class="muted">Stored monsters now keep permanent levels. Rare Candy pushes level milestones and future evolutions.</p>
          <div class="badge-row compact-row">
            ${badge(`Rare Candy x${formatNumber(rareCandyQty)}`, rareCandyQty ? 'warning' : 'default')}
          </div>
          <form method="post" action="/collection/summary" class="stack-form compact-form gap-top">
            <input type="hidden" name="action" value="use-progression-item" />
            <input type="hidden" name="collectionId" value="${entry.id}" />
            <input type="hidden" name="itemSlug" value="rare-candy" />
            <button class="button primary" type="submit" ${rareCandyQty ? '' : 'disabled'}>Use Rare Candy</button>
          </form>
        </article>
        <article class="panelish summary-panel">
          <h2>IV Surgery</h2>
          <p class="muted">Genome Maxers, IV Maxers, and IV resetters now work directly from this summary screen.</p>
          <div class="badge-row compact-row">${ivTrainingBadges || badge('No IV items in stash', 'default')}</div>
          <form method="post" action="/collection/summary" class="stack-form compact-form gap-top">
            <input type="hidden" name="action" value="use-progression-item" />
            <input type="hidden" name="collectionId" value="${entry.id}" />
            <label>
              <span>IV training item</span>
              <select name="itemSlug">${ivTrainingOptions || '<option value="">No IV training items owned</option>'}</select>
            </label>
            <button class="button accent" type="submit" ${ivTrainingEntries.length ? '' : 'disabled'}>Apply IV item</button>
          </form>
        </article>
        <article class="panelish summary-panel">
          <h2>EV Dojo</h2>
          <p class="muted">EV Maxers and removers rebalance the stored spread instantly so you can rebuild roles cleanly.</p>
          <div class="badge-row compact-row">${evTrainingBadges || badge('No EV items in stash', 'default')}</div>
          <form method="post" action="/collection/summary" class="stack-form compact-form gap-top">
            <input type="hidden" name="action" value="use-progression-item" />
            <input type="hidden" name="collectionId" value="${entry.id}" />
            <label>
              <span>EV training item</span>
              <select name="itemSlug">${evTrainingOptions || '<option value="">No EV training items owned</option>'}</select>
            </label>
            <button class="button accent" type="submit" ${evTrainingEntries.length ? '' : 'disabled'}>Apply EV item</button>
          </form>
        </article>
        <article class="panelish summary-panel">
          <h2>Regression</h2>
          <p class="muted">If you want to rebuild a line, you can reset a monster back to level 1 or revert it to its baby form.</p>
          <div class="badge-row compact-row">
            ${badge(`Deleveler x${formatNumber(delevelerQty)}`, delevelerQty ? 'warning' : 'default')}
            ${badge(`Devolver x${formatNumber(devolverQty)}`, devolverQty ? 'warning' : 'default')}
          </div>
          <div class="button-row gap-top">
            <form method="post" action="/collection/summary" class="inline-form">
              <input type="hidden" name="action" value="use-progression-item" />
              <input type="hidden" name="collectionId" value="${entry.id}" />
              <input type="hidden" name="itemSlug" value="deleveler" />
              <button class="button ghost" type="submit" ${delevelerQty ? '' : 'disabled'}>Reset to Lv 1</button>
            </form>
            <form method="post" action="/collection/summary" class="inline-form">
              <input type="hidden" name="action" value="use-progression-item" />
              <input type="hidden" name="collectionId" value="${entry.id}" />
              <input type="hidden" name="itemSlug" value="devolver" />
              <button class="button danger" type="submit" ${devolverQty ? '' : 'disabled'}>Devolve to Baby</button>
            </form>
          </div>
        </article>
      </section>
    </section>
  `;
}
function renderMarket(state) {
  const marketable = CONTENT.items.filter((item) => item.marketEnabled !== false);
  const supplyItems = marketable.filter((item) => ['capture', 'healing', 'pp', 'status', 'revive', 'buff', 'team-heal'].includes(item.category)).slice(0, 24);
  const progressionItems = marketable.filter((item) => ['level', 'regression'].includes(item.category));
  const ivItems = marketable.filter((item) => item.category === 'iv');
  const evItems = marketable.filter((item) => item.category === 'ev');
  const mintItems = marketable.filter((item) => item.category === 'mint');
  const evolutionItems = marketable.filter((item) => item.category === 'evolution');
  const abilityItems = marketable.filter((item) => item.category === 'ability');
  const transformationItems = marketable.filter((item) => item.holdEffect === 'mega-stone' || item.holdEffect === 'ultra-core' || item.holdEffect === 'dynamax-band' || item.holdEffect === 'variant-core' || item.holdEffect === 'z-crystal');
  const typeBoosters = marketable.filter((item) => item.holdEffect === 'type-boost');
  const holdItems = marketable.filter((item) => item.category === 'hold' && item.holdEffect !== 'type-boost' && !transformationItems.some((special) => special.slug === item.slug));
  const premiumItems = marketable.filter((item) => item.category === 'premium' || item.group === 'premium-perks');
  const sections = [
    {
      key: 'spotlight',
      title: 'Rotating Merchant Spotlight',
      description: `${escapeHtml(state.world.event.label)} Rotation resets in ${escapeHtml(formatTimerMinutes(state.world.marketRotation.minutesRemaining))}.`,
      items: state.world.marketRotation.items,
    },
    {
      key: 'premium',
      title: 'Premium Perks',
      description: 'Premium perks are passive account upgrades. They now sit in the expensive endgame lane so they feel earned instead of free power.',
      items: premiumItems,
    },
    {
      key: 'supplies',
      title: 'Adventure Supplies',
      description: 'Core battle tools, healing, revives, and route sustain for your long sessions.',
      items: supplyItems,
    },
    {
      key: 'progression',
      title: 'Leveling and Regression',
      description: 'Buy Rare Candy to level stored monsters, or use Deleveler and Devolver to rebuild a line without losing save progress.',
      items: progressionItems,
    },
    {
      key: 'iv',
      title: 'IV Surgery',
      description: 'Target specific IVs or fully max a monster for stronger long-term builds.',
      items: ivItems,
    },
    {
      key: 'ev',
      title: 'EV Dojo',
      description: 'Max one stat fast or wipe a stat clean when you want to rebuild a role.',
      items: evItems,
    },
    {
      key: 'mint',
      title: 'Nature Mints',
      description: 'Tune stored monsters toward cleaner stat natures without rebuilding the whole line.',
      items: mintItems,
    },
    {
      key: 'evolution',
      title: 'Evolution Stones and Relics',
      description: `${formatNumber(evolutionItems.length)} stones and relic catalysts are sold here, including type stones for every battle type plus universal and specialty evolvers.`,
      items: evolutionItems,
    },
    {
      key: 'gear',
      title: 'Mega / Ultra / Dynamax / Variant / Z Gear',
      description: `${formatNumber(transformationItems.length)} transformation gears are now in rotation, including alt mega emblems, extra ultra cores, more Dynamax activators, and universal Z gear.`,
      items: transformationItems,
    },
    {
      key: 'ability',
      title: 'Ability Lab',
      description: 'Capsules and patches for regular swaps, hidden abilities, and cleaner stored builds.',
      items: abilityItems,
    },
    {
      key: 'booster',
      title: 'Type Boosters',
      description: `${formatNumber(typeBoosters.length)} type boosters are available now, including scarves, plates, and themed charms.`,
      items: typeBoosters,
    },
    {
      key: 'hold',
      title: 'Hold Items',
      description: 'Stable long-run equipment for bulky walls, sweepers, anti-setup builds, and coverage-heavy sets.',
      items: holdItems,
    },
  ].filter((section) => section.items.length);
  const renderMarketCards = (items, categoryKey) => items.map((item) => {
    const price = persistentItemUnitPrice(item, state.user.id);
    const affordTen = state.user.cash >= price * 10;
    const isSpotlight = state.world.marketRotation.items.some((entry) => entry.slug === item.slug);
    const anchorId = `market-item-${item.slug}`;
    const searchText = [item.name, item.description, categoryKey, item.category, item.group || '', item.holdEffect || ''].join(' ').toLowerCase();
    return `
      <form
        method="post"
        action="/market/buy"
        class="shop-card panel"
        id="${anchorId}"
        data-market-card
        data-search="${escapeHtml(searchText)}"
        data-category="${escapeHtml(categoryKey)}"
        data-price="${price}"
        data-spotlight="${isSpotlight ? '1' : '0'}"
        data-affordable="${state.user.cash >= price ? '1' : '0'}"
      >
        <input type="hidden" name="itemSlug" value="${escapeHtml(item.slug)}" />
        <input type="hidden" name="returnTo" value="${escapeHtml(anchorId)}" />
        <div class="card-top">
          <h3>${escapeHtml(item.name)}</h3>
          <div class="badge-row compact-row">
            ${badge(money(price), 'default')}
            ${isSpotlight ? badge('Spotlight', 'warning') : badge(titleLabel(categoryKey), 'default')}
          </div>
        </div>
        <p class="muted">${escapeHtml(item.description)}</p>
        <div class="quantity-selector">
          <button class="button ghost" type="submit" name="quantity" value="1">Buy x1</button>
          <button class="button ghost" type="submit" name="quantity" value="3">Buy x3</button>
          <button class="button ghost" type="submit" name="quantity" value="5">Buy x5</button>
          <button class="button ${affordTen ? 'primary' : 'ghost'}" type="submit" name="quantity" value="10">Buy x10</button>
        </div>
      </form>
    `;
  }).join('');
  const renderSection = (section) => `
    <div class="market-section" data-market-section>
      <div class="section-head">
        <div>
          <h2>${escapeHtml(section.title)}</h2>
          <p class="muted">${section.description}</p>
        </div>
        ${badge(`${formatNumber(section.items.length)} items`, 'default')}
      </div>
      <div class="grid-three" data-market-results>${renderMarketCards(section.items, section.key)}</div>
    </div>
  `;
  return `
    <section class="panel market-shell" data-market-board>
      <div class="section-head">
        <div>
          <p class="eyebrow">Guild Market</p>
          <h1>Market</h1>
          <p class="muted">Buy without losing your place, then keep scrolling. Premium perks are now priced like long-term account goals, not early freebies.</p>
        </div>
        <p data-market-cash>${money(state.user.cash)} available</p>
      </div>
      <section class="panelish market-control-panel gap-top">
        <div class="section-head">
          <div>
            <h2>Search and Filter</h2>
            <p class="muted">Search by item name, effect, or category, then narrow the board to what you can actually buy right now.</p>
          </div>
          <div class="badge-row compact-row">
            ${badge(`${formatNumber(marketable.length)} total`, 'default')}
            ${badge(`${formatNumber(state.world.marketRotation.items.length)} spotlight`, 'warning')}
            <span class="badge badge-success" data-market-count>${formatNumber(marketable.length)} items</span>
          </div>
        </div>
        <div class="market-control-grid" data-market-controls>
          <label>
            <span>Search</span>
            <input type="search" placeholder="Ability Patch, EV, Mega, healing..." data-market-search />
          </label>
          <label>
            <span>Category</span>
            <select data-market-category>
              <option value="">All categories</option>
              <option value="spotlight">Spotlight</option>
              <option value="premium">Premium</option>
              <option value="supplies">Adventure Supplies</option>
              <option value="progression">Leveling / Regression</option>
              <option value="iv">IV Surgery</option>
              <option value="ev">EV Dojo</option>
              <option value="mint">Nature Mints</option>
              <option value="evolution">Evolution</option>
              <option value="gear">Battle Gear</option>
              <option value="ability">Ability Lab</option>
              <option value="booster">Type Boosters</option>
              <option value="hold">Hold Items</option>
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select data-market-sort>
              <option value="featured">Featured</option>
              <option value="price-asc">Price low to high</option>
              <option value="price-desc">Price high to low</option>
              <option value="name-asc">Name A-Z</option>
            </select>
          </label>
          <label class="checkbox-row-inline">
            <input type="checkbox" data-market-affordable />
            <span>Affordable now</span>
          </label>
          <label class="checkbox-row-inline">
            <input type="checkbox" data-market-spotlight />
            <span>Spotlight only</span>
          </label>
        </div>
      </section>
      ${sections.map((section) => renderSection(section)).join('')}
      <section class="panelish market-empty-state" data-market-empty hidden>
        <h2>No market items matched</h2>
        <p class="muted">Try a broader search term or clear one of the active filters.</p>
      </section>
    </section>
  `;
}
function renderRosterPreview(monsters) {
  return `
    <div class="roster-preview">
      ${monsters.map((monster) => `
        <div class="roster-chip">
          <span>${escapeHtml((monster.nickname || monster.name).slice(0, 2).toUpperCase())}</span>
          <small>${escapeHtml(monster.name)}</small>
          <small>Lv ${formatNumber(monster.level || 1)}</small>
        </div>
      `).join('')}
    </div>
  `;
}

function renderChallengeCard(match, action, hiddenFields = '', intro = '', buttonLabel = 'Battle') {
  return `
    <article class="panelish gym-card">
      <div class="card-top">
        <div>
          <h3>${escapeHtml(match.name)}</h3>
          <p class="muted">${escapeHtml(intro)}</p>
        </div>
        <div class="badge-row compact-row">
          ${match.badgeName ? badge(match.badgeName, match.type) : badge(match.type, match.type)}
          ${match.completed ? badge('Cleared', 'success') : ''}
        </div>
      </div>
      ${renderRosterPreview(match.roster)}
      <div class="badge-row compact-row">
        ${match.roster[0]?.types?.map((type) => badge(type, type)).join(' ') || ''}
      </div>
      <form method="post" action="${action}" class="stack-form gap-top">
        ${hiddenFields}
        <button class="button ${match.unlocked ? 'primary' : 'ghost'}" type="submit" ${match.unlocked ? '' : 'disabled'}>${match.unlocked ? buttonLabel : 'Locked'}</button>
      </form>
    </article>
  `;
}

function renderGyms(state) {
  const leagueTabs = state.leagues.map((league) => `
    <button class="tab-button ${league.active ? 'is-active' : ''}" type="button" data-tab-target="${escapeHtml(league.slug)}" ${league.unlocked ? '' : 'disabled'}>
      ${escapeHtml(league.name)}
    </button>
  `).join('');
  const leaguePanels = state.leagues.map((league) => {
    const leaderCards = league.leaders.map((leader) => renderChallengeCard(
      leader,
      '/gyms/start',
      `<input type="hidden" name="battleSlug" value="${escapeHtml(leader.slug)}" />`,
      `${leader.type} specialist - 6-mon gym team`,
      leader.completed ? 'Rematch' : 'Start Gym Battle',
    )).join('');
    const eliteCards = league.eliteFour.map((leader) => renderChallengeCard(
      leader,
      '/gyms/start',
      `<input type="hidden" name="battleSlug" value="${escapeHtml(leader.slug)}" />`,
      `Elite Four specialist - 6-mon pressure squad`,
      leader.completed ? 'Rematch' : 'Challenge Elite Four',
    )).join('');
    const championCard = renderChallengeCard(
      league.champion,
      '/gyms/start',
      `<input type="hidden" name="battleSlug" value="${escapeHtml(league.champion.slug)}" />`,
      `${league.champion.title} - full championship roster`,
      league.champion.completed ? 'Rematch Champion' : 'Challenge Champion',
    );
    return `
      <section class="tab-panel ${league.active ? 'is-active' : ''}" data-tab-panel="${escapeHtml(league.slug)}">
        <section class="panelish highlight-panel nested-panel">
          <div class="section-head">
            <div>
              <h2>${escapeHtml(league.name)} League</h2>
              <p class="muted">${escapeHtml(league.banner)}. ${formatNumber(league.badgeCount)} badges and ${formatNumber(league.eliteCount)} elite clears logged.</p>
            </div>
            <div class="badge-row">
              ${badge(`${formatNumber(league.badgeCount)}/8 Badges`, league.badgeCount >= 8 ? 'success' : 'warning')}
              ${badge(`${formatNumber(league.eliteCount)}/4 Elite`, league.eliteCount >= 4 ? 'success' : 'default')}
            </div>
          </div>
        </section>
        <section class="market-section">
          <h2>Gym Leaders</h2>
          <div class="grid-three">${leaderCards}</div>
        </section>
        <section class="market-section">
          <h2>Elite Four</h2>
          <div class="grid-three">${eliteCards}</div>
        </section>
        <section class="market-section">
          <h2>Champion</h2>
          ${championCard}
        </section>
      </section>
    `;
  }).join('');
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">League Board</p>
          <h1>Gyms</h1>
          <p class="muted">Every region board now launches real challenge battles using your persistent party box. Clear badges, open the Elite Four, and push into the champion room.</p>
        </div>
        <div class="badge-row">
          ${badge(`Total Clears ${formatNumber(state.totalWins)}`, 'success')}
          ${badge(state.world.activeRegion.name, 'default')}
        </div>
      </div>
      <section class="panelish nested-panel" data-tab-group>
        <div class="tab-strip league-tab-strip">${leagueTabs}</div>
        ${leaguePanels}
      </section>
    </section>
  `;
}

function safeExternalUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString().slice(0, 420) : '';
  } catch {
    return '';
  }
}

function renderChatMessageCopy(body) {
  const text = String(body || '');
  if (!text.trim()) {
    return '';
  }
  const pattern = /(https?:\/\/[^\s<>'"]+)/g;
  const lines = text.split('\n').map((line) => {
    let lastIndex = 0;
    const parts = [];
    for (const match of line.matchAll(pattern)) {
      const index = Number(match.index || 0);
      const value = match[0] || '';
      const safeUrl = safeExternalUrl(value);
      parts.push(escapeHtml(line.slice(lastIndex, index)));
      if (safeUrl) {
        parts.push(`<a class="chat-inline-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(safeUrl.replace(/^https?:\/\/(www\.)?/, ''))}</a>`);
      } else {
        parts.push(escapeHtml(value));
      }
      lastIndex = index + value.length;
    }
    parts.push(escapeHtml(line.slice(lastIndex)));
    return parts.join('');
  });
  return `<p class="chat-message-copy">${lines.join('<br />')}</p>`;
}

function renderEmojiPicker(targetInputId, pickerSlug, categories = []) {
  if (!categories.length) {
    return '';
  }
  const tabs = categories.map((category, index) => `
    <button class="tab-button ${index === 0 ? 'is-active' : ''}" type="button" data-tab-target="${escapeHtml(`${pickerSlug}-${category.slug}`)}">
      <span>${escapeHtml(category.icon || '*')}</span>
      <span>${escapeHtml(category.name)}</span>
    </button>
  `).join('');
  const panels = categories.map((category, index) => `
    <section class="tab-panel ${index === 0 ? 'is-active' : ''}" data-tab-panel="${escapeHtml(`${pickerSlug}-${category.slug}`)}">
      <p class="muted emoji-category-copy">${escapeHtml(category.name)} board</p>
      <div class="emoji-picker-grid">
        ${(category.emojis || []).map((emoji, emojiIndex) => `
          <button class="emoji-chip" type="button" data-emoji-target="${escapeHtml(targetInputId)}" data-emoji-value="${escapeHtml(emoji)}" aria-label="${escapeHtml(category.name)} emoji ${emojiIndex + 1}">${escapeHtml(emoji)}</button>
        `).join('')}
      </div>
    </section>
  `).join('');
  return `
    <details class="emoji-picker">
      <summary>Emoji</summary>
      <div class="emoji-picker-shell panelish" data-tab-group>
        <div class="tab-strip emoji-tab-strip">${tabs}</div>
        ${panels}
      </div>
    </details>
  `;
}

function renderChatMessages(messages, currentUserId) {
  if (!messages.length) {
    return '<div class="chat-empty muted">No messages yet.</div>';
  }
  return messages.map((message) => {
    const imageUrl = safeExternalUrl(message.imageUrl);
    const linkUrl = safeExternalUrl(message.linkUrl);
    const linkLabel = message.linkLabel || (linkUrl ? linkUrl.replace(/^https?:\/\/(www\.)?/, '') : 'Open link');
    return `
      <article class="chat-bubble ${message.senderUserId === currentUserId ? 'is-self' : ''}">
        <div class="card-top">
          <strong>${escapeHtml(message.senderName)}</strong>
          <small class="muted">${escapeHtml(formatDateTime(message.createdAt))}</small>
        </div>
        ${renderChatMessageCopy(message.body)}
        ${imageUrl ? `
          <a class="chat-shared-image" href="${escapeHtml(imageUrl)}" target="_blank" rel="noreferrer noopener">
            <img src="${escapeHtml(imageUrl)}" alt="Shared image from ${escapeHtml(message.senderName)}" loading="lazy" referrerpolicy="no-referrer" />
          </a>
        ` : ''}
        ${linkUrl ? `
          <a class="chat-link-card" href="${escapeHtml(linkUrl)}" target="_blank" rel="noreferrer noopener">
            <strong>${escapeHtml(linkLabel)}</strong>
            <span>${escapeHtml(linkUrl)}</span>
          </a>
        ` : ''}
        ${message.targetName ? `<small class="muted chat-target-tag">to ${escapeHtml(message.targetName)}</small>` : ''}
      </article>
    `;
  }).join('');
}
function renderSocial(state) {
  const playerOptions = state.players.map((player) => `<option value="${player.id}">${escapeHtml(player.username)}</option>`).join('');
  const globalEmojiPicker = renderEmojiPicker('global-chat-input', 'global-emoji-picker', state.emojiCategories || []);
  const whisperEmojiPicker = renderEmojiPicker('direct-chat-input', 'direct-emoji-picker', state.emojiCategories || []);
  const arenaLadder = state.arenaLadder || { label: 'Bronze V', tone: 'warning', points: 0, highestPoints: 0, progressPercent: 0, pointsToNext: 0, nextLabel: 'Bronze IV', capped: false };
  const playerCards = state.playerChallenges.map((challenge) => `
    <article class="panelish gym-card">
      <div class="card-top">
        <h3>${escapeHtml(challenge.user.username)}</h3>
        ${badge(challenge.format, 'default')}
      </div>
      <p class="muted">${escapeHtml(challenge.difficulty)} difficulty sparring data from the player's saved team.</p>
      <div class="badge-row compact-row">
        ${badge(challenge.user.arenaRankLabel || 'Bronze V', challenge.user.arenaRankTone || 'default')}
        ${badge(`${formatNumber(challenge.user.arenaPoints || 0)} arena pts`, challenge.user.arenaRankTone || 'default')}
      </div>
      ${renderRosterPreview(challenge.roster)}
      <form method="post" action="/social/challenge" class="stack-form gap-top">
        <input type="hidden" name="source" value="player" />
        <input type="hidden" name="value" value="${challenge.user.id}" />
        <button class="button accent" type="submit">Start Spar</button>
      </form>
    </article>
  `).join('');
  const botCards = state.botChallenges.map((challenge) => `
    <article class="panelish gym-card">
      <div class="card-top">
        <h3>${escapeHtml(challenge.name)}</h3>
        ${badge(challenge.format, 'warning')}
      </div>
      <p class="muted">${escapeHtml(challenge.difficulty)} difficulty arena board with a generated 6-mon roster.</p>
      ${renderRosterPreview(challenge.roster)}
      <form method="post" action="/social/challenge" class="stack-form gap-top">
        <input type="hidden" name="source" value="bot" />
        <input type="hidden" name="value" value="${escapeHtml(challenge.slug)}" />
        <button class="button primary" type="submit">Launch Arena</button>
      </form>
    </article>
  `).join('');
  const socialActivityLog = state.activityLog?.length
    ? state.activityLog.map((entry) => `<li>${escapeHtml(entry.text)} <span class="muted">${escapeHtml(formatDateTime(entry.at))}</span></li>`).join('')
    : '<li>No arena activity logged yet.</li>';
  const casualQueue = state.playerChallenges[0] || null;
  const rankedQueue = state.leaderboardChallenges[0] || null;
  const hardQueue = state.botChallenges.find((entry) => entry.difficulty === 'hard') || state.botChallenges[0] || null;
  const advancedQueue = state.botChallenges.find((entry) => entry.difficulty === 'advanced') || state.botChallenges[state.botChallenges.length - 1] || null;
  const queueCards = [
    `
      <article class="panelish social-queue-card social-ladder-card">
        <div class="card-top">
          <div>
            <h3>${escapeHtml(arenaLadder.label)}</h3>
            <p class="muted">Bronze V through Diamond I now scale ranked ghost strength and ladder gains.</p>
          </div>
          ${badge(`${formatNumber(arenaLadder.points || 0)} pts`, arenaLadder.tone || 'warning')}
        </div>
        ${renderProgressMeter(arenaLadder.progressPercent || 0, arenaLadder.capped ? 'Diamond cap reached' : `${formatNumber(arenaLadder.pointsToNext || 0)} pts to ${arenaLadder.nextLabel || 'next rank'}`)}
        <div class="badge-row compact-row">
          ${badge(`Arena ${formatNumber(state.arenaRecord?.wins || 0)}-${formatNumber(state.arenaRecord?.losses || 0)}`, 'warning')}
          ${badge(`Best ${formatNumber(arenaLadder.highestPoints || arenaLadder.points || 0)} pts`, 'default')}
        </div>
      </article>
    `,
    casualQueue ? `
      <article class="panelish social-queue-card">
        <div class="card-top">
          <h3>Casual Match</h3>
          ${badge('player', 'success')}
        </div>
        <p class="muted">Spar with ${escapeHtml(casualQueue.user.username)}'s saved roster with fair player-style pressure.</p>
        <form method="post" action="/social/challenge" class="stack-form gap-top">
          <input type="hidden" name="source" value="player" />
          <input type="hidden" name="value" value="${casualQueue.user.id}" />
          <button class="button accent" type="submit">Queue Casual</button>
        </form>
      </article>
    ` : '',
    rankedQueue ? `
      <article class="panelish social-queue-card">
        <div class="card-top">
          <h3>Ranked Ghost</h3>
          ${badge('ranked', 'warning')}
        </div>
        <p class="muted">Challenge live ladder data against ${escapeHtml(rankedQueue.arenaRankLabel || 'Bronze V')} pressure with ${formatNumber(rankedQueue.arenaPoints || 0)} points on the line.</p>
        <form method="post" action="/social/challenge" class="stack-form gap-top">
          <input type="hidden" name="source" value="leaderboard" />
          <input type="hidden" name="value" value="${rankedQueue.userId}" />
          <button class="button primary" type="submit">Queue Ranked</button>
        </form>
      </article>
    ` : '',
    hardQueue ? `
      <article class="panelish social-queue-card">
        <div class="card-top">
          <h3>Hard AI</h3>
          ${badge('hard', 'default')}
        </div>
        <p class="muted">Fight a tougher generated AI roster when you want a clean mid-tier practice queue.</p>
        <form method="post" action="/social/challenge" class="stack-form gap-top">
          <input type="hidden" name="source" value="bot" />
          <input type="hidden" name="value" value="${escapeHtml(hardQueue.slug)}" />
          <button class="button ghost" type="submit">Fight Hard AI</button>
        </form>
      </article>
    ` : '',
    advancedQueue ? `
      <article class="panelish social-queue-card">
        <div class="card-top">
          <h3>Advanced AI</h3>
          ${badge('advanced', 'warning')}
        </div>
        <p class="muted">Advanced queue with stronger move coverage and less forgiving generated battle plans.</p>
        <form method="post" action="/social/challenge" class="stack-form gap-top">
          <input type="hidden" name="source" value="bot" />
          <input type="hidden" name="value" value="${escapeHtml(advancedQueue.slug)}" />
          <button class="button primary" type="submit">Fight Advanced AI</button>
        </form>
      </article>
    ` : '',
  ].filter(Boolean).join('');
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Global / Player Chat</p>
          <h1>Social & Arena</h1>
          <p class="muted">Global chat, whisper windows, full emoji boards, image cards, and clean link attachments now share one live social hub.</p>
        </div>
        <div class="badge-row">
          ${badge(state.world.event.label, 'default')}
          ${badge(state.world.activeRegion.name, 'success')}
          ${badge(`Arena ${state.arenaRecord.wins}-${state.arenaRecord.losses}`, 'warning')}
          ${badge(arenaLadder.label || 'Bronze V', arenaLadder.tone || 'warning')}
          ${badge(state.emojiSet.name, 'default')}
        </div>
      </div>
      <section class="grid-two summary-grid gap-top">
        <div class="grid-two social-queue-grid">${queueCards}</div>
        <article class="panelish social-activity-card">
          <div class="section-head">
            <div>
              <h2>Latest Activity</h2>
              <p class="muted">Arena queues, map searches, and mini-game rewards now show up here so the social page stays connected to live play.</p>
            </div>
            ${badge('Live', 'success')}
          </div>
          <ul class="clean-list compact">${socialActivityLog}</ul>
        </article>
      </section>
      <section class="grid-two chat-layout">
        <article class="panelish chat-window">
          <div class="chat-window-head">
            <div>
              <h2>Global Chat</h2>
              <p class="muted">Featured board: ${escapeHtml(state.emojiSet.name)}. Open the picker for faces, animals, food, travel, symbols, flags, and more.</p>
            </div>
            ${badge('World', 'success')}
          </div>
          <div class="chat-feed scroll-list" data-autoscroll>${renderChatMessages(state.globalMessages, state.user.id)}</div>
          <form method="post" action="/social/chat" class="stack-form gap-top chat-compose-form" data-chat-composer>
            <input type="hidden" name="roomType" value="global" />
            <div class="chat-compose-row">
              <textarea id="global-chat-input" name="body" maxlength="360" rows="3" placeholder="Say something to the world"></textarea>
              <div class="chat-compose-actions">
                ${globalEmojiPicker}
                <button class="button primary" type="submit">Send</button>
              </div>
            </div>
            <details class="chat-attachment-toggle">
              <summary>Attachments</summary>
              <div class="chat-attachment-grid">
                <label><span>Image URL</span><input type="url" name="imageUrl" placeholder="https://example.com/image.png" data-chat-image-input /></label>
                <label><span>Link URL</span><input type="url" name="linkUrl" placeholder="https://example.com" data-chat-link-input /></label>
                <label><span>Link Label</span><input type="text" name="linkLabel" maxlength="64" placeholder="Optional link title" data-chat-link-label /></label>
              </div>
            </details>
            <div class="chat-attachment-preview" data-chat-preview hidden>
              <div class="chat-attachment-preview-media" data-chat-preview-image-wrap hidden>
                <img class="chat-preview-image" data-chat-preview-image src="" alt="Attachment preview" />
              </div>
              <a class="chat-link-card" data-chat-preview-link hidden target="_blank" rel="noreferrer noopener">
                <strong data-chat-preview-link-label>Link preview</strong>
                <span data-chat-preview-link-url></span>
              </a>
            </div>
            <p class="muted chat-attachment-note">You can send text only, attachments only, or both in the same post.</p>
          </form>
        </article>
        <article class="panelish chat-window">
          <div class="chat-window-head">
            <div>
              <h2>Player Chat</h2>
              <p class="muted">Whispers stay between you and the selected player, but they support the same emoji and attachment tools.</p>
            </div>
            ${badge('Direct', 'default')}
          </div>
          <div class="chat-feed scroll-list" data-autoscroll>${renderChatMessages(state.directMessages, state.user.id)}</div>
          <form method="post" action="/social/chat" class="stack-form gap-top chat-compose-form" data-chat-composer>
            <input type="hidden" name="roomType" value="direct" />
            <label><span>Player</span><select name="targetUserId">${playerOptions || '<option value="">No players</option>'}</select></label>
            <div class="chat-compose-row">
              <textarea id="direct-chat-input" name="body" maxlength="360" rows="3" placeholder="Send a private message"></textarea>
              <div class="chat-compose-actions">
                ${whisperEmojiPicker}
                <button class="button accent" type="submit">Whisper</button>
              </div>
            </div>
            <details class="chat-attachment-toggle">
              <summary>Attachments</summary>
              <div class="chat-attachment-grid">
                <label><span>Image URL</span><input type="url" name="imageUrl" placeholder="https://example.com/image.png" data-chat-image-input /></label>
                <label><span>Link URL</span><input type="url" name="linkUrl" placeholder="https://example.com" data-chat-link-input /></label>
                <label><span>Link Label</span><input type="text" name="linkLabel" maxlength="64" placeholder="Optional link title" data-chat-link-label /></label>
              </div>
            </details>
            <div class="chat-attachment-preview" data-chat-preview hidden>
              <div class="chat-attachment-preview-media" data-chat-preview-image-wrap hidden>
                <img class="chat-preview-image" data-chat-preview-image src="" alt="Attachment preview" />
              </div>
              <a class="chat-link-card" data-chat-preview-link hidden target="_blank" rel="noreferrer noopener">
                <strong data-chat-preview-link-label>Link preview</strong>
                <span data-chat-preview-link-url></span>
              </a>
            </div>
            <p class="muted chat-attachment-note">Whispers can also carry one image and one featured link.</p>
          </form>
        </article>
      </section>
      <section class="market-section">
        <h2>Player Challenges</h2>
        <div class="grid-three">${playerCards}</div>
      </section>
      <section class="market-section">
        <h2>Arena Ladder</h2>
        <p class="muted">Ranked ghosts now use live ladder points from Bronze V through Diamond I, and stronger ranks scale their saved teams higher.</p>
        <div class="grid-three">${renderLeaderboardPreview(state.arenaLeaderboard || state.leaderboard, { limit: 6 })}</div>
      </section>
      <section class="market-section">
        <h2>Bot Arena</h2>
        <div class="grid-three">${botCards}</div>
      </section>
      <section class="market-section">
        <h2>Overall Snapshot</h2>
        <div class="grid-three">${renderLeaderboardPreview(state.leaderboard, { limit: 6 })}</div>
      </section>
    </section>
  `;
}
function renderMiniGames(state) {
  const gameMeta = (slug) => state.games.find((entry) => entry.slug === slug) || { name: slug, summary: '', rewardHint: '', tone: 'default' };
  const mining = gameMeta('mine');
  const dice = gameMeta('dice');
  const prizeWheelMeta = gameMeta('prize-wheel');
  const gamble = gameMeta('aura-gamble');
  const silhouetteMeta = gameMeta('who-is-that');
  const quizMeta = gameMeta('type-quiz');
  const forecastMeta = gameMeta('battle-forecast');
  const statScoutMeta = gameMeta('stat-scout');
  const rarityRadarMeta = gameMeta('rarity-radar');
  const whackMeta = gameMeta('whack-a-mon');
  const powerPivotMeta = gameMeta('power-pivot');
  const typeEdgeMeta = gameMeta('type-edge');
  const dailyMeta = gameMeta('daily-crate');
  const gear = state.gear || { auraInventory: [], hatInventory: [], equippedAura: null, equippedHat: null };
  const ownedAuras = (gear.auraInventory || []).filter((entry) => entry.quantity > 0);
  const ownedHats = (gear.hatInventory || []).filter((entry) => entry.quantity > 0);
  const exchangeState = state.tokenExchange || { itemBundles: [], monsterEntries: [], lockedMonsterCount: 0 };
  const rewardShopCards = (state.rewardShop || []).map((entry) => {
    const searchText = [entry.name, entry.description, entry.rewardName, entry.rewardType, entry.tone || ''].join(' ').toLowerCase();
    return `
      <article
        class="panelish minigame-shop-card"
        data-reward-shop-card
        data-search="${escapeHtml(searchText)}"
        data-category="${escapeHtml(entry.rewardType)}"
        data-cost="${entry.cost}"
        data-redeemable="${entry.canRedeem ? '1' : '0'}"
        data-exclusive="${entry.repeatable === false ? '1' : '0'}"
      >
        <div class="card-top">
          <h3>${escapeHtml(entry.name)}</h3>
          <div class="badge-row compact-row">
            ${badge(`${formatNumber(entry.cost)} Tokens`, 'warning')}
            ${entry.alreadyOwnedExclusive ? badge('Owned', 'success') : badge(entry.rewardType, 'default')}
          </div>
        </div>
        <p class="muted">${escapeHtml(entry.description)}</p>
        <p class="muted">Reward: ${escapeHtml(entry.rewardName)}${entry.ownedQuantity ? ` &middot; Owned x${formatNumber(entry.ownedQuantity)}` : ''}</p>
        <form method="post" action="/minigames/redeem" class="stack-form gap-top">
          <input type="hidden" name="rewardSlug" value="${escapeHtml(entry.slug)}" />
          <button class="button ${entry.canRedeem ? 'accent' : 'ghost'}" type="submit" ${entry.canRedeem ? '' : 'disabled'}>${entry.canRedeem ? 'Redeem Reward' : entry.alreadyOwnedExclusive ? 'Already Owned' : `Need ${formatNumber(entry.cost)} Tokens`}</button>
        </form>
      </article>
    `;
  }).join('');
  const itemExchangeOptions = (exchangeState.itemBundles || []).map((entry) => `<option value="${escapeHtml(entry.itemSlug)}:${entry.quantity}">${escapeHtml(entry.itemName)} x${formatNumber(entry.quantity)} &middot; +${formatNumber(entry.tokens)} Tokens</option>`).join('');
  const monsterExchangeOptions = (exchangeState.monsterEntries || []).map((entry) => `<option value="${entry.collectionId}">${escapeHtml(entry.monsterName)}${entry.monsterName !== entry.speciesName ? ` (${escapeHtml(entry.speciesName)})` : ''} &middot; Lv ${formatNumber(entry.level)} &middot; ${escapeHtml(titleLabel(entry.rarity))} &middot; +${formatNumber(entry.tokens)} Tokens${entry.heldItemName ? ` &middot; returns ${escapeHtml(entry.heldItemName)}` : ''}</option>`).join('');
  const activityLog = state.activityLog.length
    ? state.activityLog.slice(0, 10).map((entry) => `<li>${escapeHtml(entry.text)} <span class="muted">${escapeHtml(formatDateTime(entry.at))}</span></li>`).join('')
    : '<li>No mini-game activity logged yet.</li>';
  const cooldownSeconds = (slug) => Number(state.cooldowns?.[slug] || 0);
  const cooldownBadge = (slug) => cooldownSeconds(slug) > 0
    ? badge(`${miniGameCooldownLabel(slug)} ${formatNumber(cooldownSeconds(slug))}s`, 'warning')
    : badge(`${miniGameCooldownLabel(slug)} Ready`, 'success');
  const silhouetteOptions = (state.silhouette?.options || []).map((option, index) => `
    <label class="checkbox-row-inline">
      <input type="radio" name="answer" value="${escapeHtml(option.slug)}" ${index === 0 ? 'checked' : ''} />
      <span>${escapeHtml(option.name)}</span>
    </label>
  `).join('');
  const quizOptions = (state.typeQuiz?.options || []).map((type, index) => `
    <label class="checkbox-row-inline">
      <input type="radio" name="answer" value="${escapeHtml(type)}" ${index === 0 ? 'checked' : ''} />
      <span>${escapeHtml(titleLabel(type))}</span>
    </label>
  `).join('');
  const forecastOptions = (state.battleForecast?.options || []).map((option, index) => `
    <label class="checkbox-row-inline">
      <input type="radio" name="answer" value="${escapeHtml(option.key)}" ${index === 0 ? 'checked' : ''} />
      <span>${escapeHtml(option.label)}</span>
    </label>
  `).join('');
  const statScoutOptions = (state.statScout?.options || []).map((option, index) => `
    <label class="checkbox-row-inline">
      <input type="radio" name="answer" value="${escapeHtml(option.key)}" ${index === 0 ? 'checked' : ''} />
      <span>${escapeHtml(option.label)}</span>
    </label>
  `).join('');
  const rarityRadarOptions = (state.rarityRadar?.options || []).map((option, index) => `
    <label class="checkbox-row-inline">
      <input type="radio" name="answer" value="${escapeHtml(option)}" ${index === 0 ? 'checked' : ''} />
      <span>${escapeHtml(titleLabel(option))}</span>
    </label>
  `).join('');
  const prizeWheelSegments = (state.prizeWheel?.segments || []).map((segment) => badge(segment.label, segment.tone || 'default')).join(' ');
  const whackOptions = (state.whackAMon?.slots || []).map((option, index) => `
    <label class="checkbox-row-inline">
      <input type="radio" name="answer" value="${escapeHtml(option.key)}" ${index === 0 ? 'checked' : ''} />
      <span>${escapeHtml(option.label)}</span>
    </label>
  `).join('');
  const powerPivotOptions = (state.powerPivot?.options || []).map((option, index) => `
    <label class="checkbox-row-inline">
      <input type="radio" name="answer" value="${escapeHtml(option.slug)}" ${index === 0 ? 'checked' : ''} />
      <span>${escapeHtml(option.name)}</span>
    </label>
  `).join('');
  const typeEdgeOptions = (state.typeEdge?.options || []).map((type, index) => `
    <label class="checkbox-row-inline">
      <input type="radio" name="answer" value="${escapeHtml(type)}" ${index === 0 ? 'checked' : ''} />
      <span>${escapeHtml(titleLabel(type))}</span>
    </label>
  `).join('');
  return `
    <section class="panel minigame-page">
      <div class="section-head">
        <div>
          <p class="eyebrow">Reward Board</p>
          <h1>Mini Games</h1>
          <p class="muted">Harder side activities now lean more on skill lanes, tighter token rewards, and clearer arcade segmentation.</p>
        </div>
        <div class="badge-row">
          ${badge(`Played ${formatNumber(state.stats.played)}`, 'default')}
          ${badge(`Wins ${formatNumber(state.stats.wins)}`, 'success')}
          ${badge(`Streak ${formatNumber(state.stats.streak)}`, 'warning')}
          ${badge(`Tokens ${formatNumber(state.stats.tokens || 0)}`, 'warning')}
          ${badge(`Jackpots ${formatNumber(state.stats.gambleJackpots || 0)}`, 'warning')}
          ${badge(`Wheel Wins ${formatNumber(state.stats.prizeWheelWins || 0)}`, 'electric')}
          ${badge(`Forecast Wins ${formatNumber(state.stats.forecastWins || 0)}`, 'electric')}
          ${badge(`Scout Wins ${formatNumber(state.stats.statScoutWins || 0)}`, 'grass')}
          ${badge(`Radar Wins ${formatNumber(state.stats.rarityRadarWins || 0)}`, 'ghost')}
          ${badge(`Whacks ${formatNumber(state.stats.whackWins || 0)}`, 'fighting')}
          ${badge(`Pivot Wins ${formatNumber(state.stats.powerPivotWins || 0)}`, 'warning')}
          ${badge(`Edge Wins ${formatNumber(state.stats.typeEdgeWins || 0)}`, 'electric')}
        </div>
      </div>
      <section class="panelish minigame-card">
        <div class="section-head">
          <div>
            <h2>Challenge Tuning</h2>
            <p class="muted">No-repeat question cursors, lower validation rates, and stronger penalties reduce abuse.</p>
          </div>
          <div class="badge-row compact-row">
            ${badge('Cursor rotation active', 'warning')}
            ${badge('Skill lanes pay better than gamble lanes', 'default')}
            ${cooldownBadge('mine')}
            ${cooldownBadge('dice')}
            ${cooldownBadge('prize-wheel')}
            ${cooldownBadge('aura-gamble')}
            ${cooldownBadge('who-is-that')}
            ${cooldownBadge('type-quiz')}
            ${cooldownBadge('battle-forecast')}
            ${cooldownBadge('stat-scout')}
            ${cooldownBadge('rarity-radar')}
            ${cooldownBadge('whack-a-mon')}
            ${cooldownBadge('power-pivot')}
            ${cooldownBadge('type-edge')}
          </div>
        </div>
      </section>
      <section class="grid-three minigame-grid">
        <article class="panelish minigame-card">
          <div class="card-top">
            <h2>${escapeHtml(mining.name)}</h2>
            ${badge(mining.rewardHint, mining.tone)}
          </div>
          <p class="muted">${escapeHtml(mining.summary)}</p>
          <form method="post" action="/minigames/play" class="stack-form gap-top">
            <input type="hidden" name="gameSlug" value="mine" />
            <button class="button primary" type="submit" ${cooldownSeconds('mine') > 0 ? 'disabled' : ''}>${cooldownSeconds('mine') > 0 ? `Cooling ${formatNumber(cooldownSeconds('mine'))}s` : 'Go Mining'}</button>
          </form>
        </article>
        <article class="panelish minigame-card">
          <div class="card-top">
            <h2>${escapeHtml(dice.name)}</h2>
            ${badge(dice.rewardHint, dice.tone)}
          </div>
          <p class="muted">${escapeHtml(dice.summary)}</p>
          <form method="post" action="/minigames/play" class="stack-form gap-top">
            <input type="hidden" name="gameSlug" value="dice" />
            <button class="button accent" type="submit" ${cooldownSeconds('dice') > 0 ? 'disabled' : ''}>${cooldownSeconds('dice') > 0 ? `Cooling ${formatNumber(cooldownSeconds('dice'))}s` : 'Roll Dice'}</button>
          </form>
        </article>
        <article class="panelish minigame-card">
          <div class="card-top">
            <h2>${escapeHtml(prizeWheelMeta.name)}</h2>
            ${badge(prizeWheelMeta.rewardHint, prizeWheelMeta.tone)}
          </div>
          <p class="muted">${escapeHtml(prizeWheelMeta.summary)}</p>
          <div class="badge-row compact-row">${prizeWheelSegments}</div>
          <p class="muted gap-top">${escapeHtml(state.prizeWheel?.headline || '')}</p>
          <form method="post" action="/minigames/play" class="stack-form gap-top">
            <input type="hidden" name="gameSlug" value="prize-wheel" />
            <button class="button accent" type="submit" ${cooldownSeconds('prize-wheel') > 0 ? 'disabled' : ''}>${cooldownSeconds('prize-wheel') > 0 ? `Cooling ${formatNumber(cooldownSeconds('prize-wheel'))}s` : 'Spin Prize Wheel'}</button>
          </form>
        </article>
      </section>
      <section class="grid-two minigame-grid">
        <article class="panelish minigame-card">
          <div class="card-top">
            <h2>${escapeHtml(gamble.name)}</h2>
            ${badge(gamble.rewardHint, gamble.tone)}
          </div>
          <p class="muted">${escapeHtml(gamble.summary)}</p>
          <form method="post" action="/minigames/play" class="stack-form gap-top">
            <input type="hidden" name="gameSlug" value="aura-gamble" />
            <button class="button accent" type="submit" ${cooldownSeconds('aura-gamble') > 0 ? 'disabled' : ''}>${cooldownSeconds('aura-gamble') > 0 ? `Cooling ${formatNumber(cooldownSeconds('aura-gamble'))}s` : 'Spin Aura Jackpot'}</button>
          </form>
        </article>
        <article class="panelish minigame-card">
          <div class="card-top">
            <h2>${escapeHtml(whackMeta.name)}</h2>
            ${badge(whackMeta.rewardHint, whackMeta.tone)}
          </div>
          <p class="muted">${escapeHtml(state.whackAMon?.prompt || '')}</p>
          <form method="post" action="/minigames/play" class="stack-form gap-top">
            <input type="hidden" name="gameSlug" value="whack-a-mon" />
            <div class="choice-grid">${whackOptions}</div>
            <button class="button primary" type="submit" ${cooldownSeconds('whack-a-mon') > 0 ? 'disabled' : ''}>${cooldownSeconds('whack-a-mon') > 0 ? `Cooling ${formatNumber(cooldownSeconds('whack-a-mon'))}s` : 'Whack Target'}</button>
          </form>
        </article>
      </section>
      <section class="panelish minigame-card">
        <div class="section-head">
          <div>
            <h2>Loadout Inventory</h2>
            <p class="muted">Auras and hats from Aura Jackpot can be equipped in your Hub identity screen.</p>
          </div>
          <div class="badge-row compact-row">
            ${badge(`Auras ${formatNumber(ownedAuras.length)}`, 'default')}
            ${badge(`Hats ${formatNumber(ownedHats.length)}`, 'default')}
            ${gear.equippedAura ? badge(gear.equippedAura.name, gear.equippedAura.tone || 'default') : badge('No Aura Equipped', 'default')}
            ${gear.equippedHat ? badge(gear.equippedHat.name, gear.equippedHat.tone || 'default') : badge('No Hat Equipped', 'default')}
          </div>
        </div>
        <div class="button-row">
          <a class="button ghost" href="/hub">Manage Gear In Hub</a>
        </div>
      </section>
      <section class="panelish minigame-card" data-reward-shop-board>
        <div class="section-head">
          <div>
            <h2>Mini-Game Reward Shop</h2>
            <p class="muted">Win tokens from mini-games, then redeem exclusive gear and account-upgrade items here.</p>
          </div>
          <div class="badge-row compact-row">
            ${badge(`Tokens ${formatNumber(state.stats.tokens || 0)}`, 'warning')}
            ${badge(`${formatNumber((state.rewardShop || []).length)} rewards`, 'default')}
            <span class="badge badge-success" data-reward-shop-count>${formatNumber((state.rewardShop || []).length)} rewards</span>
          </div>
        </div>
        <div class="market-control-panel gap-top">
          <div class="market-control-grid" data-reward-shop-controls>
            <label>
              <span>Search</span>
              <input type="search" placeholder="Aura, mint, emblem, visor..." data-reward-shop-search />
            </label>
            <label>
              <span>Type</span>
              <select data-reward-shop-category>
                <option value="">All rewards</option>
                <option value="item">Items</option>
                <option value="aura">Auras</option>
                <option value="hat">Hats</option>
              </select>
            </label>
            <label>
              <span>Sort</span>
              <select data-reward-shop-sort>
                <option value="featured">Featured</option>
                <option value="cost-asc">Cost low to high</option>
                <option value="cost-desc">Cost high to low</option>
                <option value="name-asc">Name A-Z</option>
              </select>
            </label>
            <label class="checkbox-row-inline">
              <input type="checkbox" data-reward-shop-redeemable />
              <span>Redeemable now</span>
            </label>
            <label class="checkbox-row-inline">
              <input type="checkbox" data-reward-shop-exclusive />
              <span>Exclusive only</span>
            </label>
          </div>
        </div>
        <div class="grid-three gap-top" data-reward-shop-results>${rewardShopCards || '<p class="muted">No reward shop entries available right now.</p>'}</div>
        <section class="panelish market-empty-state gap-top" data-reward-shop-empty hidden>
          <h2>No reward shop entries matched</h2>
          <p class="muted">Try a broader search term or clear one of the active filters.</p>
        </section>
      </section>
      <section class="grid-two minigame-grid">
        <article class="panelish minigame-card">
          <div class="section-head">
            <div>
              <h2>Convert Stash to Tokens</h2>
              <p class="muted">Turn extra stash bundles into arcade tokens without leaving the mini-game board.</p>
            </div>
            <div class="badge-row compact-row">
              ${badge(`${formatNumber((exchangeState.itemBundles || []).length)} bundles`, 'default')}
              ${badge('Cash-safe exchange', 'warning')}
            </div>
          </div>
          <form method="post" action="/minigames/exchange" class="stack-form gap-top">
            <input type="hidden" name="action" value="item" />
            <label>
              <span>Stash bundle</span>
              <select name="bundle">${itemExchangeOptions || '<option value="">No stash bundles worth tokens right now</option>'}</select>
            </label>
            <button class="button accent" type="submit" ${(exchangeState.itemBundles || []).length ? '' : 'disabled'}>Convert Bundle</button>
          </form>
          <p class="muted gap-top">Low-value items need larger bundles before they convert into tokens.</p>
        </article>
        <article class="panelish minigame-card">
          <div class="section-head">
            <div>
              <h2>Exchange Box Monsters</h2>
              <p class="muted">Trade eligible storage monsters for tokens. Favorites, your visible partner, and saved-party monsters are protected.</p>
            </div>
            <div class="badge-row compact-row">
              ${badge(`${formatNumber((exchangeState.monsterEntries || []).length)} eligible`, 'default')}
              ${exchangeState.lockedMonsterCount ? badge(`${formatNumber(exchangeState.lockedMonsterCount)} protected`, 'warning') : ''}
            </div>
          </div>
          <form method="post" action="/minigames/exchange" class="stack-form gap-top">
            <input type="hidden" name="action" value="monster" />
            <label>
              <span>Stored monster</span>
              <select name="collectionId">${monsterExchangeOptions || '<option value="">No eligible storage monsters right now</option>'}</select>
            </label>
            <button class="button ghost" type="submit" ${(exchangeState.monsterEntries || []).length ? '' : 'disabled'}>Exchange Monster</button>
          </form>
          <p class="muted gap-top">Held items are returned to your stash automatically before the exchange completes.</p>
        </article>
      </section>
      <section class="grid-three minigame-grid">
        <article class="panelish minigame-card">
          <div class="card-top">
            <h2>${escapeHtml(silhouetteMeta.name)}</h2>
            ${badge(silhouetteMeta.rewardHint, silhouetteMeta.tone)}
          </div>
          <p class="muted">${escapeHtml(state.silhouette?.clue || '')}</p>
          <form method="post" action="/minigames/play" class="stack-form gap-top">
            <input type="hidden" name="gameSlug" value="who-is-that" />
            <div class="choice-grid">${silhouetteOptions}</div>
            <button class="button ghost" type="submit" ${cooldownSeconds('who-is-that') > 0 ? 'disabled' : ''}>${cooldownSeconds('who-is-that') > 0 ? `Cooling ${formatNumber(cooldownSeconds('who-is-that'))}s` : 'Submit Guess'}</button>
          </form>
        </article>
        <article class="panelish minigame-card">
          <div class="card-top">
            <h2>${escapeHtml(quizMeta.name)}</h2>
            ${badge(quizMeta.rewardHint, quizMeta.tone)}
          </div>
          <p class="muted">${escapeHtml(state.typeQuiz?.prompt || '')}</p>
          <form method="post" action="/minigames/play" class="stack-form gap-top">
            <input type="hidden" name="gameSlug" value="type-quiz" />
            <div class="choice-grid">${quizOptions}</div>
            <button class="button ghost" type="submit" ${cooldownSeconds('type-quiz') > 0 ? 'disabled' : ''}>${cooldownSeconds('type-quiz') > 0 ? `Cooling ${formatNumber(cooldownSeconds('type-quiz'))}s` : 'Answer Quiz'}</button>
          </form>
        </article>
        <article class="panelish minigame-card">
          <div class="card-top">
            <h2>${escapeHtml(forecastMeta.name)}</h2>
            ${badge(forecastMeta.rewardHint, forecastMeta.tone)}
          </div>
          <p class="muted">${escapeHtml(state.battleForecast?.prompt || 'Forecast challenge unavailable right now.')}</p>
          <form method="post" action="/minigames/play" class="stack-form gap-top">
            <input type="hidden" name="gameSlug" value="battle-forecast" />
            <div class="choice-grid">${forecastOptions}</div>
            <button class="button accent" type="submit" ${cooldownSeconds('battle-forecast') > 0 ? 'disabled' : ''}>${cooldownSeconds('battle-forecast') > 0 ? `Cooling ${formatNumber(cooldownSeconds('battle-forecast'))}s` : 'Lock Forecast'}</button>
          </form>
        </article>
      </section>
      <section class="grid-two minigame-grid">
        <article class="panelish minigame-card">
          <div class="card-top">
            <h2>${escapeHtml(statScoutMeta.name)}</h2>
            ${badge(statScoutMeta.rewardHint, statScoutMeta.tone)}
          </div>
          <p class="muted">${escapeHtml(state.statScout?.prompt || '')}</p>
          <form method="post" action="/minigames/play" class="stack-form gap-top">
            <input type="hidden" name="gameSlug" value="stat-scout" />
            <div class="choice-grid">${statScoutOptions}</div>
            <button class="button ghost" type="submit" ${cooldownSeconds('stat-scout') > 0 ? 'disabled' : ''}>${cooldownSeconds('stat-scout') > 0 ? `Cooling ${formatNumber(cooldownSeconds('stat-scout'))}s` : 'Scout Stat'}</button>
          </form>
        </article>
        <article class="panelish minigame-card">
          <div class="card-top">
            <h2>${escapeHtml(rarityRadarMeta.name)}</h2>
            ${badge(rarityRadarMeta.rewardHint, rarityRadarMeta.tone)}
          </div>
          <p class="muted">${escapeHtml(state.rarityRadar?.prompt || '')}</p>
          <form method="post" action="/minigames/play" class="stack-form gap-top">
            <input type="hidden" name="gameSlug" value="rarity-radar" />
            <div class="choice-grid">${rarityRadarOptions}</div>
            <button class="button accent" type="submit" ${cooldownSeconds('rarity-radar') > 0 ? 'disabled' : ''}>${cooldownSeconds('rarity-radar') > 0 ? `Cooling ${formatNumber(cooldownSeconds('rarity-radar'))}s` : 'Classify Target'}</button>
          </form>
        </article>
      </section>
      <section class="grid-two minigame-grid">
        <article class="panelish minigame-card">
          <div class="card-top">
            <h2>${escapeHtml(powerPivotMeta.name)}</h2>
            ${badge(powerPivotMeta.rewardHint, powerPivotMeta.tone)}
          </div>
          <p class="muted">${escapeHtml(state.powerPivot?.prompt || '')}</p>
          <form method="post" action="/minigames/play" class="stack-form gap-top">
            <input type="hidden" name="gameSlug" value="power-pivot" />
            <div class="choice-grid">${powerPivotOptions}</div>
            <button class="button accent" type="submit" ${cooldownSeconds('power-pivot') > 0 ? 'disabled' : ''}>${cooldownSeconds('power-pivot') > 0 ? `Cooling ${formatNumber(cooldownSeconds('power-pivot'))}s` : 'Lock Power Read'}</button>
          </form>
        </article>
        <article class="panelish minigame-card">
          <div class="card-top">
            <h2>${escapeHtml(typeEdgeMeta.name)}</h2>
            ${badge(typeEdgeMeta.rewardHint, typeEdgeMeta.tone)}
          </div>
          <p class="muted">${escapeHtml(state.typeEdge?.prompt || '')}</p>
          <form method="post" action="/minigames/play" class="stack-form gap-top">
            <input type="hidden" name="gameSlug" value="type-edge" />
            <div class="choice-grid">${typeEdgeOptions}</div>
            <button class="button ghost" type="submit" ${cooldownSeconds('type-edge') > 0 ? 'disabled' : ''}>${cooldownSeconds('type-edge') > 0 ? `Cooling ${formatNumber(cooldownSeconds('type-edge'))}s` : 'Call Type Edge'}</button>
          </form>
        </article>
      </section>
      <section class="panelish minigame-card">
        <div class="card-top">
          <h2>${escapeHtml(dailyMeta.name)}</h2>
          ${badge(state.dailyReward.ready ? 'Ready now' : `Claimed ${state.dailyReward.lastClaimDate || 'today'}`, state.dailyReward.ready ? 'success' : 'default')}
        </div>
        <p class="muted">${escapeHtml(dailyMeta.summary)}</p>
        <form method="post" action="/minigames/play" class="inline-form gap-top">
          <input type="hidden" name="gameSlug" value="daily-crate" />
          <button class="button primary" type="submit" ${state.dailyReward.ready ? '' : 'disabled'}>Claim Daily Reward</button>
        </form>
      </section>
      <section class="panelish gap-top">
        <div class="section-head">
          <div>
            <h2>Mini-Game Activity</h2>
            <p class="muted">Recent reward log with timestamps.</p>
          </div>
          <div class="badge-row compact-row">
            ${badge(`Quiz Wins ${formatNumber(state.stats.quizWins)}`, 'water')}
            ${badge(`Silhouette Wins ${formatNumber(state.stats.silhouetteWins)}`, 'default')}
            ${badge(`Wheel Wins ${formatNumber(state.stats.prizeWheelWins || 0)}`, 'electric')}
            ${badge(`Forecast Wins ${formatNumber(state.stats.forecastWins)}`, 'electric')}
            ${badge(`Scout Wins ${formatNumber(state.stats.statScoutWins || 0)}`, 'grass')}
            ${badge(`Radar Wins ${formatNumber(state.stats.rarityRadarWins || 0)}`, 'ghost')}
            ${badge(`Whacks ${formatNumber(state.stats.whackWins || 0)}`, 'fighting')}
            ${badge(`Pivot Wins ${formatNumber(state.stats.powerPivotWins || 0)}`, 'warning')}
            ${badge(`Edge Wins ${formatNumber(state.stats.typeEdgeWins || 0)}`, 'electric')}
            ${badge(`Mine Fails ${formatNumber(state.stats.mineFails || 0)}`, 'warning')}
            ${badge(`Dice Losses ${formatNumber(state.stats.diceLosses || 0)}`, 'warning')}
            ${badge(`Collection ${formatNumber(state.collectionCount)}`, 'success')}
          </div>
        </div>
        <ul class="clean-list compact">${activityLog}</ul>
      </section>
    </section>
  `;
}
function miniGameCooldownLabel(slug) {
  const labels = {
    mine: 'Mine',
    dice: 'Dice',
    'prize-wheel': 'Wheel',
    'aura-gamble': 'Aura',
    'who-is-that': 'Silhouette',
    'type-quiz': 'Quiz',
    'battle-forecast': 'Forecast',
    'stat-scout': 'Scout',
    'rarity-radar': 'Radar',
    'whack-a-mon': 'Whack',
    'power-pivot': 'Pivot',
    'type-edge': 'Edge',
  };
  return labels[slug] || 'Game';
}

function renderNews(state) {
  const headlineCards = state.headlines.map((entry) => `
    <article class="panelish news-card">
      <div class="card-top">
        <h3>${escapeHtml(entry.title)}</h3>
        ${badge(entry.kind, entry.kind === 'Live' ? 'success' : entry.kind === 'Market' ? 'warning' : 'default')}
      </div>
      <p class="muted">${escapeHtml(entry.summary)}</p>
      <small class="muted">${escapeHtml(entry.publishedAt)}</small>
    </article>
  `).join('');
  const upcomingCards = state.upcoming.map((entry) => `
    <article class="panelish news-card upcoming-card">
      <div class="card-top">
        <h3>${escapeHtml(entry.title)}</h3>
        ${badge(entry.targetDate, 'warning')}
      </div>
      <p class="muted">${escapeHtml(entry.summary)}</p>
    </article>
  `).join('');
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Broadcast Board</p>
          <h1>News & Announcements</h1>
          <p class="muted">Live world updates plus upcoming patches so players can anticipate what is next.</p>
        </div>
        <div class="button-row">
          <a class="button ghost" href="/social">Open Social</a>
          <a class="button ghost" href="/events">Open Events</a>
          <a class="button accent" href="/minigames">Play Mini Games</a>
        </div>
      </div>
      <section class="market-section">
        <h2>Live Feed</h2>
        <div class="grid-three news-grid">${headlineCards}</div>
      </section>
      <section class="market-section">
        <h2>Upcoming</h2>
        <div class="grid-three news-grid">${upcomingCards}</div>
      </section>
    </section>
  `;
}

function renderEventsPage(state) {
  const liveCards = state.headlines.slice(0, 4).map((entry) => `
    <article class="panelish news-card">
      <div class="card-top">
        <h3>${escapeHtml(entry.title)}</h3>
        ${badge(entry.kind, entry.kind === 'Live' ? 'success' : entry.kind === 'Market' ? 'warning' : 'default')}
      </div>
      <p class="muted">${escapeHtml(entry.summary)}</p>
      <small class="muted">${escapeHtml(entry.publishedAt || 'Now')}</small>
    </article>
  `).join('');
  const bannerCards = state.banners.map((entry) => `
    <article class="panelish news-card ${entry.active ? 'upcoming-card' : ''}">
      <div class="card-top">
        <div>
          <h3>${escapeHtml(entry.banner)}</h3>
          <p class="muted">${escapeHtml(entry.series)} &middot; ${formatNumber(entry.species.length)} units</p>
        </div>
        ${badge(entry.active ? 'Active' : 'Standby', entry.active ? 'success' : 'default')}
      </div>
      <div class="badge-row compact-row">
        ${entry.typeSet.slice(0, 4).map((type) => badge(titleLabel(type), type)).join(' ')}
        ${entry.mythicCount ? badge(`${formatNumber(entry.mythicCount)} mythic`, 'warning') : ''}
        ${badge(`${formatNumber(entry.transformReady)} transform-ready`, 'default')}
      </div>
      <p class="muted gap-top">Catch rate range ${formatNumber(Math.round(entry.minCatchRate * 1000) / 10)}% to ${formatNumber(Math.round(entry.maxCatchRate * 1000) / 10)}%. Rotation refresh in about ${formatNumber(entry.rotationMinutesRemaining || 60)} minutes.</p>
    </article>
  `).join('');
  const unitCards = state.featuredUnits.map((entry) => {
    const species = entry.species;
    return `
      <article class="monster-card panelish dex-card">
        <div class="card-top">
          <div>
            <h3>${escapeHtml(species.name)}</h3>
            <p class="muted">${escapeHtml(entry.series)} &middot; ${escapeHtml(entry.banner)}</p>
          </div>
          ${badge(species.rarity, species.rarity === 'mythic' || species.rarity === 'legendary' ? 'warning' : species.rarity === 'epic' ? 'psychic' : 'default')}
        </div>
        ${renderMonsterPortrait(species, { caption: `Stage ${formatNumber(species.stage)} - ${formatNumber(species.total || 0)} total` })}
        <div class="badge-row compact-row">${species.types.map((type) => badge(titleLabel(type), type)).join(' ')}</div>
        <div class="badge-row compact-row gap-top">${renderTransformationBadges(entry.transformationModes || [])}</div>
        <p class="muted gap-top">RNG catch target: ${escapeHtml(String(Number(entry.catchRatePercent || 0).toFixed(1)).replace(/\.0$/, ''))}% catch rate.</p>
        <p class="muted">${escapeHtml(species.acquisitionNote || 'Limited rotation unit.')}</p>
        <div class="button-row gap-top">
          <a class="button ghost" href="/builds/${escapeHtml(species.slug)}">Open Build</a>
        </div>
      </article>
    `;
  }).join('');
  const saveBadges = (state.saveSummary?.protectedScopes || []).map((entry) => badge(entry, 'default')).join(' ');
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">Live Event Relay</p>
          <h1>Events & Rotations</h1>
          <p class="muted">Track limited anime banners, RNG catch windows, battle transformations, and account-save coverage from one page.</p>
        </div>
        <div class="button-row">
          <a class="button ghost" href="/news">Open News</a>
          <a class="button accent" href="/builds">Open Build Dex</a>
        </div>
      </div>
      <section class="grid-two settings-grid gap-top">
        <article class="panelish settings-card">
          <p class="eyebrow">Current Rotation</p>
          <h2>${escapeHtml(state.world.event.label)}</h2>
          <p class="muted">${escapeHtml(state.world.phaseLabel)} in ${escapeHtml(state.world.activeRegion.name)}. Daily boss focus: ${escapeHtml(state.dailyBoss?.name || 'Astravault Omega')}.</p>
          <div class="badge-row compact-row gap-top">
            ${badge(`${formatNumber(state.featuredBanners.length)} active banners`, 'success')}
            ${badge(`${formatNumber(state.featuredUnits.length)} featured units`, 'warning')}
            ${badge(`${formatNumber(state.world.marketRotation.minutesRemaining)}m market reset`, 'default')}
          </div>
        </article>
        <article class="panelish settings-card">
          <p class="eyebrow">Save & Recovery</p>
          <h2>Persistent Account Progress</h2>
          <p class="muted">Accounts, runs, trainer level, storage, inventory, and cash are saved automatically. Device restore is ${state.saveSummary?.deviceBackupReady ? 'ready on this browser' : 'not ready yet on this browser'}.</p>
          <div class="badge-row compact-row gap-top">
            ${badge(`Lv ${formatNumber(state.saveSummary?.trainerLevel || 1)}`, 'success')}
            ${badge(`${formatNumber(state.saveSummary?.caughtCount || 0)} caught`, 'default')}
            ${badge(`${formatNumber(state.saveSummary?.visibleCollectionCount || 0)} stored`, 'warning')}
          </div>
          <div class="badge-row compact-row gap-top">${saveBadges}</div>
          <p class="muted gap-top">Last synced snapshot: ${escapeHtml(String(state.saveSummary?.lastSyncedAt || 'Now'))}</p>
        </article>
      </section>
      <section class="market-section">
        <div class="section-head">
          <div>
            <h2>Live Feed</h2>
            <p class="muted">Broadcast cards for the current world event, boss watch, and market rotation.</p>
          </div>
        </div>
        <div class="grid-three news-grid">${liveCards}</div>
      </section>
      <section class="market-section">
        <div class="section-head">
          <div>
            <h2>Limited Banner Rotations</h2>
            <p class="muted">Every limited banner is grouped here so players can chase specific anime lines instead of guessing where they live.</p>
          </div>
        </div>
        <div class="grid-three news-grid">${bannerCards}</div>
      </section>
      <section class="market-section">
        <div class="section-head">
          <div>
            <h2>Featured Units</h2>
            <p class="muted">These are the hottest limited pulls right now, with RNG catch info and transformation access called out directly.</p>
          </div>
        </div>
        <div class="monster-grid">${unitCards}</div>
      </section>
    </section>
  `;
}

function renderAdmin(overview) {
  const users = overview.users.map((user) => `
    <article class="panel admin-user-card">
      <h3>${escapeHtml(user.username)}</h3>
      <p class="muted">#${user.id} - ${escapeHtml(user.email)} - ${escapeHtml(user.role)}</p>
      <p>${money(user.cash)} - modes ${escapeHtml(user.meta.unlockedModes.join(', '))}</p>
      <div class="admin-grid">
        <form method="post" action="/admin" class="compact-form stack-form">
          <input type="hidden" name="action" value="grant-cash" />
          <input type="hidden" name="targetUserId" value="${user.id}" />
          <input type="number" name="amount" placeholder="Cash amount" />
          <button class="button ghost" type="submit">Grant cash</button>
        </form>
        <form method="post" action="/admin" class="compact-form stack-form">
          <input type="hidden" name="action" value="grant-item" />
          <input type="hidden" name="targetUserId" value="${user.id}" />
          <select name="itemSlug">${CONTENT.items.map((item) => `<option value="${item.slug}">${escapeHtml(item.name)}</option>`).join('')}</select>
          <input type="number" name="quantity" placeholder="Qty" value="1" />
          <button class="button ghost" type="submit">Grant item</button>
        </form>
        <form method="post" action="/admin" class="compact-form stack-form">
          <input type="hidden" name="action" value="grant-monster" />
          <input type="hidden" name="targetUserId" value="${user.id}" />
          <input type="text" name="speciesSlug" placeholder="Species slug or ID" />
          <input type="number" name="level" placeholder="Level" value="8" />
          <button class="button ghost" type="submit">Grant monster</button>
        </form>
        <form method="post" action="/admin" class="compact-form stack-form">
          <input type="hidden" name="action" value="set-monster-level" />
          <input type="hidden" name="targetUserId" value="${user.id}" />
          <input type="number" name="collectionId" placeholder="Collection ID" />
          <input type="number" name="level" placeholder="New level" value="30" />
          <button class="button ghost" type="submit">Set monster level</button>
        </form>
        <form method="post" action="/admin" class="compact-form stack-form">
          <input type="hidden" name="action" value="adjust-monster-stat" />
          <input type="hidden" name="targetUserId" value="${user.id}" />
          <input type="number" name="collectionId" placeholder="Collection ID" />
          <select name="statKey">
            <option value="hp">hp</option>
            <option value="atk">atk</option>
            <option value="def">def</option>
            <option value="spa">spa</option>
            <option value="spd">spd</option>
            <option value="spe">spe</option>
          </select>
          <input type="number" name="amount" placeholder="Delta" value="6" />
          <button class="button ghost" type="submit">Adjust bonus stat</button>
        </form>
        <form method="post" action="/admin" class="compact-form stack-form">
          <input type="hidden" name="action" value="set-run-wave" />
          <input type="hidden" name="targetUserId" value="${user.id}" />
          <input type="number" name="wave" placeholder="Wave" value="20" />
          <button class="button ghost" type="submit">Set run wave</button>
        </form>
        <form method="post" action="/admin" class="compact-form stack-form">
          <input type="hidden" name="action" value="set-role" />
          <input type="hidden" name="targetUserId" value="${user.id}" />
          <select name="role"><option value="player">player</option><option value="admin">admin</option></select>
          <button class="button ghost" type="submit">Set role</button>
        </form>
        <form method="post" action="/admin" class="compact-form stack-form">
          <input type="hidden" name="action" value="unlock-mode" />
          <input type="hidden" name="targetUserId" value="${user.id}" />
          <select name="mode"><option value="classic">classic</option><option value="endless">endless</option><option value="challenge">challenge</option></select>
          <button class="button ghost" type="submit">Unlock mode</button>
        </form>
        <form method="post" action="/admin" class="compact-form stack-form">
          <input type="hidden" name="action" value="clear-run" />
          <input type="hidden" name="targetUserId" value="${user.id}" />
          <button class="button danger" type="submit">Clear active run</button>
        </form>
      </div>
    </article>
  `).join('');
  const logs = overview.logs.map((entry) => `<li>${escapeHtml(entry.action)} - admin #${entry.admin_user_id} - target ${entry.target_user_id || 'n/a'}</li>`).join('');
  return `
    <section class="panel">
      <div class="section-head">
        <div>
          <h1>Admin Control</h1>
          <p class="muted">Grant resources, tune monster power, manage run state, unlock modes, and clear active runs.</p>
        </div>
        <div class="stat-grid slim">
          <div class="stat-card"><strong>${formatNumber(overview.users.length)}</strong><span>users listed</span></div>
          <div class="stat-card"><strong>${formatNumber(overview.activeRuns)}</strong><span>active runs</span></div>
          <div class="stat-card"><strong>${formatNumber(overview.totalRuns)}</strong><span>total runs</span></div>
        </div>
      </div>
      <div class="stack">${users}</div>
      <article class="panel nested-panel">
        <h2>Recent admin log</h2>
        <ul class="clean-list compact">${logs || '<li>No admin actions yet.</li>'}</ul>
      </article>
    </section>
  `;
}

function requireAuth(user, response) {
  if (!user) {
    setFlash(response, 'Please sign in first.', 'warning');
    redirect(response, '/login');
    return false;
  }
  return true;
}

function requireAdmin(user, response) {
  if (!requireAuth(user, response)) {
    return false;
  }
  if (user.role !== 'admin') {
    setFlash(response, 'Admin access is required.', 'error');
    redirect(response, '/hub');
    return false;
  }
  return true;
}

function renderPage(response, params) {
  html(response, 200, layout(params));
}

export async function handleRequest(request, response) {
  const url = new URL(request.url, config.appOrigin);
  const pathname = url.pathname;

  if (serveStatic(response, pathname)) {
    return;
  }

  const cookies = parseCookies(request);
  const user = getUserBySessionToken(cookies[config.sessionCookieName]);
  const flash = consumeFlash(request, response);

  try {
    if (request.method === 'POST' && pathname === '/auth/device-restore') {
      const payload = await parseJson(request);
      try {
        const restoredUser = restoreSignedDeviceSave(payload?.backup || payload);
        const token = createSession(restoredUser.id);
        setCookie(response, config.sessionCookieName, token, { maxAge: config.sessionTtlHours * 3600 });
        json(response, 200, { ok: true, redirect: '/hub' });
      } catch (error) {
        json(response, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (request.method === 'GET' && pathname === '/') {
      if (user) {
        redirect(response, '/hub');
        return;
      }
      renderPage(response, { title: 'Home', user, flash, body: renderLanding(), wide: true });
      return;
    }

    if (request.method === 'GET' && pathname === '/register') {
      renderPage(response, {
        title: 'Register',
        user,
        flash,
        body: authCard('Create your account', hasDurableAccountStorage()
          ? 'Create one account, then sign in from phone or PC with the same username or email and password.'
          : 'Create your account here, then keep a transfer code in Settings if you want to move between phone and PC safely.', `
          ${renderViewModePanel('register')}
          <form method="post" action="/register" class="stack-form">
            <label><span>Username</span><input type="text" name="username" required autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" /></label>
            <label><span>Email</span><input type="email" name="email" required autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false" /></label>
            <label><span>Password</span><input type="password" name="password" required autocomplete="new-password" /></label>
            <button class="button primary" type="submit">Register</button>
          </form>
        `, '<p class="muted">The first account created becomes the admin account automatically.</p>'),
      });
      return;
    }

    if (request.method === 'POST' && pathname === '/register') {
      const form = await parseForm(request);
      const usernameError = validateUsername(form.data.username);
      const emailError = validateEmail(form.data.email);
      const passwordError = validatePassword(form.data.password);
      if (usernameError || emailError || passwordError) {
        setFlash(response, usernameError || emailError || passwordError, 'error');
        redirect(response, '/register');
        return;
      }
      try {
        const newUser = createUser(form.data);
        const token = createSession(newUser.id);
        setCookie(response, config.sessionCookieName, token, { maxAge: config.sessionTtlHours * 3600 });
        setFlash(response, 'Account created. Welcome to Moemon Arena.', 'success');
        redirect(response, '/hub');
      } catch (error) {
        setFlash(response, error.message.includes('UNIQUE') ? 'Username or email is already in use.' : error.message, 'error');
        redirect(response, '/register');
      }
      return;
    }

    if (request.method === 'GET' && pathname === '/login') {
      renderPage(response, {
        title: 'Player Login',
        user,
        flash,
        body: authCard('Player Sign In', hasDurableAccountStorage()
          ? 'Use your username or email plus password to continue your player account from any phone or PC. A transfer code is available below as a backup path.'
          : 'Use your username or email plus password to continue your player account. If this deployment forgets the live server copy, paste a transfer code from the device that still has your account.', `
          ${renderViewModePanel('player-login')}
          <form method="post" action="/login" class="stack-form">
            <label><span>Username or email</span><input type="text" name="login" required autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" /></label>
            <label><span>Password</span><input type="password" name="password" required autocomplete="current-password" /></label>
            <input type="hidden" name="deviceBackup" value="" data-device-save-input data-device-save-mode="player" />
            <button class="button primary" type="submit">Player Login</button>
          </form>
        `, `${renderDeviceTransferImportPanel('player')}<p class='muted'><a href='/admin-login'>Admin account?</a> <a href='/forgot-password'>Need a reset link?</a></p>`, 'data-device-restore-mode="player"'),
      });
      return;
    }

    if (request.method === 'GET' && pathname === '/admin-login') {
      renderPage(response, {
        title: 'Admin Login',
        user,
        flash,
        body: authCard('Admin Sign In', hasDurableAccountStorage()
          ? 'Use the admin account email or username here from any phone or PC. Player accounts are blocked from this route.'
          : 'Use the admin account email or username here. If the live server copy is missing, paste a transfer code from the admin device that still has the account.', `
          ${renderViewModePanel('admin-login')}
          <form method="post" action="/admin-login" class="stack-form">
            <label><span>Admin username or email</span><input type="text" name="login" required autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" /></label>
            <label><span>Password</span><input type="password" name="password" required autocomplete="current-password" /></label>
            <input type="hidden" name="deviceBackup" value="" data-device-save-input data-device-save-mode="admin" />
            <button class="button warning" type="submit">Admin Login</button>
          </form>
        `, `${renderDeviceTransferImportPanel('admin')}<p class='muted'><a href='/login'>Player login</a> <a href='/forgot-password'>Need a reset link?</a></p>`, 'data-device-restore-mode="admin"'),
      });
      return;
    }

    if (request.method === 'POST' && pathname === '/login') {
      const form = await parseForm(request);
      const signedIn = await authenticateWithOptionalDeviceRestore(form);
      if (!signedIn) {
        setFlash(response, 'Invalid login credentials.', 'error');
        redirect(response, '/login');
        return;
      }
      if (isAdminAccount(signedIn)) {
        setFlash(response, 'Admin accounts must use the admin login page.', 'warning');
        redirect(response, '/admin-login');
        return;
      }
      const token = createSession(signedIn.id);
      setCookie(response, config.sessionCookieName, token, { maxAge: config.sessionTtlHours * 3600 });
      setFlash(response, 'Signed in successfully.', 'success');
      redirect(response, '/hub');
      return;
    }

    if (request.method === 'POST' && pathname === '/admin-login') {
      const form = await parseForm(request);
      const signedIn = await authenticateWithOptionalDeviceRestore(form);
      if (!signedIn) {
        setFlash(response, 'Invalid admin credentials.', 'error');
        redirect(response, '/admin-login');
        return;
      }
      if (!isAdminAccount(signedIn)) {
        setFlash(response, 'This account is not an admin account.', 'error');
        redirect(response, '/login');
        return;
      }
      const token = createSession(signedIn.id);
      setCookie(response, config.sessionCookieName, token, { maxAge: config.sessionTtlHours * 3600 });
      setFlash(response, 'Admin signed in successfully.', 'success');
      redirect(response, '/admin');
      return;
    }

    if (request.method === 'POST' && pathname === '/logout') {
      if (cookies[config.sessionCookieName]) {
        destroySession(cookies[config.sessionCookieName]);
      }
      clearCookie(response, config.sessionCookieName);
      setFlash(response, 'Signed out.', 'info');
      redirect(response, '/login');
      return;
    }

    if (request.method === 'GET' && pathname === '/forgot-password') {
      renderPage(response, {
        title: 'Forgot Password',
        user,
        flash,
        body: authCard('Password reset', 'If the email exists, a reset link will be sent.', `
          ${renderViewModePanel('forgot-password')}
          <form method="post" action="/forgot-password" class="stack-form">
            <label><span>Email</span><input type="email" name="email" required autocomplete="email" autocapitalize="none" autocorrect="off" spellcheck="false" /></label>
            <button class="button primary" type="submit">Send reset email</button>
          </form>
        `),
      });
      return;
    }

    if (request.method === 'POST' && pathname === '/forgot-password') {
      const form = await parseForm(request);
      const result = await requestPasswordReset(form.data.email);
      if (result.reason === 'not-configured' && result.resetUrl) {
        console.log(`Password reset for ${form.data.email}: ${result.resetUrl}`);
      }
      setFlash(response, result.sent ? 'Reset email sent.' : 'If that account exists, a reset link has been prepared.', 'info');
      redirect(response, '/forgot-password');
      return;
    }

    if (request.method === 'GET' && pathname === '/reset-password') {
      const token = url.searchParams.get('token') || '';
      renderPage(response, {
        title: 'Reset Password',
        user,
        flash,
        body: authCard('Choose a new password', 'Use a strong password with uppercase, lowercase, and numbers.', `
          ${renderViewModePanel('reset-password')}
          <form method="post" action="/reset-password" class="stack-form">
            <input type="hidden" name="token" value="${escapeHtml(token)}" />
            <label><span>New password</span><input type="password" name="password" required autocomplete="new-password" /></label>
            <button class="button primary" type="submit">Reset password</button>
          </form>
        `),
      });
      return;
    }

    if (request.method === 'POST' && pathname === '/reset-password') {
      const form = await parseForm(request);
      const passwordError = validatePassword(form.data.password);
      if (passwordError) {
        setFlash(response, passwordError, 'error');
        redirect(response, `/reset-password?token=${encodeURIComponent(form.data.token || '')}`);
        return;
      }
      try {
        resetPasswordWithToken(form.data.token, form.data.password);
        setFlash(response, 'Password updated. You can sign in now.', 'success');
        redirect(response, '/login');
      } catch (error) {
        setFlash(response, error.message, 'error');
        redirect(response, `/reset-password?token=${encodeURIComponent(form.data.token || '')}`);
      }
      return;
    }

    if (request.method === 'GET' && pathname === '/hub') {
      if (!requireAuth(user, response)) {
        return;
      }
      renderPage(response, { title: 'Hub', user, flash, body: renderHub(getHubState(user.id)), wide: true });
      return;
    }

    if (request.method === 'GET' && pathname === '/trainer-card') {
      if (!requireAuth(user, response)) {
        return;
      }
      renderPage(response, { title: 'Trainer Card', user, flash, body: renderTrainerCardPage(getTrainerCardState(user.id)), wide: true });
      return;
    }

    if (request.method === 'POST' && pathname === '/trainer-card') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        if (form.data.action === 'set-class') {
          setTrainerClass(user.id, form.data.classSlug || '');
          setFlash(response, 'Trainer class updated.', 'success');
        } else if (form.data.action === 'set-title') {
          setTrainerTitle(user.id, form.data.titleSlug || '');
          setFlash(response, 'Trainer title updated.', 'success');
        } else if (form.data.action === 'upgrade-skill') {
          upgradeTrainerSkill(user.id, form.data.skillSlug || '');
          setFlash(response, 'Skill point spent.', 'success');
        } else if (form.data.action === 'reset-skills') {
          resetTrainerSkills(user.id);
          setFlash(response, 'Trainer skill tree reset.', 'success');
        } else if (form.data.action === 'claim-mission') {
          claimMissionReward(user.id, form.data.scope || '', form.data.missionSlug || '');
          setFlash(response, 'Mission reward claimed.', 'success');
        }
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/trainer-card');
      return;
    }
    if (request.method === 'POST' && pathname === '/hub/identity') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        if (form.data.action === 'avatar') {
          setPlayerAvatar(user.id, form.data.avatarSlug);
          setFlash(response, 'Avatar sprite updated.', 'success');
        } else if (form.data.action === 'partner') {
          setPartnerMonster(user.id, Number(form.data.collectionId));
          setFlash(response, 'Partner monster updated.', 'success');
        } else if (form.data.action === 'equip-aura') {
          setTrainerGearEquip(user.id, 'aura', form.data.auraSlug || '');
          setFlash(response, 'Trainer aura equipped.', 'success');
        } else if (form.data.action === 'unequip-aura') {
          setTrainerGearEquip(user.id, 'aura', '');
          setFlash(response, 'Trainer aura removed.', 'success');
        } else if (form.data.action === 'equip-hat') {
          setTrainerGearEquip(user.id, 'hat', form.data.hatSlug || '');
          setFlash(response, 'Trainer hat equipped.', 'success');
        } else if (form.data.action === 'unequip-hat') {
          setTrainerGearEquip(user.id, 'hat', '');
          setFlash(response, 'Trainer hat removed.', 'success');
        }
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, form.data.collectionId ? `/collection/summary?id=${encodeURIComponent(form.data.collectionId)}` : '/hub');
      return;
    }

    if (request.method === 'POST' && pathname === '/hub/incubator') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        if (form.data.action === 'start') {
          startIncubatorEgg(user.id);
          setFlash(response, 'A new egg entered the incubator.', 'success');
        } else if (form.data.action === 'claim') {
          const hatched = claimIncubatorEgg(user.id, form.data.eggId);
          setFlash(response, `${hatched.name} hatched from the incubator.`, 'success');
        } else if (form.data.action === 'discard') {
          const removed = removeIncubatorEgg(user.id, form.data.eggId);
          setFlash(response, `${removed.species?.name || 'Egg'} removed from the incubator.`, 'warning');
        }
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/hub');
      return;
    }

    if (request.method === 'POST' && pathname === '/hub/activity') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        const result = performHubActivity(user.id, form.data.action);
        setFlash(response, `Activity reward: ${result.rewardLabel}.`, 'success');
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/hub');
      return;
    }

    if (request.method === 'GET' && pathname === '/maps') {
      if (!requireAuth(user, response)) {
        return;
      }
      renderPage(response, { title: 'Maps', user, flash, body: renderMaps(getMapState(user.id)), wide: true });
      return;
    }

    if (request.method === 'POST' && pathname === '/maps/select') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        updatePlayerSettings(user.id, { preferredRegionSlug: form.data.regionSlug || '' });
        setFlash(response, 'Preferred adventure region updated.', 'success');
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/maps');
      return;
    }

    if (request.method === 'POST' && pathname === '/maps/adventure') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        startMapAdventure(user.id, form.data.regionSlug || '', form.data.adventureMode || 'wild');
        setFlash(response, 'Adventure route launched.', 'success');
        redirect(response, '/play');
      } catch (error) {
        setFlash(response, error.message, 'error');
        redirect(response, '/maps');
      }
      return;
    }
    if (request.method === 'POST' && pathname === '/maps/search') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        if (form.data.action === 'search') {
          const result = searchMapRoute(user.id, form.data.regionSlug || '');
          const flashLevel = result.lastResultTone === 'warning' ? 'warning' : result.lastResultTone === 'success' ? 'success' : 'info';
          setFlash(response, result.lastResult || 'Route search completed.', flashLevel);
          redirect(response, '/maps');
          return;
        }
        if (form.data.action === 'battle') {
          startMapSearchEncounter(user.id, form.data.regionSlug || '');
          setFlash(response, 'Search encounter launched.', 'success');
          redirect(response, '/play');
          return;
        }
        if (form.data.action === 'flee') {
          fleeMapSearchEncounter(user.id, form.data.regionSlug || '');
          setFlash(response, 'You fled from the route sighting.', 'info');
          redirect(response, '/maps');
          return;
        }
        throw new Error('Unknown map search action.');
      } catch (error) {
        setFlash(response, error.message, 'error');
        redirect(response, '/maps');
      }
      return;
    }

    if (request.method === 'GET' && pathname === '/settings') {
      if (!requireAuth(user, response)) {
        return;
      }
      renderPage(response, { title: 'Settings', user, flash, body: renderSettings(getSettingsState(user.id)), wide: true });
      return;
    }

    if (request.method === 'POST' && pathname === '/settings') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        updatePlayerSettings(user.id, {
          preferredRegionSlug: form.data.preferredRegionSlug || '',
          favoriteLeagueSlug: form.data.favoriteLeagueSlug || '',
          chatEmojiSet: form.data.chatEmojiSet || '',
          hudMode: form.data.hudMode || '',
          motionMode: form.data.motionMode || '',
          displayTheme: form.data.displayTheme || '',
          colorMode: form.data.colorMode || '',
          fontMode: form.data.fontMode || '',
          soundEnabled: form.data.soundEnabled || 'false',
        });
        setFlash(response, 'Player settings saved.', 'success');
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/settings');
      return;
    }

    if (request.method === 'GET' && pathname === '/play/new') {
      if (!requireAuth(user, response)) {
        return;
      }
      renderPage(response, {
        title: 'New Run',
        user,
        flash,
        body: renderRunSetup(getHubState(user.id), url.searchParams.get('draft') || ''),
        wide: true,
      });
      return;
    }

    if (request.method === 'POST' && pathname === '/play/new') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        createRunForUser(user.id, {
          mode: form.data.mode,
          challengeSlug: form.data.challengeSlug || '',
          draftSlug: form.data.draftSlug || '',
          starterIds: form.getAll('starter'),
        });
        setFlash(response, 'Run started.', 'success');
        redirect(response, '/play');
      } catch (error) {
        setFlash(response, error.message, 'error');
        redirect(response, '/play/new');
      }
      return;
    }

    if (request.method === 'GET' && pathname === '/play') {
      if (!requireAuth(user, response)) {
        return;
      }
      const run = getRunSnapshot(user.id);
      if (!run) {
        if (user.meta.lastRunSummary) {
          renderPage(response, {
            title: 'Run Summary',
            user,
            flash,
            body: renderRunSummaryScreen(user.meta.lastRunSummary, user),
            wide: true,
          });
          return;
        }
        setFlash(response, 'No active run. Start a new one.', 'warning');
        redirect(response, '/play/new');
        return;
      }
      renderPage(response, {
        title: 'Play',
        user,
        flash,
        body: run.pendingReward ? renderRewardView(run) : renderBattleView(run),
        wide: true,
      });
      return;
    }

    if (request.method === 'GET' && pathname === '/play/summary') {
      if (!requireAuth(user, response)) {
        return;
      }
      const run = getRunSnapshot(user.id);
      if (run) {
        redirect(response, '/play');
        return;
      }
      renderPage(response, {
        title: 'Run Summary',
        user,
        flash,
        body: renderRunSummaryScreen(user.meta.lastRunSummary, user),
        wide: true,
      });
      return;
    }

    if (request.method === 'POST' && pathname === '/play/action') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        performRunAction(user.id, {
          type: form.data.action,
          moveIndex: form.data.moveIndex,
          targetIndex: form.data.targetIndex,
          itemSlug: form.data.itemSlug,
          battleMode: form.data.battleMode,
          transformMode: form.data.transformMode,
        });
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/play');
      return;
    }

    if (request.method === 'POST' && pathname === '/play/reward') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        handleRewardAction(user.id, {
          type: form.data.action,
          rewardIndex: form.data.rewardIndex,
          itemSlug: form.data.itemSlug,
          quantity: form.data.quantity,
        });
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/play');
      return;
    }

    if (request.method === 'POST' && pathname === '/play/abandon') {
      if (!requireAuth(user, response)) {
        return;
      }
      abandonRun(user.id);
      setFlash(response, 'Run abandoned.', 'warning');
      redirect(response, '/play/summary');
      return;
    }

    if (request.method === 'GET' && pathname === '/collection') {
      if (!requireAuth(user, response)) {
        return;
      }
      renderPage(response, { title: 'Collection', user, flash, body: renderCollection(getHubState(user.id)), wide: true });
      return;
    }

    if (request.method === 'POST' && pathname === '/collection/party') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        if (form.data.action === 'set') {
          setPersistentPartySlot(user.id, Number(form.data.slotIndex), Number(form.data.collectionId));
          setFlash(response, 'Party slot updated.', 'success');
        } else if (form.data.action === 'clear') {
          clearPersistentPartySlot(user.id, Number(form.data.slotIndex));
          setFlash(response, 'Monster stored back in the PC.', 'success');
        } else if (form.data.action === 'save-order' || form.data.action === 'reorder') {
          setPersistentPartyOrder(user.id, form.getAll('partyId').length ? form.getAll('partyId') : form.getAll('collectionId'));
          setFlash(response, 'Team builder party order saved.', 'success');
        }
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/collection');
      return;
    }

    if (request.method === 'POST' && pathname === '/collection/action') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        if (form.data.action === 'rename') {
          renameCollectionMonster(user.id, Number(form.data.collectionId), form.data.nickname || '');
          setFlash(response, 'Monster renamed.', 'success');
        } else if (form.data.action === 'toggle-starter') {
          toggleStarterFlag(user.id, Number(form.data.collectionId));
          setFlash(response, 'Starter flag updated.', 'success');
        } else if (form.data.action === 'toggle-favorite') {
          toggleCollectionFavorite(user.id, Number(form.data.collectionId));
          setFlash(response, 'Favorite list updated.', 'success');
        }
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/collection');
      return;
    }
    if (request.method === 'GET' && pathname === '/collection/summary') {
      if (!requireAuth(user, response)) {
        return;
      }
      const collectionId = Number(url.searchParams.get('id'));
      const entry = getCollectionEntry(user.id, collectionId);
      if (!entry) {
        setFlash(response, 'That monster could not be found.', 'error');
        redirect(response, '/collection');
        return;
      }
      renderPage(response, {
        title: 'Summary Screen',
        user,
        flash,
        body: renderCollectionSummary(entry, getPersistentInventory(user.id), user),
        wide: true,
      });
      return;
    }

    if (request.method === 'POST' && pathname === '/collection/summary') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      const collectionId = Number(form.data.collectionId);
      try {
        if (form.data.action === 'rename') {
          renameCollectionMonster(user.id, collectionId, form.data.nickname || '');
          setFlash(response, 'Monster renamed.', 'success');
        } else if (form.data.action === 'toggle-starter') {
          toggleStarterFlag(user.id, collectionId);
          setFlash(response, 'Starter flag updated.', 'success');
        } else if (form.data.action === 'toggle-favorite') {
          toggleCollectionFavorite(user.id, collectionId);
          setFlash(response, 'Favorite list updated.', 'success');
        } else if (form.data.action === 'evolve-level') {
          evolveCollectionMonster(user.id, collectionId, '');
          setFlash(response, 'Level milestone reached. The monster evolved.', 'success');
        } else if (form.data.action === 'equip-item') {
          setCollectionHeldItem(user.id, collectionId, form.data.itemSlug || '');
          setFlash(response, 'Held item updated.', 'success');
        } else if (form.data.action === 'teach-move') {
          teachCollectionMove(user.id, collectionId, Number(form.data.moveId), Number(form.data.slotIndex));
          setFlash(response, 'Move set updated.', 'success');
        } else if (form.data.action === 'ability-change') {
          setCollectionAbility(user.id, collectionId, form.data.abilityMode || '');
          setFlash(response, 'Ability updated.', 'success');
        } else if (form.data.action === 'use-stone') {
          evolveCollectionMonster(user.id, collectionId, form.data.itemSlug || '');
          setFlash(response, 'Evolution stone resonated and the monster evolved.', 'success');
        } else if (form.data.action === 'use-progression-item') {
          const progressionItem = CONTENT.itemMap.get(form.data.itemSlug || '');
          useCollectionProgressionItem(user.id, collectionId, form.data.itemSlug || '');
          setFlash(response, progressionItem ? `${progressionItem.name} applied to the stored monster.` : 'Stored monster progression updated.', 'success');
        } else if (form.data.action === 'use-stash-item') {
          const stashItem = useCollectionStashItem(user.id, collectionId, form.data.itemSlug || '');
          setFlash(response, stashItem ? `${stashItem.name} applied to the stored monster.` : 'Stored monster stash item used.', 'success');
        } else if (form.data.action === 'move-box') {
          setCollectionBox(user.id, collectionId, form.data.boxTag || '');
          setFlash(response, 'Monster moved to a different PC box.', 'success');
        }
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, `/collection/summary?id=${encodeURIComponent(collectionId)}`);
      return;
    }

    if (request.method === 'GET' && (pathname === '/builds' || pathname.startsWith('/builds/'))) {
      if (!requireAuth(user, response)) {
        return;
      }
      const routeReference = pathname.startsWith('/builds/') ? decodeURIComponent(pathname.slice('/builds/'.length)) : '';
      const selectedReference = routeReference || url.searchParams.get('slug') || url.searchParams.get('species') || url.searchParams.get('id') || '';
      renderPage(response, { title: 'Build Dex', user, flash, body: renderBuildDexPage(getBuildDexState(selectedReference)), wide: true });
      return;
    }
    if (request.method === 'GET' && pathname === '/market') {
      if (!requireAuth(user, response)) {
        return;
      }
      renderPage(response, { title: 'Market', user, flash, body: renderMarket(getHubState(user.id)), wide: true });
      return;
    }

    if (request.method === 'POST' && pathname === '/market/buy') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      const returnHash = /^market-item-[a-z0-9-]+$/i.test(form.data.returnTo || '') ? `#${form.data.returnTo}` : '';
      try {
        purchasePersistentItem(user.id, form.data.itemSlug, form.data.quantity);
        setFlash(response, 'Item added to your permanent stash.', 'success');
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, `/market${returnHash}`);
      return;
    }

    if (request.method === 'GET' && pathname === '/gyms') {
      if (!requireAuth(user, response)) {
        return;
      }
      renderPage(response, { title: 'Gyms', user, flash, body: renderGyms(getGymState(user.id)), wide: true });
      return;
    }

    if (request.method === 'POST' && pathname === '/gyms/start') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        startGymChallenge(user.id, form.data.battleSlug || '');
        setFlash(response, 'Gym battle launched.', 'success');
        redirect(response, '/play');
      } catch (error) {
        setFlash(response, error.message, 'error');
        redirect(response, '/gyms');
      }
      return;
    }

    if (request.method === 'GET' && pathname === '/social') {
      if (!requireAuth(user, response)) {
        return;
      }
      renderPage(response, { title: 'Social', user, flash, body: renderSocial(getSocialState(user.id)), wide: true });
      return;
    }

    if (request.method === 'POST' && pathname === '/social/chat') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        postChatMessage(user.id, form.data.roomType, form.data.body, Number(form.data.targetUserId || 0), { imageUrl: form.data.imageUrl || '', linkUrl: form.data.linkUrl || '', linkLabel: form.data.linkLabel || '' });
        setFlash(response, form.data.roomType === 'direct' ? 'Whisper sent.' : 'Global message sent.', 'success');
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/social');
      return;
    }

    if (request.method === 'POST' && pathname === '/social/challenge') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        startArenaChallenge(user.id, form.data.source || '', form.data.value || '');
        setFlash(response, 'Arena challenge launched.', 'success');
        redirect(response, '/play');
      } catch (error) {
        setFlash(response, error.message, 'error');
        redirect(response, '/social');
      }
      return;
    }

    if (request.method === 'GET' && pathname === '/minigames') {
      if (!requireAuth(user, response)) {
        return;
      }
      renderPage(response, { title: 'Mini Games', user, flash, body: renderMiniGames(getMiniGamesState(user.id)), wide: true });
      return;
    }

    if (request.method === 'POST' && pathname === '/minigames/play') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        const result = playMiniGame(user.id, form.data.gameSlug || '', { answer: form.data.answer || '' });
        setFlash(response, result.summary, result.win ? 'success' : 'info');
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/minigames');
      return;
    }
    if (request.method === 'POST' && pathname === '/minigames/redeem') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        const result = redeemMiniGameReward(user.id, form.data.rewardSlug || '');
        setFlash(response, `${result.rewardName} redeemed from the mini-game shop.`, 'success');
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/minigames');
      return;
    }
    if (request.method === 'POST' && pathname === '/minigames/exchange') {
      if (!requireAuth(user, response)) {
        return;
      }
      const form = await parseForm(request);
      try {
        if (form.data.action === 'item') {
          const [itemSlug, quantityRaw] = String(form.data.bundle || '').split(':');
          const result = exchangeMiniGameInventoryItem(user.id, itemSlug || '', Number(quantityRaw || 0));
          setFlash(response, `${result.itemName} x${formatNumber(result.quantity)} converted into ${formatNumber(result.tokensGained)} arcade tokens.`, 'success');
        } else if (form.data.action === 'monster') {
          const result = exchangeMiniGameMonster(user.id, Number(form.data.collectionId || 0));
          setFlash(response, `${result.speciesName} exchanged for ${formatNumber(result.tokensGained)} arcade tokens.`, 'success');
        } else {
          throw new Error('Unknown mini-game exchange action.');
        }
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/minigames');
      return;
    }

    if (request.method === 'GET' && pathname === '/news') {
      if (!requireAuth(user, response)) {
        return;
      }
      renderPage(response, { title: 'News', user, flash, body: renderNews(getNewsState(user.id)), wide: true });
      return;
    }

    if (request.method === 'GET' && pathname === '/events') {
      if (!requireAuth(user, response)) {
        return;
      }
      renderPage(response, { title: 'Events', user, flash, body: renderEventsPage(getEventsState(user.id)), wide: true });
      return;
    }

    if (request.method === 'GET' && pathname === '/admin') {
      if (!requireAdmin(user, response)) {
        return;
      }
      renderPage(response, { title: 'Admin', user, flash, body: renderAdmin(getAdminOverview()), wide: true });
      return;
    }

    if (request.method === 'POST' && pathname === '/admin') {
      if (!requireAdmin(user, response)) {
        return;
      }
      const form = await parseForm(request);
      const targetUserId = Number(form.data.targetUserId);
      try {
        if (form.data.action === 'grant-cash') {
          adminGrantCash(user.id, targetUserId, Number(form.data.amount || 0));
        } else if (form.data.action === 'grant-item') {
          adminGrantItem(user.id, targetUserId, form.data.itemSlug, Number(form.data.quantity || 1));
        } else if (form.data.action === 'grant-monster') {
          adminGrantMonster(user.id, targetUserId, form.data.speciesSlug, Number(form.data.level || 8));
        } else if (form.data.action === 'set-monster-level') {
          adminSetMonsterLevel(user.id, targetUserId, Number(form.data.collectionId || 0), Number(form.data.level || 1));
        } else if (form.data.action === 'adjust-monster-stat') {
          adminAdjustMonsterBonusStat(user.id, targetUserId, Number(form.data.collectionId || 0), form.data.statKey || '', Number(form.data.amount || 0));
        } else if (form.data.action === 'set-run-wave') {
          adminSetRunWave(user.id, targetUserId, Number(form.data.wave || 1));
        } else if (form.data.action === 'set-role') {
          adminSetRole(user.id, targetUserId, form.data.role);
        } else if (form.data.action === 'unlock-mode') {
          adminUnlockMode(user.id, targetUserId, form.data.mode);
        } else if (form.data.action === 'clear-run') {
          adminClearRun(user.id, targetUserId);
        } else if (form.data.action === 'create-admin') {
          createAdmin(form.data.email, form.data.password, form.data.username || 'Administrator');
        }
        setFlash(response, 'Admin action completed.', 'success');
      } catch (error) {
        setFlash(response, error.message, 'error');
      }
      redirect(response, '/admin');
      return;
    }

    html(response, 404, layout({ title: 'Not Found', user, flash, body: '<section class="panel"><h1>404</h1><p class="muted">The page you requested was not found.</p></section>' }));
  } catch (error) {
    console.error(error);
    html(response, 500, layout({ title: 'Server Error', user, flash, body: `<section class="panel"><h1>Server error</h1><p class="muted">${escapeHtml(error.message)}</p></section>` }));
  } finally {
    try {
      await flushPendingWorldBackup();
    } catch (error) {
      console.error('[moemon] Failed to flush pending world backup snapshot:', error);
    }
  }
}

export const server = http.createServer(handleRequest);

const isDirectRun = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

function localOriginForPort(port) {
  if (process.env.APP_ORIGIN) {
    return config.appOrigin;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return `http://localhost:${port}`;
}

function listenWithPortFallback(targetServer, preferredPort, maxAttempts = 10) {
  return new Promise((resolve, reject) => {
    const tryListen = (port, attemptsRemaining) => {
      const onError = (error) => {
        targetServer.removeListener('listening', onListening);
        if (error?.code === 'EADDRINUSE' && attemptsRemaining > 0) {
          tryListen(port + 1, attemptsRemaining - 1);
          return;
        }
        reject(error);
      };

      const onListening = () => {
        targetServer.removeListener('error', onError);
        const address = targetServer.address();
        const actualPort = typeof address === 'object' && address ? address.port : port;
        resolve(actualPort);
      };

      targetServer.once('error', onError);
      targetServer.once('listening', onListening);
      targetServer.listen(port);
    };

    tryListen(preferredPort, maxAttempts);
  });
}

async function startDirectServer() {
  try {
    const requestedPort = Number(process.env.PORT || config.port || 3000);
    const actualPort = await listenWithPortFallback(server, requestedPort);
    config.port = actualPort;
    config.appOrigin = localOriginForPort(actualPort);
    if (actualPort !== requestedPort) {
      console.warn(`[moemon] Port ${requestedPort} is already in use. Switched to ${actualPort} instead.`);
    }
    console.log(`Moemon Arena listening on ${config.appOrigin}`);
  } catch (error) {
    console.error(`[moemon] Failed to start server: ${error.message}`);
    process.exitCode = 1;
  }
}

if (isDirectRun) {
  startDirectServer();
}
