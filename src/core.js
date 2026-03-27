import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import tls from 'node:tls';
import { DatabaseSync } from 'node:sqlite';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnv();

const inferredAppOrigin = process.env.APP_ORIGIN
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${process.env.PORT || 3000}`);

export const config = {
  port: Number(process.env.PORT || 3000),
  appOrigin: inferredAppOrigin,
  sessionCookieName: process.env.SESSION_COOKIE_NAME || 'moemon_session',
  sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 168),
  smtpHost: process.env.SMTP_HOST || '',
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASS || '',
  smtpFrom: process.env.SMTP_FROM || process.env.SMTP_USER || '',
};

export const TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

const TYPE_WORDS = {
  normal: 'Wild',
  fire: 'Ember',
  water: 'Tide',
  electric: 'Volt',
  grass: 'Bloom',
  ice: 'Frost',
  fighting: 'Valor',
  poison: 'Venom',
  ground: 'Dune',
  flying: 'Sky',
  psychic: 'Mind',
  bug: 'Hive',
  rock: 'Stone',
  ghost: 'Wisp',
  dragon: 'Drake',
  dark: 'Night',
  steel: 'Iron',
  fairy: 'Glim',
};

const BIOMES = [
  'Sunscar Plains', 'Ashen Crater', 'Moonlit Fen', 'Azure Shoals', 'Glass Canopy',
  'Howling Mesa', 'Static Vault', 'Whisper Ruins', 'Crystal Caves', 'Starroot Vale',
  'Obsidian Ridge', 'Storm Garden', 'Coral Labyrinth', 'Silver Tundra', 'Dream Orchard',
  'Brass Bastion', 'Phantom Moor', 'Aurora Reef',
];

const TYPE_CHART = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { steel: 0.5, dragon: 2, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

const MOVE_ACTIONS = ['Burst', 'Lash', 'Pulse', 'Rush', 'Spike', 'Wave', 'Crash', 'Veil', 'Storm', 'Edge', 'Nova', 'Drive', 'Bloom', 'Strike', 'Torrent', 'Shroud', 'Gale', 'Volt', 'Fang', 'Prism', 'Rift', 'Claw', 'Roar', 'Bloom'];
const MOVE_SUFFIXES = ['Arc', 'Howl', 'Flare', 'Dance', 'Cage', 'Surge', 'Drift', 'Drum', 'Chime', 'Bloom', 'Break', 'Ray', 'Lock', 'Roar', 'Step', 'Torrent', 'Burst', 'Rift', 'Halo', 'Drive', 'Spiral', 'Edge', 'Torrent', 'Signal'];
const MOVE_EPITHETS = ['Prime', 'Alpha', 'Delta', 'Eclipse', 'Zero', 'Omega', 'Astral', 'Mythic', 'Solar', 'Lunar', 'Tempest', 'Oracle', 'Titan', 'Phantom', 'Crown', 'Zenith'];
const TYPE_WORD_VARIANTS = {
  normal: ['Wild', 'Rally', 'Feral', 'Prime', 'Frontier', 'Crest'],
  fire: ['Ember', 'Blaze', 'Cinder', 'Pyre', 'Inferno', 'Kindle'],
  water: ['Tide', 'Aqua', 'Current', 'Surge', 'Cascade', 'Riptide'],
  electric: ['Volt', 'Spark', 'Static', 'Amp', 'Circuit', 'Joule'],
  grass: ['Bloom', 'Verdant', 'Vine', 'Root', 'Thorn', 'Canopy'],
  ice: ['Frost', 'Glacier', 'Hail', 'Crystal', 'Permafrost', 'Aurora'],
  fighting: ['Valor', 'Champion', 'Brawler', 'Rush', 'Gauntlet', 'Combat'],
  poison: ['Venom', 'Toxin', 'Mire', 'Blight', 'Acid', 'Spore'],
  ground: ['Dune', 'Terra', 'Quake', 'Dust', 'Fault', 'Mesa'],
  flying: ['Sky', 'Gale', 'Aero', 'Wing', 'Jet', 'Tempest'],
  psychic: ['Mind', 'Oracle', 'Psi', 'Dream', 'Astral', 'Rune'],
  bug: ['Hive', 'Swarm', 'Sting', 'Carapace', 'Silk', 'Scarab'],
  rock: ['Stone', 'Granite', 'Boulder', 'Crag', 'Monolith', 'Slate'],
  ghost: ['Wisp', 'Phantom', 'Hex', 'Shade', 'Specter', 'Mourning'],
  dragon: ['Drake', 'Wyvern', 'Scale', 'Rex', 'Elder', 'Imperial'],
  dark: ['Night', 'Umbral', 'Shadow', 'Dread', 'Void', 'Abyss'],
  steel: ['Iron', 'Chrome', 'Alloy', 'Gear', 'Titan', 'Forge'],
  fairy: ['Glim', 'Fable', 'Luster', 'Halo', 'Charm', 'Starlight'],
};
const MOVE_ACTION_BY_EFFECT = {
  damage: ['Burst', 'Slash', 'Crash', 'Drive', 'Strike', 'Arc', 'Breaker', 'Rush'],
  special: ['Pulse', 'Ray', 'Nova', 'Torrent', 'Signal', 'Surge', 'Prism', 'Bloom'],
  drain: ['Drain', 'Leech', 'Siphon', 'Harvest', 'Sip', 'Bloom', 'Root', 'Latch'],
  burn: ['Flare', 'Scorch', 'Pyre', 'Cinder', 'Blaze', 'Kindle', 'Torch', 'Inferno'],
  poison: ['Toxin', 'Venom', 'Barb', 'Mire', 'Fang', 'Corrode', 'Spite', 'Needle'],
  paralyze: ['Shock', 'Jolt', 'Static', 'Volt', 'Zap', 'Snare', 'Surge', 'Lock'],
  recoil: ['Crash', 'Break', 'Burst', 'Ram', 'Overdrive', 'Smash', 'Dive', 'Rocket'],
  cleanse: ['Purify', 'Mend', 'Grace', 'Renew', 'Remedy', 'Cleanse', 'Pulse', 'Wish'],
  'debuff-atk': ['Sap', 'Glare', 'Snarl', 'Hex', 'Frost', 'Fear', 'Dampen', 'Crash'],
  'debuff-def': ['Crack', 'Rend', 'Shatter', 'Melt', 'Pierce', 'Spite', 'Break', 'Fray'],
  'buff-spd': ['Ward', 'Bless', 'Shell', 'Halo', 'Sanctum', 'Aegis', 'Guard', 'Calm'],
  heal: ['Mend', 'Wish', 'Rest', 'Bloom', 'Renew', 'Grace', 'Remedy', 'Pulse'],
  'buff-atk': ['Rally', 'Claw', 'Drive', 'Roar', 'Drum', 'Howl', 'March', 'Edge'],
  'buff-def': ['Guard', 'Plate', 'Wall', 'Bulwark', 'Shell', 'Fort', 'Bastion', 'Brace'],
  focus: ['Focus', 'Charge', 'Align', 'Trace', 'Zen', 'Prime', 'Surge', 'Flow'],
  'buff-spa': ['Mind', 'Rune', 'Pulse', 'Chant', 'Nova', 'Echo', 'Beam', 'Gleam'],
  'buff-spe': ['Dash', 'Rush', 'Step', 'Drift', 'Feint', 'Boost', 'Flash', 'Zip'],
  'weather-sun': ['Sun', 'Dawn', 'Solar', 'Daybreak', 'Radiant', 'Halo', 'Heat', 'Flare'],
  'weather-rain': ['Rain', 'Mist', 'Storm', 'Drizzle', 'Current', 'Monsoon', 'Tide', 'Cascade'],
};
const MOVE_SUFFIX_BY_EFFECT = {
  damage: ['Arc', 'Break', 'Strike', 'Crash', 'Claw', 'Drive', 'Impact', 'Roar'],
  special: ['Ray', 'Wave', 'Nova', 'Gleam', 'Surge', 'Torrent', 'Bloom', 'Signal'],
  drain: ['Sip', 'Kiss', 'Bloom', 'Latch', 'Swell', 'Harvest', 'Drain', 'Root'],
  burn: ['Flare', 'Brand', 'Blaze', 'Heat', 'Pyre', 'Torch', 'Ash', 'Crest'],
  poison: ['Barb', 'Spite', 'Needle', 'Mire', 'Bite', 'Venin', 'Spore', 'Bloom'],
  paralyze: ['Lock', 'Snap', 'Surge', 'Grid', 'Pulse', 'Wire', 'Flash', 'Field'],
  recoil: ['Crash', 'Burst', 'Drop', 'Break', 'Dive', 'Rend', 'Drive', 'Ram'],
  cleanse: ['Song', 'Wish', 'Prayer', 'Bloom', 'Echo', 'Light', 'Grace', 'Spring'],
  'debuff-atk': ['Gloom', 'Snare', 'Grip', 'Spite', 'Fog', 'Hex', 'Clamp', 'Drop'],
  'debuff-def': ['Crack', 'Fray', 'Break', 'Rift', 'Rend', 'Pierce', 'Shear', 'Split'],
  'buff-spd': ['Ward', 'Ring', 'Halo', 'Dome', 'Guard', 'Shell', 'Aura', 'Charm'],
  heal: ['Song', 'Wish', 'Prayer', 'Bloom', 'Echo', 'Light', 'Grace', 'Spring'],
  'buff-atk': ['Roar', 'Beat', 'March', 'Drive', 'Howl', 'Fang', 'Rhythm', 'Arc'],
  'buff-def': ['Wall', 'Shell', 'Plate', 'Ward', 'Shield', 'Bastion', 'Dome', 'Ring'],
  focus: ['Mode', 'Flow', 'Stance', 'Trace', 'Circuit', 'Pulse', 'Zen', 'Aura'],
  'buff-spa': ['Chime', 'Rune', 'Ray', 'Prism', 'Spiral', 'Echo', 'Bloom', 'Focus'],
  'buff-spe': ['Step', 'Burst', 'Drift', 'Flash', 'Rush', 'Dash', 'Trail', 'Lift'],
  'weather-sun': ['Light', 'Halo', 'Radiance', 'Day', 'Shine', 'Sun', 'Heat', 'Dawn'],
  'weather-rain': ['Rain', 'Mist', 'Tide', 'Cloud', 'Storm', 'Monsoon', 'Drop', 'Current'],
};
const MOVE_ROLE_LABELS = {
  damage: 'High damage',
  special: 'Special attack',
  drain: 'Sustain',
  burn: 'Burn pressure',
  poison: 'Poison pressure',
  paralyze: 'Speed control',
  recoil: 'Risk damage',
  cleanse: 'Cleanse support',
  'debuff-atk': 'Attack break',
  'debuff-def': 'Armor break',
  'buff-spd': 'Special wall',
  heal: 'Recovery',
  'buff-atk': 'Attack boost',
  'buff-def': 'Defense boost',
  focus: 'Setup sweep',
  'buff-spa': 'Special boost',
  'buff-spe': 'Speed boost',
  'weather-sun': 'Weather support',
  'weather-rain': 'Weather support',
};
const MONSTER_ROOT_A = ['Aero', 'Amber', 'Arca', 'Bram', 'Cinder', 'Coral', 'Cryo', 'Dawn', 'Dusk', 'Echo', 'Ember', 'Ferro', 'Flora', 'Flux', 'Gale', 'Glim', 'Gloom', 'Halo', 'Hex', 'Ion', 'Jade', 'Jolt', 'Kelp', 'Lunar', 'Mire', 'Nimbus', 'Nova', 'Obsid', 'Petra', 'Pyro', 'Quartz', 'Rune', 'Solar', 'Talon', 'Umber', 'Vale', 'Vapor', 'Verd', 'Volt', 'Whisper', 'Zephyr', 'Astra', 'Blitz', 'Crown', 'Delta', 'Elder', 'Fable', 'Grim', 'Harbor', 'Ivory', 'Juniper', 'Kindle', 'Lotus', 'Marrow', 'Nectar', 'Oracle', 'Prism', 'Quill', 'Razor', 'Sable', 'Tempest', 'Umbral', 'Verdant', 'Willow', 'Xylo', 'Yonder', 'Zen'];
const MONSTER_ROOT_B = ['let', 'ling', 'bud', 'cub', 'mite', 'kin', 'pup', 'it', 'seed', 'drift', 'crest', 'flare', 'fang', 'thorn', 'wing', 'spark', 'glow', 'moth', 'fin', 'horn', 'shade', 'quill', 'spine', 'veil', 'root', 'tail', 'mane', 'scale', 'whorl', 'claw'];
const STAGE_TWO_SUFFIXES = ['crest', 'flare', 'fang', 'thorn', 'wing', 'spark', 'guard', 'shade', 'quill', 'bloom', 'brake', 'veil', 'rider', 'stride', 'coil'];
const STAGE_THREE_SUFFIXES = ['drake', 'prime', 'titan', 'wyrm', 'seraph', 'raja', 'rex', 'behem', 'sovereign', 'monarch'];
const STAGE_FOUR_SUFFIXES = ['omega', 'ascendant', 'eternal', 'paragon', 'zenith', 'overlord', 'imperion', 'apex'];
const BRANCH_STAGE_TWO_SUFFIXES = ['morph', 'veil', 'spark', 'flare', 'bloom', 'shade', 'crest', 'pulse'];
const BRANCH_STAGE_THREE_SUFFIXES = ['delta', 'nova', 'umbra', 'aegis', 'torrent', 'gale', 'spire', 'oracle'];
const BRANCH_STAGE_FOUR_SUFFIXES = ['hyperion', 'eidolon', 'evercrest', 'omnis', 'grandis', 'starveil', 'megatide', 'doomwing'];
const SPECIAL_AURAS = [
  {
    slug: 'normal',
    name: 'Normal',
    tone: 'default',
    description: 'The baseline chroma. No extra aura mutations apply.',
    palettes: ['Field', 'Plain', 'Classic', 'Common'],
  },
  {
    slug: 'metallic',
    name: 'Metallic',
    tone: 'metallic',
    description: 'Shrugs off status ailments unless challenged by Shadow energy.',
    palettes: ['Mercury', 'Chrome', 'Titanium', 'Platinum'],
  },
  {
    slug: 'ghostly',
    name: 'Ghostly',
    tone: 'ghostly',
    description: 'Damaging hits can randomly make the foe flinch unless Shadow is involved.',
    palettes: ['Moonveil', 'Spectral', 'Afterglow', 'Mournmist'],
  },
  {
    slug: 'shadow',
    name: 'Shadow',
    tone: 'shadow-aura',
    description: 'Ignores Metallic and Ghostly protections and cannot be flinched by them.',
    palettes: ['Void', 'Eclipse', 'Nightcore', 'Umbra'],
  },
  {
    slug: 'dark-aura',
    name: 'Dark',
    tone: 'dark-aura',
    description: 'Damaging attacks hit 25% harder.',
    palettes: ['Raven', 'Obsidian', 'Midnight', 'Onyx'],
  },
  {
    slug: 'shiny',
    name: 'Shiny',
    tone: 'shiny',
    description: 'Glittering chroma with 25% more HP and a rare recolor.',
    palettes: ['Sunflash', 'Rose Gold', 'Mint Prism', 'Aurora'],
  },
  {
    slug: 'mirage',
    name: 'Mirage',
    tone: 'mirage',
    description: 'Adapts to the opponent: stronger into Dark, tougher into Shiny, and tricky versus Shadow.',
    palettes: ['Hologlass', 'Prism Haze', 'Mirage Mint', 'Nebula'],
  },
  {
    slug: 'chrome',
    name: 'Chrome',
    tone: 'chrome',
    description: 'Heavy plated chroma with 50% more HP and elevated crit chances.',
    palettes: ['Silverline', 'Steel Nova', 'Mirror Coat', 'Palladium'],
  },
];
const SPECIAL_AURA_MAP = new Map(SPECIAL_AURAS.map((entry) => [entry.slug, entry]));

const ITEMS = [
  { slug: 'potion', name: 'Potion', category: 'healing', price: 80, unlockWave: 1, description: 'Restore 40 HP to the active monster.', amount: 40 },
  { slug: 'super-potion', name: 'Super Potion', category: 'healing', price: 180, unlockWave: 4, description: 'Restore 90 HP to the active monster.', amount: 90 },
  { slug: 'hyper-potion', name: 'Hyper Potion', category: 'healing', price: 420, unlockWave: 10, description: 'Restore 180 HP to the active monster.', amount: 180 },
  { slug: 'max-potion', name: 'Max Potion', category: 'healing', price: 800, unlockWave: 20, description: 'Fully restore the active monster.', amount: 9999 },
  { slug: 'ether', name: 'Ether', category: 'pp', price: 160, unlockWave: 3, description: 'Restore 6 PP to all moves on the active monster.', amount: 6 },
  { slug: 'elixir', name: 'Elixir', category: 'pp', price: 360, unlockWave: 12, description: 'Fully restore PP on the active monster.', amount: 99 },
  { slug: 'antidote', name: 'Antidote', category: 'status', price: 70, unlockWave: 1, description: 'Clear poison or burn from the active monster.' },
  { slug: 'revive', name: 'Revive', category: 'revive', price: 600, unlockWave: 8, description: 'Revive a fainted monster with half HP.', amount: 0.5 },
  { slug: 'max-revive', name: 'Max Revive', category: 'revive', price: 1200, unlockWave: 24, description: 'Revive a fainted monster at full HP.', amount: 1 },
  { slug: 'capture-orb', name: 'Capture Orb', category: 'capture', price: 160, unlockWave: 1, description: 'Attempt to capture a weakened wild monster.' },
  { slug: 'elite-orb', name: 'Elite Orb', category: 'capture', price: 420, unlockWave: 14, description: 'A stronger capture tool for rare monsters.', bonus: 0.18 },
  { slug: 'rare-candy', name: 'Rare Candy', category: 'level', price: 380, unlockWave: 6, description: 'Raise the active monster by one level.' },
  { slug: 'deleveler', name: 'Deleveler', category: 'regression', price: 420, unlockWave: 8, description: 'Reset a stored monster back to level 1 from the Summary Screen.', carryIntoRun: false, runShop: false },
  { slug: 'devolver', name: 'Devolver', category: 'regression', price: 780, unlockWave: 12, description: 'Return a stored monster to its baby stage from the Summary Screen.', carryIntoRun: false, runShop: false },
  { slug: 'attack-chip', name: 'Attack Chip', category: 'buff', price: 250, unlockWave: 5, description: 'Permanently raise attack on the active monster by 6.' },
  { slug: 'guard-chip', name: 'Guard Chip', category: 'buff', price: 250, unlockWave: 5, description: 'Permanently raise defense on the active monster by 6.' },
  { slug: 'focus-chip', name: 'Focus Chip', category: 'buff', price: 250, unlockWave: 5, description: 'Permanently raise special attack on the active monster by 6.' },
  { slug: 'ward-chip', name: 'Ward Chip', category: 'buff', price: 250, unlockWave: 5, description: 'Permanently raise special defense on the active monster by 6.' },
  { slug: 'haste-chip', name: 'Haste Chip', category: 'buff', price: 250, unlockWave: 5, description: 'Permanently raise speed on the active monster by 6.' },
  { slug: 'field-ration', name: 'Field Ration', category: 'team-heal', price: 320, unlockWave: 7, description: 'Heal the entire team by 25%.' },
  { slug: 'phoenix-salt', name: 'Phoenix Salt', category: 'status', price: 300, unlockWave: 9, description: 'Clear all status from the team.' },
  { slug: 'reroll-ticket', name: 'Reroll Ticket', category: 'utility', price: 240, unlockWave: 4, description: 'Reroll the reward and shop screen once.' },
  { slug: 'lucky-coin', name: 'Lucky Coin', category: 'economy', price: 300, unlockWave: 3, description: 'Gain an instant burst of run cash.' },
  { slug: 'tutor-scroll', name: 'Tutor Scroll', category: 'tutor', price: 500, unlockWave: 11, description: 'Teach the active monster a new move from its type pool.' },
];

const CHALLENGES = [
  { slug: 'mono-blaze', name: 'Mono Blaze', description: 'Start with fire-aligned monsters only. Rewards more cash.', rule: { allowedType: 'fire', cashBonus: 1.35 } },
  { slug: 'mono-tide', name: 'Mono Tide', description: 'Start with water-aligned monsters only. Enemies hit harder, but captures are easier.', rule: { allowedType: 'water', enemyDamageBonus: 1.1, captureBonus: 0.15 } },
  { slug: 'glass-cannon', name: 'Glass Cannon', description: 'All monsters deal more damage and take more damage.', rule: { playerDamageBonus: 1.2, enemyDamageBonus: 1.2 } },
  { slug: 'tiny-cup', name: 'Tiny Cup', description: 'Starter cost cap is reduced, but shops are cheaper.', rule: { starterCap: 7, shopDiscount: 0.8 } },
  { slug: 'boss-rush', name: 'Boss Rush', description: 'Bosses appear more often, with richer payouts.', rule: { bossFrequency: 4, cashBonus: 1.45 } },
  { slug: 'iron-wallet', name: 'Iron Wallet', description: 'Healing is expensive but starter cash is high.', rule: { shopMarkup: 1.25, startingCash: 900 } },
];

const NATURES = [
  { slug: 'adamant', name: 'Adamant', up: 'atk', down: 'spa', role: 'physical sweepers' },
  { slug: 'brave', name: 'Brave', up: 'atk', down: 'spe', role: 'trick room bruisers' },
  { slug: 'lonely', name: 'Lonely', up: 'atk', down: 'def', role: 'glass-cannon physical attackers' },
  { slug: 'naughty', name: 'Naughty', up: 'atk', down: 'spd', role: 'reckless physical attackers' },
  { slug: 'modest', name: 'Modest', up: 'spa', down: 'atk', role: 'special sweepers' },
  { slug: 'quiet', name: 'Quiet', up: 'spa', down: 'spe', role: 'trick room special attackers' },
  { slug: 'mild', name: 'Mild', up: 'spa', down: 'def', role: 'fragile special cannons' },
  { slug: 'rash', name: 'Rash', up: 'spa', down: 'spd', role: 'all-in special attackers' },
  { slug: 'jolly', name: 'Jolly', up: 'spe', down: 'spa', role: 'fast physical sweepers' },
  { slug: 'timid', name: 'Timid', up: 'spe', down: 'atk', role: 'fast special sweepers' },
  { slug: 'hasty', name: 'Hasty', up: 'spe', down: 'def', role: 'frail speed attackers' },
  { slug: 'naive', name: 'Naive', up: 'spe', down: 'spd', role: 'mixed fast attackers' },
  { slug: 'bold', name: 'Bold', up: 'def', down: 'atk', role: 'physical tanks' },
  { slug: 'relaxed', name: 'Relaxed', up: 'def', down: 'spe', role: 'trick room tanks' },
  { slug: 'impish', name: 'Impish', up: 'def', down: 'spa', role: 'physical walls' },
  { slug: 'lax', name: 'Lax', up: 'def', down: 'spd', role: 'physical walls with a special weakness' },
  { slug: 'calm', name: 'Calm', up: 'spd', down: 'atk', role: 'special walls' },
  { slug: 'sassy', name: 'Sassy', up: 'spd', down: 'spe', role: 'slow special tanks' },
  { slug: 'careful', name: 'Careful', up: 'spd', down: 'spa', role: 'special tanks' },
  { slug: 'gentle', name: 'Gentle', up: 'spd', down: 'def', role: 'special walls with a physical weakness' },
  { slug: 'hardy', name: 'Hardy', up: null, down: null, role: 'balanced' },
  { slug: 'docile', name: 'Docile', up: null, down: null, role: 'balanced' },
  { slug: 'serious', name: 'Serious', up: null, down: null, role: 'balanced' },
  { slug: 'bashful', name: 'Bashful', up: null, down: null, role: 'balanced' },
  { slug: 'quirky', name: 'Quirky', up: null, down: null, role: 'balanced' },
];

const NATURE_MAP = new Map(NATURES.map((nature) => [nature.slug, nature]));
const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const STAT_LABELS = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Speed' };
const WEATHER_LABELS = {
  clear: 'Clear Skies',
  sun: 'Harsh Sunlight',
  rain: 'Heavy Rain',
};
const PLAYER_SPRITES = [
  { slug: 'amber-ranger', name: 'Amber Ranger', palette: 'sunset', accent: 'Scout', glyph: 'AR' },
  { slug: 'tidal-ace', name: 'Tidal Ace', palette: 'tide', accent: 'Wave', glyph: 'TA' },
  { slug: 'volt-runner', name: 'Volt Runner', palette: 'volt', accent: 'Spark', glyph: 'VR' },
  { slug: 'moss-keeper', name: 'Moss Keeper', palette: 'forest', accent: 'Bloom', glyph: 'MK' },
  { slug: 'crystal-sage', name: 'Crystal Sage', palette: 'mist', accent: 'Rune', glyph: 'CS' },
  { slug: 'grave-walker', name: 'Grave Walker', palette: 'grave', accent: 'Shade', glyph: 'GW' },
  { slug: 'iron-lancer', name: 'Iron Lancer', palette: 'steel', accent: 'Guard', glyph: 'IL' },
  { slug: 'aurora-knight', name: 'Aurora Knight', palette: 'aurora', accent: 'Halo', glyph: 'AK' },
  { slug: 'ember-pilot', name: 'Ember Pilot', palette: 'sunset', accent: 'Flare', glyph: 'EP' },
  { slug: 'storm-rider', name: 'Storm Rider', palette: 'tide', accent: 'Tempest', glyph: 'SR' },
  { slug: 'moon-idol', name: 'Moon Idol', palette: 'grave', accent: 'Luna', glyph: 'MI' },
  { slug: 'meadow-drifter', name: 'Meadow Drifter', palette: 'forest', accent: 'Leaf', glyph: 'MD' },
];
const PLAYER_SPRITE_MAP = new Map(PLAYER_SPRITES.map((sprite) => [sprite.slug, sprite]));
const PLAYER_SPRITE_BONUSES = [
  { slug: 'amber-ranger', name: 'Ranger Instinct', description: 'Adds balanced frontline pressure.', statBoosts: { hp: 6, atk: 4, def: 3 } },
  { slug: 'tidal-ace', name: 'Tidal Rhythm', description: 'Adds sustain and special bulk.', statBoosts: { hp: 8, spd: 5, spa: 2 } },
  { slug: 'volt-runner', name: 'Volt Tempo', description: 'Boosts speed-focused aggression.', statBoosts: { spe: 8, atk: 3 } },
  { slug: 'moss-keeper', name: 'Moss Bastion', description: 'Improves defensive staying power.', statBoosts: { hp: 10, def: 6 } },
  { slug: 'crystal-sage', name: 'Crystal Focus', description: 'Improves special offense and control.', statBoosts: { spa: 7, spd: 4 } },
  { slug: 'grave-walker', name: 'Grave Pressure', description: 'Adds mixed offense for dark routes.', statBoosts: { atk: 5, spa: 5, spe: 2 } },
  { slug: 'iron-lancer', name: 'Lancer Discipline', description: 'Heavy attack and armor boost for long runs.', statBoosts: { atk: 7, def: 7 } },
  { slug: 'aurora-knight', name: 'Aurora Guard', description: 'Balanced special wall and speed boost.', statBoosts: { spd: 7, spe: 4, hp: 4 } },
  { slug: 'ember-pilot', name: 'Ember Rush', description: 'Fast offensive pressure from turn one.', statBoosts: { atk: 6, spe: 6 } },
  { slug: 'storm-rider', name: 'Storm Sync', description: 'Special offense and speed burst.', statBoosts: { spa: 6, spe: 6 } },
  { slug: 'moon-idol', name: 'Moon Veil', description: 'Defensive sustain with special attack support.', statBoosts: { hp: 8, spd: 6, spa: 3 } },
  { slug: 'meadow-drifter', name: 'Meadow Surge', description: 'Balanced utility for long PvE clears.', statBoosts: { hp: 5, atk: 3, def: 3, spa: 3, spd: 3, spe: 3 } },
];
const PLAYER_SPRITE_BONUS_MAP = new Map(PLAYER_SPRITE_BONUSES.map((entry) => [entry.slug, {
  slug: entry.slug,
  name: entry.name,
  description: entry.description,
  statBoosts: normalizeStatSpread(entry.statBoosts),
}]));

function trainerSpriteBonus(avatarSlug) {
  return PLAYER_SPRITE_BONUS_MAP.get(avatarSlug) || null;
}

const TRAINER_AURA_GEAR = [
  {
    slug: 'ember-aura',
    name: 'Ember Aura',
    tone: 'fire',
    description: 'Adds +6 Atk and +6 SpA to your run party when equipped.',
    statBoosts: { atk: 6, spa: 6 },
  },
  {
    slug: 'tidal-aura',
    name: 'Tidal Aura',
    tone: 'water',
    description: 'Adds +12 HP and +6 SpD to your run party when equipped.',
    statBoosts: { hp: 12, spd: 6 },
  },
  {
    slug: 'volt-aura',
    name: 'Volt Aura',
    tone: 'electric',
    description: 'Adds +10 Spe and +4 Atk to your run party when equipped.',
    statBoosts: { spe: 10, atk: 4 },
  },
  {
    slug: 'warden-aura',
    name: 'Warden Aura',
    tone: 'steel',
    description: 'Adds +8 Def and +8 SpD to your run party when equipped.',
    statBoosts: { def: 8, spd: 8 },
  },
  {
    slug: 'prism-aura',
    name: 'Prism Aura',
    tone: 'fairy',
    description: 'Adds +4 to every stat on your run party when equipped.',
    statBoosts: { hp: 4, atk: 4, def: 4, spa: 4, spd: 4, spe: 4 },
  },
  {
    slug: 'grave-aura',
    name: 'Grave Aura',
    tone: 'ghost',
    description: 'Adds +8 SpA and +8 Spe to your run party when equipped.',
    statBoosts: { spa: 8, spe: 8 },
  },
  {
    slug: 'grove-aura',
    name: 'Grove Aura',
    tone: 'grass',
    description: 'Adds +14 HP, +4 Def, and +4 SpD to your run party when equipped.',
    statBoosts: { hp: 14, def: 4, spd: 4 },
  },
  {
    slug: 'titan-aura',
    name: 'Titan Aura',
    tone: 'rock',
    description: 'Adds +10 Atk and +8 Def to your run party when equipped.',
    statBoosts: { atk: 10, def: 8 },
  },
  {
    slug: 'oracle-aura',
    name: 'Oracle Aura',
    tone: 'psychic',
    description: 'Adds +6 SpA, +6 SpD, and +6 Spe to your run party when equipped.',
    statBoosts: { spa: 6, spd: 6, spe: 6 },
  },
  {
    slug: 'eclipse-aura',
    name: 'Eclipse Aura',
    tone: 'dark',
    description: 'Adds +8 Atk, +6 SpA, and +6 HP to your run party when equipped.',
    statBoosts: { hp: 6, atk: 8, spa: 6 },
  },
];
const TRAINER_AURA_GEAR_MAP = new Map(TRAINER_AURA_GEAR.map((entry) => [entry.slug, entry]));

const TRAINER_HAT_GEAR = [
  {
    slug: 'ranger-cap',
    name: 'Ranger Cap',
    tone: 'grass',
    description: 'Adds +8 HP and +4 Def to your run party when equipped.',
    statBoosts: { hp: 8, def: 4 },
  },
  {
    slug: 'ace-visor',
    name: 'Ace Visor',
    tone: 'electric',
    description: 'Adds +8 Spe and +4 SpA to your run party when equipped.',
    statBoosts: { spe: 8, spa: 4 },
  },
  {
    slug: 'sage-hood',
    name: 'Sage Hood',
    tone: 'psychic',
    description: 'Adds +8 SpA and +6 SpD to your run party when equipped.',
    statBoosts: { spa: 8, spd: 6 },
  },
  {
    slug: 'iron-helm',
    name: 'Iron Helm',
    tone: 'steel',
    description: 'Adds +10 Def and +4 Atk to your run party when equipped.',
    statBoosts: { def: 10, atk: 4 },
  },
  {
    slug: 'lucky-beret',
    name: 'Lucky Beret',
    tone: 'warning',
    description: 'Adds +6 HP and +6 Spe to your run party when equipped.',
    statBoosts: { hp: 6, spe: 6 },
  },
  {
    slug: 'storm-helm',
    name: 'Storm Helm',
    tone: 'electric',
    description: 'Adds +10 Spe and +4 Atk to your run party when equipped.',
    statBoosts: { spe: 10, atk: 4 },
  },
  {
    slug: 'warden-crown',
    name: 'Warden Crown',
    tone: 'steel',
    description: 'Adds +12 HP and +6 Def to your run party when equipped.',
    statBoosts: { hp: 12, def: 6 },
  },
  {
    slug: 'moon-veil',
    name: 'Moon Veil',
    tone: 'ghost',
    description: 'Adds +6 SpD, +6 Spe, and +4 HP to your run party when equipped.',
    statBoosts: { hp: 4, spd: 6, spe: 6 },
  },
  {
    slug: 'flora-band',
    name: 'Flora Band',
    tone: 'grass',
    description: 'Adds +8 HP, +4 Atk, and +4 SpA to your run party when equipped.',
    statBoosts: { hp: 8, atk: 4, spa: 4 },
  },
  {
    slug: 'champion-visor',
    name: 'Champion Visor',
    tone: 'fighting',
    description: 'Adds +8 Atk, +6 Spe, and +4 Def to your run party when equipped.',
    statBoosts: { atk: 8, def: 4, spe: 6 },
  },
];

const TRAINER_HAT_GEAR_MAP = new Map(TRAINER_HAT_GEAR.map((entry) => [entry.slug, entry]));

const TRAINER_LEVEL_CAP = 100;
const TRAINER_CLASS_LEVEL_CAP = 100;

const TRAINER_CLASSES = [
  { slug: 'collector', name: 'Collector', unlockLevel: 1, vibe: 'Loot-first', description: 'Build wide rosters faster and pressure catches.', bonuses: { captureBonus: 0.06, cashBonus: 0.02 } },
  { slug: 'fighter', name: 'Fighter', unlockLevel: 1, vibe: 'Direct combat', description: 'Leans into cleaner battles and stronger routes.', bonuses: { playerDamageBonus: 0.05 } },
  { slug: 'gambler', name: 'Gambler', unlockLevel: 1, vibe: 'High variance', description: 'Turns volatility into bankroll momentum.', bonuses: { cashBonus: 0.08 } },
  { slug: 'scout', name: 'Scout', unlockLevel: 2, vibe: 'Fast learner', description: 'Levels faster and keeps momentum between clears.', bonuses: { expBonus: 0.05 } },
  { slug: 'medic', name: 'Medic', unlockLevel: 2, vibe: 'Sustain', description: 'Keeps teams healthier after every battle.', bonuses: { healAfterBattleBonus: 0.05 } },
  { slug: 'engineer', name: 'Engineer', unlockLevel: 3, vibe: 'Resource routing', description: 'Starts richer and squeezes more value from shops.', bonuses: { shopDiscount: 0.06, startingCashBonus: 100 } },
  { slug: 'breeder', name: 'Breeder', unlockLevel: 3, vibe: 'Roster growth', description: 'Catch-focused class for long collection sessions.', bonuses: { captureBonus: 0.04, healAfterBattleBonus: 0.02 } },
  { slug: 'ace', name: 'Ace', unlockLevel: 4, vibe: 'Momentum duelist', description: 'Wins off tempo and tighter battle loops.', bonuses: { playerDamageBonus: 0.06, ppAfterBattleBonus: 1 } },
  { slug: 'mystic', name: 'Mystic', unlockLevel: 4, vibe: 'Myth route', description: 'Blends XP gain with smoother catches.', bonuses: { expBonus: 0.04, captureBonus: 0.04 } },
  { slug: 'sentinel', name: 'Sentinel', unlockLevel: 5, vibe: 'Fortified climbs', description: 'Better sustain for hard boss pushes.', bonuses: { healAfterBattleBonus: 0.04, cashBonus: 0.03 } },
  { slug: 'rogue', name: 'Rogue', unlockLevel: 5, vibe: 'Burst pressure', description: 'Trades clean route control for faster kills.', bonuses: { cashBonus: 0.05, playerDamageBonus: 0.04 } },
  { slug: 'tactician', name: 'Tactician', unlockLevel: 6, vibe: 'Calculated', description: 'Squeezes more value from damage and shop routing.', bonuses: { shopDiscount: 0.04, playerDamageBonus: 0.05 } },
  { slug: 'ranger', name: 'Ranger', unlockLevel: 6, vibe: 'Route control', description: 'Steady catches with healthy route pacing.', bonuses: { captureBonus: 0.05, healAfterBattleBonus: 0.03 } },
  { slug: 'marshal', name: 'Marshal', unlockLevel: 7, vibe: 'Aggressive commander', description: 'Pushes heavier offense and richer starts.', bonuses: { playerDamageBonus: 0.07, startingCashBonus: 80 } },
  { slug: 'archivist', name: 'Archivist', unlockLevel: 7, vibe: 'Long-game', description: 'Converts grind into faster account progress.', bonuses: { expBonus: 0.07, missionBonus: 0.1 } },
  { slug: 'hunter', name: 'Hunter', unlockLevel: 8, vibe: 'Target lock', description: 'Excels at securing key catches on dangerous routes.', bonuses: { captureBonus: 0.08, cashBonus: 0.04 } },
  { slug: 'idol', name: 'Idol', unlockLevel: 8, vibe: 'Showtime', description: 'A social-climb class that farms momentum and XP.', bonuses: { cashBonus: 0.05, expBonus: 0.04 } },
  { slug: 'alchemist', name: 'Alchemist', unlockLevel: 9, vibe: 'Utility crafter', description: 'Turns every stop into cleaner sustain.', bonuses: { shopDiscount: 0.08, healAfterBattleBonus: 0.03 } },
  { slug: 'relic-keeper', name: 'Relic Keeper', unlockLevel: 9, vibe: 'Passive value', description: 'Great for item-heavy grind sessions.', bonuses: { cashBonus: 0.03, ppAfterBattleBonus: 1 } },
  { slug: 'stormcaller', name: 'Stormcaller', unlockLevel: 10, vibe: 'Tempo caster', description: 'Pressures battles without giving up progression.', bonuses: { playerDamageBonus: 0.05, expBonus: 0.05 } },
  { slug: 'warden', name: 'Warden', unlockLevel: 11, vibe: 'Tank route', description: 'Safer for long clears and boss retries.', bonuses: { healAfterBattleBonus: 0.06 } },
  { slug: 'rival', name: 'Rival', unlockLevel: 12, vibe: 'Climb faster', description: 'Pure pressure for leaderboard grinding.', bonuses: { playerDamageBonus: 0.08, cashBonus: 0.02 } },
  { slug: 'chrono-rider', name: 'Chrono Rider', unlockLevel: 13, vibe: 'Speedrun', description: 'Great for repeated battle loops and fast resets.', bonuses: { expBonus: 0.06, ppAfterBattleBonus: 1 } },
  { slug: 'beast-tamer', name: 'Beast Tamer', unlockLevel: 14, vibe: 'Stable builder', description: 'Catch-heavy class for box growth and route safety.', bonuses: { captureBonus: 0.07, healAfterBattleBonus: 0.03 } },
  { slug: 'guildmaster', name: 'Guildmaster', unlockLevel: 15, vibe: 'Economy lead', description: 'Stacks money and discounts for long sessions.', bonuses: { cashBonus: 0.08, shopDiscount: 0.05 } },
  { slug: 'astralist', name: 'Astralist', unlockLevel: 16, vibe: 'Arcane climb', description: 'Smooths both battle tempo and account leveling.', bonuses: { expBonus: 0.08, playerDamageBonus: 0.03 } },
  { slug: 'omen-reader', name: 'Omen Reader', unlockLevel: 17, vibe: 'Mission farm', description: 'Turns daily and weekly boards into real progress.', bonuses: { missionBonus: 0.15, captureBonus: 0.03 } },
  { slug: 'frontier-lord', name: 'Frontier Lord', unlockLevel: 18, vibe: 'Commanding', description: 'Starts rich and controls difficult battles better.', bonuses: { startingCashBonus: 160, playerDamageBonus: 0.05 } },
  { slug: 'rogue-master', name: 'Rogue Master', unlockLevel: 20, vibe: 'High mastery', description: 'An endgame climb class for heavy replay sessions.', bonuses: { cashBonus: 0.06, expBonus: 0.06 } },
  { slug: 'arena-crown', name: 'Arena Crown', unlockLevel: 22, vibe: 'Champion pressure', description: 'Built for hard trainer fights and leaderboard pushes.', bonuses: { playerDamageBonus: 0.1, healAfterBattleBonus: 0.04 } },
].map((entry, index) => ({ ...entry, unlockLevel: index + 1 }));
const TRAINER_CLASS_MAP = new Map(TRAINER_CLASSES.map((entry) => [entry.slug, entry]));

const TRAINER_SUBCLASSES = [
  { slug: 'packmaster', classSlugs: ['collector', 'breeder', 'hunter', 'beast-tamer'], unlockLevel: 8, name: 'Packmaster', description: 'Sharpens capture pressure and roster snowballing.', bonuses: { captureBonus: 0.03, cashBonus: 0.02 } },
  { slug: 'vault-chief', classSlugs: ['engineer', 'guildmaster', 'relic-keeper', 'archivist'], unlockLevel: 10, name: 'Vault Chief', description: 'Builds stronger cash flow and cleaner route spending.', bonuses: { cashBonus: 0.03, shopDiscount: 0.03 } },
  { slug: 'duelist', classSlugs: ['fighter', 'ace', 'rival', 'arena-crown'], unlockLevel: 12, name: 'Duelist', description: 'Turns direct battles into cleaner offensive routes.', bonuses: { playerDamageBonus: 0.04, expBonus: 0.02 } },
  { slug: 'field-surgeon', classSlugs: ['medic', 'warden', 'sentinel', 'alchemist'], unlockLevel: 14, name: 'Field Surgeon', description: 'Adds even more sustain for long clears.', bonuses: { healAfterBattleBonus: 0.04, ppAfterBattleBonus: 1 } },
  { slug: 'shadow-runner', classSlugs: ['rogue', 'chrono-rider', 'rogue-master', 'idol'], unlockLevel: 16, name: 'Shadow Runner', description: 'Converts speed and momentum into richer replay loops.', bonuses: { expBonus: 0.03, cashBonus: 0.03, playerDamageBonus: 0.02 } },
  { slug: 'war-chief', classSlugs: ['marshal', 'frontier-lord', 'stormcaller', 'tactician'], unlockLevel: 18, name: 'War Chief', description: 'Stacks battle pressure and starting tempo.', bonuses: { playerDamageBonus: 0.04, startingCashBonus: 60 } },
  { slug: 'oracle', classSlugs: ['mystic', 'astralist', 'omen-reader'], unlockLevel: 20, name: 'Oracle', description: 'Turns progression boards and route knowledge into value.', bonuses: { expBonus: 0.03, missionBonus: 0.08 } },
  { slug: 'pathfinder', classSlugs: ['scout', 'ranger', 'collector'], unlockLevel: 22, name: 'Pathfinder', description: 'Smooths route pacing with balanced gains.', bonuses: { captureBonus: 0.02, healAfterBattleBonus: 0.03, expBonus: 0.02 } },
  { slug: 'high-roller', classSlugs: ['gambler', 'idol', 'guildmaster'], unlockLevel: 24, name: 'High Roller', description: 'Pushes reward variance toward bigger bankroll spikes.', bonuses: { cashBonus: 0.05, missionBonus: 0.03 } },
  { slug: 'champion-core', classSlugs: ['arena-crown', 'frontier-lord', 'rogue-master'], unlockLevel: 28, name: 'Champion Core', description: 'Late-game subclass for hard-end runs and boards.', bonuses: { playerDamageBonus: 0.05, healAfterBattleBonus: 0.03, cashBonus: 0.02 } },
];
const TRAINER_SUBCLASS_MAP = new Map(TRAINER_SUBCLASSES.map((entry) => [entry.slug, entry]));

const TRAINER_TITLES = [
  { slug: 'rookie-tamer', name: 'Rookie Tamer', unlockLevel: 1, description: 'The first title every trainer starts with.' },
  { slug: 'route-scout', name: 'Route Scout', unlockLevel: 3, description: 'Unlocked after settling into the route grind.' },
  { slug: 'badge-hunter', name: 'Badge Hunter', unlockLevel: 6, description: 'For trainers pushing gyms and checkpoints.' },
  { slug: 'run-breaker', name: 'Run Breaker', unlockLevel: 10, description: 'Marks players who stop relying on easy clears.' },
  { slug: 'rogue-runner', name: 'Rogue Runner', unlockLevel: 14, description: 'A cleaner title for repeat run victories.' },
  { slug: 'battle-architect', name: 'Battle Architect', unlockLevel: 18, description: 'For trainers who plan around strategy and build paths.' },
  { slug: 'storm-champion', name: 'Storm Champion', unlockLevel: 22, description: 'Reserved for players who stay ahead of scaling routes.' },
  { slug: 'rogue-master', name: 'Rogue Master', unlockLevel: 28, description: 'A late-game title for long-term grinders.' },
  { slug: 'frontier-legend', name: 'Frontier Legend', unlockLevel: 34, description: 'A high-rank title for leaderboard threats.' },
  { slug: 'arena-sovereign', name: 'Arena Sovereign', unlockLevel: 40, description: 'Top-end title for trainers living on the boards.' },
];
const TRAINER_TITLE_MAP = new Map(TRAINER_TITLES.map((entry) => [entry.slug, entry]));

const TRAINER_SKILL_TREE = [
  { slug: 'fast-learner', name: 'Fast Learner', unlockLevel: 2, maxRank: 3, description: 'Gain more trainer EXP from battles and missions.', bonusesPerRank: { expBonus: 0.03 } },
  { slug: 'bounty-board', name: 'Bounty Board', unlockLevel: 3, maxRank: 3, description: 'Increase gold income from wins and mission rewards.', bonusesPerRank: { cashBonus: 0.03 } },
  { slug: 'catch-chain', name: 'Catch Chain', unlockLevel: 4, maxRank: 3, description: 'Improve your chance to secure captures.', bonusesPerRank: { captureBonus: 0.02 } },
  { slug: 'field-medic', name: 'Field Medic', unlockLevel: 5, maxRank: 3, description: 'Recover more HP after every victory.', bonusesPerRank: { healAfterBattleBonus: 0.03 } },
  { slug: 'pp-tactician', name: 'PP Tactician', unlockLevel: 6, maxRank: 2, description: 'Restore more move energy between battles.', bonusesPerRank: { ppAfterBattleBonus: 1 } },
  { slug: 'quartermaster', name: 'Quartermaster', unlockLevel: 7, maxRank: 3, description: 'Start runs with more cash in hand.', bonusesPerRank: { startingCashBonus: 50 } },
  { slug: 'bargain-instinct', name: 'Bargain Instinct', unlockLevel: 8, maxRank: 3, description: 'Lower shop prices during runs.', bonusesPerRank: { shopDiscount: 0.02 } },
  { slug: 'battle-rhythm', name: 'Battle Rhythm', unlockLevel: 9, maxRank: 3, description: 'Increase party battle pressure a little.', bonusesPerRank: { playerDamageBonus: 0.02 } },
  { slug: 'mission-control', name: 'Mission Control', unlockLevel: 10, maxRank: 3, description: 'Boost cash and EXP from claimed missions.', bonusesPerRank: { missionBonus: 0.05 } },
  { slug: 'victory-lap', name: 'Victory Lap', unlockLevel: 12, maxRank: 2, description: 'Blend better sustain with better EXP pacing.', bonusesPerRank: { healAfterBattleBonus: 0.02, expBonus: 0.02 } },
  { slug: 'salvage-eye', name: 'Salvage Eye', unlockLevel: 14, maxRank: 3, description: 'Blend route cash gain with cleaner market planning.', bonusesPerRank: { cashBonus: 0.02, shopDiscount: 0.01 } },
  { slug: 'ambush-theory', name: 'Ambush Theory', unlockLevel: 16, maxRank: 3, description: 'Adds a little capture pressure and battle tempo together.', bonusesPerRank: { captureBonus: 0.01, playerDamageBonus: 0.015 } },
  { slug: 'deep-breath', name: 'Deep Breath', unlockLevel: 18, maxRank: 3, description: 'Long-run sustain that also restores battle rhythm.', bonusesPerRank: { healAfterBattleBonus: 0.02, ppAfterBattleBonus: 1 } },
  { slug: 'long-contract', name: 'Long Contract', unlockLevel: 22, maxRank: 3, description: 'Turns mission boards into steadier cash and EXP.', bonusesPerRank: { missionBonus: 0.04, expBonus: 0.015 } },
  { slug: 'frontline-drill', name: 'Frontline Drill', unlockLevel: 26, maxRank: 3, description: 'High-level battle conditioning for faster clears.', bonusesPerRank: { playerDamageBonus: 0.025, cashBonus: 0.015 } },
];
const TRAINER_SKILL_MAP = new Map(TRAINER_SKILL_TREE.map((entry) => [entry.slug, entry]));

const DISPLAY_THEMES = [
  { slug: 'pokemon', name: 'Pokemon Vibe', description: 'Pixel-forward cards, type color energy, and classic adventure polish.' },
  { slug: 'cool', name: 'Cool Neon', description: 'Sharper glow, stronger contrast, and a more arcade feeling.' },
  { slug: 'modern', name: 'Modern Clean', description: 'Cleaner cards, calmer gradients, and a more app-like feel.' },
  { slug: 'vintage', name: 'Vintage Guild', description: 'Warm accents and a softer fantasy adventurer board.' },
  { slug: 'stadium', name: 'Stadium Clash', description: 'Bold arena contrast, saturated accents, and broadcast energy.' },
  { slug: 'aether', name: 'Aether Lab', description: 'Clean research panels with luminous cyan and mint lighting.' },
  { slug: 'route', name: 'Route Journal', description: 'Adventure-card warmth with field-map greens and travel blues.' },
];
const DISPLAY_THEME_MAP = new Map(DISPLAY_THEMES.map((entry) => [entry.slug, entry]));

const COLOR_MODES = [
  { slug: 'dark', name: 'Dark', description: 'Deep contrast with rich gradients.' },
  { slug: 'light', name: 'Light', description: 'Bright cards and softer shadows.' },
  { slug: 'sunset', name: 'Sunset', description: 'Warm route-board lighting with vibrant accents.' },
  { slug: 'forest', name: 'Forest', description: 'Emerald route colors with leafy contrast.' },
  { slug: 'ocean', name: 'Ocean', description: 'Cool water tones with cleaner blue highlights.' },
  { slug: 'rose', name: 'Rose', description: 'Soft coral panels with bright cream highlights.' },
];
const COLOR_MODE_MAP = new Map(COLOR_MODES.map((entry) => [entry.slug, entry]));

const FONT_MODES = [
  { slug: 'pixel', name: 'Pixel', description: 'Local pixel-style stack for classic monster-tamer energy.' },
  { slug: 'classic', name: 'Classic', description: 'Serif-forward RPG card styling.' },
  { slug: 'modern', name: 'Modern', description: 'Cleaner UI typography for app-style readability.' },
  { slug: 'arcade', name: 'Arcade', description: 'Sharper angular text with more menu-board punch.' },
  { slug: 'trainer', name: 'Trainer', description: 'Readable handheld-style UI lettering for long sessions.' },
  { slug: 'storybook', name: 'Storybook', description: 'Warm fantasy text styling for lore-heavy screens.' },
];
const FONT_MODE_MAP = new Map(FONT_MODES.map((entry) => [entry.slug, entry]));

const MISSION_POOLS = {
  daily: [
    { slug: 'daily-run-double', name: 'Win 2 Runs', description: 'Clear two full runs today.', metric: 'runWins', target: 2, rewards: { cash: 700, exp: 90 } },
    { slug: 'daily-catch-five', name: 'Catch 5 Monsters', description: 'Secure five fresh catches today.', metric: 'monstersCaught', target: 5, rewards: { item: 'elite-orb', quantity: 3, exp: 70 } },
    { slug: 'daily-battle-four', name: 'Win 4 Battles', description: 'Beat four trainer or boss battles today.', metric: 'battleWins', target: 4, rewards: { cash: 520, item: 'field-ration', quantity: 1 } },
    { slug: 'daily-minigame-three', name: 'Win 3 Mini Games', description: 'Take three side wins from the reward board.', metric: 'minigameWins', target: 3, rewards: { cash: 450, item: 'reroll-ticket', quantity: 2 } },
    { slug: 'daily-market-three', name: 'Buy 3 Market Items', description: 'Stock up three times from the guild market.', metric: 'marketPurchases', target: 3, rewards: { cash: 600, exp: 60 } },
    { slug: 'daily-arena-one', name: 'Win 1 Arena Match', description: 'Take one live arena win today.', metric: 'arenaWins', target: 1, rewards: { item: 'rare-candy', quantity: 1, exp: 85 } },
  ],
  weekly: [
    { slug: 'weekly-run-six', name: 'Win 6 Runs', description: 'Put together six run victories this week.', metric: 'runWins', target: 6, rewards: { cash: 2600, exp: 260, item: 'premium-credit-chip', quantity: 1 } },
    { slug: 'weekly-catch-eighteen', name: 'Catch 18 Monsters', description: 'Keep the collection moving all week.', metric: 'monstersCaught', target: 18, rewards: { item: 'rare-candy', quantity: 3, exp: 220 } },
    { slug: 'weekly-battle-ten', name: 'Win 10 Battles', description: 'Defeat ten trainer or boss fights this week.', metric: 'battleWins', target: 10, rewards: { cash: 1900, item: 'phoenix-salt', quantity: 2 } },
    { slug: 'weekly-arena-three', name: 'Win 3 Arena Matches', description: 'Hold your line on the arena board.', metric: 'arenaWins', target: 3, rewards: { cash: 1800, exp: 240, item: 'premium-exp-pass', quantity: 1 } },
    { slug: 'weekly-earn-fivek', name: 'Earn 5000 Gold', description: 'Bring in real cash through the week.', metric: 'goldEarned', target: 5000, rewards: { cash: 2200, item: 'premium-hybrid-license', quantity: 1 } },
  ],
  monthly: [
    { slug: 'monthly-run-twenty', name: 'Win 20 Runs', description: 'Finish twenty full clears this month.', metric: 'runWins', target: 20, rewards: { cash: 9500, exp: 1200, item: 'master-ball', quantity: 1 } },
    { slug: 'monthly-catch-sixty', name: 'Catch 60 Monsters', description: 'Push your collection forward all month long.', metric: 'monstersCaught', target: 60, rewards: { cash: 6200, exp: 980, item: 'rare-candy', quantity: 8 } },
    { slug: 'monthly-battle-forty', name: 'Win 40 Battles', description: 'Take down forty trainer or boss battles this month.', metric: 'battleWins', target: 40, rewards: { cash: 7000, exp: 1050, item: 'phoenix-salt', quantity: 6 } },
    { slug: 'monthly-arena-eight', name: 'Win 8 Arena Matches', description: 'Stay active on the arena board through the month.', metric: 'arenaWins', target: 8, rewards: { cash: 6800, exp: 1100, item: 'premium-exp-pass', quantity: 2 } },
    { slug: 'monthly-market-fifteen', name: 'Buy 15 Market Items', description: 'Keep your inventory moving with regular market visits.', metric: 'marketPurchases', target: 15, rewards: { cash: 5600, exp: 880, item: 'premium-credit-chip', quantity: 2 } },
    { slug: 'monthly-earn-twentyk', name: 'Earn 20000 Gold', description: 'Build a big bankroll over the whole month.', metric: 'goldEarned', target: 20000, rewards: { cash: 9000, exp: 1150, item: 'premium-hybrid-license', quantity: 2 } },
  ],
};
const MISSION_TEMPLATE_MAP = new Map([
  ...MISSION_POOLS.daily.map((entry) => [entry.slug, { ...entry, scope: 'daily' }]),
  ...MISSION_POOLS.weekly.map((entry) => [entry.slug, { ...entry, scope: 'weekly' }]),
  ...MISSION_POOLS.monthly.map((entry) => [entry.slug, { ...entry, scope: 'monthly' }]),
]);

const WORLD_REGION_CATEGORIES = {
  sanctuary: { label: 'Sanctuary Fields', summary: 'Wish-touched gardens, lakes, and hidden mythic refuges.', tone: 'fairy' },
  ruins: { label: 'Ancient Ruins', summary: 'Temples, palaces, and relic grounds loaded with old power.', tone: 'rock' },
  peak: { label: 'Peaks & Towers', summary: 'Summits, towers, and sky climbs with punishing elemental pressure.', tone: 'dragon' },
  depths: { label: 'Depths & Caverns', summary: 'Deep caves and sealed domains built for longer, harder fights.', tone: 'ghost' },
  island: { label: 'Island Routes', summary: 'Remote islands and coastal routes with low-RNG rare signals.', tone: 'water' },
};

const WORLD_REGIONS = [
  { slug: 'jirachis-park', name: "Jirachi's Park", category: 'sanctuary', biomeHints: ['Wish Meadow', 'Comet Garden', 'Starroot Vale'], preferredTypes: ['grass', 'fairy', 'psychic'], weatherPool: ['clear', 'rain', 'fog'], unlockWave: 1, routeLevel: 14, npcTitle: 'Wishkeepers', flavor: 'A bright park where rare trails begin softly before the pressure ramps up.' },
  { slug: 'mesprits-lake', name: "Mesprit's Lake", category: 'sanctuary', biomeHints: ['Emotion Shore', 'Azure Lake', 'Quiet Wetlands'], preferredTypes: ['water', 'psychic', 'fairy'], weatherPool: ['rain', 'clear', 'fog'], unlockWave: 6, routeLevel: 18, npcTitle: 'Lake Sages', flavor: 'Calm water hides heavier psychic pressure and smarter wild formations.' },
  { slug: 'ruins-of-alph', name: 'Ruins of Alph', category: 'ruins', biomeHints: ['Cipher Halls', 'Old Tablet Wing', 'Puzzle Vault'], preferredTypes: ['psychic', 'rock', 'normal'], weatherPool: ['clear', 'fog'], unlockWave: 11, routeLevel: 22, npcTitle: 'Researchers', flavor: 'Ancient puzzle halls mix utility monsters with rarer hidden chambers.' },
  { slug: 'enteis-tower', name: "Entei's Tower", category: 'peak', biomeHints: ['Ash Ladder', 'Sunscar Floors', 'Blaze Belfry'], preferredTypes: ['fire', 'fighting', 'rock'], weatherPool: ['clear', 'fog'], unlockWave: 16, routeLevel: 26, npcTitle: 'Flame Wardens', flavor: 'The climb stays hot and direct, with fewer weak encounters than early routes.' },
  { slug: 'kyogres-temple', name: "Kyogre's Temple", category: 'ruins', biomeHints: ['Tidal Archive', 'Rain Altar', 'Abyss Steps'], preferredTypes: ['water', 'ice', 'dragon'], weatherPool: ['rain', 'fog', 'clear'], unlockWave: 21, routeLevel: 30, npcTitle: 'Tide Priests', flavor: 'Temple floods and stronger aquatic lines make scouting much less free.' },
  { slug: 'eternal-garden', name: 'Eternal Garden', category: 'sanctuary', biomeHints: ['Bloom Ring', 'Moon Orchard', 'Petal Hollow'], preferredTypes: ['grass', 'fairy', 'bug'], weatherPool: ['clear', 'rain', 'fog'], unlockWave: 26, routeLevel: 34, npcTitle: 'Garden Sentinels', flavor: 'Beautiful lanes, rare support species, and steadier item pings reward patience.' },
  { slug: 'groudons-palace', name: "Groudon's Palace", category: 'ruins', biomeHints: ['Molten Court', 'Sunforge Hall', 'Basalt Gate'], preferredTypes: ['ground', 'fire', 'rock'], weatherPool: ['clear', 'fog'], unlockWave: 31, routeLevel: 38, npcTitle: 'Magma Guards', flavor: 'Bulkier earth cores and fire pressure punish under-leveled teams quickly.' },
  { slug: 'mewtwos-cavern', name: "Mewtwo's Cavern", category: 'depths', biomeHints: ['Clone Lab', 'Silent Trench', 'Mindbreak Cavern'], preferredTypes: ['psychic', 'dark', 'poison'], weatherPool: ['fog', 'clear'], unlockWave: 36, routeLevel: 42, npcTitle: 'Mindbreakers', flavor: 'Wilds here lean faster and harsher, with fewer safe turns than midgame areas.' },
  { slug: 'manaphys-haven', name: "Manaphy's Haven", category: 'island', biomeHints: ['Coral Haven', 'Seafoam Ring', 'Lull Tide'], preferredTypes: ['water', 'fairy', 'ice'], weatherPool: ['rain', 'clear'], unlockWave: 41, routeLevel: 46, npcTitle: 'Harbor Guides', flavor: 'A coastal sanctuary route with low-RNG item finds and rare tide signatures.' },
  { slug: 'heatrans-mountain', name: "Heatran's Mountain", category: 'peak', biomeHints: ['Iron Furnace', 'Steam Chasm', 'Magma Switchbacks'], preferredTypes: ['fire', 'steel', 'ground'], weatherPool: ['clear', 'fog'], unlockWave: 46, routeLevel: 50, npcTitle: 'Forgekeepers', flavor: 'Steel-backed enemy rosters and furnace weather create much tougher boss boards.' },
  { slug: 'spear-pillar', name: 'Spear Pillar', category: 'peak', biomeHints: ['Origin Steps', 'Astral Reach', 'Cloudline Gate'], preferredTypes: ['dragon', 'psychic', 'steel'], weatherPool: ['clear', 'fog'], unlockWave: 51, routeLevel: 54, npcTitle: 'Pillar Wardens', flavor: 'High-altitude dragon pressure starts here and does not really let up.' },
  { slug: 'regigigas-domain', name: "Regigigas' Domain", category: 'depths', biomeHints: ['Titan Lock', 'Ancient Core', 'Stone Vault'], preferredTypes: ['normal', 'rock', 'ice'], weatherPool: ['fog', 'clear'], unlockWave: 56, routeLevel: 58, npcTitle: 'Titan Custodians', flavor: 'Large stat lines and tanky enemy fronts make this one of the first real wall checks.' },
  { slug: 'deep-mewtwos-cave', name: "Deep Mewtwo's Cave", category: 'depths', biomeHints: ['Null Sector', 'Shadow Lab', 'Brainstorm Rift'], preferredTypes: ['psychic', 'ghost', 'dark'], weatherPool: ['fog', 'clear'], unlockWave: 61, routeLevel: 62, npcTitle: 'Null Keepers', flavor: 'This deeper layer cuts out filler encounters and spikes enemy scaling hard.' },
  { slug: 'moon-gaze-mountain', name: 'Moon Gaze Mountain', category: 'peak', biomeHints: ['Moonglass Path', 'Lunar Cliffs', 'Night Crown'], preferredTypes: ['fairy', 'ghost', 'rock'], weatherPool: ['fog', 'clear'], unlockWave: 66, routeLevel: 66, npcTitle: 'Moonwatchers', flavor: 'Night-heavy routes and evasive rare spawns make scouting feel tense again.' },
  { slug: 'icebound-cave', name: 'Icebound Cave', category: 'depths', biomeHints: ['Frozen Shelf', 'Glacier Tunnels', 'Crystal Freeze'], preferredTypes: ['ice', 'water', 'rock'], weatherPool: ['fog', 'clear', 'rain'], unlockWave: 71, routeLevel: 70, npcTitle: 'Glacier Scouts', flavor: 'Heavy defenses and slippery type coverage make clean wins less common here.' },
  { slug: 'sky-pillar', name: 'Sky Pillar', category: 'peak', biomeHints: ['Wind Crown', 'Stratos Hall', 'Cloud Spire'], preferredTypes: ['dragon', 'flying', 'psychic'], weatherPool: ['clear', 'fog'], unlockWave: 76, routeLevel: 74, npcTitle: 'Sky Wardens', flavor: 'Fast aerial builds and legendary pressure turn this climb into a real check.' },
  { slug: 'mirage-ruins', name: 'Mirage Ruins', category: 'ruins', biomeHints: ['Glass Desert', 'Phantom Court', 'Broken Sunroom'], preferredTypes: ['ghost', 'psychic', 'ground'], weatherPool: ['clear', 'fog'], unlockWave: 81, routeLevel: 78, npcTitle: 'Mirage Hunters', flavor: 'Rare signals are lower RNG here, but so are easy fights and free item pulls.' },
  { slug: 'latias-heaven', name: 'Latias Heaven', category: 'island', biomeHints: ['Sky Reef', 'Halo Lagoon', 'Radiant Drift'], preferredTypes: ['dragon', 'flying', 'fairy'], weatherPool: ['clear', 'rain'], unlockWave: 86, routeLevel: 82, npcTitle: 'Skyfarers', flavor: 'A high-end island board where support cores and fast sweepers both hit harder.' },
  { slug: 'stormbreak-isle', name: 'Stormbreak Isle', category: 'island', biomeHints: ['Thunder Coast', 'Breaker Cliffs', 'Tempest Wharf'], preferredTypes: ['electric', 'water', 'flying'], weatherPool: ['rain', 'fog', 'clear'], unlockWave: 91, routeLevel: 86, npcTitle: 'Storm Riders', flavor: 'An exposed island route with fewer drops, rougher weather, and meaner ranged cores.' },
  { slug: 'crescent-atoll', name: 'Crescent Atoll', category: 'island', biomeHints: ['Moon Tide', 'Crescent Shoals', 'Starfall Sand'], preferredTypes: ['water', 'fairy', 'dark'], weatherPool: ['clear', 'rain', 'fog'], unlockWave: 96, routeLevel: 90, npcTitle: 'Atoll Wardens', flavor: 'The late-game island circuit closes with tight drop rates and brutal rare patrols.' },
];
const WORLD_REGION_MAP = new Map(WORLD_REGIONS.map((region) => [region.slug, region]));
const AMBIENT_EVENTS = [
  { slug: 'rare-ripple', label: 'A rare monster appeared nearby!', effect: 'Rare spawn surge', rareBonus: 0.14 },
  { slug: 'meteor-shower', label: 'Meteor shower increased spawn rates!', effect: 'Legendary sighting chance up', legendaryBonus: 0.16 },
  { slug: 'merchant-arrival', label: 'A wandering merchant has arrived.', effect: 'Market spotlight discount', marketDiscount: 0.22 },
  { slug: 'night-swell', label: 'Moonlight thickened the shadows.', effect: 'Ghost and Dark routes are stronger', typeBias: ['ghost', 'dark'] },
  { slug: 'storm-front', label: 'Storm clouds rolled over the route.', effect: 'Electric and Water routes are buzzing', typeBias: ['electric', 'water'] },
  { slug: 'sunbreak', label: 'A bright sunbreak cut through the haze.', effect: 'Fire and Grass routes heat up', typeBias: ['fire', 'grass'] },
];
const GYM_REGION_ORDER = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unova', 'Kalos', 'Alola', 'Galar', 'Paldea'];
const GYM_LEAGUES = [
  {
    slug: 'kanto',
    name: 'Kanto',
    banner: 'Indigo League',
    leaders: [
      { slug: 'brock', name: 'Brock', type: 'rock', badgeName: 'Boulder Badge' },
      { slug: 'misty', name: 'Misty', type: 'water', badgeName: 'Cascade Badge' },
      { slug: 'lt-surge', name: 'Lt. Surge', type: 'electric', badgeName: 'Thunder Badge' },
      { slug: 'erika', name: 'Erika', type: 'grass', badgeName: 'Rainbow Badge' },
      { slug: 'koga', name: 'Koga', type: 'poison', badgeName: 'Soul Badge' },
      { slug: 'sabrina', name: 'Sabrina', type: 'psychic', badgeName: 'Marsh Badge' },
      { slug: 'blaine', name: 'Blaine', type: 'fire', badgeName: 'Volcano Badge' },
      { slug: 'giovanni', name: 'Giovanni', type: 'ground', badgeName: 'Earth Badge' },
    ],
    eliteFour: [
      { slug: 'lorelei', name: 'Lorelei', type: 'ice' },
      { slug: 'bruno', name: 'Bruno', type: 'fighting' },
      { slug: 'agatha', name: 'Agatha', type: 'ghost' },
      { slug: 'lance', name: 'Lance', type: 'dragon' },
    ],
    champion: { slug: 'blue', name: 'Blue', type: 'normal', title: 'Champion Battle' },
  },
  {
    slug: 'johto',
    name: 'Johto',
    banner: 'Silver League',
    leaders: [
      { slug: 'falkner', name: 'Falkner', type: 'flying', badgeName: 'Zephyr Badge' },
      { slug: 'bugsy', name: 'Bugsy', type: 'bug', badgeName: 'Hive Badge' },
      { slug: 'whitney', name: 'Whitney', type: 'normal', badgeName: 'Plain Badge' },
      { slug: 'morty', name: 'Morty', type: 'ghost', badgeName: 'Fog Badge' },
      { slug: 'chuck', name: 'Chuck', type: 'fighting', badgeName: 'Storm Badge' },
      { slug: 'jasmine', name: 'Jasmine', type: 'steel', badgeName: 'Mineral Badge' },
      { slug: 'pryce', name: 'Pryce', type: 'ice', badgeName: 'Glacier Badge' },
      { slug: 'clair', name: 'Clair', type: 'dragon', badgeName: 'Rising Badge' },
    ],
    eliteFour: [
      { slug: 'will', name: 'Will', type: 'psychic' },
      { slug: 'koga-elite', name: 'Koga', type: 'poison' },
      { slug: 'bruno-elite', name: 'Bruno', type: 'fighting' },
      { slug: 'karen', name: 'Karen', type: 'dark' },
    ],
    champion: { slug: 'lance-champion', name: 'Lance', type: 'dragon', title: 'Champion Battle' },
  },
  {
    slug: 'hoenn',
    name: 'Hoenn',
    banner: 'Ever Grande League',
    leaders: [
      { slug: 'roxanne', name: 'Roxanne', type: 'rock', badgeName: 'Stone Badge' },
      { slug: 'brawly', name: 'Brawly', type: 'fighting', badgeName: 'Knuckle Badge' },
      { slug: 'wattson', name: 'Wattson', type: 'electric', badgeName: 'Dynamo Badge' },
      { slug: 'flannery', name: 'Flannery', type: 'fire', badgeName: 'Heat Badge' },
      { slug: 'norman', name: 'Norman', type: 'normal', badgeName: 'Balance Badge' },
      { slug: 'winona', name: 'Winona', type: 'flying', badgeName: 'Feather Badge' },
      { slug: 'tate-liza', name: 'Tate & Liza', type: 'psychic', badgeName: 'Mind Badge' },
      { slug: 'wallace', name: 'Wallace', type: 'water', badgeName: 'Rain Badge' },
    ],
    eliteFour: [
      { slug: 'sidney', name: 'Sidney', type: 'dark' },
      { slug: 'phoebe', name: 'Phoebe', type: 'ghost' },
      { slug: 'glacia', name: 'Glacia', type: 'ice' },
      { slug: 'drake', name: 'Drake', type: 'dragon' },
    ],
    champion: { slug: 'steven', name: 'Steven', type: 'steel', title: 'Champion Battle' },
  },
  {
    slug: 'sinnoh',
    name: 'Sinnoh',
    banner: 'Lily of the Valley',
    leaders: [
      { slug: 'roark', name: 'Roark', type: 'rock', badgeName: 'Coal Badge' },
      { slug: 'gardenia', name: 'Gardenia', type: 'grass', badgeName: 'Forest Badge' },
      { slug: 'maylene', name: 'Maylene', type: 'fighting', badgeName: 'Cobble Badge' },
      { slug: 'crasher-wake', name: 'Crasher Wake', type: 'water', badgeName: 'Fen Badge' },
      { slug: 'fantina', name: 'Fantina', type: 'ghost', badgeName: 'Relic Badge' },
      { slug: 'byron', name: 'Byron', type: 'steel', badgeName: 'Mine Badge' },
      { slug: 'candice', name: 'Candice', type: 'ice', badgeName: 'Icicle Badge' },
      { slug: 'volkner', name: 'Volkner', type: 'electric', badgeName: 'Beacon Badge' },
    ],
    eliteFour: [
      { slug: 'aaron', name: 'Aaron', type: 'bug' },
      { slug: 'bertha', name: 'Bertha', type: 'ground' },
      { slug: 'flint', name: 'Flint', type: 'fire' },
      { slug: 'lucian', name: 'Lucian', type: 'psychic' },
    ],
    champion: { slug: 'cynthia', name: 'Cynthia', type: 'dragon', title: 'Champion Battle' },
  },
  {
    slug: 'unova',
    name: 'Unova',
    banner: 'Pokemon League',
    leaders: [
      { slug: 'cilan', name: 'Cilan', type: 'grass', badgeName: 'Trio Badge' },
      { slug: 'lenora', name: 'Lenora', type: 'normal', badgeName: 'Basic Badge' },
      { slug: 'burgh', name: 'Burgh', type: 'bug', badgeName: 'Insect Badge' },
      { slug: 'elesa', name: 'Elesa', type: 'electric', badgeName: 'Bolt Badge' },
      { slug: 'clay', name: 'Clay', type: 'ground', badgeName: 'Quake Badge' },
      { slug: 'skyla', name: 'Skyla', type: 'flying', badgeName: 'Jet Badge' },
      { slug: 'brycen', name: 'Brycen', type: 'ice', badgeName: 'Freeze Badge' },
      { slug: 'drayden', name: 'Drayden', type: 'dragon', badgeName: 'Legend Badge' },
    ],
    eliteFour: [
      { slug: 'shauntal', name: 'Shauntal', type: 'ghost' },
      { slug: 'grimsley', name: 'Grimsley', type: 'dark' },
      { slug: 'caitlin', name: 'Caitlin', type: 'psychic' },
      { slug: 'marshall', name: 'Marshall', type: 'fighting' },
    ],
    champion: { slug: 'iris', name: 'Iris', type: 'dragon', title: 'Champion Battle' },
  },
  {
    slug: 'kalos',
    name: 'Kalos',
    banner: 'Lumiose League',
    leaders: [
      { slug: 'viola', name: 'Viola', type: 'bug', badgeName: 'Bug Badge' },
      { slug: 'grant', name: 'Grant', type: 'rock', badgeName: 'Cliff Badge' },
      { slug: 'korrina', name: 'Korrina', type: 'fighting', badgeName: 'Rumble Badge' },
      { slug: 'ramos', name: 'Ramos', type: 'grass', badgeName: 'Plant Badge' },
      { slug: 'clemont', name: 'Clemont', type: 'electric', badgeName: 'Voltage Badge' },
      { slug: 'valerie', name: 'Valerie', type: 'fairy', badgeName: 'Fairy Badge' },
      { slug: 'olympia', name: 'Olympia', type: 'psychic', badgeName: 'Psychic Badge' },
      { slug: 'wulfric', name: 'Wulfric', type: 'ice', badgeName: 'Iceberg Badge' },
    ],
    eliteFour: [
      { slug: 'malva', name: 'Malva', type: 'fire' },
      { slug: 'siebold', name: 'Siebold', type: 'water' },
      { slug: 'wikstrom', name: 'Wikstrom', type: 'steel' },
      { slug: 'drasna', name: 'Drasna', type: 'dragon' },
    ],
    champion: { slug: 'diantha', name: 'Diantha', type: 'fairy', title: 'Champion Battle' },
  },
  {
    slug: 'alola',
    name: 'Alola',
    banner: 'Island Challenge',
    leaders: [
      { slug: 'ilima', name: 'Ilima', type: 'normal', badgeName: 'Melemele Stamp' },
      { slug: 'lana', name: 'Lana', type: 'water', badgeName: 'Brooklet Stamp' },
      { slug: 'kiawe', name: 'Kiawe', type: 'fire', badgeName: 'Wela Stamp' },
      { slug: 'mallow', name: 'Mallow', type: 'grass', badgeName: 'Lush Stamp' },
      { slug: 'sophocles', name: 'Sophocles', type: 'electric', badgeName: 'Vikavolt Stamp' },
      { slug: 'acerola', name: 'Acerola', type: 'ghost', badgeName: 'Haunted Stamp' },
      { slug: 'mina', name: 'Mina', type: 'fairy', badgeName: 'Poni Stamp' },
      { slug: 'hapu', name: 'Hapu', type: 'ground', badgeName: 'Grand Trial Stamp' },
    ],
    eliteFour: [
      { slug: 'hala', name: 'Hala', type: 'fighting' },
      { slug: 'olivia', name: 'Olivia', type: 'rock' },
      { slug: 'nanu', name: 'Nanu', type: 'dark' },
      { slug: 'kahili', name: 'Kahili', type: 'flying' },
    ],
    champion: { slug: 'kukui', name: 'Professor Kukui', type: 'normal', title: 'Title Defense' },
  },
  {
    slug: 'galar',
    name: 'Galar',
    banner: 'Champion Cup',
    leaders: [
      { slug: 'milo', name: 'Milo', type: 'grass', badgeName: 'Grass Badge' },
      { slug: 'nessa', name: 'Nessa', type: 'water', badgeName: 'Water Badge' },
      { slug: 'kabu', name: 'Kabu', type: 'fire', badgeName: 'Fire Badge' },
      { slug: 'bea', name: 'Bea', type: 'fighting', badgeName: 'Fighting Badge' },
      { slug: 'opal', name: 'Opal', type: 'fairy', badgeName: 'Fairy Badge' },
      { slug: 'gordie', name: 'Gordie', type: 'rock', badgeName: 'Rock Badge' },
      { slug: 'piers', name: 'Piers', type: 'dark', badgeName: 'Dark Badge' },
      { slug: 'raihan', name: 'Raihan', type: 'dragon', badgeName: 'Dragon Badge' },
    ],
    eliteFour: [
      { slug: 'marnie', name: 'Marnie', type: 'dark' },
      { slug: 'bede', name: 'Bede', type: 'psychic' },
      { slug: 'hop', name: 'Hop', type: 'normal' },
      { slug: 'mustard', name: 'Mustard', type: 'fighting' },
    ],
    champion: { slug: 'leon', name: 'Leon', type: 'fire', title: 'Champion Battle' },
  },
  {
    slug: 'paldea',
    name: 'Paldea',
    banner: 'Champion Assessment',
    leaders: [
      { slug: 'katy', name: 'Katy', type: 'bug', badgeName: 'Bug Badge' },
      { slug: 'brassius', name: 'Brassius', type: 'grass', badgeName: 'Grass Badge' },
      { slug: 'iono', name: 'Iono', type: 'electric', badgeName: 'Electric Badge' },
      { slug: 'kofu', name: 'Kofu', type: 'water', badgeName: 'Water Badge' },
      { slug: 'larry', name: 'Larry', type: 'normal', badgeName: 'Normal Badge' },
      { slug: 'ryme', name: 'Ryme', type: 'ghost', badgeName: 'Ghost Badge' },
      { slug: 'tulip', name: 'Tulip', type: 'psychic', badgeName: 'Psychic Badge' },
      { slug: 'grusha', name: 'Grusha', type: 'ice', badgeName: 'Ice Badge' },
    ],
    eliteFour: [
      { slug: 'rika', name: 'Rika', type: 'ground' },
      { slug: 'poppy', name: 'Poppy', type: 'steel' },
      { slug: 'larry-elite', name: 'Larry', type: 'flying' },
      { slug: 'hassel', name: 'Hassel', type: 'dragon' },
    ],
    champion: { slug: 'geeta', name: 'Geeta', type: 'rock', title: 'Top Champion' },
  },
];
const GYM_LEAGUE_MAP = new Map(GYM_LEAGUES.map((league) => [league.slug, league]));
const PARTY_SLOT_COUNT = 6;
const PC_BOX_LABELS = ['Box 1', 'Box 2', 'Box 3', 'Box 4', 'Box 5', 'Box 6'];
const SOCIAL_EMOJI_CATEGORIES = [
  {
    slug: 'faces',
    name: 'Faces',
    icon: '\u{1F600}',
    emojis: ['\u{1F600}', '\u{1F603}', '\u{1F604}', '\u{1F601}', '\u{1F606}', '\u{1F605}', '\u{1F923}', '\u{1F602}', '\u{1F642}', '\u{1F643}', '\u{1F609}', '\u{1F60A}', '\u{1F607}', '\u{1F970}', '\u{1F60D}', '\u{1F929}', '\u{1F60E}', '\u{1F917}', '\u{1F914}', '\u{1F928}', '\u{1F62E}', '\u{1F62D}', '\u{1F621}', '\u{1F631}'],
  },
  {
    slug: 'hands',
    name: 'Hands',
    icon: '\u270B',
    emojis: ['\u{1F44B}', '\u{1F91A}', '\u{1F590}', '\u270B', '\u{1F596}', '\u{1F44C}', '\u{1F90F}', '\u{1F44D}', '\u{1F44E}', '\u{1F91D}', '\u{1F64F}', '\u{1F4AA}', '\u{1F64C}', '\u{1F91F}', '\u261D', '\u{1F446}', '\u{1F447}', '\u{1F448}', '\u{1F449}', '\u{1FAF6}'],
  },
  {
    slug: 'hearts',
    name: 'Hearts',
    icon: '\u2764\uFE0F',
    emojis: ['\u2764\uFE0F', '\u{1F9E1}', '\u{1F49B}', '\u{1F49A}', '\u{1F499}', '\u{1F49C}', '\u{1F90E}', '\u{1F5A4}', '\u{1F90D}', '\u{1F495}', '\u{1F496}', '\u{1F497}', '\u{1F493}', '\u{1F49E}', '\u{1F498}', '\u2728', '\u2B50', '\u{1F4AB}', '\u{1F31F}', '\u{1F389}'],
  },
  {
    slug: 'animals',
    name: 'Animals',
    icon: '\u{1F43E}',
    emojis: ['\u{1F43E}', '\u{1F436}', '\u{1F431}', '\u{1F98A}', '\u{1F43B}', '\u{1F43C}', '\u{1F428}', '\u{1F42F}', '\u{1F981}', '\u{1F99A}', '\u{1F438}', '\u{1F437}', '\u{1F42E}', '\u{1F984}', '\u{1F9A5}', '\u{1F98B}', '\u{1F995}', '\u{1F409}', '\u{1F54A}', '\u{1F433}'],
  },
  {
    slug: 'food',
    name: 'Food',
    icon: '\u{1F354}',
    emojis: ['\u{1F354}', '\u{1F355}', '\u{1F35F}', '\u{1F37F}', '\u{1F36A}', '\u{1F370}', '\u{1F382}', '\u{1F36B}', '\u{1F366}', '\u{1F34E}', '\u{1F353}', '\u{1F349}', '\u{1F95D}', '\u{1F968}', '\u{1F95E}', '\u2615', '\u{1F379}', '\u{1F37A}', '\u{1F964}', '\u{1F9C3}'],
  },
  {
    slug: 'activities',
    name: 'Activities',
    icon: '\u{1F3AE}',
    emojis: ['\u{1F3AE}', '\u{1F3B2}', '\u{1F3AF}', '\u26BD', '\u{1F3C0}', '\u{1F3D0}', '\u{1F3C6}', '\u{1F947}', '\u{1F3C5}', '\u{1F3A8}', '\u{1F3AD}', '\u{1F3A4}', '\u{1F3A7}', '\u{1F3B5}', '\u{1F3B8}', '\u{1F3B9}', '\u{1F941}', '\u{1F3A3}', '\u{1F3B0}', '\u{1F52E}'],
  },
  {
    slug: 'travel',
    name: 'Travel',
    icon: '\u{1F680}',
    emojis: ['\u{1F680}', '\u2708\uFE0F', '\u{1F6F8}', '\u{1F6F0}\uFE0F', '\u{1F697}', '\u{1F699}', '\u{1F68C}', '\u{1F695}', '\u{1F6A2}', '\u{1F6A4}', '\u{1F3D5}\uFE0F', '\u{1F3D6}\uFE0F', '\u{1F3DD}\uFE0F', '\u{1F3DE}\uFE0F', '\u{1F5FA}\uFE0F', '\u{1F30B}', '\u{1F3D4}\uFE0F', '\u{1F305}', '\u{1F306}', '\u{1F307}'],
  },
  {
    slug: 'weather',
    name: 'Weather',
    icon: '\u2600\uFE0F',
    emojis: ['\u2600\uFE0F', '\u{1F31E}', '\u{1F31D}', '\u{1F319}', '\u{1F31B}', '\u2B50', '\u2601\uFE0F', '\u26C5', '\u{1F324}\uFE0F', '\u{1F325}\uFE0F', '\u{1F326}\uFE0F', '\u{1F327}\uFE0F', '\u26C8\uFE0F', '\u{1F329}\uFE0F', '\u{1F32A}\uFE0F', '\u2744\uFE0F', '\u2603\uFE0F', '\u{1F30A}', '\u{1F525}', '\u{1F308}'],
  },
  {
    slug: 'objects',
    name: 'Objects',
    icon: '\u{1F4F7}',
    emojis: ['\u{1F4F7}', '\u{1F4F8}', '\u{1F4F1}', '\u{1F4BB}', '\u{1F4BF}', '\u{1F4E6}', '\u{1F381}', '\u{1F48E}', '\u{1F451}', '\u{1F52B}', '\u2694\uFE0F', '\u{1F6E1}\uFE0F', '\u{1F517}', '\u{1F4AC}', '\u{1F4A1}', '\u{1F4A5}', '\u{1F4AF}', '\u{1F4A3}', '\u{1F50A}', '\u{1F514}'],
  },
  {
    slug: 'symbols',
    name: 'Symbols',
    icon: '\u267B\uFE0F',
    emojis: ['\u2705', '\u274C', '\u2757', '\u2753', '\u267B\uFE0F', '\u269C\uFE0F', '\u2620\uFE0F', '\u{1F4A2}', '\u{1F4A4}', '\u{1F300}', '\u3030\uFE0F', '\u27A1\uFE0F', '\u2B05\uFE0F', '\u2B06\uFE0F', '\u2B07\uFE0F', '\u{1F6AB}', '\u2714\uFE0F', '\u2795', '\u2796', '\u2716\uFE0F'],
  },
  {
    slug: 'flags',
    name: 'Flags',
    icon: '\u{1F3F3}\uFE0F',
    emojis: ['\u{1F1FA}\u{1F1F8}', '\u{1F1EF}\u{1F1F5}', '\u{1F1F5}\u{1F1ED}', '\u{1F1EC}\u{1F1E7}', '\u{1F1EB}\u{1F1F7}', '\u{1F1E9}\u{1F1EA}', '\u{1F1EA}\u{1F1F8}', '\u{1F1EE}\u{1F1F9}', '\u{1F1E6}\u{1F1FA}', '\u{1F1F8}\u{1F1EC}', '\u{1F1F0}\u{1F1F7}', '\u{1F1E7}\u{1F1F7}', '\u{1F1E8}\u{1F1E6}', '\u{1F1F2}\u{1F1FD}', '\u{1F1F9}\u{1F1ED}', '\u{1F1E6}\u{1F1F7}', '\u{1F1F5}\u{1F1EA}', '\u{1F1FF}\u{1F1E6}', '\u{1F1F3}\u{1F1FF}', '\u{1F3F4}\u200D\u2620\uFE0F'],
  },
];
const CHAT_EMOJI_CATEGORY_MAP = new Map(SOCIAL_EMOJI_CATEGORIES.map((entry) => [entry.slug, entry]));

function emojiSlice(slug, start = 0, count = 8) {
  return (CHAT_EMOJI_CATEGORY_MAP.get(slug)?.emojis || []).slice(start, start + count);
}

const CHAT_EMOJI_SETS = {
  cute: {
    name: 'Cute Mix',
    emojis: [...emojiSlice('faces', 0, 8), ...emojiSlice('hearts', 0, 8), ...emojiSlice('animals', 0, 8)],
  },
  battle: {
    name: 'Battle Mix',
    emojis: [...emojiSlice('activities', 0, 8), ...emojiSlice('weather', 0, 8), ...emojiSlice('objects', 8, 8)],
  },
  classic: {
    name: 'Classic Mix',
    emojis: [...emojiSlice('faces', 8, 8), ...emojiSlice('hands', 0, 8), ...emojiSlice('symbols', 0, 8)],
  },
};

const ANNOUNCEMENT_FEED = [
  {
    id: 'patch-2026-03-25-nav',
    kind: 'Patch',
    title: 'Navigation Update: Mini Games + News',
    summary: 'Added dedicated Mini Games and News tabs beside Social for faster route changes.',
    publishedAt: '2026-03-25',
  },
  {
    id: 'patch-2026-03-25-sprite',
    kind: 'Content',
    title: 'Sprite Pass: Signature Portrait Set',
    summary: 'Selected species now render with signature portrait glyph accents while keeping existing generated styles.',
    publishedAt: '2026-03-25',
  },
  {
    id: 'patch-2026-03-25-reward',
    kind: 'Event',
    title: 'Mini-Game Rewards Activated',
    summary: 'Who\'s That Mon, Type Quiz, Mining, Dice, and Daily Crate now reward account progress.',
    publishedAt: '2026-03-25',
  },
];

const UPCOMING_BOARD = [
  {
    id: 'upcoming-2026-q2-lobby',
    targetDate: '2026-04-12',
    title: 'Social Lobby Channels',
    summary: 'Region-based channels and party invite shortcuts are planned for the next social patch.',
  },
  {
    id: 'upcoming-2026-q2-raids',
    targetDate: '2026-04-19',
    title: 'Daily Boss Raid Board',
    summary: 'Daily bosses will publish rotating raid objectives with extra item drops.',
  },
  {
    id: 'upcoming-2026-q2-studio',
    targetDate: '2026-05-03',
    title: 'Trainer Studio Expansion',
    summary: 'Profile card themes, badges, and extra avatar accents are queued as cosmetics.',
  },
];
const ABILITIES = [
  { slug: 'battle-aura', name: 'Battle Aura', description: 'Keeps the monster steady in battle.' },
  { slug: 'blaze', name: 'Blaze', description: 'Fire moves become stronger when HP gets low.' },
  { slug: 'torrent', name: 'Torrent', description: 'Water moves become stronger when HP gets low.' },
  { slug: 'overgrow', name: 'Overgrow', description: 'Grass moves become stronger when HP gets low.' },
  { slug: 'swarm', name: 'Swarm', description: 'Bug moves become stronger when HP gets low.' },
  { slug: 'static', name: 'Static', description: 'Physical attackers may be paralyzed on contact.' },
  { slug: 'poison-point', name: 'Poison Point', description: 'Physical attackers may be poisoned on contact.' },
  { slug: 'flame-body', name: 'Flame Body', description: 'Physical attackers may be burned on contact.' },
  { slug: 'iron-barbs', name: 'Iron Barbs', description: 'Physical attackers take chip damage on contact.' },
  { slug: 'sturdy', name: 'Sturdy', description: 'Prevents a knockout blow from full HP once.' },
  { slug: 'rain-dish', name: 'Rain Dish', description: 'Restores HP every turn while rain is active.' },
  { slug: 'chlorophyll', name: 'Chlorophyll', description: 'Speed rises in sunlight.' },
  { slug: 'swift-swim', name: 'Swift Swim', description: 'Speed rises in rain.' },
  { slug: 'levitate', name: 'Levitate', description: 'Grants immunity to Ground-type moves.' },
  { slug: 'pressure', name: 'Pressure', description: 'Enemy moves spend extra PP when targeting this monster.' },
  { slug: 'adaptability', name: 'Adaptability', description: 'Same-type attacks hit harder than usual.' },
  { slug: 'technician', name: 'Technician', description: 'Low-power moves are boosted.' },
  { slug: 'regenerator', name: 'Regenerator', description: 'Restores HP when switching out.' },
  { slug: 'sniper', name: 'Sniper', description: 'Critical hits become much stronger.' },
  { slug: 'guts', name: 'Guts', description: 'Physical attacks rise while the monster is statused.' },
  { slug: 'thick-fat', name: 'Thick Fat', description: 'Fire- and Ice-type damage is reduced.' },
  { slug: 'magic-guard', name: 'Magic Guard', description: 'Indirect damage is prevented.' },
  { slug: 'multiscale', name: 'Multiscale', description: 'Damage is reduced while HP is full.' },
  { slug: 'serene-grace', name: 'Serene Grace', description: 'Secondary effects trigger more often.' },
  { slug: 'prism-surge', name: 'Prism Surge', description: 'A rare hidden ability that boosts same-type attacks and restores HP.' },
];

const ABILITY_MAP = new Map(ABILITIES.map((ability) => [ability.slug, ability]));
const TYPE_ABILITY_POOLS = {
  normal: ['battle-aura', 'adaptability', 'regenerator'],
  fire: ['blaze', 'flame-body', 'guts'],
  water: ['torrent', 'rain-dish', 'swift-swim'],
  electric: ['static', 'adaptability', 'sniper'],
  grass: ['overgrow', 'chlorophyll', 'regenerator'],
  ice: ['thick-fat', 'pressure', 'multiscale'],
  fighting: ['battle-aura', 'guts', 'technician'],
  poison: ['poison-point', 'regenerator', 'magic-guard'],
  ground: ['sturdy', 'thick-fat', 'battle-aura'],
  flying: ['levitate', 'multiscale', 'sniper'],
  psychic: ['pressure', 'serene-grace', 'magic-guard'],
  bug: ['swarm', 'technician', 'iron-barbs'],
  rock: ['sturdy', 'iron-barbs', 'battle-aura'],
  ghost: ['pressure', 'magic-guard', 'sniper'],
  dragon: ['pressure', 'multiscale', 'adaptability'],
  dark: ['pressure', 'sniper', 'guts'],
  steel: ['sturdy', 'iron-barbs', 'technician'],
  fairy: ['serene-grace', 'battle-aura', 'magic-guard'],
};
const HIDDEN_ABILITY_POOLS = {
  normal: ['prism-surge', 'adaptability'],
  fire: ['prism-surge', 'magic-guard'],
  water: ['regenerator', 'prism-surge'],
  electric: ['prism-surge', 'technician'],
  grass: ['regenerator', 'prism-surge'],
  ice: ['multiscale', 'prism-surge'],
  fighting: ['guts', 'prism-surge'],
  poison: ['magic-guard', 'prism-surge'],
  ground: ['thick-fat', 'prism-surge'],
  flying: ['multiscale', 'prism-surge'],
  psychic: ['serene-grace', 'magic-guard'],
  bug: ['technician', 'prism-surge'],
  rock: ['sturdy', 'prism-surge'],
  ghost: ['magic-guard', 'prism-surge'],
  dragon: ['adaptability', 'multiscale'],
  dark: ['sniper', 'prism-surge'],
  steel: ['iron-barbs', 'prism-surge'],
  fairy: ['serene-grace', 'prism-surge'],
};
const EVOLUTION_STONE_CATALOG = [
  { slug: 'normal-stone', name: 'Normal Stone', evolveTypes: ['normal'], price: 640, unlockWave: 8, description: 'A stable type stone for straightforward evolutions.' },
  { slug: 'fire-stone', name: 'Fire Stone', evolveTypes: ['fire'], price: 720, unlockWave: 10, description: 'A blazing stone that can trigger Fire-aligned evolutions early.' },
  { slug: 'water-stone', name: 'Water Stone', evolveTypes: ['water'], price: 720, unlockWave: 10, description: 'A tide-soaked stone that drives Water-aligned growth.' },
  { slug: 'electric-stone', name: 'Electric Stone', evolveTypes: ['electric'], price: 720, unlockWave: 10, description: 'A crackling stone tuned for Electric-aligned evolution.' },
  { slug: 'thunder-stone', name: 'Thunder Stone', evolveTypes: ['electric'], price: 760, unlockWave: 11, description: 'A classic lightning-charged stone with Electric resonance.' },
  { slug: 'grass-stone', name: 'Grass Stone', evolveTypes: ['grass'], price: 720, unlockWave: 10, description: 'A living stone for Grass-aligned branches.' },
  { slug: 'leaf-stone', name: 'Leaf Stone', evolveTypes: ['grass'], price: 760, unlockWave: 11, description: 'A classic leaf-carved stone with Grass resonance.' },
  { slug: 'ice-stone', name: 'Ice Stone', evolveTypes: ['ice'], price: 720, unlockWave: 10, description: 'A frozen catalyst for Ice-aligned growth.' },
  { slug: 'valor-stone', name: 'Valor Stone', evolveTypes: ['fighting'], price: 740, unlockWave: 10, description: 'A battle-forged relic for Fighting-aligned monsters.' },
  { slug: 'venom-stone', name: 'Venom Stone', evolveTypes: ['poison'], price: 740, unlockWave: 10, description: 'A toxic relic that pushes Poison-aligned evolution.' },
  { slug: 'terra-stone', name: 'Terra Stone', evolveTypes: ['ground'], price: 740, unlockWave: 10, description: 'A heavy earth stone for Ground-aligned evolution.' },
  { slug: 'gale-stone', name: 'Gale Stone', evolveTypes: ['flying'], price: 740, unlockWave: 10, description: 'A wind-carved stone for Flying-aligned growth.' },
  { slug: 'mind-stone', name: 'Mind Stone', evolveTypes: ['psychic'], price: 760, unlockWave: 12, description: 'A lucid stone for Psychic-aligned awakenings.' },
  { slug: 'hive-stone', name: 'Hive Stone', evolveTypes: ['bug'], price: 700, unlockWave: 9, description: 'A swarm-tuned stone for Bug-aligned forms.' },
  { slug: 'crag-stone', name: 'Crag Stone', evolveTypes: ['rock'], price: 740, unlockWave: 10, description: 'A dense stone for Rock-aligned monsters.' },
  { slug: 'dusk-stone', name: 'Dusk Stone', evolveTypes: ['ghost'], price: 760, unlockWave: 12, description: 'A dim shard for Ghost-aligned evolution.' },
  { slug: 'dragon-stone', name: 'Dragon Stone', evolveTypes: ['dragon'], price: 820, unlockWave: 14, description: 'An ancient fang-cut stone for Dragon-aligned growth.' },
  { slug: 'shadow-stone', name: 'Shadow Stone', evolveTypes: ['dark'], price: 780, unlockWave: 12, description: 'A moonless stone for Dark-aligned monsters.' },
  { slug: 'iron-stone', name: 'Iron Stone', evolveTypes: ['steel'], price: 780, unlockWave: 12, description: 'A tempered steel-core stone for Steel-aligned forms.' },
  { slug: 'fable-stone', name: 'Fable Stone', evolveTypes: ['fairy'], price: 780, unlockWave: 12, description: 'A radiant stone used by Fairy-aligned evolutions.' },
  { slug: 'prism-stone', name: 'Prism Stone', evolveTypes: TYPES, price: 1200, unlockWave: 18, description: 'A universal stone that resonates with every type in the game.' },
  { slug: 'moon-stone', name: 'Moon Stone', evolveTypes: ['fairy', 'dark', 'ghost'], price: 820, unlockWave: 12, description: 'A cool lunar stone with broad night-aligned resonance.' },
  { slug: 'sun-stone', name: 'Sun Stone', evolveTypes: ['fire', 'grass', 'psychic'], price: 820, unlockWave: 12, description: 'A warm solar stone for bright, aggressive evolutions.' },
  { slug: 'shiny-stone', name: 'Shiny Stone', evolveTypes: ['fairy', 'steel', 'psychic'], price: 860, unlockWave: 13, description: 'A polished stone for refined or radiant forms.' },
  { slug: 'dawn-stone', name: 'Dawn Stone', evolveTypes: ['psychic', 'fighting', 'fairy'], price: 860, unlockWave: 13, description: 'A rising-light stone for focused evolutions.' },
  { slug: 'dragon-scale', name: 'Dragon Scale', evolveTypes: ['dragon', 'water'], price: 900, unlockWave: 14, description: 'A rare scale relic that accelerates draconic growth.' },
  { slug: 'metal-coat', name: 'Metal Coat', evolveTypes: ['steel', 'rock'], price: 900, unlockWave: 14, description: 'A metallic evolution coat for armored species.' },
  { slug: 'protector', name: 'Protector', evolveTypes: ['rock', 'ground', 'fighting'], price: 940, unlockWave: 15, description: 'A heavy defense relic for bruisers and tanks.' },
  { slug: 'reaper-cloth', name: 'Reaper Cloth', evolveTypes: ['ghost', 'dark'], price: 940, unlockWave: 15, description: 'A haunted cloth that pushes sinister evolution lines.' },
  { slug: 'electirizer', name: 'Electirizer', evolveTypes: ['electric', 'steel'], price: 940, unlockWave: 15, description: 'A high-voltage evolver that supercharges tech lines.' },
  { slug: 'magmarizer', name: 'Magmarizer', evolveTypes: ['fire', 'fighting'], price: 940, unlockWave: 15, description: 'A furnace relic for hot-blooded evolutions.' },
  { slug: 'dubious-disc', name: 'Dubious Disc', evolveTypes: ['psychic', 'electric', 'steel'], price: 980, unlockWave: 16, description: 'A strange digital disc for unstable upgrade paths.' },
  { slug: 'upgrade', name: 'Upgrade', evolveTypes: ['normal', 'steel', 'electric'], price: 940, unlockWave: 15, description: 'A modular upgrade drive for engineered evolutions.' },
  { slug: 'linking-cord', name: 'Linking Cord', evolveTypes: ['normal', 'fighting', 'psychic'], price: 860, unlockWave: 14, description: 'A flexible link item that bridges classic trade-style evolution lines.' },
  { slug: 'prism-scale', name: 'Prism Scale', evolveTypes: ['water', 'fairy', 'dragon'], price: 980, unlockWave: 16, description: 'A gleaming scale for elegant or serpentine forms.' },
  { slug: 'auspicious-armor', name: 'Auspicious Armor', evolveTypes: ['fire', 'steel', 'psychic'], price: 1040, unlockWave: 16, description: 'A noble armor shard for disciplined offensive evolutions.' },
  { slug: 'malicious-armor', name: 'Malicious Armor', evolveTypes: ['ghost', 'dark', 'steel'], price: 1040, unlockWave: 16, description: 'A cursed armor shard for ruthless evolution lines.' },
  { slug: 'tart-apple', name: 'Tart Apple', evolveTypes: ['grass', 'dragon'], price: 920, unlockWave: 14, description: 'A sharp fruit catalyst for fierce orchard evolutions.' },
  { slug: 'sweet-apple', name: 'Sweet Apple', evolveTypes: ['grass', 'fairy'], price: 920, unlockWave: 14, description: 'A soft fruit catalyst for gentle orchard evolutions.' },
  { slug: 'syrupy-apple', name: 'Syrupy Apple', evolveTypes: ['grass', 'bug', 'dragon'], price: 960, unlockWave: 15, description: 'A sticky fruit catalyst for heavy orchard evolution routes.' },
  { slug: 'storm-core', name: 'Storm Core', evolveTypes: ['electric', 'flying', 'water'], price: 1080, unlockWave: 17, description: 'A storm relic that pushes speed-heavy elemental lines forward.' },
  { slug: 'void-shard', name: 'Void Shard', evolveTypes: ['ghost', 'dark', 'psychic'], price: 1080, unlockWave: 17, description: 'A cold fragment for dangerous late-night evolutions.' },
  { slug: 'aurora-core', name: 'Aurora Core', evolveTypes: ['ice', 'fairy', 'dragon'], price: 1080, unlockWave: 17, description: 'A shimmering core with polar resonance.' },
  { slug: 'titan-heart', name: 'Titan Heart', evolveTypes: ['rock', 'ground', 'steel'], price: 1080, unlockWave: 17, description: 'A dense core stone built for colossal forms.' },
];
const EVOLUTION_STONE_MAP = new Map(EVOLUTION_STONE_CATALOG.map((item) => [item.slug, item]));
const PREFERRED_STONE_BY_TYPE = {
  normal: 'normal-stone',
  fire: 'fire-stone',
  water: 'water-stone',
  electric: 'electric-stone',
  grass: 'grass-stone',
  ice: 'ice-stone',
  fighting: 'valor-stone',
  poison: 'venom-stone',
  ground: 'terra-stone',
  flying: 'gale-stone',
  psychic: 'mind-stone',
  bug: 'hive-stone',
  rock: 'crag-stone',
  ghost: 'dusk-stone',
  dragon: 'dragon-stone',
  dark: 'shadow-stone',
  steel: 'iron-stone',
  fairy: 'fable-stone',
};

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export { escapeHtml };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomId(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJson(value, fallback = null) {
  if (!value) {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function writeJson(value) {
  return JSON.stringify(value ?? null);
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

function seededInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function hashSeedFromString(value) {
  return String(value || '').split('').reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) >>> 0, 0);
}

function normalizeNature(natureLike, fallbackSeed = 0) {
  if (natureLike && typeof natureLike === 'object') {
    natureLike = natureLike.slug || natureLike.name || '';
  }
  const slug = String(natureLike || '').toLowerCase();
  if (NATURE_MAP.has(slug)) {
    return NATURE_MAP.get(slug);
  }
  const seed = Math.abs(Number(fallbackSeed) || 0);
  return NATURES[seed % NATURES.length];
}

function natureEffectLabel(natureLike, fallbackSeed = 0) {
  const nature = normalizeNature(natureLike, fallbackSeed);
  if (!nature.up || !nature.down) {
    return 'Neutral';
  }
  return '+' + STAT_LABELS[nature.up] + ' / -' + STAT_LABELS[nature.down];
}

function totalStats(stats) {
  return stats.hp + stats.atk + stats.def + stats.spa + stats.spd + stats.spe;
}

function statTotal(stats) {
  return totalStats(stats || { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
}

function statSpreadSummary(spread, scaleLabel = '') {
  const labels = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
  return STAT_KEYS
    .map((key) => `${labels[key]} ${formatNumber(Number(spread?.[key] || 0))}${scaleLabel}`)
    .join(' / ');
}
function blankStatSpread(value = 0) {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, value]));
}

function normalizeStatSpread(spread, maxValue = null) {
  const next = blankStatSpread();
  for (const key of STAT_KEYS) {
    const raw = Number(spread?.[key] || 0);
    const clamped = maxValue === null ? raw : clamp(raw, 0, maxValue);
    next[key] = Math.max(0, Math.floor(clamped));
  }
  return next;
}

function rebuildMonsterBoosts(monster) {
  const ivs = normalizeStatSpread(monster.ivs, 31);
  const evs = normalizeStatSpread(monster.evs, 252);
  const bonusStats = normalizeStatSpread(monster.bonusStats);
  monster.ivs = ivs;
  monster.evs = evs;
  monster.bonusStats = bonusStats;
  monster.statBoosts = Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    ivs[key] + Math.floor(evs[key] / 8) + bonusStats[key],
  ]));
  return monster.statBoosts;
}

function totalEffortValues(evs) {
  return STAT_KEYS.reduce((sum, key) => sum + Number(evs?.[key] || 0), 0);
}

function grantEffortValues(monster, defeatedSpecies, amount = 8) {
  if (!monster || !defeatedSpecies) {
    return false;
  }
  const targetStat = STAT_KEYS.reduce((best, key) => (
    defeatedSpecies.baseStats[key] > defeatedSpecies.baseStats[best] ? key : best
  ), 'hp');
  monster.evs = normalizeStatSpread(monster.evs, 252);
  const totalBefore = totalEffortValues(monster.evs);
  const room = Math.max(0, 510 - totalBefore);
  if (!room) {
    return false;
  }
  const granted = Math.min(amount, room, 252 - monster.evs[targetStat]);
  if (granted <= 0) {
    return false;
  }
  monster.evs[targetStat] += granted;
  const hpRatio = monster.stats?.hp ? monster.currentHp / Math.max(1, monster.stats.hp) : 1;
  rebuildMonsterBoosts(monster);
  const species = SPECIES_MAP.get(monster.speciesId);
  if (species) {
    monster.stats = resolvedMonsterStats(monster, species);
    monster.currentHp = monster.currentHp > 0
      ? Math.max(1, Math.min(monster.stats.hp, Math.round(monster.stats.hp * hpRatio)))
      : 0;
  }
  return true;
}

function moveUnlockLevelForIndex(index, stage = 1) {
  const unlocks = [1, 4, 7, 10, 13, 16, 19, 22, 25, 29, 33, 37, 41, 46, 51, 56, 61, 67, 73, 79, 85, 91, 96, 100];
  const stageShift = stage === 1 ? 0 : stage === 2 ? -4 : stage === 3 ? -8 : -12;
  return clamp((unlocks[index] || 100) + stageShift, 1, 100);
}

function availableMoveIdsForLevel(species, level) {
  return (species?.movePool || []).filter((moveId, index) => moveUnlockLevelForIndex(index, species.stage) <= level);
}

function buildEvolutionStoneOptions(types, familyIndex = 0, stage = 1) {
  if (!Array.isArray(types) || !types.length || stage >= 4) {
    return [];
  }
  const direct = types.map((type) => PREFERRED_STONE_BY_TYPE[type]).filter(Boolean);
  const specialPool = EVOLUTION_STONE_CATALOG
    .filter((item) => item.slug !== 'prism-stone' && item.evolveTypes.some((type) => types.includes(type)) && !direct.includes(item.slug))
    .map((item) => item.slug);
  const extraCount = stage === 1 ? 1 : 2;
  const extras = [];
  for (let index = 0; index < Math.min(extraCount, specialPool.length); index += 1) {
    extras.push(specialPool[(familyIndex * 3 + index * 5) % specialPool.length]);
  }
  return [...new Set([...direct, ...extras, 'prism-stone'])].slice(0, stage === 1 ? 4 : stage === 2 ? 5 : 3);
}

function speciesCanUseEvolutionStone(species, itemSlug) {
  return !!species?.stoneEvolutionMap?.[itemSlug];
}

function normalizeAuraKey(auraKey) {
  return SPECIAL_AURA_MAP.has(auraKey) ? auraKey : 'normal';
}

function auraInfoForMonster(monster) {
  return SPECIAL_AURA_MAP.get(normalizeAuraKey(monster?.auraKey)) || SPECIAL_AURA_MAP.get('normal');
}

function auraRollTableForSpecies(species) {
  const rarityBoost = species?.rarity === 'legendary' ? 18 : species?.rarity === 'mythic' ? 26 : species?.rarity === 'epic' ? 10 : 0;
  return [
    { slug: 'normal', weight: Math.max(340, 610 - rarityBoost * 4 - species.stage * 18) },
    { slug: 'metallic', weight: 90 + species.stage * 6 },
    { slug: 'ghostly', weight: 84 + (species.types.includes('ghost') ? 26 : 0) },
    { slug: 'shadow', weight: 52 + (species.types.includes('dark') ? 20 : 0) + rarityBoost },
    { slug: 'dark-aura', weight: 72 + (species.types.includes('dark') ? 18 : 0) },
    { slug: 'shiny', weight: 56 + rarityBoost },
    { slug: 'mirage', weight: 34 + (species.types.includes('psychic') || species.types.includes('fairy') ? 14 : 0) + rarityBoost },
    { slug: 'chrome', weight: 20 + rarityBoost + (species.types.includes('steel') ? 20 : 0) },
  ];
}

function selectAuraKeyForSpecies(species, seed = 0) {
  const table = auraRollTableForSpecies(species);
  const totalWeight = table.reduce((sum, entry) => sum + entry.weight, 0);
  const rng = seeded((species.id * 193 + seed * 41 + species.stage * 17) >>> 0);
  let roll = Math.floor(rng() * totalWeight);
  for (const entry of table) {
    roll -= entry.weight;
    if (roll < 0) {
      return entry.slug;
    }
  }
  return 'normal';
}

function selectAuraPalette(auraKey, seed = 0) {
  const aura = SPECIAL_AURA_MAP.get(normalizeAuraKey(auraKey)) || SPECIAL_AURA_MAP.get('normal');
  return aura.palettes[Math.abs(Number(seed) || 0) % aura.palettes.length] || aura.palettes[0] || 'Classic';
}

function buildAbilityPoolForSpecies(types) {
  const pool = [...new Set(types.flatMap((type) => TYPE_ABILITY_POOLS[type] || ['battle-aura']))];
  if (!pool.includes('battle-aura')) {
    pool.unshift('battle-aura');
  }
  while (pool.length < 2) {
    pool.push('battle-aura');
  }
  return pool.slice(0, 3);
}

function hiddenAbilitySlugForSpecies(types, familyIndex = 0, stage = 1) {
  const pool = [...new Set(types.flatMap((type) => HIDDEN_ABILITY_POOLS[type] || ['prism-surge']))];
  return pool[Math.abs(familyIndex * 13 + stage * 7) % pool.length] || 'prism-surge';
}

function speciesAbilityChoices(species) {
  return [...new Set([...(species?.abilityPool || []), species?.hiddenAbilitySlug].filter(Boolean))];
}

function abilitySlugForSpecies(species, seed = 0, includeHidden = false) {
  if (includeHidden && species?.hiddenAbilitySlug) {
    return species.hiddenAbilitySlug;
  }
  const pool = Array.isArray(species?.abilityPool) && species.abilityPool.length
    ? species.abilityPool
    : [...new Set((species?.types || []).flatMap((type) => TYPE_ABILITY_POOLS[type] || ['battle-aura']))];
  if (!pool.length) {
    return 'battle-aura';
  }
  const index = Math.abs((species.id * 17 + seed) || 0) % pool.length;
  return pool[index];
}

function moveRoleForEffect(effect) {
  return MOVE_ROLE_LABELS[effect] || 'Utility';
}

function moveTeachingCost(move) {
  const prices = {
    1: 180,
    2: 320,
    3: 520,
    4: 800,
    5: 1200,
  };
  return prices[move?.tier] || 1200;
}

function moveNameForTemplate(type, effect, index) {
  const words = TYPE_WORD_VARIANTS[type] || [TYPE_WORDS[type] || capitalized(type)];
  const actions = MOVE_ACTION_BY_EFFECT[effect] || MOVE_ACTIONS;
  const suffixes = MOVE_SUFFIX_BY_EFFECT[effect] || MOVE_SUFFIXES;
  const word = words[Math.floor(index / 12) % words.length];
  const action = actions[Math.floor(index / Math.max(1, TYPES.length / 2)) % actions.length];
  const suffix = suffixes[Math.floor(index / Math.max(1, TYPES.length * Math.max(1, actions.length / 2))) % suffixes.length];
  const epithet = MOVE_EPITHETS[Math.floor(index / Math.max(1, TYPES.length * actions.length)) % MOVE_EPITHETS.length];
  return word + ' ' + action + ' ' + suffix + ' ' + epithet;
}

function moveDescriptionForEffect(name, type, category, effect) {
  const typed = capitalized(type) + '-type';
  switch (effect) {
    case 'damage':
      return name + ' is a reliable ' + typed + ' physical strike.';
    case 'special':
      return name + ' is a reliable ' + typed + ' special blast.';
    case 'drain':
      return name + ' deals damage and restores some HP to the user.';
    case 'burn':
      return name + ' deals damage and may burn the target.';
    case 'poison':
      return name + ' deals damage and may poison the target.';
    case 'paralyze':
      return name + ' deals damage and may paralyze the target.';
    case 'recoil':
      return name + ' hits hard but hurts the user after striking.';
    case 'cleanse':
      return name + ' restores HP and can clear status from the user.';
    case 'debuff-atk':
      return name + ' damages the target and lowers its Attack.';
    case 'debuff-def':
      return name + ' damages the target and lowers its Defense.';
    case 'buff-spd':
      return name + ' sharply raises Special Defense.';
    case 'heal':
      return name + ' restores about one-third of the user\'s HP.';
    case 'buff-atk':
      return name + ' sharply raises Attack.';
    case 'buff-def':
      return name + ' sharply raises Defense.';
    case 'focus':
      return name + ' raises Special Attack and Speed.';
    case 'buff-spa':
      return name + ' sharply raises Special Attack.';
    case 'buff-spe':
      return name + ' sharply raises Speed.';
    case 'weather-sun':
      return name + ' floods the field with sunlight for five turns.';
    case 'weather-rain':
      return name + ' summons rain for five turns.';
    default:
      return name + ' is a ' + typed + ' ' + category + ' technique.';
  }
}

function buildMoves() {
  const moves = [];
  const templates = [
    { key: 'damage', category: 'physical', power: [42, 62, 86, 112, 138], accuracy: [100, 96, 92, 87, 82] },
    { key: 'special', category: 'special', power: [46, 68, 92, 116, 132], accuracy: [100, 96, 92, 88, 84] },
    { key: 'drain', category: 'special', power: [38, 58, 78, 98, 114], accuracy: [100, 95, 92, 88, 85] },
    { key: 'burn', category: 'special', power: [44, 68, 90, 112, 126], accuracy: [100, 95, 92, 88, 85] },
    { key: 'poison', category: 'physical', power: [42, 60, 84, 106, 122], accuracy: [100, 95, 92, 88, 84] },
    { key: 'paralyze', category: 'special', power: [36, 56, 76, 96, 116], accuracy: [100, 96, 93, 90, 86] },
    { key: 'recoil', category: 'physical', power: [64, 82, 104, 126, 148], accuracy: [100, 95, 91, 87, 83] },
    { key: 'debuff-atk', category: 'special', power: [40, 58, 78, 98, 116], accuracy: [100, 96, 93, 90, 86] },
    { key: 'debuff-def', category: 'physical', power: [40, 60, 82, 102, 120], accuracy: [100, 95, 92, 88, 84] },
    { key: 'cleanse', category: 'status', power: [0, 0, 0, 0, 0], accuracy: [100, 100, 100, 100, 100] },
    { key: 'heal', category: 'status', power: [0, 0, 0, 0, 0], accuracy: [100, 100, 100, 100, 100] },
    { key: 'buff-atk', category: 'status', power: [0, 0, 0, 0, 0], accuracy: [100, 100, 100, 100, 100] },
    { key: 'buff-def', category: 'status', power: [0, 0, 0, 0, 0], accuracy: [100, 100, 100, 100, 100] },
    { key: 'buff-spd', category: 'status', power: [0, 0, 0, 0, 0], accuracy: [100, 100, 100, 100, 100] },
    { key: 'focus', category: 'status', power: [0, 0, 0, 0, 0], accuracy: [100, 100, 100, 100, 100] },
    { key: 'buff-spa', category: 'status', power: [0, 0, 0, 0, 0], accuracy: [100, 100, 100, 100, 100] },
    { key: 'buff-spe', category: 'status', power: [0, 0, 0, 0, 0], accuracy: [100, 100, 100, 100, 100] },
    { key: 'weather-sun', category: 'status', power: [0, 0, 0, 0, 0], accuracy: [100, 100, 100, 100, 100] },
    { key: 'weather-rain', category: 'status', power: [0, 0, 0, 0, 0], accuracy: [100, 100, 100, 100, 100] },
    { key: 'damage', category: 'special', power: [48, 70, 94, 118, 140], accuracy: [100, 97, 94, 90, 86] },
    { key: 'special', category: 'physical', power: [44, 66, 90, 114, 136], accuracy: [100, 97, 93, 89, 85] },
    { key: 'burn', category: 'physical', power: [42, 64, 86, 108, 124], accuracy: [100, 95, 92, 88, 84] },
    { key: 'poison', category: 'special', power: [40, 62, 84, 104, 120], accuracy: [100, 95, 92, 88, 84] },
    { key: 'paralyze', category: 'physical', power: [40, 60, 80, 100, 118], accuracy: [100, 97, 94, 90, 87] },
  ];

  const seen = new Map();
  const totalMoveCount = 1440;
  const tierSize = Math.floor(totalMoveCount / 8);
  for (let index = 0; index < totalMoveCount; index += 1) {
    const type = TYPES[index % TYPES.length];
    const template = templates[(index + Math.floor(index / TYPES.length)) % templates.length];
    const tier = Math.floor(index / tierSize);
    let name = moveNameForTemplate(type, template.key, index);
    const seenCount = (seen.get(name) || 0) + 1;
    seen.set(name, seenCount);
    if (seenCount > 1) {
      name = name + ' ' + seenCount;
    }
    const power = template.power[clamp(tier, 0, template.power.length - 1)];
    const accuracy = template.accuracy[clamp(tier, 0, template.accuracy.length - 1)];
    moves.push({
      id: index + 1,
      slug: slugify(name),
      name,
      type,
      category: template.category,
      power,
      accuracy,
      pp: template.category === 'status' ? clamp(18 - tier, 10, 18) : clamp(22 - tier * 2, 8, 24),
      priority: template.key === 'focus' || template.key === 'buff-spe' ? 1 : 0,
      effect: template.key,
      role: moveRoleForEffect(template.key),
      tier: tier + 1,
      description: moveDescriptionForEffect(name, type, template.category, template.key),
    });
  }
  return moves;
}

function sampleMovePool(pool, count, startOffset = 0, step = 5) {
  if (!Array.isArray(pool) || !pool.length || count <= 0) {
    return [];
  }
  const picks = [];
  const seen = new Set();
  let index = Math.abs(startOffset) % pool.length;
  while (picks.length < count && seen.size < pool.length) {
    const moveId = pool[index];
    if (!seen.has(moveId)) {
      picks.push(moveId);
      seen.add(moveId);
    }
    index = (index + step) % pool.length;
    if (seen.has(pool[index])) {
      index = (index + 1) % pool.length;
    }
  }
  return picks;
}

function moveIdsMatching(pool, moveLookup, predicate) {
  return (pool || []).filter((moveId) => {
    const move = moveLookup.get(moveId);
    return !!move && predicate(move);
  });
}

function buildTypeMovePool(types, stage, seed, moveIdsByType, moveLookup, limit = 24, stats = null) {
  const normalizedTypes = [...new Set((types || []).filter(Boolean))];
  const typedMoves = dedupeList(normalizedTypes.flatMap((type) => moveIdsByType.get(type) || []));
  const attackBias = stats && stats.spa > stats.atk + 8
    ? 'special'
    : stats && stats.atk > stats.spa + 8
      ? 'physical'
      : 'mixed';
  const utilityEffects = new Set(['cleanse', 'heal', 'buff-atk', 'buff-def', 'buff-spd', 'focus', 'buff-spa', 'buff-spe', 'weather-sun', 'weather-rain', 'debuff-atk', 'debuff-def']);
  const preferredOffense = moveIdsMatching(typedMoves, moveLookup, (move) => move.category !== 'status' && (attackBias === 'mixed' || move.category === attackBias));
  const alternateOffense = moveIdsMatching(typedMoves, moveLookup, (move) => move.category !== 'status' && !preferredOffense.includes(move.id));
  const supportMoves = moveIdsMatching(typedMoves, moveLookup, (move) => move.category === 'status' || utilityEffects.has(move.effect));
  const finisherMoves = moveIdsMatching(typedMoves, moveLookup, (move) => move.category !== 'status' && (move.tier || 0) >= 4);
  const accurateMoves = moveIdsMatching(typedMoves, moveLookup, (move) => move.category !== 'status' && Number(move.accuracy || 0) >= 94);
  const coverageTypes = TYPES.filter((type) => !normalizedTypes.includes(type));
  const coverageMoves = dedupeList(coverageTypes.slice(0, 6).flatMap((type, index) => sampleMovePool(
    moveIdsByType.get(type) || [],
    stage >= 3 ? 2 : 1,
    seed * 13 + index * 11,
    5 + index,
  )));
  return dedupeList([
    ...sampleMovePool(preferredOffense.length ? preferredOffense : typedMoves, stage >= 3 ? 7 : stage === 2 ? 6 : 5, seed * 7 + stage * 5, 3 + stage),
    ...sampleMovePool(supportMoves, stage >= 3 ? 5 : 4, seed * 5 + 17, 4),
    ...sampleMovePool(alternateOffense, stage >= 3 ? 4 : 3, seed * 3 + 29, 5),
    ...sampleMovePool(finisherMoves, stage >= 3 ? 3 : 2, seed * 11 + 7, 6),
    ...sampleMovePool(accurateMoves, 2, seed * 19 + 3, 7),
    ...coverageMoves,
  ], limit);
}

const BRANCH_STAT_PROFILES = [
  { hp: 1.04, atk: 1.18, def: 1.02, spa: 1.08, spd: 1, spe: 1.12 },
  { hp: 1.08, atk: 1.02, def: 1.2, spa: 1.06, spd: 1.14, spe: 0.98 },
  { hp: 1, atk: 1.04, def: 1.02, spa: 1.22, spd: 1.1, spe: 1.08 },
  { hp: 1.12, atk: 1.12, def: 1.08, spa: 1.12, spd: 1.08, spe: 1.02 },
];

function shiftBranchStats(baseStats, profileIndex, stage) {
  const profile = BRANCH_STAT_PROFILES[profileIndex % BRANCH_STAT_PROFILES.length];
  const stageBonus = stage === 2 ? 6 : stage === 3 ? 14 : 24;
  return Object.fromEntries(STAT_KEYS.map((key) => {
    const scaled = Math.max(24, Math.floor(baseStats[key] * (profile[key] || 1)) + stageBonus);
    return [key, scaled];
  }));
}

function dedupeList(values, limit = null) {
  const unique = [...new Set((values || []).filter(Boolean))];
  return limit ? unique.slice(0, limit) : unique;
}

function createBranchSpeciesEntry(families, anchorSpecies, moveIdsByType, moveLookup, {
  nameSuffix,
  branchIndex = 0,
  stage = 2,
  seed = 0,
  rarity = null,
  types = null,
}) {
  const branchTypes = dedupeList(types || [
    ...(anchorSpecies.types || []),
    TYPES[(anchorSpecies.family * 11 + seed * 7 + stage * 3) % TYPES.length],
  ], 2);
  const stats = shiftBranchStats(anchorSpecies.baseStats, branchIndex + seed, stage);
  const movePool = dedupeList([
    ...anchorSpecies.movePool,
    ...buildTypeMovePool(
      branchTypes.length ? branchTypes : anchorSpecies.types,
      stage,
      anchorSpecies.family * 7 + seed * 11 + branchIndex,
      moveIdsByType,
      moveLookup,
      stage === 4 ? 20 : 18,
      stats,
    ),
  ], stage === 4 ? 20 : 18);
  const id = families.length + 1;
  return {
    id,
    slug: slugify(`${anchorSpecies.name}-${nameSuffix}`),
    name: `${anchorSpecies.name} ${nameSuffix}`,
    stage,
    types: branchTypes.length ? branchTypes : [...anchorSpecies.types],
    biome: anchorSpecies.biome,
    family: anchorSpecies.family,
    starterEligible: false,
    starterCost: clamp(Math.ceil(totalStats(stats) / 95), 4, 10),
    catchRate: stage === 2 ? 0.24 : stage === 3 ? 0.14 : 0.08,
    baseStats: stats,
    movePool,
    abilityPool: buildAbilityPoolForSpecies(branchTypes.length ? branchTypes : anchorSpecies.types),
    hiddenAbilitySlug: hiddenAbilitySlugForSpecies(branchTypes.length ? branchTypes : anchorSpecies.types, anchorSpecies.family, stage),
    evolvesTo: null,
    evolveLevel: null,
    evolveStoneSlugs: stage < 4 ? buildEvolutionStoneOptions(branchTypes.length ? branchTypes : anchorSpecies.types, anchorSpecies.family + seed, stage) : [],
    stoneEvolutionMap: {},
    rarity: rarity || (stage === 2 ? 'rare' : stage === 3 ? 'epic' : 'legendary'),
    total: totalStats(stats),
    branchOf: anchorSpecies.id,
  };
}

function appendBranchSpecies(families, moveIdsByType, moveLookup) {
  const baseFamilies = new Map();
  families.forEach((species) => {
    if (!baseFamilies.has(species.family)) {
      baseFamilies.set(species.family, []);
    }
    baseFamilies.get(species.family).push(species);
  });

  for (const [familyId, line] of baseFamilies.entries()) {
    const sorted = [...line].sort((left, right) => left.stage - right.stage);
    const stage1 = sorted.find((entry) => entry.stage === 1);
    const stage2 = sorted.find((entry) => entry.stage === 2);
    const stage3 = sorted.find((entry) => entry.stage === 3);
    if (!stage1 || !stage2 || !stage3) {
      continue;
    }

    if (familyId % 5 === 0) {
      const branchStone = stage1.evolveStoneSlugs?.[1] || stage1.evolveStoneSlugs?.[0] || 'prism-stone';
      const branchTwo = createBranchSpeciesEntry(families, stage1, moveIdsByType, moveLookup, {
        nameSuffix: capitalized(BRANCH_STAGE_TWO_SUFFIXES[familyId % BRANCH_STAGE_TWO_SUFFIXES.length]),
        branchIndex: familyId,
        stage: 2,
        seed: 1,
      });
      families.push(branchTwo);
      stage1.stoneEvolutionMap = { ...(stage1.stoneEvolutionMap || {}), [branchStone]: branchTwo.id };
      stage1.evolveStoneSlugs = dedupeList([...(stage1.evolveStoneSlugs || []), branchStone], 5);

      const branchThree = createBranchSpeciesEntry(families, branchTwo, moveIdsByType, moveLookup, {
        nameSuffix: capitalized(BRANCH_STAGE_THREE_SUFFIXES[familyId % BRANCH_STAGE_THREE_SUFFIXES.length]),
        branchIndex: familyId + 1,
        stage: 3,
        seed: 2,
      });
      families.push(branchThree);
      branchTwo.evolvesTo = branchThree.id;
      branchTwo.evolveLevel = 28 + (familyId % 8);

      if (familyId % 10 === 0) {
        const branchFour = createBranchSpeciesEntry(families, branchThree, moveIdsByType, moveLookup, {
          nameSuffix: capitalized(BRANCH_STAGE_FOUR_SUFFIXES[familyId % BRANCH_STAGE_FOUR_SUFFIXES.length]),
          branchIndex: familyId + 2,
          stage: 4,
          seed: 3,
          rarity: 'legendary',
        });
        families.push(branchFour);
        branchThree.evolvesTo = branchFour.id;
        branchThree.evolveLevel = 58 + (familyId % 9);
      }
    }

    if (familyId % 6 === 0) {
      const branchStone = stage2.evolveStoneSlugs?.[2] || stage2.evolveStoneSlugs?.[0] || 'prism-stone';
      const altThree = createBranchSpeciesEntry(families, stage2, moveIdsByType, moveLookup, {
        nameSuffix: capitalized(BRANCH_STAGE_THREE_SUFFIXES[(familyId + 3) % BRANCH_STAGE_THREE_SUFFIXES.length]),
        branchIndex: familyId + 3,
        stage: 3,
        seed: 4,
      });
      families.push(altThree);
      stage2.stoneEvolutionMap = { ...(stage2.stoneEvolutionMap || {}), [branchStone]: altThree.id };
      stage2.evolveStoneSlugs = dedupeList([...(stage2.evolveStoneSlugs || []), branchStone], 5);

      if (familyId % 12 === 0) {
        const altFour = createBranchSpeciesEntry(families, altThree, moveIdsByType, moveLookup, {
          nameSuffix: capitalized(BRANCH_STAGE_FOUR_SUFFIXES[(familyId + 4) % BRANCH_STAGE_FOUR_SUFFIXES.length]),
          branchIndex: familyId + 4,
          stage: 4,
          seed: 5,
          rarity: 'legendary',
        });
        families.push(altFour);
        altThree.evolvesTo = altFour.id;
        altThree.evolveLevel = 56 + (familyId % 10);
      }
    }

    if (familyId % 11 === 0) {
      const apex = createBranchSpeciesEntry(families, stage3, moveIdsByType, moveLookup, {
        nameSuffix: capitalized(STAGE_FOUR_SUFFIXES[familyId % STAGE_FOUR_SUFFIXES.length]),
        branchIndex: familyId + 5,
        stage: 4,
        seed: 6,
        rarity: 'legendary',
      });
      families.push(apex);
      stage3.evolvesTo = apex.id;
      stage3.evolveLevel = 60 + (familyId % 8);
    }
  }
}

function buildSpecies(moves) {
  const families = [];
  const moveLookup = new Map(moves.map((move) => [move.id, move]));
  const moveIdsByType = new Map(TYPES.map((type) => [type, moves.filter((move) => move.type === type).map((move) => move.id)]));
  let rootIndex = 0;

  for (let family = 0; family < 183; family += 1) {
    const typeA = TYPES[family % TYPES.length];
    const altIndex = (family * 7 + 3) % TYPES.length;
    const typeB = family % 4 === 0 && TYPES[altIndex] !== typeA ? TYPES[altIndex] : null;
    const root = (MONSTER_ROOT_A[rootIndex % MONSTER_ROOT_A.length]) + (MONSTER_ROOT_B[Math.floor(rootIndex / MONSTER_ROOT_A.length) % MONSTER_ROOT_B.length]);
    rootIndex += 1;
    const seed = family * 41 + 9;
    const rng = seeded(seed);
    const biome = BIOMES[family % BIOMES.length];

    for (let stage = 1; stage <= 3; stage += 1) {
      const id = families.length + 1;
      const stageSuffix = stage === 1
        ? MONSTER_ROOT_B[(family + stage) % MONSTER_ROOT_B.length]
        : stage === 2
          ? STAGE_TWO_SUFFIXES[(family + stage) % STAGE_TWO_SUFFIXES.length]
          : STAGE_THREE_SUFFIXES[(family + stage) % STAGE_THREE_SUFFIXES.length];
      const name = (root + stageSuffix).replace(/(.)\1{2,}/g, '$1$1');
      const base = 38 + family % 22 + stage * 9;
      const types = typeB ? [typeA, typeB] : [typeA];
      const stats = {
        hp: base + seededInt(rng, 6, 18) + stage * 10,
        atk: base + seededInt(rng, 6, 18) + (typeA === 'fighting' || typeA === 'ground' || typeA === 'dragon' ? 12 : 5) + stage * 7,
        def: base + seededInt(rng, 6, 18) + (typeA === 'rock' || typeA === 'steel' ? 12 : 4) + stage * 6,
        spa: base + seededInt(rng, 6, 18) + (typeA === 'psychic' || typeA === 'fire' || typeA === 'electric' ? 12 : 5) + stage * 7,
        spd: base + seededInt(rng, 6, 18) + (typeA === 'water' || typeA === 'fairy' ? 10 : 4) + stage * 6,
        spe: base + seededInt(rng, 6, 18) + (typeA === 'flying' || typeA === 'electric' ? 12 : 5) + stage * 7,
      };
      const total = totalStats(stats);
      const starterCost = stage === 1 ? clamp(Math.ceil(total / 110), 1, 6) : clamp(Math.ceil(total / 95), 4, 9);
      const movePool = buildTypeMovePool(types, stage, family * 41 + stage * 17, moveIdsByType, moveLookup, 24, stats);
      families.push({
        id,
        slug: slugify(name),
        name,
        stage,
        types,
        biome,
        family: family + 1,
        starterEligible: stage === 1,
        starterCost,
        catchRate: stage === 1 ? 0.42 : stage === 2 ? 0.28 : 0.16,
        baseStats: stats,
        movePool: movePool.slice(0, 18),
        abilityPool: buildAbilityPoolForSpecies(types),
        hiddenAbilitySlug: hiddenAbilitySlugForSpecies(types, family, stage),
        evolvesTo: stage < 3 ? id + 1 : null,
        evolveLevel: stage === 1 ? 16 + (family % 4) : stage === 2 ? 34 + (family % 6) : null,
        evolveStoneSlugs: stage < 3 ? buildEvolutionStoneOptions(types, family, stage) : [],
        stoneEvolutionMap: {},
        rarity: stage === 1 ? 'common' : stage === 2 ? 'rare' : 'epic',
        total,
      });
    }
  }

  appendBranchSpecies(families, moveIdsByType, moveLookup);

  families.push({
    id: families.length + 1,
    slug: 'astravault-omega',
    name: 'Astravault Omega',
    stage: 3,
    types: ['dragon', 'steel'],
    biome: 'Celestial Gate',
    family: 184,
    starterEligible: false,
    starterCost: 10,
    catchRate: 0.05,
    baseStats: { hp: 126, atk: 128, def: 122, spa: 132, spd: 124, spe: 118 },
    movePool: buildTypeMovePool(['dragon', 'steel'], 3, 1840, moveIdsByType, moveLookup, 24, { hp: 126, atk: 128, def: 122, spa: 132, spd: 124, spe: 118 }),
    abilityPool: ['pressure', 'multiscale', 'adaptability'],
    hiddenAbilitySlug: 'prism-surge',
    evolvesTo: null,
    evolveLevel: null,
    evolveStoneSlugs: [],
    stoneEvolutionMap: {},
    rarity: 'mythic',
    total: 750,
  });

  const legendarySpecies = [
    {
      slug: 'thornwyrm-regaia',
      name: 'Thornwyrm Regaia',
      types: ['grass', 'dragon'],
      biome: 'Starroot Vale',
      moveTypes: ['grass', 'dragon'],
      baseStats: { hp: 112, atk: 128, def: 118, spa: 120, spd: 116, spe: 106 },
    },
    {
      slug: 'coilvolt-zeros',
      name: 'Coilvolt Zeros',
      types: ['electric', 'steel'],
      biome: 'Static Vault',
      moveTypes: ['electric', 'steel'],
      baseStats: { hp: 104, atk: 116, def: 120, spa: 132, spd: 116, spe: 120 },
    },
    {
      slug: 'mourningveil-noctra',
      name: 'Mourningveil Noctra',
      types: ['ghost', 'dark'],
      biome: 'Phantom Moor',
      moveTypes: ['ghost', 'dark'],
      baseStats: { hp: 108, atk: 124, def: 110, spa: 126, spd: 120, spe: 112 },
    },
    {
      slug: 'peaklord-aerion',
      name: 'Peaklord Aerion',
      types: ['rock', 'flying'],
      biome: 'Howling Mesa',
      moveTypes: ['rock', 'flying'],
      baseStats: { hp: 118, atk: 130, def: 122, spa: 102, spd: 110, spe: 110 },
    },
    {
      slug: 'tidesaint-nautila',
      name: 'Tidesaint Nautila',
      types: ['water', 'fairy'],
      biome: 'Aurora Reef',
      moveTypes: ['water', 'fairy'],
      baseStats: { hp: 116, atk: 98, def: 116, spa: 134, spd: 126, spe: 110 },
    },
    {
      slug: 'ashcrown-vulcaros',
      name: 'Ashcrown Vulcaros',
      types: ['fire', 'ground'],
      biome: 'Ashen Crater',
      moveTypes: ['fire', 'ground'],
      baseStats: { hp: 114, atk: 132, def: 112, spa: 124, spd: 108, spe: 112 },
    },
    {
      slug: 'frostoracle-syra',
      name: 'Frostoracle Syra',
      types: ['ice', 'psychic'],
      biome: 'Silver Tundra',
      moveTypes: ['ice', 'psychic'],
      baseStats: { hp: 106, atk: 96, def: 108, spa: 136, spd: 128, spe: 122 },
    },
    {
      slug: 'ironmyth-basilux',
      name: 'Ironmyth Basilux',
      types: ['steel', 'dragon'],
      biome: 'Celestial Gate',
      moveTypes: ['steel', 'dragon'],
      baseStats: { hp: 120, atk: 130, def: 126, spa: 126, spd: 122, spe: 106 },
    },
    {
      slug: 'glassstinger-nihilisk',
      name: 'Glassstinger Nihilisk',
      types: ['bug', 'poison'],
      biome: 'Moonlit Fen',
      moveTypes: ['bug', 'poison'],
      baseStats: { hp: 100, atk: 138, def: 96, spa: 128, spd: 98, spe: 140 },
      rarity: 'mythic',
    },
    {
      slug: 'voidmantle-kartrek',
      name: 'Voidmantle Kartrek',
      types: ['steel', 'dark'],
      biome: 'Brass Bastion',
      moveTypes: ['steel', 'dark'],
      baseStats: { hp: 98, atk: 142, def: 124, spa: 108, spd: 110, spe: 132 },
      rarity: 'legendary',
    },
    {
      slug: 'riftsurge-guzzolume',
      name: 'Riftsurge Guzzolume',
      types: ['dragon', 'electric'],
      biome: 'Static Vault',
      moveTypes: ['dragon', 'electric'],
      baseStats: { hp: 126, atk: 136, def: 108, spa: 134, spd: 108, spe: 118 },
      rarity: 'mythic',
    },
  ];

  legendarySpecies.forEach((entry, index) => {
    const id = families.length + 1;
    const movePool = buildTypeMovePool(entry.moveTypes, 3, 2200 + index * 19, moveIdsByType, moveLookup, 24, entry.baseStats);
    families.push({
      id,
      slug: entry.slug,
      name: entry.name,
      stage: 3,
      types: entry.types,
      biome: entry.biome,
      family: 184 + index,
      starterEligible: false,
      starterCost: 10,
      catchRate: 0.06,
      baseStats: entry.baseStats,
      movePool,
      abilityPool: buildAbilityPoolForSpecies(entry.types),
      hiddenAbilitySlug: hiddenAbilitySlugForSpecies(entry.types, 184 + index, 3),
      evolvesTo: null,
      evolveLevel: null,
      evolveStoneSlugs: [],
      stoneEvolutionMap: {},
      rarity: entry.rarity || 'legendary',
      total: totalStats(entry.baseStats),
    });
  });

  return families;
}

function capitalized(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function titleLabel(value) {
  const text = String(value || '').replace(/-/g, ' ').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function defaultStages() {
  return { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, accuracy: 0, evasion: 0 };
}

function enrichCatalogItem(item) {
  const inferredGroup = item.group
    || (item.category === 'capture' ? 'pokeballs'
      : item.category === 'hold' ? 'hold-items'
      : item.category === 'evolution' ? 'evolution-stones'
      : item.category === 'mint' ? 'mints'
      : item.category === 'berry' ? 'berries'
      : item.category === 'ability' ? 'ability-lab'
      : item.category === 'regression' ? 'training-lab'
      : item.category === 'battle-stage' || item.category === 'battle-crit' || item.category === 'battle-utility' ? 'battle-items'
      : item.category === 'healing' || item.category === 'pp' || item.category === 'status' || item.category === 'revive' || item.category === 'level' || item.category === 'buff' || item.category === 'team-heal' ? 'medicine'
      : item.category === 'machine' ? 'machines'
      : item.category === 'material' ? 'materials'
      : 'general');
  const carryIntoRun = item.carryIntoRun !== undefined
    ? item.carryIntoRun
    : inferredGroup === 'pokeballs' || inferredGroup === 'battle-items' || inferredGroup === 'medicine';
  const runShop = item.runShop !== undefined
    ? item.runShop
    : inferredGroup === 'pokeballs' || inferredGroup === 'battle-items' || inferredGroup === 'medicine';
  const marketEnabled = item.marketEnabled !== undefined
    ? item.marketEnabled
    : inferredGroup !== 'machines' && inferredGroup !== 'materials';

  return {
    unlockWave: 1,
    price: 220,
    rarity: 'common',
    marketEnabled,
    runShop,
    carryIntoRun,
    ...item,
    group: inferredGroup,
  };
}

function registerItemCatalogEntries(entries) {
  const known = new Set(ITEMS.map((item) => item.slug));
  entries.map(enrichCatalogItem).forEach((item) => {
    if (known.has(item.slug)) {
      return;
    }
    ITEMS.push(item);
    known.add(item.slug);
  });
}

function expandItemCatalog() {
  for (let index = 0; index < ITEMS.length; index += 1) {
    ITEMS[index] = enrichCatalogItem(ITEMS[index]);
  }

  const standardBalls = [
    ['poke-ball', 'Poke Ball', 160, 1, 'A standard Poke Ball used to catch wild monsters.', 0.02],
    ['great-ball', 'Great Ball', 320, 4, 'A better ball with a stronger catch rate than a Poke Ball.', 0.12],
    ['ultra-ball', 'Ultra Ball', 620, 10, 'A high-performance ball with a strong catch rate.', 0.24],
    ['master-ball', 'Master Ball', 4000, 30, 'A rare ball that catches without fail.', 1],
    ['quick-ball', 'Quick Ball', 520, 8, 'Works best at the start of an encounter.', 0.18],
    ['timer-ball', 'Timer Ball', 480, 10, 'Performs better the longer a battle lasts.', 0.1],
    ['dusk-ball', 'Dusk Ball', 460, 9, 'Performs better in dark or strange biomes.', 0.16],
    ['net-ball', 'Net Ball', 420, 7, 'Especially effective on bug and water monsters.', 0.14],
    ['dive-ball', 'Dive Ball', 400, 7, 'Performs better on aquatic monsters.', 0.14],
    ['nest-ball', 'Nest Ball', 360, 5, 'Works well on low-level monsters.', 0.12],
    ['repeat-ball', 'Repeat Ball', 360, 9, 'Works better on species already in storage.', 0.12],
    ['friend-ball', 'Friend Ball', 340, 6, 'Gentle catch tool for friendlier recruitment.', 0.08],
    ['luxury-ball', 'Luxury Ball', 520, 9, 'A premium ball used for prized catches.', 0.1],
    ['heal-ball', 'Heal Ball', 300, 5, 'Heals the caught monster after capture.', 0.06],
    ['premier-ball', 'Premier Ball', 220, 3, 'A commemorative ball with standard performance.', 0.03],
    ['beast-ball', 'Beast Ball', 680, 15, 'A specialist ball for rare anomalies.', -0.05],
    ['dream-ball', 'Dream Ball', 560, 12, 'A curious ball that works best on weakened foes.', 0.14],
    ['fast-ball', 'Fast Ball', 420, 8, 'Catches swift targets more easily.', 0.12],
    ['level-ball', 'Level Ball', 430, 8, 'Works best when your active monster outlevels the target.', 0.12],
    ['heavy-ball', 'Heavy Ball', 430, 8, 'Works best on bulky targets.', 0.12],
    ['love-ball', 'Love Ball', 420, 8, 'A themed ball with a modest catch boost.', 0.08],
    ['moon-ball', 'Moon Ball', 420, 8, 'A niche ball for mystic species.', 0.08],
    ['lure-ball', 'Lure Ball', 410, 8, 'Useful for aquatic encounters.', 0.1],
    ['safari-ball', 'Safari Ball', 260, 4, 'A classic field ball.', 0.05],
    ['sport-ball', 'Sport Ball', 260, 4, 'A special event ball.', 0.05],
  ].map(([slug, name, price, unlockWave, description, captureBonus]) => ({
    slug,
    name,
    category: 'capture',
    group: 'pokeballs',
    price,
    unlockWave,
    description,
    captureBonus,
  }));

  const battleItems = [
    ['x-attack', 'X Attack', 'Boosts Attack by 1 stage in battle.', 'atk', 1, 180],
    ['x-attack-2', 'X Attack 2', 'Boosts Attack by 2 stages in battle.', 'atk', 2, 360],
    ['x-defense', 'X Defense', 'Boosts Defense by 1 stage in battle.', 'def', 1, 180],
    ['x-defense-2', 'X Defense 2', 'Boosts Defense by 2 stages in battle.', 'def', 2, 360],
    ['x-sp-atk', 'X Sp. Atk', 'Boosts Special Attack by 1 stage in battle.', 'spa', 1, 180],
    ['x-sp-atk-2', 'X Sp. Atk 2', 'Boosts Special Attack by 2 stages in battle.', 'spa', 2, 360],
    ['x-sp-def', 'X Sp. Def', 'Boosts Special Defense by 1 stage in battle.', 'spd', 1, 180],
    ['x-sp-def-2', 'X Sp. Def 2', 'Boosts Special Defense by 2 stages in battle.', 'spd', 2, 360],
    ['x-speed', 'X Speed', 'Boosts Speed by 1 stage in battle.', 'spe', 1, 180],
    ['x-speed-2', 'X Speed 2', 'Boosts Speed by 2 stages in battle.', 'spe', 2, 360],
    ['x-accuracy', 'X Accuracy', 'Boosts Accuracy by 1 stage in battle.', 'accuracy', 1, 180],
    ['x-accuracy-2', 'X Accuracy 2', 'Boosts Accuracy by 2 stages in battle.', 'accuracy', 2, 360],
    ['aux-evasion', 'Aux Evasion', 'Boosts evasion by 2 stages in battle.', 'evasion', 2, 320],
  ].map(([slug, name, description, stat, stages, price]) => ({
    slug,
    name,
    category: 'battle-stage',
    group: 'battle-items',
    description,
    stat,
    stages,
    price,
    unlockWave: 4,
  }));

  const battleUtility = [
    { slug: 'dire-hit', name: 'Dire Hit', category: 'battle-crit', group: 'battle-items', description: 'Raises critical-hit rate by 1 step in battle.', critBoost: 1, price: 220, unlockWave: 4 },
    { slug: 'dire-hit-2', name: 'Dire Hit 2', category: 'battle-crit', group: 'battle-items', description: 'Raises critical-hit rate by 2 steps in battle.', critBoost: 2, price: 420, unlockWave: 8 },
    { slug: 'guard-spec', name: 'Guard Spec.', category: 'battle-utility', group: 'battle-items', description: 'Creates a temporary shield against stat disruption.', effect: 'guard-spec', price: 260, unlockWave: 6 },
    { slug: 'aux-power', name: 'Aux Power', category: 'battle-stage', group: 'battle-items', description: 'Sharply boosts offensive stats in battle.', multiStats: ['atk', 'spa'], stages: 2, price: 420, unlockWave: 8 },
    { slug: 'aux-guard', name: 'Aux Guard', category: 'battle-stage', group: 'battle-items', description: 'Sharply boosts defensive stats in battle.', multiStats: ['def', 'spd'], stages: 2, price: 420, unlockWave: 8 },
    { slug: 'aux-powerguard', name: 'Aux Powerguard', category: 'battle-stage', group: 'battle-items', description: 'Sharply boosts both offense and defense in battle.', multiStats: ['atk', 'spa', 'def', 'spd'], stages: 2, price: 620, unlockWave: 12 },
    { slug: 'reset-urge', name: 'Reset Urge', category: 'battle-utility', group: 'battle-items', description: 'Resets temporary stage changes on the active monster.', effect: 'reset-stages', price: 260, unlockWave: 7 },
    { slug: 'roto-boost', name: 'Roto Boost', category: 'battle-stage', group: 'battle-items', description: 'Raises all core combat stats by 1 stage.', multiStats: ['atk', 'def', 'spa', 'spd', 'spe'], stages: 1, price: 680, unlockWave: 14 },
  ];

  const extraMedicine = [
    { slug: 'full-heal', name: 'Full Heal', category: 'status', group: 'medicine', price: 180, unlockWave: 3, description: 'Cures any major status condition from the active monster.' },
    { slug: 'full-restore', name: 'Full Restore', category: 'healing', group: 'medicine', price: 1200, unlockWave: 18, description: 'Fully restores HP and clears status on the active monster.', amount: 9999, fullRestore: true },
    { slug: 'fresh-water', name: 'Fresh Water', category: 'healing', group: 'medicine', price: 120, unlockWave: 2, description: 'Restores 30 HP.', amount: 30 },
    { slug: 'soda-pop', name: 'Soda Pop', category: 'healing', group: 'medicine', price: 180, unlockWave: 5, description: 'Restores 50 HP.', amount: 50 },
    { slug: 'lemonade', name: 'Lemonade', category: 'healing', group: 'medicine', price: 260, unlockWave: 6, description: 'Restores 70 HP.', amount: 70 },
    { slug: 'moomoo-milk', name: 'Moomoo Milk', category: 'healing', group: 'medicine', price: 320, unlockWave: 8, description: 'Restores 100 HP.', amount: 100 },
    { slug: 'max-ether', name: 'Max Ether', category: 'pp', group: 'medicine', price: 520, unlockWave: 12, description: 'Fully restores PP to one move set on the active monster.', amount: 99 },
    { slug: 'max-elixir', name: 'Max Elixir', category: 'pp', group: 'medicine', price: 900, unlockWave: 20, description: 'Fully restores all PP on the active monster.', amount: 99 },
    { slug: 'berry-juice', name: 'Berry Juice', category: 'healing', group: 'medicine', price: 140, unlockWave: 3, description: 'Restores 20 HP.', amount: 20 },
    { slug: 'burn-heal', name: 'Burn Heal', category: 'status', group: 'medicine', price: 80, unlockWave: 2, description: 'Cures a burn from the active monster.', cures: ['burn'] },
    { slug: 'paralyze-heal', name: 'Paralyze Heal', category: 'status', group: 'medicine', price: 80, unlockWave: 2, description: 'Cures paralysis from the active monster.', cures: ['paralyze'] },
    { slug: 'ice-heal', name: 'Ice Heal', category: 'status', group: 'medicine', price: 80, unlockWave: 2, description: 'Cures freeze from the active monster.', cures: ['freeze'] },
    { slug: 'awakening', name: 'Awakening', category: 'status', group: 'medicine', price: 80, unlockWave: 2, description: 'Wakes a sleeping monster.', cures: ['sleep'] },
    { slug: 'big-malasada', name: 'Big Malasada', category: 'status', group: 'medicine', price: 260, unlockWave: 8, description: 'Heals all major status conditions.', cures: ['burn', 'poison', 'paralyze', 'freeze', 'sleep'] },
    { slug: 'lava-cookie', name: 'Lava Cookie', category: 'status', group: 'medicine', price: 260, unlockWave: 8, description: 'Heals all major status conditions.', cures: ['burn', 'poison', 'paralyze', 'freeze', 'sleep'] },
    { slug: 'old-gateau', name: 'Old Gateau', category: 'status', group: 'medicine', price: 260, unlockWave: 8, description: 'Heals all major status conditions.', cures: ['burn', 'poison', 'paralyze', 'freeze', 'sleep'] },
    { slug: 'casteliacone', name: 'Casteliacone', category: 'status', group: 'medicine', price: 260, unlockWave: 8, description: 'Heals all major status conditions.', cures: ['burn', 'poison', 'paralyze', 'freeze', 'sleep'] },
    { slug: 'rage-candy-bar', name: 'Rage Candy Bar', category: 'status', group: 'medicine', price: 260, unlockWave: 8, description: 'Heals all major status conditions.', cures: ['burn', 'poison', 'paralyze', 'freeze', 'sleep'] },
  ];

  const berryEntries = [
    ['oran-berry', 'Oran Berry', 'Heals 10 HP when HP gets low.', 'heal-low', 0, 120],
    ['sitrus-berry', 'Sitrus Berry', 'Heals 25% HP when HP gets low.', 'heal-low-percent', 0.25, 180],
    ['lum-berry', 'Lum Berry', 'Cures any major status condition once.', 'cure-any', 0, 220],
    ['cheri-berry', 'Cheri Berry', 'Cures paralysis once.', 'cure-status', 'paralyze', 120],
    ['pecha-berry', 'Pecha Berry', 'Cures poison once.', 'cure-status', 'poison', 120],
    ['rawst-berry', 'Rawst Berry', 'Cures burn once.', 'cure-status', 'burn', 120],
    ['aspear-berry', 'Aspear Berry', 'Cures freeze once.', 'cure-status', 'freeze', 120],
    ['chesto-berry', 'Chesto Berry', 'Cures sleep once.', 'cure-status', 'sleep', 120],
    ['liechi-berry', 'Liechi Berry', 'Raises Attack when HP gets low.', 'boost-low', 'atk', 220],
    ['ganlon-berry', 'Ganlon Berry', 'Raises Defense when HP gets low.', 'boost-low', 'def', 220],
    ['petaya-berry', 'Petaya Berry', 'Raises Special Attack when HP gets low.', 'boost-low', 'spa', 220],
    ['apicot-berry', 'Apicot Berry', 'Raises Special Defense when HP gets low.', 'boost-low', 'spd', 220],
    ['salac-berry', 'Salac Berry', 'Raises Speed when HP gets low.', 'boost-low', 'spe', 220],
    ['lansat-berry', 'Lansat Berry', 'Raises critical-hit rate when HP gets low.', 'crit-low', 1, 260],
    ['occa-berry', 'Occa Berry', 'Weakens one supereffective Fire-type attack.', 'resist-type', 'fire', 180],
    ['passho-berry', 'Passho Berry', 'Weakens one supereffective Water-type attack.', 'resist-type', 'water', 180],
    ['wacan-berry', 'Wacan Berry', 'Weakens one supereffective Electric-type attack.', 'resist-type', 'electric', 180],
    ['rindo-berry', 'Rindo Berry', 'Weakens one supereffective Grass-type attack.', 'resist-type', 'grass', 180],
    ['yache-berry', 'Yache Berry', 'Weakens one supereffective Ice-type attack.', 'resist-type', 'ice', 180],
    ['chople-berry', 'Chople Berry', 'Weakens one supereffective Fighting-type attack.', 'resist-type', 'fighting', 180],
    ['kebia-berry', 'Kebia Berry', 'Weakens one supereffective Poison-type attack.', 'resist-type', 'poison', 180],
    ['shuca-berry', 'Shuca Berry', 'Weakens one supereffective Ground-type attack.', 'resist-type', 'ground', 180],
    ['coba-berry', 'Coba Berry', 'Weakens one supereffective Flying-type attack.', 'resist-type', 'flying', 180],
    ['payapa-berry', 'Payapa Berry', 'Weakens one supereffective Psychic-type attack.', 'resist-type', 'psychic', 180],
    ['tanga-berry', 'Tanga Berry', 'Weakens one supereffective Bug-type attack.', 'resist-type', 'bug', 180],
    ['charti-berry', 'Charti Berry', 'Weakens one supereffective Rock-type attack.', 'resist-type', 'rock', 180],
    ['kasib-berry', 'Kasib Berry', 'Weakens one supereffective Ghost-type attack.', 'resist-type', 'ghost', 180],
    ['haban-berry', 'Haban Berry', 'Weakens one supereffective Dragon-type attack.', 'resist-type', 'dragon', 180],
    ['colbur-berry', 'Colbur Berry', 'Weakens one supereffective Dark-type attack.', 'resist-type', 'dark', 180],
    ['babiri-berry', 'Babiri Berry', 'Weakens one supereffective Steel-type attack.', 'resist-type', 'steel', 180],
    ['roseli-berry', 'Roseli Berry', 'Weakens one supereffective Fairy-type attack.', 'resist-type', 'fairy', 180],
  ].map(([slug, name, description, berryEffect, berryValue, price]) => ({
    slug,
    name,
    category: 'hold',
    group: 'berries',
    description,
    holdEffect: 'berry',
    berryEffect,
    berryValue,
    price,
    unlockWave: 4,
    carryIntoRun: false,
    runShop: false,
  }));

  const supportedHoldItems = [
    { slug: 'leftovers', name: 'Leftovers', category: 'hold', group: 'hold-items', price: 720, unlockWave: 12, description: 'Restores a little HP at the end of each turn.', holdEffect: 'leftovers' },
    { slug: 'life-orb', name: 'Life Orb', category: 'hold', group: 'hold-items', price: 880, unlockWave: 14, description: 'Boosts move damage, but chips the holder after attacking.', holdEffect: 'life-orb' },
    { slug: 'choice-band', name: 'Choice Band', category: 'hold', group: 'hold-items', price: 840, unlockWave: 12, description: 'Raises Attack but locks the holder into one move until switching out.', holdEffect: 'choice-band' },
    { slug: 'choice-specs', name: 'Choice Specs', category: 'hold', group: 'hold-items', price: 840, unlockWave: 12, description: 'Raises Special Attack but locks the holder into one move until switching out.', holdEffect: 'choice-specs' },
    { slug: 'choice-scarf', name: 'Choice Scarf', category: 'hold', group: 'hold-items', price: 840, unlockWave: 12, description: 'Raises Speed but locks the holder into one move until switching out.', holdEffect: 'choice-scarf' },
    { slug: 'assault-vest', name: 'Assault Vest', category: 'hold', group: 'hold-items', price: 760, unlockWave: 12, description: 'Raises Special Defense but blocks status moves.', holdEffect: 'assault-vest' },
    { slug: 'focus-sash', name: 'Focus Sash', category: 'hold', group: 'hold-items', price: 680, unlockWave: 10, description: 'Lets the holder survive one knockout blow from full HP.', holdEffect: 'focus-sash' },
    { slug: 'focus-band', name: 'Focus Band', category: 'hold', group: 'hold-items', price: 520, unlockWave: 9, description: 'May let the holder survive a knockout blow with 1 HP.', holdEffect: 'focus-band' },
    { slug: 'expert-belt', name: 'Expert Belt', category: 'hold', group: 'hold-items', price: 680, unlockWave: 11, description: 'Boosts super-effective damage.', holdEffect: 'expert-belt' },
    { slug: 'muscle-band', name: 'Muscle Band', category: 'hold', group: 'hold-items', price: 540, unlockWave: 10, description: 'Boosts physical move damage.', holdEffect: 'muscle-band' },
    { slug: 'wise-glasses', name: 'Wise Glasses', category: 'hold', group: 'hold-items', price: 540, unlockWave: 10, description: 'Boosts special move damage.', holdEffect: 'wise-glasses' },
    { slug: 'scope-lens', name: 'Scope Lens', category: 'hold', group: 'hold-items', price: 520, unlockWave: 10, description: 'Raises the holder\'s critical-hit rate.', holdEffect: 'scope-lens' },
    { slug: 'shell-bell', name: 'Shell Bell', category: 'hold', group: 'hold-items', price: 560, unlockWave: 10, description: 'Restores a portion of damage dealt as HP.', holdEffect: 'shell-bell' },
    { slug: 'big-root', name: 'Big Root', category: 'hold', group: 'hold-items', price: 520, unlockWave: 9, description: 'Improves HP drain from absorbing moves.', holdEffect: 'big-root' },
    { slug: 'rocky-helmet', name: 'Rocky Helmet', category: 'hold', group: 'hold-items', price: 640, unlockWave: 12, description: 'Damages attackers that strike physically.', holdEffect: 'rocky-helmet' },
    { slug: 'eviolite', name: 'Eviolite', category: 'hold', group: 'hold-items', price: 760, unlockWave: 14, description: 'Raises defenses on monsters that can still evolve.', holdEffect: 'eviolite' },
    { slug: 'covert-cloak', name: 'Covert Cloak', category: 'hold', group: 'hold-items', price: 620, unlockWave: 11, description: 'Blocks extra effects from enemy moves.', holdEffect: 'covert-cloak' },
    { slug: 'weakness-policy', name: 'Weakness Policy', category: 'hold', group: 'hold-items', price: 760, unlockWave: 13, description: 'Sharply raises offenses if hit super effectively.', holdEffect: 'weakness-policy' },
    { slug: 'wide-lens', name: 'Wide Lens', category: 'hold', group: 'hold-items', price: 460, unlockWave: 8, description: 'Slightly improves move accuracy.', holdEffect: 'wide-lens' },
    { slug: 'zoom-lens', name: 'Zoom Lens', category: 'hold', group: 'hold-items', price: 460, unlockWave: 8, description: 'Improves accuracy if the holder moves after the target.', holdEffect: 'zoom-lens' },
    { slug: 'clear-amulet', name: 'Clear Amulet', category: 'hold', group: 'hold-items', price: 620, unlockWave: 11, description: 'Helps block enemy stat disruption.', holdEffect: 'clear-amulet' },
    { slug: 'ability-shield', name: 'Ability Shield', category: 'hold', group: 'hold-items', price: 620, unlockWave: 11, description: 'Keeps the holder\'s ability online in chaos-heavy fights.', holdEffect: 'ability-shield' },
    { slug: 'power-bracer', name: 'Power Bracer', category: 'hold', group: 'hold-items', price: 560, unlockWave: 9, description: 'Raises Attack while held.', holdEffect: 'stat-boost', holdStat: 'atk', holdValue: 1.15 },
    { slug: 'guard-talisman', name: 'Guard Talisman', category: 'hold', group: 'hold-items', price: 560, unlockWave: 9, description: 'Raises Defense while held.', holdEffect: 'stat-boost', holdStat: 'def', holdValue: 1.15 },
    { slug: 'mind-ribbon', name: 'Mind Ribbon', category: 'hold', group: 'hold-items', price: 560, unlockWave: 9, description: 'Raises Special Attack while held.', holdEffect: 'stat-boost', holdStat: 'spa', holdValue: 1.15 },
    { slug: 'spirit-locket', name: 'Spirit Locket', category: 'hold', group: 'hold-items', price: 560, unlockWave: 9, description: 'Raises Special Defense while held.', holdEffect: 'stat-boost', holdStat: 'spd', holdValue: 1.15 },
    { slug: 'rush-boots', name: 'Rush Boots', category: 'hold', group: 'hold-items', price: 560, unlockWave: 9, description: 'Raises Speed while held.', holdEffect: 'stat-boost', holdStat: 'spe', holdValue: 1.15 },
    { slug: 'quick-claw', name: 'Quick Claw', category: 'hold', group: 'hold-items', price: 540, unlockWave: 9, description: 'May jump the holder ahead in turn order.', holdEffect: 'quick-claw' },
    { slug: 'kings-rock', name: 'King\'s Rock', category: 'hold', group: 'hold-items', price: 640, unlockWave: 12, description: 'Damaging moves gain a chance to flinch the target.', holdEffect: 'flinch-charm' },
    { slug: 'razor-fang', name: 'Razor Fang', category: 'hold', group: 'hold-items', price: 610, unlockWave: 11, description: 'Raises crit odds for sharp, high-pressure play.', holdEffect: 'crit-boost' },
    { slug: 'guardian-core', name: 'Guardian Core', category: 'hold', group: 'hold-items', price: 760, unlockWave: 13, description: 'Softens incoming super-effective attacks.', holdEffect: 'super-guard' },
    { slug: 'vital-shell', name: 'Vital Shell', category: 'hold', group: 'hold-items', price: 740, unlockWave: 12, description: 'A defensive relic that restores HP every turn.', holdEffect: 'leftovers' },
    { slug: 'berserker-emblem', name: 'Berserker Emblem', category: 'hold', group: 'hold-items', price: 590, unlockWave: 10, description: 'Boosts physical move damage for aggressive sets.', holdEffect: 'muscle-band' },
    { slug: 'sage-torc', name: 'Sage Torc', category: 'hold', group: 'hold-items', price: 590, unlockWave: 10, description: 'Boosts special move damage for caster builds.', holdEffect: 'wise-glasses' },
    { slug: 'iron-thorn', name: 'Iron Thorn', category: 'hold', group: 'hold-items', price: 660, unlockWave: 12, description: 'Returns contact pain to physical attackers.', holdEffect: 'rocky-helmet' },
    { slug: 'aura-mirror', name: 'Aura Mirror', category: 'hold', group: 'hold-items', price: 640, unlockWave: 12, description: 'Shields the holder from disruptive stat drops.', holdEffect: 'clear-amulet' },
    { slug: 'tempo-gyro', name: 'Tempo Gyro', category: 'hold', group: 'hold-items', price: 860, unlockWave: 14, description: 'A tuned speed relay for faster battle pacing.', holdEffect: 'choice-scarf' },
  ];

  const typeBoosters = [
    ['fire', 'Charcoal'],
    ['water', 'Mystic Water'],
    ['grass', 'Miracle Seed'],
    ['electric', 'Magnet'],
    ['ice', 'Never-Melt Ice'],
    ['fighting', 'Black Belt'],
    ['poison', 'Poison Barb'],
    ['ground', 'Soft Sand'],
    ['flying', 'Sharp Beak'],
    ['psychic', 'Twisted Spoon'],
    ['bug', 'Silver Powder'],
    ['rock', 'Hard Stone'],
    ['ghost', 'Spell Tag'],
    ['dragon', 'Dragon Fang'],
    ['dark', 'Black Glasses'],
    ['steel', 'Metal Coat'],
    ['fairy', 'Pixie Plate'],
    ['normal', 'Silk Scarf'],
    ['fire', 'Flame Plate'],
    ['water', 'Splash Plate'],
    ['grass', 'Meadow Plate'],
    ['electric', 'Zap Plate'],
    ['ice', 'Icicle Plate'],
    ['fighting', 'Fist Plate'],
    ['poison', 'Toxic Plate'],
    ['ground', 'Earth Plate'],
    ['flying', 'Sky Plate'],
    ['psychic', 'Mind Plate'],
    ['bug', 'Insect Plate'],
    ['rock', 'Stone Plate'],
    ['ghost', 'Spirit Plate'],
    ['dragon', 'Draco Plate'],
    ['dark', 'Dread Plate'],
    ['steel', 'Iron Plate'],
    ['fairy', 'Pixie Charm'],
    ['normal', 'Classic Crest'],
  ].map(([type, name]) => ({
    slug: slugify(name),
    name,
    category: 'hold',
    group: 'hold-items',
    price: 480,
    unlockWave: 9,
    description: 'Boosts ' + capitalized(type) + '-type moves when held.',
    holdEffect: 'type-boost',
    holdType: type,
  }));

  const mintItems = NATURES.map((nature) => ({
    slug: nature.slug + '-mint',
    name: nature.name + ' Mint',
    category: 'mint',
    group: 'mints',
    price: 620,
    unlockWave: 10,
    description: 'Changes the monster\'s nature to ' + nature.name + '.',
    targetNature: nature.slug,
    carryIntoRun: false,
    runShop: false,
  }));

    const trainingStatLabels = {
    hp: 'HP',
    atk: 'Attack',
    def: 'Defense',
    spa: 'Sp. Atk',
    spd: 'Sp. Def',
    spe: 'Speed',
  };
  const ivTrainingItems = [
    {
      slug: 'genome-maxer',
      name: 'Genome Maxer',
      category: 'iv',
      group: 'training-lab',
      price: 12800,
      unlockWave: 22,
      description: 'Sets every IV on the chosen monster to 31 from the Summary Screen.',
      ivMode: 'all-max',
      carryIntoRun: false,
      runShop: false,
    },
    ...STAT_KEYS.flatMap((statKey) => ([
      {
        slug: 'iv-' + statKey + '-maxer',
        name: trainingStatLabels[statKey] + ' IV Maxer',
        category: 'iv',
        group: 'training-lab',
        price: statKey === 'hp' ? 2400 : 2600,
        unlockWave: 16,
        description: 'Maxes the ' + trainingStatLabels[statKey] + ' IV on the chosen monster.',
        ivMode: 'set',
        ivStat: statKey,
        ivValue: 31,
        carryIntoRun: false,
        runShop: false,
      },
      {
        slug: 'iv-' + statKey + '-resetter',
        name: trainingStatLabels[statKey] + ' IV Resetter',
        category: 'iv',
        group: 'training-lab',
        price: 1100,
        unlockWave: 12,
        description: 'Clears the ' + trainingStatLabels[statKey] + ' IV back to 0 for rebuilds.',
        ivMode: 'set',
        ivStat: statKey,
        ivValue: 0,
        carryIntoRun: false,
        runShop: false,
      },
    ])),
  ];
  const evTrainingItems = STAT_KEYS.flatMap((statKey) => ([
    {
      slug: 'ev-' + statKey + '-maxer',
      name: trainingStatLabels[statKey] + ' EV Maxer',
      category: 'ev',
      group: 'training-lab',
      price: statKey === 'hp' ? 1800 : 1950,
      unlockWave: 14,
      description: 'Tunes the chosen monster so ' + trainingStatLabels[statKey] + ' reaches 252 EVs.',
      evMode: 'set',
      evStat: statKey,
      evValue: 252,
      carryIntoRun: false,
      runShop: false,
    },
    {
      slug: 'ev-' + statKey + '-remover',
      name: trainingStatLabels[statKey] + ' EV Remover',
      category: 'ev',
      group: 'training-lab',
      price: 780,
      unlockWave: 10,
      description: 'Removes every invested ' + trainingStatLabels[statKey] + ' EV for rebuilds.',
      evMode: 'set',
      evStat: statKey,
      evValue: 0,
      carryIntoRun: false,
      runShop: false,
    },
  ]));
  const trainingItems = [
    ...ivTrainingItems,
    ...evTrainingItems,
    {
      slug: 'ev-total-reset',
      name: 'Total EV Reset',
      category: 'ev',
      group: 'training-lab',
      price: 2400,
      unlockWave: 16,
      description: 'Wipes every EV back to 0 so you can rebuild the whole spread from scratch.',
      evMode: 'all-reset',
      carryIntoRun: false,
      runShop: false,
    },
  ];

  const evolutionItems = EVOLUTION_STONE_CATALOG.map((item) => ({
    ...item,
    category: 'evolution',
    group: 'evolution-stones',
    marketEnabled: true,
    runShop: false,
    carryIntoRun: false,
  }));

  const abilityItems = [
    {
      slug: 'ability-capsule',
      name: 'Ability Capsule',
      category: 'ability',
      group: 'ability-lab',
      price: 920,
      unlockWave: 12,
      description: 'Switches between a monster\'s standard abilities from the Summary Screen.',
      marketEnabled: true,
      runShop: false,
      carryIntoRun: false,
    },
    {
      slug: 'ability-patch',
      name: 'Ability Patch',
      category: 'ability',
      group: 'ability-lab',
      price: 1600,
      unlockWave: 18,
      description: 'Unlocks and equips the monster\'s hidden special ability.',
      marketEnabled: true,
      runShop: false,
      carryIntoRun: false,
    },
  ];

  const transformationGear = [
    {
      slug: 'mega-emblem',
      name: 'Mega Emblem',
      category: 'hold',
      group: 'hold-items',
      price: 1450,
      unlockWave: 16,
      description: 'Lets a Stage 2 or Stage 3 monster Mega Evolve once per battle.',
      holdEffect: 'mega-stone',
      carryIntoRun: false,
      runShop: false,
    },
    {
      slug: 'ultra-core',
      name: 'Ultra Core',
      category: 'hold',
      group: 'hold-items',
      price: 1850,
      unlockWave: 22,
      description: 'Lets a fully evolved monster trigger an Ultra Burst once per battle.',
      holdEffect: 'ultra-core',
      carryIntoRun: false,
      runShop: false,
    },
    {
      slug: 'max-band',
      name: 'Max Band',
      category: 'hold',
      group: 'hold-items',
      price: 1720,
      unlockWave: 20,
      description: 'Lets any monster Dynamax into a bulkier max-form once per battle.',
      holdEffect: 'dynamax-band',
      carryIntoRun: false,
      runShop: false,
    },
    {
      slug: 'variant-prism',
      name: 'Variant Prism',
      category: 'hold',
      group: 'hold-items',
      price: 1380,
      unlockWave: 17,
      description: 'Triggers a Variant Form with an alternate move kit once per battle.',
      holdEffect: 'variant-core',
      carryIntoRun: false,
      runShop: false,
    },
    {
      slug: 'omega-emblem',
      name: 'Omega Emblem',
      category: 'hold',
      group: 'hold-items',
      price: 1620,
      unlockWave: 18,
      description: 'A stronger mega trigger for late-game transformation builds.',
      holdEffect: 'mega-stone',
      carryIntoRun: false,
      runShop: false,
    },
    {
      slug: 'nova-core',
      name: 'Nova Core',
      category: 'hold',
      group: 'hold-items',
      price: 1940,
      unlockWave: 23,
      description: 'Another ultra-burst drive for high-end builds.',
      holdEffect: 'ultra-core',
      carryIntoRun: false,
      runShop: false,
    },
    {
      slug: 'gigant-ring',
      name: 'Gigant Ring',
      category: 'hold',
      group: 'hold-items',
      price: 1780,
      unlockWave: 21,
      description: 'A premium Dynamax activator with the same max-form access.',
      holdEffect: 'dynamax-band',
      carryIntoRun: false,
      runShop: false,
    },
    {
      slug: 'mirage-prism',
      name: 'Mirage Prism',
      category: 'hold',
      group: 'hold-items',
      price: 1440,
      unlockWave: 18,
      description: 'A rare prism that enables Variant Form shifts.',
      holdEffect: 'variant-core',
      carryIntoRun: false,
      runShop: false,
    },
    {
      slug: 'stellar-z-core',
      name: 'Stellar Z Core',
      category: 'hold',
      group: 'hold-items',
      price: 1580,
      unlockWave: 20,
      description: 'A universal Z-item that can empower any damaging move once per battle.',
      holdEffect: 'z-crystal',
      carryIntoRun: false,
      runShop: false,
    },
    ...TYPES.map((type) => ({
      slug: type + '-z-crystal',
      name: capitalized(type) + 'ium Z',
      category: 'hold',
      group: 'hold-items',
      price: 1320,
      unlockWave: 18,
      description: 'Lets one matching ' + capitalized(type) + '-type move erupt as a Z-Move each battle.',
      holdEffect: 'z-crystal',
      holdType: type,
      carryIntoRun: false,
      runShop: false,
    })),
  ];

  const megaStoneNames = ['Abomasite', 'Absolite', 'Aerodactylite', 'Aggronite', 'Alakazite', 'Altarianite', 'Ampharosite', 'Audinite', 'Banettite', 'Beedrillite', 'Blastoisinite', 'Blazikenite', 'Cameruptite', 'Charizardite X', 'Charizardite Y', 'Diancite', 'Galladite', 'Garchompite', 'Gardevoirite', 'Gengarite', 'Gyaradosite', 'Heracronite', 'Houndoominite', 'Kangaskhanite', 'Latiasite', 'Latiosite', 'Lopunnite', 'Lucarionite', 'Manectite', 'Mawilite', 'Medichamite', 'Metagrossite', 'Mewtwonite X', 'Mewtwonite Y', 'Pidgeotite', 'Pinsirite', 'Sablenite', 'Salamencite', 'Sceptilite', 'Scizorite', 'Sharpedonite', 'Slowbronite', 'Steelixite', 'Swampertite', 'Tyranitarite', 'Venusaurite'];
  const megaStones = megaStoneNames.map((name) => ({
    slug: slugify(name),
    name,
    category: 'hold',
    group: 'hold-items',
    price: 1800,
    unlockWave: 25,
    description: 'Reserved for future mega evolution support.',
    holdEffect: 'mega-stone',
    marketEnabled: false,
    runShop: false,
    carryIntoRun: false,
  }));

  const machineItems = ['TM116', 'TM125', 'TM126', 'TM149', 'TR00', 'TR10', 'TR75', 'TM168', 'TM169', 'TM170'].map((name) => ({
    slug: slugify(name),
    name,
    category: 'machine',
    group: 'machines',
    price: 900,
    unlockWave: 16,
    description: 'A powerful move machine reserved for future tutor support.',
    marketEnabled: false,
    runShop: false,
    carryIntoRun: false,
  }));

  const premiumPerks = [
    {
      slug: 'premium-exp-pass',
      name: 'Premium EXP Pass',
      category: 'premium',
      group: 'premium-perks',
      price: 9800,
      unlockWave: 12,
      description: 'Passive account perk: each owned copy grants +8% run EXP (up to 40%).',
      marketEnabled: true,
      runShop: false,
      carryIntoRun: false,
      premiumExpBonus: 0.08,
      premiumExpCap: 0.4,
    },
    {
      slug: 'premium-credit-chip',
      name: 'Premium Credit Chip',
      category: 'premium',
      group: 'premium-perks',
      price: 11200,
      unlockWave: 14,
      description: 'Passive account perk: each owned copy grants +6% run cash payout (up to 30%).',
      marketEnabled: true,
      runShop: false,
      carryIntoRun: false,
      premiumCashBonus: 0.06,
      premiumCashCap: 0.3,
    },
    {
      slug: 'premium-hybrid-license',
      name: 'Premium Hybrid License',
      category: 'premium',
      group: 'premium-perks',
      price: 16800,
      unlockWave: 18,
      description: 'Passive account perk: +5% EXP and +5% cash payout per copy (up to 20% each).',
      marketEnabled: true,
      runShop: false,
      carryIntoRun: false,
      premiumExpBonus: 0.05,
      premiumExpCap: 0.2,
      premiumCashBonus: 0.05,
      premiumCashCap: 0.2,
    },
  ];

  registerItemCatalogEntries([
    ...standardBalls,
    ...battleItems,
    ...battleUtility,
    ...extraMedicine,
    ...berryEntries,
    ...supportedHoldItems,
    ...typeBoosters,
    ...mintItems,
    ...trainingItems,
    ...evolutionItems,
    ...abilityItems,
    ...transformationGear,
    ...megaStones,
    ...machineItems,
    ...premiumPerks,
  ]);
}

expandItemCatalog();

const MOVES = buildMoves();
const SPECIES = buildSpecies(MOVES);
const MOVE_MAP = new Map(MOVES.map((move) => [move.id, move]));
const MOVE_SLUG_MAP = new Map(MOVES.map((move) => [move.slug, move]));
const SPECIES_MAP = new Map(SPECIES.map((species) => [species.id, species]));
const SPECIES_SLUG_MAP = new Map(SPECIES.map((species) => [species.slug, species]));
const ITEM_MAP = new Map(ITEMS.map((item) => [item.slug, item]));
const CHALLENGE_MAP = new Map(CHALLENGES.map((challenge) => [challenge.slug, challenge]));

const STARTER_DRAFTS = [
  {
    slug: 'classic-style',
    name: 'Classic Style',
    rarity: 'common',
    description: 'A balanced Fire / Water / Grass trio with classic monster-tamer energy.',
    starterIds: [4, 7, 67],
  },
  {
    slug: 'unique-style',
    name: 'Unique Style',
    rarity: 'rare',
    description: 'A roguelike-style trio built around unusual typing and trickier starts.',
    starterIds: [1, 13, 16],
  },
  {
    slug: 'advanced-style',
    name: 'Advanced Style',
    rarity: 'legendary',
    description: 'Harder, rarer starters with sharper strengths and higher-risk openings.',
    starterIds: [43, 49, 52],
  },
  {
    slug: 'stormfront-style',
    name: 'Stormfront Style',
    rarity: 'rare',
    description: 'A fast trio that leans on rain, sparks, and tempo control.',
    starterIds: [10, 19, 25],
  },
  {
    slug: 'twilight-style',
    name: 'Twilight Style',
    rarity: 'rare',
    description: 'A sneaky pack focused on night pressure, sustain, and status play.',
    starterIds: [28, 31, 37],
  },
  {
    slug: 'warden-style',
    name: 'Warden Style',
    rarity: 'legendary',
    description: 'Bulkier starters with strong held-item and transformation scaling.',
    starterIds: [55, 58, 64],
  },
  {
    slug: 'mythic-style',
    name: 'Mythic Style',
    rarity: 'legendary',
    description: 'High-ceiling starters tuned for aggressive setup and late-wave growth.',
    starterIds: [70, 73, 79],
  },
];
const STARTER_DRAFT_MAP = new Map(STARTER_DRAFTS.map((draft) => [draft.slug, draft]));
const STARTER_SEED_IDS = [...new Set(STARTER_DRAFTS.flatMap((draft) => draft.starterIds))];
const STARTER_SEED_SET = new Set(STARTER_SEED_IDS);
const STARTER_PERKS = {
  4: { slug: 'ember-edge', name: 'Ember Edge', description: 'Fire starters begin each run with a bonus Attack edge.', statBoosts: { atk: 10 } },
  7: { slug: 'tidal-heart', name: 'Tidal Heart', description: 'Water starters gain bonus HP for longer runs.', statBoosts: { hp: 16 } },
  67: { slug: 'verdant-mend', name: 'Verdant Mend', description: 'Grass starters receive stronger healing effects.', healingBoost: 0.25 },
  1: { slug: 'voltage-step', name: 'Voltage Step', description: 'Aeroletling starts with extra Speed.', statBoosts: { spe: 10 } },
  13: { slug: 'grave-bloom', name: 'Grave Bloom', description: 'Cinderletkin restores a little extra HP from healing and drain.', healingBoost: 0.2 },
  16: { slug: 'frost-focus', name: 'Frost Focus', description: 'Coralletpup starts with bonus Special Attack.', statBoosts: { spa: 10 } },
  43: { slug: 'drake-force', name: 'Drake Force', description: 'Galeletspark gets balanced offensive boosts.', statBoosts: { atk: 6, spa: 6 } },
  49: { slug: 'toxic-armor', name: 'Toxic Armor', description: 'Gloomletmoth begins with reinforced Defense.', statBoosts: { def: 12 } },
  52: { slug: 'halo-ward', name: 'Halo Ward', description: 'Haloletfin starts with bonus Special Defense and healing.', statBoosts: { spd: 10 }, healingBoost: 0.15 },
  10: { slug: 'storm-battery', name: 'Storm Battery', description: 'Volt-root starters begin with extra Special Attack and a little Speed.', statBoosts: { spa: 8, spe: 4 } },
  19: { slug: 'reef-step', name: 'Reef Step', description: 'Water-leaning starters cut in faster and recover slightly better.', statBoosts: { spe: 8 }, healingBoost: 0.1 },
  25: { slug: 'pressure-fang', name: 'Pressure Fang', description: 'Aggressive starters gain early Attack pressure for boss fights.', statBoosts: { atk: 10 } },
  28: { slug: 'shade-lure', name: 'Shade Lure', description: 'Night-themed starters are better at securing captures.', captureBonus: 0.08 },
  31: { slug: 'gravepulse', name: 'Gravepulse', description: 'Spectral starters gain mixed offense with a small sustain edge.', statBoosts: { atk: 4, spa: 4 }, healingBoost: 0.08 },
  37: { slug: 'mist-shroud', name: 'Mist Shroud', description: 'Defensive starters begin with bonus Special Defense and Speed.', statBoosts: { spd: 8, spe: 4 } },
  55: { slug: 'warden-plate', name: 'Warden Plate', description: 'Tanky starters enter runs with a sturdy HP and Defense frame.', statBoosts: { hp: 12, def: 8 } },
  58: { slug: 'pulse-array', name: 'Pulse Array', description: 'Tech-focused starters scale faster through moves and abilities.', statBoosts: { spa: 10 } },
  64: { slug: 'wild-bastion', name: 'Wild Bastion', description: 'Balanced bruisers gain both Attack and Special Defense.', statBoosts: { atk: 6, spd: 6 } },
  70: { slug: 'myth-run', name: 'Myth Run', description: 'Elite starters begin with sharper Speed and capture tempo.', statBoosts: { spe: 10 }, captureBonus: 0.06 },
  73: { slug: 'sky-forge', name: 'Sky Forge', description: 'Late-game starters gain bonus mixed offense for transformations.', statBoosts: { atk: 5, spa: 5 } },
  79: { slug: 'moon-guard', name: 'Moon Guard', description: 'Harder starters open with a resilient HP and Sp. Def shell.', statBoosts: { hp: 10, spd: 8 } },
};
const STARTER_SEEDS = STARTER_SEED_IDS.map((speciesId) => SPECIES_MAP.get(speciesId)).filter(Boolean);

function getStarterPerk(speciesId) {
  return STARTER_PERKS[Number(speciesId)] || null;
}

function isStarterCandidateMonster(monster) {
  return !!monster
    && STARTER_SEED_SET.has(Number(monster.speciesId))
    && (monster.origin === 'starter-draft' || monster.origin === 'starter-gift');
}

function isHiddenLegacyStarter(monster) {
  return !!monster
    && monster.origin === 'starter-gift'
    && !STARTER_SEED_SET.has(Number(monster.speciesId));
}

function isLegacyGrantedStorageMonster(monster) {
  return !!monster && monster.origin === 'storage';
}

function pruneLegacyStorageEntries(userId) {
  const user = getUserById(userId);
  if (!user) {
    return 0;
  }
  if (Number(user.meta.legacyStorageCleanupVersion || 0) >= 1) {
    return 0;
  }
  const rows = db.prepare('SELECT id, monster_json FROM collection WHERE user_id = ? ORDER BY id ASC').all(userId);
  const removeIds = [];
  const removedSpeciesIds = new Set();
  const keptSpeciesIds = new Set();
  rows.forEach((row) => {
    const monster = readJson(row.monster_json, null);
    if (isLegacyGrantedStorageMonster(monster)) {
      removeIds.push(Number(row.id));
      removedSpeciesIds.add(Number(monster?.speciesId || 0));
      return;
    }
    keptSpeciesIds.add(Number(monster?.speciesId || 0));
  });
  const removed = removeIds.length;
  if (removed) {
    const deleteStatement = db.prepare('DELETE FROM collection WHERE id = ? AND user_id = ?');
    removeIds.forEach((collectionId) => deleteStatement.run(collectionId, userId));
    const removedSet = new Set(removeIds);
    if (removedSet.has(Number(user.meta.partnerCollectionId || 0))) {
      user.meta.partnerCollectionId = null;
    }
    user.meta.partyCollectionIds = normalizePartyCollectionIds(
      Array.isArray(user.meta.partyCollectionIds) ? user.meta.partyCollectionIds : Array(PARTY_SLOT_COUNT).fill(null),
      Array.from(new Set((user.meta.partyCollectionIds || []).map((id) => Number(id)).filter((id) => id && !removedSet.has(id))))
    );
    user.meta.seenSpeciesIds = normalizeSpeciesIds((user.meta.seenSpeciesIds || []).filter((speciesId) => {
      const numericSpeciesId = Number(speciesId || 0);
      return !removedSpeciesIds.has(numericSpeciesId) || keptSpeciesIds.has(numericSpeciesId);
    }));
  }
  user.meta.legacyStorageCleanupVersion = 1;
  saveUserMeta(userId, user.meta);
  return removed;
}

function applyStarterPerk(monster) {
  if (!monster || monster.starterPerk) {
    return monster;
  }
  const perk = getStarterPerk(monster.speciesId);
  if (!perk) {
    return monster;
  }
  monster.starterPerk = {
    ...perk,
    statBoosts: { ...(perk.statBoosts || {}) },
    healingBoost: perk.healingBoost || 0,
  };
  if (perk.statBoosts) {
    const mergedBonusStats = {};
    for (const key of STAT_KEYS) {
      mergedBonusStats[key] = (monster.bonusStats?.[key] || 0) + (perk.statBoosts[key] || 0);
    }
    monster.bonusStats = mergedBonusStats;
  }
  monster.healingBoost = perk.healingBoost || 0;
  const species = SPECIES_MAP.get(monster.speciesId);
  rebuildMonsterBoosts(monster);
  monster.stats = resolvedMonsterStats(monster, species);
  monster.currentHp = monster.stats.hp;
  return monster;
}

function removeStarterPerk(monster) {
  if (!monster?.starterPerk) {
    return monster;
  }
  const perk = monster.starterPerk;
  if (perk.statBoosts) {
    const cleanedBonusStats = {};
    for (const key of STAT_KEYS) {
      cleanedBonusStats[key] = (monster.bonusStats?.[key] || 0) - (perk.statBoosts[key] || 0);
    }
    monster.bonusStats = cleanedBonusStats;
  }
  monster.healingBoost = 0;
  monster.starterPerk = null;
  const species = SPECIES_MAP.get(monster.speciesId);
  rebuildMonsterBoosts(monster);
  monster.stats = resolvedMonsterStats(monster, species);
  monster.currentHp = monster.stats.hp;
  return monster;
}

function ensureStarterDraftCandidates(userId) {
  const rows = db.prepare('SELECT id, monster_json FROM collection WHERE user_id = ? ORDER BY id ASC').all(userId);
  const presentSpecies = new Set();
  for (const row of rows) {
    const monster = readJson(row.monster_json, null);
    if (isStarterCandidateMonster(monster)) {
      presentSpecies.add(Number(monster.speciesId));
    }
  }
  for (const species of STARTER_SEEDS) {
    if (presentSpecies.has(species.id)) {
      continue;
    }
    const monster = makeMonsterInstance(species.id, 5, {
      seedOffset: userId,
      metLocation: 'Guild Nursery',
      metLevel: 5,
      origin: 'starter-draft',
    });
    db.prepare('INSERT INTO collection (user_id, monster_json, starter_unlocked, favorite, created_at) VALUES (?, ?, 1, 0, ?)')
      .run(userId, writeJson(monster), nowIso());
  }
}

function buildStarterDrafts() {
  return STARTER_DRAFTS.map((draft) => ({
    ...draft,
    starters: draft.starterIds.map((speciesId) => {
      const species = SPECIES_MAP.get(speciesId);
      return {
        id: species.id,
        species,
        perk: getStarterPerk(species.id),
      };
    }),
  }));
}

function getStarterDraft(draftSlug) {
  return buildStarterDrafts().find((draft) => draft.slug === draftSlug) || buildStarterDrafts()[0];
}

export const CONTENT = {
  species: SPECIES,
  speciesMap: SPECIES_MAP,
  speciesSlugMap: SPECIES_SLUG_MAP,
  moves: MOVES,
  moveMap: MOVE_MAP,
  moveSlugMap: MOVE_SLUG_MAP,
  items: ITEMS,
  itemMap: ITEM_MAP,
  challenges: CHALLENGES,
  challengeMap: CHALLENGE_MAP,
  natures: NATURES,
  natureMap: NATURE_MAP,
  abilities: ABILITIES,
  abilityMap: ABILITY_MAP,
  specialAuras: SPECIAL_AURAS,
  specialAuraMap: SPECIAL_AURA_MAP,
  types: TYPES,
  typeChart: TYPE_CHART,
  weatherLabels: WEATHER_LABELS,
  starterDrafts: buildStarterDrafts(),
  starterPerks: STARTER_PERKS,
  starterSeedIds: STARTER_SEED_IDS,
  playerSprites: PLAYER_SPRITES,
  playerSpriteMap: PLAYER_SPRITE_MAP,
  playerSpriteBonuses: PLAYER_SPRITE_BONUSES,
  playerSpriteBonusMap: PLAYER_SPRITE_BONUS_MAP,
  trainerAuras: TRAINER_AURA_GEAR,
  trainerAuraMap: TRAINER_AURA_GEAR_MAP,
  trainerHats: TRAINER_HAT_GEAR,
  trainerHatMap: TRAINER_HAT_GEAR_MAP,
  trainerClasses: TRAINER_CLASSES,
  trainerClassMap: TRAINER_CLASS_MAP,
  trainerTitles: TRAINER_TITLES,
  trainerTitleMap: TRAINER_TITLE_MAP,
  trainerSkills: TRAINER_SKILL_TREE,
  trainerSkillMap: TRAINER_SKILL_MAP,
  displayThemes: DISPLAY_THEMES,
  displayThemeMap: DISPLAY_THEME_MAP,
  colorModes: COLOR_MODES,
  colorModeMap: COLOR_MODE_MAP,
  fontModes: FONT_MODES,
  fontModeMap: FONT_MODE_MAP,
  worldRegions: WORLD_REGIONS,
  gymLeagues: GYM_LEAGUES,
  gymLeagueMap: GYM_LEAGUE_MAP,
  pcBoxLabels: PC_BOX_LABELS,
  partySlotCount: PARTY_SLOT_COUNT,
  chatEmojiSets: CHAT_EMOJI_SETS,
  chatEmojiCatalog: SOCIAL_EMOJI_CATEGORIES,
};

function currentWorldClock(reference = new Date()) {
  const date = reference instanceof Date ? reference : new Date(reference);
  const hour = date.getHours();
  const minute = date.getMinutes();
  const totalMinutes = hour * 60 + minute;
  const phase = totalMinutes < 300 ? 'night'
    : totalMinutes < 420 ? 'dawn'
      : totalMinutes < 1020 ? 'day'
        : totalMinutes < 1140 ? 'dusk'
          : 'night';
  return {
    hour,
    minute,
    totalMinutes,
    phase,
    label: phase === 'dawn' ? 'Dawn'
      : phase === 'day' ? 'Day'
        : phase === 'dusk' ? 'Dusk'
          : 'Night',
  };
}

function worldUnlockLevel(user) {
  const best = Math.max(
    Number(user?.meta?.bestWave?.classic || 0),
    Number(user?.meta?.bestWave?.challenge || 0),
    Number(user?.meta?.bestWave?.endless || 0),
  );
  return Math.max(1, 1 + Math.floor(best / 8) + Number(user?.meta?.classicClears || 0));
}

function marketRotationItems(reference = new Date()) {
  const candidates = ITEMS.filter((item) => item.marketEnabled !== false);
  const slot = Math.floor(currentWorldClock(reference).totalMinutes / 12);
  const picks = [];
  for (let index = 0; index < Math.min(6, candidates.length); index += 1) {
    picks.push(candidates[(slot * 5 + index * 11) % candidates.length]);
  }
  return picks;
}

function currentAmbientEvent(reference = new Date()) {
  const clock = currentWorldClock(reference);
  return AMBIENT_EVENTS[Math.floor(clock.totalMinutes / 15) % AMBIENT_EVENTS.length];
}

function legendaryRoster() {
  return SPECIES.filter((species) => ['legendary', 'mythic'].includes(species.rarity));
}

export function getWorldState(userId = 0, reference = new Date()) {
  const user = userId ? getUserById(userId) : null;
  const unlockLevel = worldUnlockLevel(user);
  const clock = currentWorldClock(reference);
  const event = currentAmbientEvent(reference);
  const visibleRegions = WORLD_REGIONS.map((region, index) => {
    const categoryMeta = WORLD_REGION_CATEGORIES[region.category] || WORLD_REGION_CATEGORIES.sanctuary;
    return {
      ...region,
      categoryLabel: categoryMeta.label,
      categorySummary: categoryMeta.summary,
      categoryTone: categoryMeta.tone,
      unlocked: unlockLevel >= index + 1,
      weatherNow: region.weatherPool[(clock.hour + index) % region.weatherPool.length],
      shakeGrass: region.category === 'sanctuary' || region.category === 'island' || clock.phase === 'night',
    };
  });
  const activeRegions = visibleRegions.filter((region) => region.unlocked);
  const preferredRegion = activeRegions.find((region) => region.slug === user?.meta?.preferredRegionSlug) || null;
  const activeRegion = preferredRegion || activeRegions[Math.floor((clock.totalMinutes / 20) % Math.max(1, activeRegions.length))] || visibleRegions[0];
  const dailyBossPool = legendaryRoster();
  const daySeed = Math.floor(reference.getTime() / 86400000);
  const dailyBoss = dailyBossPool[daySeed % Math.max(1, dailyBossPool.length)] || SPECIES_SLUG_MAP.get('astravault-omega');
  const rotation = marketRotationItems(reference);
  return {
    clock,
    phase: clock.phase,
    phaseLabel: clock.label,
    event,
    regions: visibleRegions,
    activeRegion,
    activeRegionSlug: activeRegion?.slug || WORLD_REGIONS[0].slug,
    preferredRegionSlug: preferredRegion?.slug || null,
    dailyBoss,
    marketRotation: {
      items: rotation,
      discount: event.marketDiscount || 0.14,
      minutesRemaining: 12 - (clock.minute % 12),
    },

  };
}

export function persistentItemUnitPrice(itemOrSlug, userId = 0, reference = new Date()) {
  const item = typeof itemOrSlug === 'string' ? ITEM_MAP.get(itemOrSlug) : itemOrSlug;
  if (!item) {
    return 0;
  }
  const basePrice = Math.max(120, Math.round(item.price * 3.2));
  const world = getWorldState(userId, reference);
  const spotlight = world.marketRotation.items.some((entry) => entry.slug === item.slug);
  if (!spotlight) {
    return basePrice;
  }
  return Math.max(100, Math.round(basePrice * (1 - world.marketRotation.discount)));
}

const defaultDbPath = process.env.VERCEL
  ? path.join('/tmp', 'moemon.sqlite')
  : path.join(process.cwd(), 'data', 'moemon.sqlite');
const dbPath = process.env.MOEMON_DB_PATH || defaultDbPath;
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    username_lower TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'player',
    cash INTEGER NOT NULL DEFAULT 1200,
    meta_json TEXT,
    reset_token_hash TEXT,
    reset_expires TEXT,
    created_at TEXT NOT NULL,
    last_login TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS collection (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    monster_json TEXT NOT NULL,
    starter_unlocked INTEGER NOT NULL DEFAULT 1,
    favorite INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS inventories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    item_slug TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, item_slug),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    mode TEXT NOT NULL,
    challenge_slug TEXT,
    summary_json TEXT,
    run_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_user_id INTEGER NOT NULL,
    target_user_id INTEGER,
    action TEXT NOT NULL,
    details_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_type TEXT NOT NULL,
    sender_user_id INTEGER NOT NULL,
    target_user_id INTEGER,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL
  );
`);

function quotedSqlIdentifier(value) {
  const safe = String(value || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(safe)) {
    throw new Error('Invalid SQL identifier.');
  }
  return `"${safe}"`;
}

function quotedSqlString(value) {
  const safe = String(value || '').trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(safe)) {
    throw new Error('Invalid SQL identifier.');
  }
  return `'${safe}'`;
}

function tableHasColumn(tableName, columnName) {
  const rows = db.prepare(`SELECT name FROM pragma_table_info(${quotedSqlString(tableName)}) WHERE name = ?`).all(columnName);
  return rows.length > 0;
}

function ensureTableColumn(tableName, columnName, definition) {
  if (tableHasColumn(tableName, columnName)) {
    return;
  }
  db.exec(`ALTER TABLE ${quotedSqlIdentifier(tableName)} ADD COLUMN ${quotedSqlIdentifier(columnName)} ${definition}`);
}

ensureTableColumn('chat_messages', 'image_url', 'TEXT');
ensureTableColumn('chat_messages', 'link_url', 'TEXT');
ensureTableColumn('chat_messages', 'link_label', 'TEXT');

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
}

export function validateEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value)) ? null : 'Enter a valid email address.';
}

export function validateUsername(value) {
  const username = normalizeUsername(value);
  if (username.length < 3) {
    return 'Username must be at least 3 characters.';
  }
  return /^[a-zA-Z0-9 _-]+$/.test(username)
    ? null
    : 'Username may contain letters, numbers, spaces, underscores, and dashes only.';
}

export function validatePassword(value) {
  const password = String(value ?? '');
  if (password.length < 8) {
    return 'Password must be at least 8 characters.';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must include an uppercase letter.';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must include a lowercase letter.';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must include a number.';
  }
  return null;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [algorithm, saltHex, hashHex] = String(stored ?? '').split('$');
  if (algorithm !== 'scrypt' || !saltHex || !hashHex) {
    return false;
  }
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function defaultMeta() {
  return {
    unlockedModes: ['classic', 'challenge'],
    classicClears: 0,
    challengeClears: 0,
    bestWave: { classic: 0, endless: 0, challenge: 0, gym: 0, arena: 0, adventure: 0 },
    lastRunSummary: null,
    avatarSlug: PLAYER_SPRITES[0].slug,
    partnerCollectionId: null,
    preferredRegionSlug: WORLD_REGIONS[0].slug,
    favoriteLeagueSlug: GYM_LEAGUES[0].slug,
    chatEmojiSet: 'cute',
    hudMode: 'cozy',
    motionMode: 'full',
    displayTheme: DISPLAY_THEMES[0].slug,
    colorMode: COLOR_MODES[0].slug,
    fontMode: FONT_MODES[0].slug,
    soundEnabled: true,
    legacyStorageCleanupVersion: 0,
    trainerProfile: {
      experience: 0,
      classSlug: TRAINER_CLASSES[0].slug,
      subclassSlug: null,
      titleSlug: TRAINER_TITLES[0].slug,
      skillTree: {},
      classExperience: {},
      rebirths: 0,
    },
    progressStats: {
      runsStarted: 0,
      runsCompleted: 0,
      runWins: 0,
      runLosses: 0,
      monstersCaught: 0,
      trainerVictories: 0,
      bossVictories: 0,
      arenaWins: 0,
      minigameWins: 0,
      marketPurchases: 0,
      goldEarned: 0,
      missionsClaimed: 0,
    },
    missions: {
      daily: null,
      weekly: null,
      monthly: null,
    },
    incubator: [],
    incubatorRecentSpeciesIds: [],
    partyCollectionIds: Array(PARTY_SLOT_COUNT).fill(null),
    seenSpeciesIds: [],
    activityLog: [],
    gymWins: {},
    arenaRecord: { wins: 0, losses: 0 },
    arenaLadder: { points: 0, highestPoints: 0 },
    miningTrips: 0,
    diceGames: 0,
    diceWins: 0,
    trainerGear: {
      auras: {},
      hats: {},
      equippedAuraSlug: null,
      equippedHatSlug: null,
    },
    miniGameStats: {
      played: 0,
      wins: 0,
      streak: 0,
      bestStreak: 0,
      tokens: 0,
      quizWins: 0,
      silhouetteWins: 0,
      forecastWins: 0,
      statScoutWins: 0,
      rarityRadarWins: 0,
      powerPivotWins: 0,
      typeEdgeWins: 0,
      auraGambles: 0,
      gambleJackpots: 0,
      mineFails: 0,
      diceLosses: 0,
      typeQuizCursor: 0,
      silhouetteCursor: 0,
      forecastCursor: 0,
      statScoutCursor: 0,
      rarityRadarCursor: 0,
      whackCursor: 0,
      powerPivotCursor: 0,
      typeEdgeCursor: 0,
      lastDailyClaimDate: null,
      cooldowns: {},
    },
    mapSearch: {
      regions: {},
    },

  };
}

function inflateUser(row) {
  if (!row) {
    return null;
  }
  return {
    ...row,
    meta: { ...defaultMeta(), ...(readJson(row.meta_json, {}) || {}) },
  };
}

function saveUserMeta(userId, meta) {
  db.prepare('UPDATE users SET meta_json = ? WHERE id = ?').run(writeJson(meta), userId);
}

function normalizePartyCollectionIds(ids, validIds = null) {
  const validSet = validIds ? new Set(validIds.map((value) => Number(value))) : null;
  const next = [];
  const seen = new Set();
  for (let index = 0; index < PARTY_SLOT_COUNT; index += 1) {
    const raw = Number(ids?.[index]);
    const normalized = Number.isInteger(raw) && raw > 0 ? raw : null;
    if (!normalized || seen.has(normalized) || (validSet && !validSet.has(normalized))) {
      next.push(null);
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
  }
  return next;
}

function normalizeSpeciesIds(ids) {
  const validSpecies = new Set(SPECIES.map((species) => species.id));
  const seen = new Set();
  const next = [];
  for (const value of ids || []) {
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || !validSpecies.has(normalized) || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    next.push(normalized);
  }
  return next;
}

function markSpeciesSeen(userId, speciesIds) {
  const user = getUserById(userId);
  if (!user) {
    return [];
  }
  const current = normalizeSpeciesIds(user.meta.seenSpeciesIds);
  const merged = normalizeSpeciesIds([...current, ...(speciesIds || [])]);
  if (merged.length !== current.length || merged.some((value, index) => value !== current[index])) {
    user.meta.seenSpeciesIds = merged;
    saveUserMeta(userId, user.meta);
  }
  return merged;
}

function appendActivityLog(meta, text) {
  meta.activityLog = Array.isArray(meta.activityLog) ? meta.activityLog : [];
  meta.activityLog.unshift({
    id: randomId(5),
    text,
    at: nowIso(),
  });
  meta.activityLog = meta.activityLog.slice(0, 16);
}

function changeUserCash(userId, amount) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const nextCash = Math.max(0, user.cash + Number(amount || 0));
  db.prepare('UPDATE users SET cash = ? WHERE id = ?').run(nextCash, userId);
  return nextCash;
}

function ensureEndlessUnlock(user) {
  if (user.meta.classicClears > 0 && !user.meta.unlockedModes.includes('endless')) {
    user.meta.unlockedModes.push('endless');
    saveUserMeta(user.id, user.meta);
  }
}

export function getUserById(userId) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const user = inflateUser(row);
  if (user) {
    ensureEndlessUnlock(user);
  }
  return user;
}

function getUserByLogin(login) {
  const normalized = normalizeEmail(login);
  const usernameLower = normalizeUsername(login).toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE email = ? OR username_lower = ?').get(normalized, usernameLower);
  const user = inflateUser(row);
  if (user) {
    ensureEndlessUnlock(user);
  }
  return user;
}

export function listUsers(limit = 50) {
  return db.prepare('SELECT * FROM users ORDER BY id DESC LIMIT ?').all(limit).map(inflateUser);
}

function getUserCount() {
  return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
}

function logAdmin(adminUserId, targetUserId, action, details) {
  db.prepare('INSERT INTO admin_logs (admin_user_id, target_user_id, action, details_json, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(adminUserId, targetUserId || null, action, writeJson(details), nowIso());
}

function getInventoryMap(userId) {
  const rows = db.prepare('SELECT item_slug, quantity FROM inventories WHERE user_id = ? AND quantity > 0').all(userId);
  return Object.fromEntries(rows.map((row) => [row.item_slug, row.quantity]));
}

function premiumRunBoostsForUser(userId) {
  const inventory = getInventoryMap(userId);
  let expBonus = 0;
  let cashBonus = 0;
  const activePerks = [];
  Object.entries(inventory).forEach(([slug, quantity]) => {
    const item = ITEM_MAP.get(slug);
    if (!item || item.category !== 'premium') {
      return;
    }
    const owned = Math.max(0, Math.floor(Number(quantity || 0)));
    if (!owned) {
      return;
    }
    const expFromItem = Math.min(Number(item.premiumExpCap || 0), Number(item.premiumExpBonus || 0) * owned);
    const cashFromItem = Math.min(Number(item.premiumCashCap || 0), Number(item.premiumCashBonus || 0) * owned);
    expBonus += expFromItem;
    cashBonus += cashFromItem;
    activePerks.push({
      slug: item.slug,
      name: item.name,
      quantity: owned,
      expBonus: expFromItem,
      cashBonus: cashFromItem,
    });
  });
  expBonus = clamp(expBonus, 0, 0.8);
  cashBonus = clamp(cashBonus, 0, 0.6);
  return {
    expBonus,
    cashBonus,
    expMultiplier: 1 + expBonus,
    cashMultiplier: 1 + cashBonus,
    activePerks,
  };
}

function normalizedRunPremiumBoosts(run) {
  const boost = run?.premiumBoosts || {};
  const expMultiplier = clamp(Number(boost.expMultiplier || (1 + Number(boost.expBonus || 0)) || 1), 1, 1.8);
  const cashMultiplier = clamp(Number(boost.cashMultiplier || (1 + Number(boost.cashBonus || 0)) || 1), 1, 1.6);
  return {
    expMultiplier,
    cashMultiplier,
    expBonus: expMultiplier - 1,
    cashBonus: cashMultiplier - 1,
    activePerks: Array.isArray(boost.activePerks) ? boost.activePerks : [],
  };
}

export function getPersistentInventory(userId) {
  return Object.entries(getInventoryMap(userId)).map(([slug, quantity]) => ({ item: ITEM_MAP.get(slug), quantity })).filter((entry) => entry.item);
}

export function setInventoryQuantity(userId, itemSlug, quantity) {
  const item = ITEM_MAP.get(itemSlug);
  if (!item) {
    throw new Error('Unknown item.');
  }
  const safeQuantity = Math.max(0, Number(quantity || 0));
  db.prepare(`
    INSERT INTO inventories (user_id, item_slug, quantity)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, item_slug) DO UPDATE SET quantity = excluded.quantity
  `).run(userId, itemSlug, safeQuantity);
}

export function addInventory(userId, itemSlug, quantity) {
  const current = getInventoryMap(userId)[itemSlug] || 0;
  setInventoryQuantity(userId, itemSlug, current + Number(quantity || 0));
}

function spendInventory(userId, itemSlug, quantity = 1) {
  const current = getInventoryMap(userId)[itemSlug] || 0;
  const needed = Math.max(0, Number(quantity || 0));
  if (current < needed) {
    return false;
  }
  setInventoryQuantity(userId, itemSlug, current - needed);
  return true;
}

function firstAdminRole() {
  return getUserCount() === 0 ? 'admin' : 'player';
}

function pickStarterLevel(mode) {
  return mode === 'endless' ? 9 : mode === 'challenge' ? 7 : 6;
}

function getSessionExpiryIso() {
  return new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000).toISOString();
}

export function createSession(userId) {
  const token = randomId(32);
  db.prepare('INSERT INTO sessions (user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(userId, hashValue(token), nowIso(), getSessionExpiryIso());
  return token;
}

export function destroySession(token) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashValue(token));
}

export function getUserBySessionToken(token) {
  if (!token) {
    return null;
  }
  const row = db.prepare(`
    SELECT u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
    ORDER BY s.id DESC
    LIMIT 1
  `).get(hashValue(token), nowIso());
  const user = inflateUser(row);
  if (user) {
    ensureEndlessUnlock(user);
  }
  return user;
}

function baseMetaCash(user) {
  return user.role === 'admin' ? 5000 : 1200;
}

function calcMonsterStats(species, level, boosts = {}, natureLike = null) {
  const nature = normalizeNature(natureLike, species.id * 17 + level * 3);
  const keys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const stats = {};
  for (const key of keys) {
    const base = species.baseStats[key];
    const extra = boosts[key] || 0;
    const scaled = key === 'hp'
      ? Math.floor(((base * 2 + extra) * level) / 100) + level + 12
      : Math.floor(((base * 2 + extra) * level) / 100) + 5;
    stats[key] = scaled;
  }
  if (nature.up) {
    stats[nature.up] = Math.floor(stats[nature.up] * 1.1);
  }
  if (nature.down) {
    stats[nature.down] = Math.floor(stats[nature.down] * 0.9);
  }
  return stats;
}

function applyAuraStatModifiers(monster, stats) {
  const aura = auraInfoForMonster(monster);
  const nextStats = { ...stats };
  if (aura.slug === 'shiny') {
    nextStats.hp = Math.max(1, Math.floor(nextStats.hp * 1.25));
  }
  if (aura.slug === 'chrome') {
    nextStats.hp = Math.max(1, Math.floor(nextStats.hp * 1.5));
  }
  return nextStats;
}

function resolvedMonsterStats(monster, species, level = monster?.level, boosts = monster?.statBoosts, natureLike = monster?.nature) {
  const mergedBoosts = normalizeStatSpread(boosts);
  if (monster?.trainerLoadoutBoosts) {
    const loadoutBoosts = normalizeStatSpread(monster.trainerLoadoutBoosts);
    for (const key of STAT_KEYS) {
      mergedBoosts[key] += loadoutBoosts[key];
    }
  }
  if (!monster || !species) {
    return calcMonsterStats(species, level, mergedBoosts, natureLike);
  }
  return applyAuraStatModifiers(monster, calcMonsterStats(species, level, mergedBoosts, natureLike));
}

function makeMonsterInstance(speciesId, level, options = {}) {
  const species = SPECIES_MAP.get(Number(speciesId));
  if (!species) {
    throw new Error('Unknown monster species ' + speciesId + '.');
  }
  const safeLevel = clamp(Number(level || 1), 1, 100);
  const rng = seeded((species.id * 97 + safeLevel * 13 + (options.seedOffset || 0)) >>> 0);
  const ivs = options.ivs ? normalizeStatSpread(options.ivs, 31) : {
    hp: seededInt(rng, 0, 31),
    atk: seededInt(rng, 0, 31),
    def: seededInt(rng, 0, 31),
    spa: seededInt(rng, 0, 31),
    spd: seededInt(rng, 0, 31),
    spe: seededInt(rng, 0, 31),
  };
  const evs = normalizeStatSpread(options.evs, 252);
  const bonusStats = normalizeStatSpread(options.bonusStats);
  const statBoosts = Object.fromEntries(STAT_KEYS.map((key) => [
    key,
    ivs[key] + Math.floor(evs[key] / 8) + bonusStats[key],
  ]));
  const nature = normalizeNature(options.nature, species.id * 131 + safeLevel * 17 + (options.seedOffset || 0));
  const auraKey = normalizeAuraKey(options.auraKey || selectAuraKeyForSpecies(species, (options.seedOffset || 0) + safeLevel));
  const auraPalette = options.auraPalette || selectAuraPalette(auraKey, species.id + safeLevel + (options.seedOffset || 0));
  const stats = resolvedMonsterStats({ auraKey }, species, safeLevel, statBoosts, nature.slug);
  const moveIds = availableMoveIdsForLevel(species, safeLevel).slice(-4);
  const hiddenAbilityUnlocked = options.hiddenAbilityUnlocked !== undefined ? !!options.hiddenAbilityUnlocked : rng() < 0.08;
  const abilitySlug = options.abilitySlug || abilitySlugForSpecies(species, options.seedOffset || 0, hiddenAbilityUnlocked);
  return {
    uid: randomId(8),
    speciesId: species.id,
    speciesSlug: species.slug,
    name: species.name,
    nickname: options.nickname || '',
    level: safeLevel,
    experience: 0,
    auraKey,
    auraPalette,
    types: species.types,
    baseStats: species.baseStats,
    ivs,
    evs,
    bonusStats,
    statBoosts,
    nature: nature.slug,
    abilitySlug,
    hiddenAbilityUnlocked: hiddenAbilityUnlocked || abilitySlug === species.hiddenAbilitySlug,
    heldItemSlug: options.heldItemSlug || null,
    stats,
    currentHp: options.currentHp ?? stats.hp,
    moves: moveIds.map((moveId) => {
      const move = MOVE_MAP.get(moveId);
      return { id: move.id, pp: move.pp, maxPp: move.pp };
    }),
    status: null,
    stages: defaultStages(),
    starterEligible: species.starterEligible,
    caughtAt: options.caughtAt || nowIso(),
    metLocation: options.metLocation || species.biome,
    metLevel: options.metLevel || safeLevel,
    origin: options.origin || 'wild',
    boxTag: options.boxTag || PC_BOX_LABELS[0],
    formMode: null,
    formName: null,
    formMoveSet: null,
    baseBattleForm: null,
    megaEvolved: false,
    ultraBurst: false,
    dynamaxed: false,
    variantShift: false,
    zMoveUsed: false,
    flinched: false,
  };
}

function makeWeatherState(type = 'clear', turns = 0) {
  return { type, turns };
}

function normalizeMoveStates(moveStates) {
  return (Array.isArray(moveStates) ? moveStates : []).map((moveState) => {
    const move = MOVE_MAP.get(moveState?.id);
    if (!move) {
      return null;
    }
    const next = {
      id: move.id,
      pp: clamp(Number.isFinite(moveState?.pp) ? moveState.pp : move.pp, 0, moveState?.maxPp || move.pp),
      maxPp: moveState?.maxPp || move.pp,
    };
    if (moveState?.displayName) {
      next.displayName = String(moveState.displayName);
    }
    if (moveState?.displayDescription) {
      next.displayDescription = String(moveState.displayDescription);
    }
    if (moveState?.sourceForm) {
      next.sourceForm = String(moveState.sourceForm);
    }
    return next;
  }).filter(Boolean).slice(0, 4);
}

function normalizeMonster(monster, fallbackSeed = 0) {
  if (!monster || !SPECIES_MAP.has(monster.speciesId)) {
    return { monster, changed: false };
  }

  let changed = false;
  const persistedForm = monster.formMode && monster.baseBattleForm?.moves
    ? {
        mode: monster.formMode,
        hpRatio: monster.stats?.hp ? monster.currentHp / Math.max(1, monster.stats.hp) : 1,
        baseMoves: normalizeMoveStates(monster.baseBattleForm.moves),
        formMoves: normalizeMoveStates(monster.formMoveSet?.length ? monster.formMoveSet : monster.moves),
      }
    : null;
  if (persistedForm) {
    monster.moves = cloneMonster(persistedForm.baseMoves);
    monster.formMode = null;
    monster.formName = null;
    monster.formMoveSet = null;
    monster.baseBattleForm = null;
    monster.megaEvolved = false;
    monster.ultraBurst = false;
    monster.dynamaxed = false;
    monster.variantShift = false;
    changed = true;
  }

  const safeLevel = clamp(Number(monster.level || 1), 1, 100);
  if (monster.level !== safeLevel) {
    monster.level = safeLevel;
    changed = true;
  }
  const seed = hashSeedFromString(monster.uid || (monster.speciesId + '-' + monster.level + '-' + fallbackSeed)) + fallbackSeed;
  const nature = normalizeNature(monster.nature, seed);
  if (monster.nature !== nature.slug) {
    monster.nature = nature.slug;
    changed = true;
  }
  const species = SPECIES_MAP.get(monster.speciesId);
  const normalizedAuraKey = normalizeAuraKey(monster.auraKey || selectAuraKeyForSpecies(species, seed));
  if (monster.auraKey !== normalizedAuraKey) {
    monster.auraKey = normalizedAuraKey;
    changed = true;
  }
  const normalizedAuraPalette = monster.auraPalette || selectAuraPalette(monster.auraKey, seed + species.id);
  if (monster.auraPalette !== normalizedAuraPalette) {
    monster.auraPalette = normalizedAuraPalette;
    changed = true;
  }

  if (!monster.ivs) {
    monster.ivs = normalizeStatSpread(monster.statBoosts, 31);
    changed = true;
  }
  if (!monster.evs) {
    monster.evs = blankStatSpread();
    changed = true;
  }
  if (!monster.bonusStats) {
    monster.bonusStats = blankStatSpread();
    changed = true;
  }
  if (!monster.bonusStatsMigrated && monster.starterPerk?.statBoosts) {
    const migratedBonusStats = normalizeStatSpread(monster.bonusStats);
    const migratedIvs = normalizeStatSpread(monster.ivs, 31);
    for (const key of STAT_KEYS) {
      const perkValue = monster.starterPerk.statBoosts[key] || 0;
      if (perkValue) {
        migratedBonusStats[key] += perkValue;
        migratedIvs[key] = Math.max(0, migratedIvs[key] - perkValue);
      }
    }
    monster.bonusStats = migratedBonusStats;
    monster.ivs = migratedIvs;
    monster.bonusStatsMigrated = true;
    changed = true;
  }
  const normalizedIvs = normalizeStatSpread(monster.ivs, 31);
  const normalizedEvs = normalizeStatSpread(monster.evs, 252);
  const normalizedBonusStats = normalizeStatSpread(monster.bonusStats);
  if (JSON.stringify(normalizedIvs) !== JSON.stringify(monster.ivs)
    || JSON.stringify(normalizedEvs) !== JSON.stringify(monster.evs)
    || JSON.stringify(normalizedBonusStats) !== JSON.stringify(monster.bonusStats)) {
    monster.ivs = normalizedIvs;
    monster.evs = normalizedEvs;
    monster.bonusStats = normalizedBonusStats;
    changed = true;
  }
  const expectedBoosts = {
    hp: (monster.ivs?.hp || 0) + Math.floor((monster.evs?.hp || 0) / 8) + (monster.bonusStats?.hp || 0),
    atk: (monster.ivs?.atk || 0) + Math.floor((monster.evs?.atk || 0) / 8) + (monster.bonusStats?.atk || 0),
    def: (monster.ivs?.def || 0) + Math.floor((monster.evs?.def || 0) / 8) + (monster.bonusStats?.def || 0),
    spa: (monster.ivs?.spa || 0) + Math.floor((monster.evs?.spa || 0) / 8) + (monster.bonusStats?.spa || 0),
    spd: (monster.ivs?.spd || 0) + Math.floor((monster.evs?.spd || 0) / 8) + (monster.bonusStats?.spd || 0),
    spe: (monster.ivs?.spe || 0) + Math.floor((monster.evs?.spe || 0) / 8) + (monster.bonusStats?.spe || 0),
  };
  const nextBoosts = normalizeStatSpread(monster.statBoosts);
  if (JSON.stringify(nextBoosts) !== JSON.stringify(expectedBoosts)) {
    rebuildMonsterBoosts(monster);
    changed = true;
  }

  const nextStats = resolvedMonsterStats(monster, species);
  if (JSON.stringify(nextStats) !== JSON.stringify(monster.stats || {})) {
    const hpRatio = monster.stats?.hp ? monster.currentHp / Math.max(1, monster.stats.hp) : 1;
    monster.stats = nextStats;
    monster.currentHp = monster.currentHp > 0
      ? Math.max(1, Math.min(nextStats.hp, Math.round(nextStats.hp * hpRatio)))
      : 0;
    changed = true;
  }

  const abilityChoices = speciesAbilityChoices(species);
  if (!monster.abilitySlug || !ABILITY_MAP.has(monster.abilitySlug) || !abilityChoices.includes(monster.abilitySlug)) {
    monster.abilitySlug = abilitySlugForSpecies(species, seed, monster.hiddenAbilityUnlocked);
    changed = true;
  }
  monster.hiddenAbilityUnlocked = !!monster.hiddenAbilityUnlocked || monster.abilitySlug === species.hiddenAbilitySlug;
  if (monster.heldItemSlug && !ITEM_MAP.has(monster.heldItemSlug)) {
    monster.heldItemSlug = null;
    changed = true;
  }
  if (monster.metLocation === undefined) {
    monster.metLocation = species.biome;
    changed = true;
  }
  if (monster.metLevel === undefined) {
    monster.metLevel = monster.level;
    changed = true;
  }
  if (!monster.caughtAt) {
    monster.caughtAt = nowIso();
    changed = true;
  }
  if (!monster.origin) {
    monster.origin = 'storage';
    changed = true;
  }
  if (!monster.boxTag || !PC_BOX_LABELS.includes(monster.boxTag)) {
    monster.boxTag = PC_BOX_LABELS[0];
    changed = true;
  }
  if (monster.experience === undefined) {
    monster.experience = 0;
    changed = true;
  }
  monster.flinched = !!monster.flinched;

  monster.baseStats = species.baseStats;
  monster.types = species.types;
  monster.speciesSlug = species.slug;
  monster.name = species.name;
  monster.starterEligible = species.starterEligible;
  monster.stages = monster.stages || defaultStages();
  const unlockedMoves = availableMoveIdsForLevel(species, monster.level);
  const existingMoves = normalizeMoveStates(monster.moves).filter((moveState) => unlockedMoves.includes(moveState.id));
  const desiredCount = Math.min(4, unlockedMoves.length || 4);
  const fillPool = unlockedMoves.slice(-Math.max(desiredCount, 4));
  for (const moveId of fillPool) {
    if (existingMoves.length >= desiredCount) {
      break;
    }
    if (!existingMoves.some((moveState) => moveState.id === moveId)) {
      const move = MOVE_MAP.get(moveId);
      existingMoves.push({ id: move.id, pp: move.pp, maxPp: move.pp });
      changed = true;
    }
  }
  monster.moves = existingMoves.slice(0, 4);
  monster.formMode = monster.formMode || null;
  monster.formName = monster.formName || null;
  monster.formMoveSet = normalizeMoveStates(monster.formMoveSet);
  monster.baseBattleForm = monster.baseBattleForm?.moves ? { moves: normalizeMoveStates(monster.baseBattleForm.moves) } : null;
  monster.megaEvolved = !!monster.megaEvolved;
  monster.ultraBurst = !!monster.ultraBurst;
  monster.dynamaxed = !!monster.dynamaxed;
  monster.variantShift = !!monster.variantShift;
  monster.zMoveUsed = !!monster.zMoveUsed;

  if (persistedForm) {
    monster.baseBattleForm = { moves: cloneMonster(monster.moves) };
    monster.formMode = persistedForm.mode;
    monster.formName = battleFormName(species.name, persistedForm.mode);
    monster.formMoveSet = persistedForm.formMoves.length ? normalizeMoveStates(persistedForm.formMoves) : buildFormMoveSet(monster, species, persistedForm.mode);
    if (!monster.formMoveSet.length) {
    monster.formMoveSet = buildFormMoveSet(monster, species, persistedForm.mode);
  }
  monster.moves = cloneMonster(monster.formMoveSet);
  monster.stats = scaleFormStats(resolvedMonsterStats(monster, species), persistedForm.mode);
  monster.currentHp = monster.currentHp > 0
    ? Math.max(1, Math.min(monster.stats.hp, Math.round(monster.stats.hp * persistedForm.hpRatio)))
    : 0;
    monster.megaEvolved = persistedForm.mode === 'mega';
    monster.ultraBurst = persistedForm.mode === 'ultra';
    monster.dynamaxed = persistedForm.mode === 'dynamax';
    monster.variantShift = persistedForm.mode === 'variant';
    changed = true;
  }

  return { monster, changed };
}

function normalizeEncounterState(encounter) {
  if (!encounter) {
    return { encounter, changed: false };
  }
  let changed = false;
  if (!Array.isArray(encounter.log)) {
    encounter.log = [];
    changed = true;
  }
  if (!encounter.weather || !WEATHER_LABELS[encounter.weather.type]) {
    encounter.weather = makeWeatherState();
    changed = true;
  }
  if (typeof encounter.weather.turns !== 'number') {
    encounter.weather.turns = 0;
    changed = true;
  }
  if (typeof encounter.captureUsed !== 'boolean') {
    encounter.captureUsed = false;
    changed = true;
  }
  encounter.latestMessage = encounter.log[encounter.log.length - 1] || '';
  return { encounter, changed };
}

function normalizeRunState(run) {
  if (!run) {
    return { run, changed: false };
  }
  let changed = false;
  const normalizeGroup = (group, offset) => {
    group.forEach((monster, index) => {
      const result = normalizeMonster(monster, offset + index);
      if (result.changed) {
        changed = true;
      }
    });
  };
  normalizeGroup(run.party || [], 17);
  normalizeGroup(run.bench || [], 71);
  normalizeGroup(run.encounter?.enemyParty || [], 131);
  const encounterState = normalizeEncounterState(run.encounter);
  if (encounterState.changed) {
    changed = true;
  }
  run.notes = Array.isArray(run.notes) ? run.notes : [];
  run.bag = run.bag || {};
  return { run, changed };
}

function resetCombatState(monster) {
  const hpRatio = monster.stats?.hp ? monster.currentHp / Math.max(1, monster.stats.hp) : 1;
  restoreBaseBattleForm(monster);
  const species = SPECIES_MAP.get(monster.speciesId);
  if (species) {
    monster.stats = resolvedMonsterStats(monster, species);
    monster.currentHp = monster.currentHp > 0
      ? Math.max(1, Math.min(monster.stats.hp, Math.round(monster.stats.hp * hpRatio)))
      : 0;
  }
  monster.stages = defaultStages();
  clearBattleStateFlags(monster);
  monster.flinched = false;
  if (monster.currentHp > 0) {
    monster.status = null;
  }
  for (const move of monster.moves) {
    const moveData = MOVE_MAP.get(move.id);
    move.maxPp = move.maxPp || moveData?.pp || 1;
    move.pp = Math.min(move.maxPp, move.pp ?? move.maxPp);
  }
}

function seedStarterCollection(userId) {
  for (const species of STARTER_SEEDS) {
    const monster = makeMonsterInstance(species.id, 5, { seedOffset: userId, metLocation: 'Guild Nursery', metLevel: 5, origin: 'starter-draft' });
    db.prepare('INSERT INTO collection (user_id, monster_json, starter_unlocked, favorite, created_at) VALUES (?, ?, 1, 0, ?)')
      .run(userId, writeJson(monster), nowIso());
  }
  addInventory(userId, 'potion', 5);
  addInventory(userId, 'poke-ball', 12);
  addInventory(userId, 'great-ball', 3);
}

export function createUser({ username, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedUsername = normalizeUsername(username);
  const usernameLower = normalizedUsername.toLowerCase();
  const role = firstAdminRole();
  const result = db.prepare(`
    INSERT INTO users (username, username_lower, email, password_hash, role, cash, meta_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    normalizedUsername,
    usernameLower,
    normalizedEmail,
    hashPassword(password),
    role,
    role === 'admin' ? 5000 : 1200,
    writeJson(defaultMeta()),
    nowIso(),
  );
  seedStarterCollection(result.lastInsertRowid);
  return getUserById(result.lastInsertRowid);
}

export function authenticateUser(login, password) {
  const user = getUserByLogin(login);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return null;
  }
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(nowIso(), user.id);
  return getUserById(user.id);
}

export function getCollection(userId) {
  return db.prepare('SELECT * FROM collection WHERE user_id = ? ORDER BY id ASC').all(userId).map((row) => {
    const monster = readJson(row.monster_json, null);
    if (!monster) {
      return null;
    }
    const result = normalizeMonster(monster, row.id);
    if (result.changed) {
      updateCollectionMonster(row.id, result.monster);
    }
    return {
      id: row.id,
      starterUnlocked: !!row.starter_unlocked,
      favorite: !!row.favorite,
      monster: result.monster,
      species: SPECIES_MAP.get(result.monster.speciesId),
    };
  }).filter(Boolean);
}

export function getCollectionEntry(userId, collectionId) {
  return getCollection(userId).find((entry) => entry.id === Number(collectionId)) || null;
}

export function updateCollectionMonster(collectionId, monster, userId = 0) {
  db.prepare('UPDATE collection SET monster_json = ? WHERE id = ?').run(writeJson(monster), collectionId);
  if (userId) {
    syncCollectionMonsterToRun(userId, collectionId, monster);
  }
}

export function toggleStarterFlag(userId, collectionId) {
  const row = db.prepare('SELECT starter_unlocked FROM collection WHERE id = ? AND user_id = ?').get(collectionId, userId);
  if (!row) {
    throw new Error('Monster not found.');
  }
  db.prepare('UPDATE collection SET starter_unlocked = ? WHERE id = ?').run(row.starter_unlocked ? 0 : 1, collectionId);
}

export function toggleCollectionFavorite(userId, collectionId) {
  const row = db.prepare('SELECT favorite FROM collection WHERE id = ? AND user_id = ?').get(collectionId, userId);
  if (!row) {
    throw new Error('Monster not found.');
  }
  db.prepare('UPDATE collection SET favorite = ? WHERE id = ?').run(row.favorite ? 0 : 1, collectionId);
}

export function renameCollectionMonster(userId, collectionId, nickname) {
  const row = db.prepare('SELECT monster_json FROM collection WHERE id = ? AND user_id = ?').get(collectionId, userId);
  if (!row) {
    throw new Error('Monster not found.');
  }
  const monster = readJson(row.monster_json, null);
  monster.nickname = String(nickname || '').slice(0, 24);
  updateCollectionMonster(collectionId, monster, userId);
}

export function setCollectionHeldItem(userId, collectionId, itemSlug) {
  const row = db.prepare('SELECT monster_json FROM collection WHERE id = ? AND user_id = ?').get(collectionId, userId);
  if (!row) {
    throw new Error('Monster not found.');
  }
  const monster = readJson(row.monster_json, null);
  const normalized = normalizeMonster(monster, collectionId).monster;
  const currentSlug = normalized.heldItemSlug || null;
  const nextSlug = String(itemSlug || '').trim();

  if (!nextSlug) {
    if (currentSlug) {
      addInventory(userId, currentSlug, 1);
    }
    normalized.heldItemSlug = null;
    updateCollectionMonster(collectionId, normalized, userId);
    return normalized;
  }

  const item = ITEM_MAP.get(nextSlug);
  if (!item || item.category !== 'hold') {
    throw new Error('That item cannot be equipped as a held item.');
  }
  if (currentSlug === nextSlug) {
    return normalized;
  }
  if (!spendInventory(userId, nextSlug, 1)) {
    throw new Error('That hold item is not in your stash.');
  }
  if (currentSlug) {
    addInventory(userId, currentSlug, 1);
  }
  normalized.heldItemSlug = nextSlug;
  updateCollectionMonster(collectionId, normalized, userId);
  return normalized;
}

export function teachCollectionMove(userId, collectionId, moveId, slotIndex) {
  const row = db.prepare('SELECT monster_json FROM collection WHERE id = ? AND user_id = ?').get(collectionId, userId);
  if (!row) {
    throw new Error('Monster not found.');
  }
  const user = getUserById(userId);
  const monster = readJson(row.monster_json, null);
  const normalized = normalizeMonster(monster, collectionId).monster;
  const species = SPECIES_MAP.get(normalized.speciesId);
  const targetMove = MOVE_MAP.get(Number(moveId));
  const index = Number(slotIndex);
  if (!targetMove || !species.movePool.includes(targetMove.id)) {
    throw new Error('That move is not in this monster\'s learnset.');
  }
  const unlockLevel = moveUnlockLevelForIndex(species.movePool.indexOf(targetMove.id), species.stage);
  if (!availableMoveIdsForLevel(species, normalized.level).includes(targetMove.id)) {
    throw new Error('That move unlocks at Lv ' + unlockLevel + '.');
  }
  if (!Number.isInteger(index) || index < 0 || index >= Math.min(4, species.movePool.length || 4)) {
    throw new Error('Choose a valid move slot to replace.');
  }
  const existingIndex = normalized.moves.findIndex((moveState) => moveState.id === targetMove.id);
  if (existingIndex === index) {
    return normalized;
  }
  if (existingIndex >= 0) {
    [normalized.moves[existingIndex], normalized.moves[index]] = [normalized.moves[index], normalized.moves[existingIndex]];
    updateCollectionMonster(collectionId, normalized, userId);
    return normalized;
  }
  const cost = moveTeachingCost(targetMove);
  if (user.cash < cost) {
    throw new Error('Teaching this move costs $' + formatNumber(cost) + ' account cash.');
  }
  changeUserCash(userId, -cost);
  normalized.moves[index] = { id: targetMove.id, pp: targetMove.pp, maxPp: targetMove.pp };
  updateCollectionMonster(collectionId, normalized, userId);
  return normalized;
}

export function setCollectionAbility(userId, collectionId, mode) {
  const row = db.prepare('SELECT monster_json FROM collection WHERE id = ? AND user_id = ?').get(collectionId, userId);
  if (!row) {
    throw new Error('Monster not found.');
  }
  const monster = readJson(row.monster_json, null);
  const normalized = normalizeMonster(monster, collectionId).monster;
  const species = SPECIES_MAP.get(normalized.speciesId);
  const regularAbilities = [...new Set(species.abilityPool || ['battle-aura'])];

  if (mode === 'cycle') {
    if (regularAbilities.length < 2) {
      throw new Error('This monster does not have multiple standard abilities.');
    }
    if (!spendInventory(userId, 'ability-capsule', 1)) {
      throw new Error('No Ability Capsule is available in your stash.');
    }
    const currentIndex = Math.max(0, regularAbilities.indexOf(normalized.abilitySlug));
    normalized.abilitySlug = regularAbilities[(currentIndex + 1) % regularAbilities.length];
  } else if (mode === 'unlock-hidden') {
    if (!species.hiddenAbilitySlug) {
      throw new Error('This monster has no hidden ability data.');
    }
    if (normalized.hiddenAbilityUnlocked && normalized.abilitySlug === species.hiddenAbilitySlug) {
      throw new Error('This monster already has its hidden ability equipped.');
    }
    if (!spendInventory(userId, 'ability-patch', 1)) {
      throw new Error('No Ability Patch is available in your stash.');
    }
    normalized.hiddenAbilityUnlocked = true;
    normalized.abilitySlug = species.hiddenAbilitySlug;
  } else {
    throw new Error('Unknown ability action.');
  }

  updateCollectionMonster(collectionId, normalized, userId);
  return normalized;
}

export function evolveCollectionMonster(userId, collectionId, itemSlug) {
  const row = db.prepare('SELECT monster_json FROM collection WHERE id = ? AND user_id = ?').get(collectionId, userId);
  if (!row) {
    throw new Error('Monster not found.');
  }
  const monster = readJson(row.monster_json, null);
  const normalized = normalizeMonster(monster, collectionId).monster;
  const species = SPECIES_MAP.get(normalized.speciesId);
  const requestedItemSlug = String(itemSlug || '').trim();
  const levelTargetSpecies = species?.evolvesTo ? SPECIES_MAP.get(species.evolvesTo) || null : null;
  const targetSpecies = evolutionTargetForStone(species, requestedItemSlug);
  if (!levelTargetSpecies && !targetSpecies) {
    throw new Error('This monster does not have another evolution.');
  }

  if (!requestedItemSlug) {
    if (!levelTargetSpecies || !species?.evolveLevel) {
      throw new Error('This monster needs a specific evolution item.');
    }
    if (normalized.level < species.evolveLevel) {
      throw new Error(`This monster needs to reach Lv ${species.evolveLevel} first.`);
    }
    evolveMonsterToNextSpecies(normalized, null, '', levelTargetSpecies.id);
    updateCollectionMonster(collectionId, normalized, userId);
    return normalized;
  }

  const item = ITEM_MAP.get(requestedItemSlug);
  if (!item || item.category !== 'evolution') {
    throw new Error('That evolution stone is invalid.');
  }
  if (!speciesCanUseEvolutionStone(species, item.slug) || !targetSpecies) {
    const stoneNames = Object.keys(species?.stoneEvolutionMap || {})
      .map((slug) => ITEM_MAP.get(slug)?.name)
      .filter(Boolean)
      .join(', ');
    throw new Error(stoneNames
      ? `This monster only resonates with ${stoneNames}.`
      : 'This monster has no stone evolution route.');
  }
  if (!spendInventory(userId, item.slug, 1)) {
    throw new Error('That stone is not in your stash.');
  }
  evolveMonsterToNextSpecies(normalized, null, item.name, targetSpecies?.id || species.evolvesTo);
  updateCollectionMonster(collectionId, normalized, userId);
  return normalized;
}

export function setCollectionBox(userId, collectionId, boxTag) {
  const row = db.prepare('SELECT monster_json FROM collection WHERE id = ? AND user_id = ?').get(collectionId, userId);
  if (!row) {
    throw new Error('Monster not found.');
  }
  if (!PC_BOX_LABELS.includes(boxTag)) {
    throw new Error('That PC box does not exist.');
  }
  const monster = readJson(row.monster_json, null);
  const normalized = normalizeMonster(monster, collectionId).monster;
  normalized.boxTag = boxTag;
  updateCollectionMonster(collectionId, normalized, userId);
  return normalized;
}

function refreshCollectionMonsterStats(monster) {
  const species = SPECIES_MAP.get(monster.speciesId);
  rebuildMonsterBoosts(monster);
  monster.stats = resolvedMonsterStats(monster, species, monster.level, monster.statBoosts, monster.nature);
  monster.currentHp = monster.stats.hp;
  return monster;
}

function rebalanceEffortSpreadForTarget(evs, statKey, desiredValue) {
  const next = normalizeStatSpread(evs, 252);
  const desired = clamp(Math.floor(Number(desiredValue || 0)), 0, 252);
  if (!STAT_KEYS.includes(statKey)) {
    return next;
  }
  if (desired <= next[statKey]) {
    next[statKey] = desired;
    return next;
  }
  const needed = desired - next[statKey];
  const room = Math.max(0, 510 - totalEffortValues(next));
  let deficit = Math.max(0, needed - room);
  if (deficit > 0) {
    const donors = STAT_KEYS.filter((key) => key !== statKey).sort((left, right) => next[right] - next[left]);
    for (const donor of donors) {
      if (deficit <= 0) {
        break;
      }
      const removed = Math.min(deficit, next[donor]);
      next[donor] -= removed;
      deficit -= removed;
    }
  }
  next[statKey] = desired;
  return next;
}

function applyIvTrainingItem(monster, item) {
  monster.ivs = normalizeStatSpread(monster.ivs, 31);
  if (item.ivMode === 'all-max') {
    if (STAT_KEYS.every((key) => Number(monster.ivs[key] || 0) >= 31)) {
      return false;
    }
    for (const key of STAT_KEYS) {
      monster.ivs[key] = 31;
    }
    refreshCollectionMonsterStats(monster);
    return true;
  }
  if (!STAT_KEYS.includes(item.ivStat)) {
    return false;
  }
  const nextValue = clamp(Math.floor(Number(item.ivValue || 0)), 0, 31);
  if (Number(monster.ivs[item.ivStat] || 0) === nextValue) {
    return false;
  }
  monster.ivs[item.ivStat] = nextValue;
  refreshCollectionMonsterStats(monster);
  return true;
}

function applyEvTrainingItem(monster, item) {
  monster.evs = normalizeStatSpread(monster.evs, 252);
  if (item.evMode === 'all-reset') {
    if (STAT_KEYS.every((key) => Number(monster.evs[key] || 0) === 0)) {
      return false;
    }
    monster.evs = Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
    refreshCollectionMonsterStats(monster);
    return true;
  }
  if (!STAT_KEYS.includes(item.evStat)) {
    return false;
  }
  const nextValue = clamp(Math.floor(Number(item.evValue || 0)), 0, 252);
  if (Number(monster.evs[item.evStat] || 0) === nextValue) {
    return false;
  }
  monster.evs = rebalanceEffortSpreadForTarget(monster.evs, item.evStat, nextValue);
  refreshCollectionMonsterStats(monster);
  return true;
}

function applyMintToCollectionMonster(monster, item) {
  const targetNature = NATURE_MAP.get(item.targetNature);
  if (!targetNature) {
    return false;
  }
  if (monster.nature === targetNature.slug) {
    return false;
  }
  monster.nature = targetNature.slug;
  refreshCollectionMonsterStats(monster);
  return true;
}

export function useCollectionProgressionItem(userId, collectionId, itemSlug) {
  const row = db.prepare('SELECT monster_json FROM collection WHERE id = ? AND user_id = ?').get(collectionId, userId);
  if (!row) {
    throw new Error('Monster not found.');
  }
  const item = ITEM_MAP.get(itemSlug);
  if (!item || !['level', 'regression', 'iv', 'ev'].includes(item.category)) {
    throw new Error('That progression item is invalid.');
  }
  if (!spendInventory(userId, item.slug, 1)) {
    throw new Error('That item is not in your stash.');
  }
  const monster = readJson(row.monster_json, null);
  const normalized = normalizeMonster(monster, collectionId).monster;
  let changed = false;
  if (item.slug === 'rare-candy') {
    if (normalized.level >= 100) {
      addInventory(userId, item.slug, 1);
      throw new Error('This monster is already level 100.');
    }
    setMonsterLevel(normalized, normalized.level + 1);
    maybeEvolve(normalized);
    changed = true;
  } else if (item.slug === 'deleveler') {
    if (normalized.level <= 1) {
      addInventory(userId, item.slug, 1);
      throw new Error('This monster is already level 1.');
    }
    setMonsterLevel(normalized, 1);
    changed = true;
  } else if (item.slug === 'devolver') {
    if (!devolveMonsterToRoot(normalized, null, item.name)) {
      addInventory(userId, item.slug, 1);
      throw new Error('This monster is already at its baby stage.');
    }
    changed = true;
  } else if (item.category === 'iv') {
    changed = applyIvTrainingItem(normalized, item);
  } else if (item.category === 'ev') {
    changed = applyEvTrainingItem(normalized, item);
  }
  if (!changed) {
    addInventory(userId, item.slug, 1);
    throw new Error('That item would not change this monster right now.');
  }
  updateCollectionMonster(collectionId, normalized, userId);
  return normalized;
}

export function useCollectionStashItem(userId, collectionId, itemSlug) {
  const item = ITEM_MAP.get(itemSlug);
  if (!item) {
    throw new Error('That item does not exist.');
  }
  if (['level', 'regression', 'iv', 'ev'].includes(item.category)) {
    useCollectionProgressionItem(userId, collectionId, item.slug);
    return item;
  }
  if (item.category === 'ability') {
    const abilityMode = item.slug === 'ability-capsule'
      ? 'cycle'
      : item.slug === 'ability-patch'
        ? 'unlock-hidden'
        : '';
    if (!abilityMode) {
      throw new Error('That ability item cannot be used here.');
    }
    setCollectionAbility(userId, collectionId, abilityMode);
    return item;
  }
  if (item.category === 'evolution') {
    evolveCollectionMonster(userId, collectionId, item.slug);
    return item;
  }
  if (item.category === 'hold') {
    const entry = getCollectionEntry(userId, collectionId);
    if (entry?.monster?.heldItemSlug === item.slug) {
      throw new Error('This monster is already holding that item.');
    }
    setCollectionHeldItem(userId, collectionId, item.slug);
    return item;
  }
  if (item.category === 'mint') {
    const row = db.prepare('SELECT monster_json FROM collection WHERE id = ? AND user_id = ?').get(collectionId, userId);
    if (!row) {
      throw new Error('Monster not found.');
    }
    if (!spendInventory(userId, item.slug, 1)) {
      throw new Error('That item is not in your stash.');
    }
    const monster = readJson(row.monster_json, null);
    const normalized = normalizeMonster(monster, collectionId).monster;
    if (!applyMintToCollectionMonster(normalized, item)) {
      addInventory(userId, item.slug, 1);
      throw new Error('That mint would not change this monster right now.');
    }
    updateCollectionMonster(collectionId, normalized, userId);
    return item;
  }
  throw new Error('That stash item cannot be used from the summary screen.');
}

function collectionIdSet(collection) {
  return collection.map((entry) => entry.id);
}

function isPersistentPartyEligibleMonster(monster) {
  return !!monster && !isStarterCandidateMonster(monster) && !isHiddenLegacyStarter(monster) && !monster.hiddenFromStable;
}

function persistentEligibleCollectionEntries(collection) {
  return (collection || []).filter((entry) => isPersistentPartyEligibleMonster(entry.monster));
}

function sortCollectionEntriesForDisplay(entries, options = {}) {
  const partyOrder = new Map((options.partyIds || []).map((id, index) => [Number(id), index]));
  const partnerId = Number(options.partnerCollectionId || 0);
  return [...(entries || [])].sort((left, right) => {
    const leftParty = partyOrder.has(left.id) ? 0 : 1;
    const rightParty = partyOrder.has(right.id) ? 0 : 1;
    if (leftParty !== rightParty) {
      return leftParty - rightParty;
    }
    if (leftParty === 0 && rightParty === 0) {
      return partyOrder.get(left.id) - partyOrder.get(right.id);
    }
    const leftPartner = left.id === partnerId ? 0 : 1;
    const rightPartner = right.id === partnerId ? 0 : 1;
    if (leftPartner !== rightPartner) {
      return leftPartner - rightPartner;
    }
    const leftFavorite = left.favorite ? 0 : 1;
    const rightFavorite = right.favorite ? 0 : 1;
    if (leftFavorite !== rightFavorite) {
      return leftFavorite - rightFavorite;
    }
    const levelDiff = Number(right.monster.level || 0) - Number(left.monster.level || 0);
    if (levelDiff) {
      return levelDiff;
    }
    const totalDiff = totalStats(right.monster.stats || {}) - totalStats(left.monster.stats || {});
    if (totalDiff) {
      return totalDiff;
    }
    const nameDiff = String(left.monster.nickname || left.monster.name || '').localeCompare(String(right.monster.nickname || right.monster.name || ''));
    if (nameDiff) {
      return nameDiff;
    }
    return Number(left.id) - Number(right.id);
  });
}

export function setPersistentPartySlot(userId, slotIndex, collectionId) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const normalizedSlot = Number(slotIndex);
  if (!Number.isInteger(normalizedSlot) || normalizedSlot < 0 || normalizedSlot >= PARTY_SLOT_COUNT) {
    throw new Error('Choose a valid party slot.');
  }
  const collection = persistentEligibleCollectionEntries(getCollection(userId));
  const validIds = collectionIdSet(collection);
  const nextSlots = normalizePartyCollectionIds(user.meta.partyCollectionIds, validIds);
  const targetId = Number(collectionId);
  if (!validIds.includes(targetId)) {
    throw new Error('Only owned non-starter storage monsters can be assigned to the saved party.');
  }
  for (let index = 0; index < nextSlots.length; index += 1) {
    if (nextSlots[index] === targetId) {
      nextSlots[index] = null;
    }
  }
  nextSlots[normalizedSlot] = targetId;
  user.meta.partyCollectionIds = nextSlots;
  saveUserMeta(userId, user.meta);
  return nextSlots;
}

export function clearPersistentPartySlot(userId, slotIndex) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const normalizedSlot = Number(slotIndex);
  if (!Number.isInteger(normalizedSlot) || normalizedSlot < 0 || normalizedSlot >= PARTY_SLOT_COUNT) {
    throw new Error('Choose a valid party slot.');
  }
  const collection = persistentEligibleCollectionEntries(getCollection(userId));
  const nextSlots = normalizePartyCollectionIds(user.meta.partyCollectionIds, collectionIdSet(collection));
  nextSlots[normalizedSlot] = null;
  user.meta.partyCollectionIds = nextSlots;
  saveUserMeta(userId, user.meta);
  return nextSlots;
}

export function setPersistentPartyOrder(userId, collectionIds) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const collection = persistentEligibleCollectionEntries(getCollection(userId));
  const validIds = new Set(collectionIdSet(collection));
  const requested = [];
  const seen = new Set();
  for (let index = 0; index < PARTY_SLOT_COUNT; index += 1) {
    const raw = Number(collectionIds?.[index]);
    if (!Number.isInteger(raw) || raw <= 0) {
      requested.push(null);
      continue;
    }
    if (!validIds.has(raw)) {
      throw new Error('One of the selected monsters is no longer in eligible storage.');
    }
    if (seen.has(raw)) {
      throw new Error('A monster can only occupy one party slot.');
    }
    seen.add(raw);
    requested.push(raw);
  }
  user.meta.partyCollectionIds = requested;
  saveUserMeta(userId, user.meta);
  return requested;
}

export function performHubActivity(userId, activity) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const action = String(activity || '').trim();
  if (action === 'mine') {
    const mineLoot = [
      { kind: 'cash', weight: 68, min: 45, max: 120 },
      { kind: 'item', weight: 10, slug: 'poke-ball', quantity: 2 },
      { kind: 'item', weight: 7, slug: 'great-ball', quantity: 1 },
      { kind: 'item', weight: 5, slug: 'potion', quantity: 2 },
      { kind: 'item', weight: 4, slug: 'super-potion', quantity: 1 },
      { kind: 'item', weight: 2.5, slug: 'capture-orb', quantity: 1 },
      { kind: 'item', weight: 1.2, slug: 'fire-stone', quantity: 1 },
      { kind: 'item', weight: 1.2, slug: 'water-stone', quantity: 1 },
      { kind: 'item', weight: 0.9, slug: 'electric-stone', quantity: 1 },
      { kind: 'item', weight: 0.9, slug: 'grass-stone', quantity: 1 },
      { kind: 'item', weight: 0.55, slug: 'prism-stone', quantity: 1 },
      { kind: 'item', weight: 0.35, slug: 'rare-candy', quantity: 1 },
    ];
    const reward = pickWeightedEntry(mineLoot);
    if (reward.kind === 'cash') {
      const amount = reward.min + Math.floor(Math.random() * (reward.max - reward.min + 1));
      changeUserCash(userId, amount);
      user.meta.miningTrips = Number(user.meta.miningTrips || 0) + 1;
      appendActivityLog(user.meta, `Mining trip found ${formatNumber(amount)} gold.`);
      saveUserMeta(userId, user.meta);
      return { activity: 'mine', rewardLabel: `${formatNumber(amount)} gold` };
    }
    addInventory(userId, reward.slug, reward.quantity || 1);
    user.meta.miningTrips = Number(user.meta.miningTrips || 0) + 1;
    appendActivityLog(user.meta, `Mining trip uncovered ${ITEM_MAP.get(reward.slug)?.name || reward.slug} x${reward.quantity || 1}.`);
    saveUserMeta(userId, user.meta);
    return { activity: 'mine', rewardLabel: `${ITEM_MAP.get(reward.slug)?.name || reward.slug} x${reward.quantity || 1}` };
  }
  if (action === 'dice') {
    const entryCost = 80;
    if (user.cash < entryCost) {
      throw new Error('You need at least 80 gold to roll the dice table.');
    }
    changeUserCash(userId, -entryCost);
    const roll = 1 + Math.floor(Math.random() * 6);
    user.meta.diceGames = Number(user.meta.diceGames || 0) + 1;
    let rewardLabel = `rolled ${roll} and missed`;
    if (roll === 6) {
      changeUserCash(userId, 240);
      user.meta.diceWins = Number(user.meta.diceWins || 0) + 1;
      rewardLabel = 'rolled 6 and won 240 gold';
      if (Math.random() < 0.08) {
        addInventory(userId, 'rare-candy', 1);
        rewardLabel += ' plus Rare Candy x1';
      }
    } else if (roll === 5) {
      changeUserCash(userId, 150);
      user.meta.diceWins = Number(user.meta.diceWins || 0) + 1;
      rewardLabel = 'rolled 5 and won 150 gold';
    } else if (roll === 4) {
      changeUserCash(userId, 90);
      rewardLabel = 'rolled 4 and recovered 90 gold';
    } else if (roll === 3) {
      changeUserCash(userId, 45);
      rewardLabel = 'rolled 3 and recovered 45 gold';
    }
    appendActivityLog(user.meta, `Dice table ${rewardLabel}.`);
    saveUserMeta(userId, user.meta);
    return { activity: 'dice', rewardLabel };
  }
  throw new Error('Unknown hub activity.');
}
export function getNewsState(userId) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const world = getWorldState(userId);
  const nowLabel = `${String(world.clock.hour).padStart(2, '0')}:${String(world.clock.minute).padStart(2, '0')}`;
  const liveFeed = [
    {
      id: `live-event-${world.phase}-${world.clock.totalMinutes}`,
      kind: 'Live',
      title: world.event.label,
      summary: `${world.activeRegion.name} is active right now during ${world.phaseLabel.toLowerCase()}.`,
      publishedAt: nowLabel,
    },
    {
      id: `live-boss-${world.dailyBoss?.slug || 'astravault-omega'}`,
      kind: 'Boss Alert',
      title: `${world.dailyBoss?.name || 'Astravault Omega'} watch`,
      summary: `Daily boss focus is rotating through ${world.activeRegion.name}.`,
      publishedAt: nowLabel,
    },
    {
      id: `live-market-${world.activeRegion.slug}-${world.marketRotation.minutesRemaining}`,
      kind: 'Market',
      title: 'Spotlight cart rotation',
      summary: `Next market refresh in ${world.marketRotation.minutesRemaining} minutes. Featured: ${(world.marketRotation.items || []).slice(0, 3).map((item) => item.name).join(', ')}.`,
      publishedAt: nowLabel,
    },
  ];
  return {
    user,
    world,
    headlines: [...liveFeed, ...ANNOUNCEMENT_FEED],
    upcoming: UPCOMING_BOARD,
  };
}

function gymLeaderRoster(type, seed, levelBase = 18) {
  const pool = SPECIES.filter((species) => species.types.includes(type) && species.stage >= 1);
  return Array.from({ length: 6 }, (_, index) => {
    const species = pool[(seed * 19 + index * 7) % pool.length];
    return makeMonsterInstance(species.id, levelBase + index * 2, {
      seedOffset: seed + index,
      origin: 'gym-preview',
      metLocation: species.biome,
    });
  });
}

export function getGymState(userId) {
  const user = getUserById(userId);
  const world = getWorldState(userId);
  const gymWins = normalizedGymWins(user.meta);
  const unlockedLeague = GYM_LEAGUES.find((league, index) => worldUnlockLevel(user) >= index + 1) || GYM_LEAGUES[0];
  const favoriteLeague = GYM_LEAGUE_MAP.get(user.meta.favoriteLeagueSlug);
  const favoriteLeagueSlug = favoriteLeague && worldUnlockLevel(user) >= GYM_LEAGUES.findIndex((entry) => entry.slug === favoriteLeague.slug) + 1
    ? favoriteLeague.slug
    : unlockedLeague.slug;
  const leagues = GYM_LEAGUES.map((league, leagueIndex) => {
    const unlocked = worldUnlockLevel(user) >= leagueIndex + 1;
    const leaders = league.leaders.map((leader, index) => {
      const slug = `${league.slug}-leader-${leader.slug}`;
      return {
        ...leader,
        slug,
        regionSlug: league.slug,
        roster: gymLeaderRoster(leader.type, leagueIndex * 40 + index + 3, 16 + leagueIndex * 4 + index),
        unlocked,
        completed: !!gymWins[slug],
      };
    });
    const leadersComplete = leaders.every((entry) => entry.completed);
    const eliteFour = league.eliteFour.map((member, index) => {
      const slug = `${league.slug}-elite-${member.slug}`;
      return {
        ...member,
        slug,
        regionSlug: league.slug,
        roster: gymLeaderRoster(member.type, leagueIndex * 60 + index + 27, 38 + leagueIndex * 4 + index * 2),
        unlocked: unlocked && leadersComplete,
        completed: !!gymWins[slug],
      };
    });
    const eliteComplete = eliteFour.every((entry) => entry.completed);
    const champion = {
      ...league.champion,
      slug: `${league.slug}-champion-${league.champion.slug}`,
      regionSlug: league.slug,
      roster: gymLeaderRoster(league.champion.type, leagueIndex * 80 + 55, 54 + leagueIndex * 4),
      unlocked: unlocked && leadersComplete && eliteComplete,
      completed: !!gymWins[`${league.slug}-champion-${league.champion.slug}`],
    };
    return {
      ...league,
      unlocked,
      active: league.slug === favoriteLeagueSlug || (unlocked && !GYM_LEAGUE_MAP.has(user.meta.favoriteLeagueSlug) && leagueIndex === 0),
      leaders,
      eliteFour,
      champion,
      badgeCount: leaders.filter((entry) => entry.completed).length,
      eliteCount: eliteFour.filter((entry) => entry.completed).length,
      clearedCount: leaders.filter((entry) => entry.completed).length + eliteFour.filter((entry) => entry.completed).length + (champion.completed ? 1 : 0),
    };
  });
  return {
    user,
    world,
    activeLeagueSlug: favoriteLeagueSlug,
    regions: leagues.map((league) => ({
      slug: league.slug,
      name: league.name,
      unlocked: league.unlocked,
      active: league.slug === favoriteLeagueSlug,
      badgeCount: league.badgeCount,
      eliteCount: league.eliteCount,
    })),
    leagues,
    totalWins: Object.keys(gymWins).length,
  };
}

function persistentRosterEntriesForUser(userId, allowFallback = false) {
  const user = getUserById(userId);
  if (!user) {
    return [];
  }
  const collection = persistentEligibleCollectionEntries(getCollection(userId));
  const validIds = collectionIdSet(collection);
  const partyIds = normalizePartyCollectionIds(user.meta.partyCollectionIds, validIds);
  const partnerCollectionId = validIds.includes(Number(user.meta.partnerCollectionId || 0))
    ? Number(user.meta.partnerCollectionId)
    : null;
  const collectionMap = new Map(collection.map((entry) => [entry.id, entry]));
  const orderedEntries = [];
  const seen = new Set();
  const pushEntry = (collectionId) => {
    const normalizedId = Number(collectionId || 0);
    if (!normalizedId || seen.has(normalizedId)) {
      return;
    }
    const entry = collectionMap.get(normalizedId);
    if (!entry) {
      return;
    }
    seen.add(normalizedId);
    orderedEntries.push(entry);
  };
  pushEntry(partnerCollectionId);
  partyIds.forEach((collectionId) => pushEntry(collectionId));
  if (allowFallback && orderedEntries.length < PARTY_SLOT_COUNT) {
    const fallbackEntries = sortCollectionEntriesForDisplay(collection, { partyIds, partnerCollectionId });
    fallbackEntries.forEach((entry) => pushEntry(entry.id));
  }
  return orderedEntries.slice(0, PARTY_SLOT_COUNT);
}

function buildSpecialBattleMonster(monster, fallbackSeed = 0) {
  const normalized = normalizeMonster(cloneMonster(monster), fallbackSeed).monster;
  const species = SPECIES_MAP.get(normalized?.speciesId);
  if (!species) {
    throw new Error('A special challenge roster monster could not be loaded.');
  }
  normalized.level = clamp(Math.floor(Number(normalized.level || 1)), 1, 100);
  rebuildMonsterLearnset(normalized, species, { restoreFullPp: true });
  normalized.stats = resolvedMonsterStats(normalized, species, normalized.level, normalized.statBoosts, normalized.nature);
  normalized.currentHp = normalized.stats.hp;
  normalized.status = null;
  delete normalized.sourceCollectionId;
  resetCombatState(normalized);
  normalized.currentHp = normalized.stats.hp;
  return normalized;
}

function specialRunStartingCash(mode) {
  if (mode === 'gym') {
    return 280;
  }
  if (mode === 'arena') {
    return 240;
  }
  return 220;
}

function createSpecialRunForUser(userId, options = {}) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const mode = ['gym', 'arena', 'adventure'].includes(options.mode) ? options.mode : 'arena';
  const party = specialRunParty(userId, mode);
  const enemyParty = (options.enemyParty || []).map((monster, index) => buildSpecialBattleMonster(monster, 900 + index));
  if (!enemyParty.length) {
    throw new Error('That challenge has no battle roster yet.');
  }
  const trainerBonuses = trainerGearBonuses(user.meta);
  const premiumBoosts = premiumRunBoostsForUser(userId);
  const trainerProgress = trainerProgressionSummary(user);
  applyTrainerGearBonusesToParty(party, trainerBonuses);

  const activeRow = getActiveRunRow(userId);
  if (activeRow) {
    db.prepare('UPDATE runs SET status = ?, updated_at = ? WHERE id = ?').run('abandoned', nowIso(), activeRow.id);
  }

  const world = options.world || getWorldState(userId);
  const encounterKind = options.encounterKind === 'wild' ? 'wild' : options.encounterKind === 'boss' ? 'boss' : 'trainer';
  const label = String(options.label || options.title || `${capitalized(mode)} Challenge`).trim();
  const title = String(options.title || label).trim();
  const biome = String(options.biome || options.regionName || world.activeRegion?.name || 'Frontier').trim();
  const regionName = String(options.regionName || world.activeRegion?.name || 'Frontier').trim();
  const regionSlug = String(options.regionSlug || world.activeRegion?.slug || 'frontier').trim();
  const typeFocus = String(options.typeFocus || SPECIES_MAP.get(enemyParty[0]?.speciesId)?.types?.[0] || 'normal');
  const startingCash = Math.max(0, specialRunStartingCash(mode) + Math.round(Number(trainerProgress.bonuses.startingCashBonus || 0)));
  const run = {
    userId,
    mode,
    challengeSlug: null,
    starterDraftSlug: 'special-challenge-style',
    wave: 1,
    money: startingCash,
    startingCash,
    totalRunCashEarned: 0,
    accountCashEarned: 0,
    party,
    bench: [],
    bag: buildStarterBag(userId),
    captures: 0,
    createdAt: nowIso(),
    pendingReward: null,
    encounter: null,
    premiumBoosts,
    progressionBoosts: { ...trainerProgress.bonuses },
    trainerProfile: {
      classSlug: trainerProgress.activeClass.slug,
      className: trainerProgress.activeClass.name,
      titleSlug: trainerProgress.selectedTitle.slug,
      titleName: trainerProgress.selectedTitle.name,
      level: trainerProgress.profile.level,
    },
    trainerLoadout: {
      equipped: (trainerBonuses.sources || trainerBonuses.equipped || []).map((entry) => entry.slug),
      statBoosts: trainerBonuses.statBoosts,
    },
    special: {
      kind: mode,
      label,
      battleSlug: options.battleSlug || null,
      singleEncounter: true,
      extra: { ...(options.extra || {}) },
    },
    notes: [
      `${label} launched from the ${capitalized(mode)} board.`,
      `${party.map((monster) => monster.nickname || monster.name).join(', ')} entered from your saved roster.`,
    ],
  };

  if (trainerBonuses.hasBoost) {
    const loadoutSources = trainerBonuses.sources || trainerBonuses.equipped || [];
    const loadoutLabel = loadoutSources.map((entry) => entry.name).join(' + ');
    run.notes.push('Loadout bonus active: ' + loadoutLabel + '.');
    run.notes.push('Party stat bonus: ' + statSpreadSummary(trainerBonuses.statBoosts, '%'));
  }
  if (trainerProgress.bonuses.startingCashBonus > 0) {
    run.notes.push('Trainer build bonus: +' + Math.round(trainerProgress.bonuses.startingCashBonus) + ' starting cash.');
  }

  const encounterRng = seeded((userId * 173 + enemyParty.length * 31 + label.length * 19) >>> 0);
  const weather = pickEncounterWeather(biome, typeFocus, encounterKind, encounterRng);
  const log = [
    String(options.introLine || `${title} opens in ${biome}.`),
    `${world.phaseLabel} covers the route. ${world.event.label}`,
  ];
  if (weather.type !== 'clear') {
    log.push(WEATHER_LABELS[weather.type] + ' fills the field.');
  }
  run.encounter = {
    kind: encounterKind,
    title,
    biome,
    region: regionName,
    regionSlug,
    phase: world.phase,
    ambientEvent: world.event,
    weather,
    turn: 1,
    playerIndex: firstAliveIndex(run.party),
    enemyIndex: 0,
    enemyParty,
    playerDamageBonus: 1 * (1 + Number(run.progressionBoosts.playerDamageBonus || 0)),
    canCapture: !!options.allowCapture,
    captureUsed: false,
    log,
    latestMessage: log[log.length - 1],
  };

  bumpProgressStat(user.meta, 'runsStarted', 1);
  saveUserMeta(userId, user.meta);

  const result = db.prepare('INSERT INTO runs (user_id, status, mode, challenge_slug, summary_json, run_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, 'active', mode, null, null, writeJson(run), nowIso(), nowIso());
  run.rowId = result.lastInsertRowid;
  persistRun(run.rowId, run);
  return run;
}

export function startGymChallenge(userId, battleSlug) {
  const state = getGymState(userId);
  const allMatches = state.leagues.flatMap((league) => [
    ...league.leaders.map((entry) => ({ league, entry, stage: 'leader' })),
    ...league.eliteFour.map((entry) => ({ league, entry, stage: 'elite' })),
    { league, entry: league.champion, stage: 'champion' },
  ]);
  const match = allMatches.find((entry) => entry.entry.slug === battleSlug);
  if (!match || !match.entry.unlocked) {
    throw new Error('That league battle is not unlocked yet.');
  }
  return createSpecialRunForUser(userId, {
    mode: 'gym',
    battleSlug: match.entry.slug,
    label: `${match.league.name} ${match.entry.name}`,
    title: `${match.entry.name} - ${match.league.banner}`,
    regionName: match.league.name,
    regionSlug: match.league.slug,
    biome: `${match.league.banner} Stadium`,
    enemyParty: match.entry.roster,
    typeFocus: match.entry.type,
    encounterKind: match.stage === 'leader' ? 'trainer' : 'boss',
    world: state.world,
    rewardLabel: match.stage === 'leader' ? match.entry.badgeName : match.entry.title || `${match.league.name} clear`,
    introLine: `${match.entry.name} steps forward under the ${match.league.banner} lights.`,
    extra: {
      stage: match.stage,
      leagueSlug: match.league.slug,
      leagueName: match.league.name,
      opponentName: match.entry.name,
      badgeName: match.entry.badgeName || null,
    },
  });
}

export function getStarterPool(userId) {
  ensureStarterDraftCandidates(userId);
  return getCollection(userId).filter((entry) => isStarterCandidateMonster(entry.monster));
}

function stageMultiplier(stage) {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

function alive(monster) {
  return monster && monster.currentHp > 0;
}

function currentMonster(team, index) {
  return team[index] || null;
}

function firstAliveIndex(team) {
  return team.findIndex((monster) => alive(monster));
}

function teamAlive(team) {
  return team.some((monster) => alive(monster));
}

function healMonster(monster, amount) {
  if (!monster || monster.currentHp <= 0) {
    return 0;
  }
  const totalAmount = Math.max(0, Math.floor(amount * (1 + (monster.healingBoost || 0))));
  const healed = Math.min(monster.stats.hp - monster.currentHp, totalAmount);
  monster.currentHp += healed;
  return healed;
}

function restoreMovePp(monster, amount = 1) {
  if (!monster || !Array.isArray(monster.moves) || amount <= 0) {
    return 0;
  }
  const move = monster.moves
    .filter((entry) => Number(entry.maxPp || 0) > 0)
    .sort((left, right) => ((left.pp || 0) / Math.max(1, left.maxPp || 1)) - ((right.pp || 0) / Math.max(1, right.maxPp || 1)))[0];
  if (!move || move.pp >= move.maxPp) {
    return 0;
  }
  const gained = Math.min(amount, move.maxPp - move.pp);
  move.pp += gained;
  return gained;
}

function restorePartyPp(party, amount = 1) {
  return (party || []).reduce((sum, monster) => sum + restoreMovePp(monster, amount), 0);
}

function reviveMonster(monster, ratio = 0.5) {
  if (!monster || monster.currentHp > 0) {
    return false;
  }
  monster.currentHp = Math.max(1, Math.floor(monster.stats.hp * ratio));
  monster.status = null;
  monster.stages = defaultStages();
  return true;
}

function typeMultiplier(moveType, targetTypes) {
  return targetTypes.reduce((multiplier, targetType) => multiplier * (TYPE_CHART[moveType]?.[targetType] ?? 1), 1);
}

function getHeldItem(monster) {
  return monster?.heldItemSlug ? ITEM_MAP.get(monster.heldItemSlug) || null : null;
}

function getMonsterAbility(monster) {
  return ABILITY_MAP.get(monster?.abilitySlug) || ABILITY_MAP.get('battle-aura');
}

function auraSlug(monster) {
  return auraInfoForMonster(monster).slug;
}

function hasAura(monster, slug) {
  return auraSlug(monster) === slug;
}

function auraBlocksStatus(defender, attacker = null) {
  if (hasAura(defender, 'metallic') && !hasAura(attacker, 'shadow')) {
    return true;
  }
  if (hasAura(defender, 'mirage') && hasAura(attacker, 'metallic') && !hasAura(attacker, 'shadow')) {
    return true;
  }
  return false;
}

function maybeTransferMirageStatus(mirageMonster, opponent, encounter) {
  if (!hasAura(mirageMonster, 'mirage') || !hasAura(opponent, 'shadow') || !mirageMonster.status) {
    return;
  }
  if (auraBlocksStatus(opponent, mirageMonster) || opponent.status) {
    mirageMonster.status = null;
    logLine(encounter, (mirageMonster.nickname || mirageMonster.name) + ' washed away its ailment in the Mirage/Shadow clash.');
    return;
  }
  opponent.status = { ...mirageMonster.status };
  const transferred = opponent.status.type;
  mirageMonster.status = null;
  logLine(encounter, (mirageMonster.nickname || mirageMonster.name) + ' mirrored ' + transferred + ' back onto ' + (opponent.nickname || opponent.name) + '.');
}

function auraDamageMultiplier(attacker, defender, move) {
  if (move.category === 'status') {
    return 1;
  }
  let multiplier = 1;
  if (hasAura(attacker, 'dark-aura')) {
    multiplier *= 1.25;
  }
  if (hasAura(attacker, 'mirage') && hasAura(defender, 'dark-aura')) {
    multiplier *= 1.2;
  }
  if (hasAura(attacker, 'mirage') && hasAura(defender, 'normal')) {
    multiplier *= 0.9;
  }
  if (hasAura(defender, 'mirage') && hasAura(attacker, 'shiny')) {
    multiplier *= 0.84;
  }
  if (hasAura(defender, 'mirage') && hasAura(attacker, 'normal')) {
    multiplier *= 1.1;
  }
  return multiplier;
}

function extraAuraFlinchChance(attacker, defender, move) {
  if (move.category === 'status' || hasAura(defender, 'shadow')) {
    return 0;
  }
  let chance = 0;
  if (hasAura(attacker, 'ghostly')) {
    chance = Math.max(chance, 0.14);
  }
  if (hasAura(attacker, 'mirage') && (hasAura(defender, 'ghostly') || hasAura(defender, 'metallic'))) {
    chance = Math.max(chance, 0.12);
  }
  if (getHeldItem(attacker)?.holdEffect === 'flinch-charm') {
    chance = Math.max(chance, 0.1);
  }
  return chance;
}

function monsterCanStillEvolve(monster) {
  const species = SPECIES_MAP.get(monster.speciesId);
  return !!(species?.evolvesTo || Object.keys(species?.stoneEvolutionMap || {}).length);
}

function clearBattleStateFlags(monster) {
  monster.choiceLockMoveId = null;
  monster.critBoost = 0;
  monster.guardSpecTurns = 0;
  monster.megaEvolved = false;
  monster.ultraBurst = false;
  monster.dynamaxed = false;
  monster.variantShift = false;
  monster.zMoveUsed = false;
  monster.flinched = false;
}

function hasBattleForm(monster) {
  return !!(monster?.megaEvolved || monster?.ultraBurst || monster?.dynamaxed || monster?.variantShift || monster?.formMode);
}

function battleFormName(baseName, mode) {
  if (mode === 'mega') {
    return 'Mega ' + baseName;
  }
  if (mode === 'ultra') {
    return 'Ultra ' + baseName;
  }
  if (mode === 'dynamax') {
    return 'Dynamax ' + baseName;
  }
  if (mode === 'variant') {
    return 'Variant ' + baseName;
  }
  return baseName;
}

function formStatScales(mode) {
  if (mode === 'mega') {
    return { hp: 1.08, atk: 1.22, def: 1.16, spa: 1.18, spd: 1.12, spe: 1.1 };
  }
  if (mode === 'ultra') {
    return { hp: 1.12, atk: 1.24, def: 1.18, spa: 1.26, spd: 1.18, spe: 1.2 };
  }
  if (mode === 'dynamax') {
    return { hp: 1.45, atk: 1.12, def: 1.1, spa: 1.12, spd: 1.1, spe: 1.05 };
  }
  if (mode === 'variant') {
    return { hp: 1.1, atk: 1.1, def: 1.14, spa: 1.14, spd: 1.16, spe: 1.1 };
  }
  return { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
}

function scaleFormStats(baseStats, mode) {
  const scales = formStatScales(mode);
  return Object.fromEntries(Object.entries(baseStats).map(([key, value]) => [key, Math.max(1, Math.floor(value * (scales[key] || 1)))]));
}

function formMoveTitle(move, mode, index) {
  const slot = index % 4;
  if (mode === 'mega') {
    return ['Titan', 'Apex', 'Overdrive', 'Primal'][slot] + ' ' + move.name;
  }
  if (mode === 'ultra') {
    return ['Nova', 'Prism', 'Zenith', 'Void'][slot] + ' ' + move.name;
  }
  if (mode === 'dynamax') {
    if (move.category === 'status') {
      return ['Max Guard', 'Max Ward', 'Max Pulse', 'Max Bloom'][slot];
    }
    return 'Max ' + capitalized(move.type) + ' ' + ['Crash', 'Surge', 'Break', 'Burst'][slot];
  }
  if (mode === 'variant') {
    return ['Alter', 'Echo', 'Shift', 'Delta'][slot] + ' ' + move.name;
  }
  return move.name;
}

function formEffectPriority(mode) {
  if (mode === 'mega') {
    return ['recoil', 'damage', 'poison', 'burn', 'debuff-def', 'buff-atk', 'buff-spe', 'focus'];
  }
  if (mode === 'ultra') {
    return ['special', 'damage', 'drain', 'paralyze', 'debuff-def', 'buff-spa', 'focus', 'debuff-atk'];
  }
  if (mode === 'dynamax') {
    return ['damage', 'special', 'burn', 'paralyze', 'weather-sun', 'weather-rain', 'buff-atk', 'buff-def'];
  }
  return ['cleanse', 'debuff-atk', 'debuff-def', 'poison', 'paralyze', 'heal', 'buff-spd', 'buff-spe'];
}

function scoreMoveForForm(monster, move, mode) {
  const priority = formEffectPriority(mode);
  const effectRank = priority.includes(move.effect) ? (priority.length - priority.indexOf(move.effect)) * 22 : 0;
  const sameType = monster.types.includes(move.type) ? 24 : 8;
  const novelty = (monster.moves || []).some((moveState) => moveState.id === move.id) ? 0 : 16;
  const powerScore = move.category === 'status' ? 42 : (move.power || 0) + move.tier * 24;
  const accuracyScore = move.accuracy * 0.18;
  const priorityScore = move.priority > 0 ? 18 : 0;
  const variantSupport = mode === 'variant' && move.category === 'status' ? 34 : 0;
  return effectRank + sameType + novelty + powerScore + accuracyScore + priorityScore + variantSupport;
}

function makeFormMoveState(move, mode, index) {
  return {
    id: move.id,
    pp: move.pp,
    maxPp: move.pp,
    sourceForm: mode,
    displayName: formMoveTitle(move, mode, index),
    displayDescription: battleFormName('', mode).trim() + ' move based on ' + move.name + '.',
  };
}

function buildFormMoveSet(monster, species, mode) {
  const unlocked = availableMoveIdsForLevel(species, monster.level);
  const tierCap = clamp(Math.ceil(monster.level / 20) + (mode === 'ultra' ? 1 : 0), 1, 5);
  const typeMoves = MOVES.filter((move) => species.types.includes(move.type) && move.tier <= tierCap + (mode === 'dynamax' ? 1 : 0));
  const utilityMoves = MOVES.filter((move) => move.category === 'status' && species.types.includes(move.type) && move.tier <= tierCap);
  const candidateIds = [...new Set([...unlocked, ...typeMoves.map((move) => move.id), ...utilityMoves.map((move) => move.id)])];
  const scoredMoves = candidateIds.map((moveId) => MOVE_MAP.get(moveId)).filter(Boolean).sort((left, right) => scoreMoveForForm(monster, right, mode) - scoreMoveForForm(monster, left, mode));
  const selected = [];
  const seenEffects = new Set();
  const seenTypes = new Set();
  for (const move of scoredMoves) {
    const repeatedEffect = seenEffects.has(move.effect);
    const repeatedType = seenTypes.has(move.type);
    if (selected.length < 2 || !repeatedEffect || !repeatedType || move.category !== 'status') {
      selected.push(makeFormMoveState(move, mode, selected.length));
      seenEffects.add(move.effect);
      seenTypes.add(move.type);
    }
    if (selected.length >= 4) {
      break;
    }
  }
  for (const move of scoredMoves) {
    if (selected.length >= 4) {
      break;
    }
    if (!selected.some((moveState) => moveState.id === move.id)) {
      selected.push(makeFormMoveState(move, mode, selected.length));
    }
  }
  return selected.slice(0, 4);
}

function restoreBaseBattleForm(monster) {
  if (!monster?.baseBattleForm?.moves) {
    monster.formMode = null;
    monster.formName = null;
    monster.formMoveSet = null;
    monster.baseBattleForm = null;
    monster.variantShift = false;
    return;
  }
  monster.moves = normalizeMoveStates(monster.baseBattleForm.moves);
  monster.formMode = null;
  monster.formName = null;
  monster.formMoveSet = null;
  monster.baseBattleForm = null;
  monster.megaEvolved = false;
  monster.ultraBurst = false;
  monster.dynamaxed = false;
  monster.variantShift = false;
}

function consumeHeldItem(monster, encounter, reason) {
  const item = getHeldItem(monster);
  if (!item) {
    return null;
  }
  delete monster.heldItemSlug;
  if (reason && encounter) {
    logLine(encounter, (monster.nickname || monster.name) + ' used ' + item.name + '. ' + reason);
  }
  return item;
}

function canMegaEvolve(monster) {
  const species = SPECIES_MAP.get(monster?.speciesId);
  const heldItem = getHeldItem(monster);
  return !!species && species.stage >= 2 && heldItem?.holdEffect === 'mega-stone' && !hasBattleForm(monster);
}

function canUltraBurst(monster) {
  const species = SPECIES_MAP.get(monster?.speciesId);
  const heldItem = getHeldItem(monster);
  return !!species && species.stage >= 3 && heldItem?.holdEffect === 'ultra-core' && !hasBattleForm(monster);
}

function canDynamax(monster) {
  const heldItem = getHeldItem(monster);
  return heldItem?.holdEffect === 'dynamax-band' && !hasBattleForm(monster);
}

function canVariantShift(monster) {
  const heldItem = getHeldItem(monster);
  return heldItem?.holdEffect === 'variant-core' && !hasBattleForm(monster);
}

function canUseZMove(monster, move) {
  const heldItem = getHeldItem(monster);
  return !!move && heldItem?.holdEffect === 'z-crystal' && !monster.zMoveUsed && (!heldItem.holdType || heldItem.holdType === move.type);
}

function battleMovePriority(monster, moveState) {
  let priority = MOVE_MAP.get(moveState?.id)?.priority || 0;
  const heldItem = getHeldItem(monster);
  if (heldItem?.holdEffect === 'quick-claw' && Math.random() < 0.22) {
    priority += 1;
  }
  return priority;
}

function applyBattleForm(monster, mode, encounter) {
  const species = SPECIES_MAP.get(monster?.speciesId);
  if (!species || hasBattleForm(monster)) {
    return false;
  }
  const hpRatio = monster.stats?.hp ? monster.currentHp / Math.max(1, monster.stats.hp) : 1;
  monster.baseBattleForm = { moves: cloneMonster(normalizeMoveStates(monster.moves)) };
  monster.formMode = mode;
  monster.formName = battleFormName(species.name, mode);
  monster.formMoveSet = buildFormMoveSet(monster, species, mode);
  if (monster.formMoveSet.length) {
    monster.moves = cloneMonster(monster.formMoveSet);
  }
  monster.stats = scaleFormStats(resolvedMonsterStats(monster, species), mode);
  monster.currentHp = Math.max(1, Math.min(monster.stats.hp, Math.round(monster.stats.hp * hpRatio)));
  monster.megaEvolved = mode === 'mega';
  monster.ultraBurst = mode === 'ultra';
  monster.dynamaxed = mode === 'dynamax';
  monster.variantShift = mode === 'variant';
  const message = mode === 'mega'
    ? ' Mega Evolved!'
    : mode === 'ultra'
      ? ' unleashed an Ultra Burst!'
      : mode === 'dynamax'
        ? ' roared into Dynamax form!'
        : ' shifted into a Variant Form!';
  logLine(encounter, (monster.nickname || monster.name) + message);
  return true;
}

function effectiveStat(monster, key, encounter = null) {
  const stage = monster.stages?.[key] || 0;
  let value = monster.stats[key] * stageMultiplier(stage);
  const heldItem = getHeldItem(monster);
  const ability = getMonsterAbility(monster);
  if (key === 'atk' && monster.status?.type === 'burn' && ability.slug !== 'guts') {
    value *= 0.85;
  }
  if (key === 'atk' && monster.status && ability.slug === 'guts') {
    value *= 1.3;
  }
  if (key === 'spe' && monster.status?.type === 'paralyze') {
    value *= 0.75;
  }
  if (heldItem?.holdEffect === 'choice-band' && key === 'atk') {
    value *= 1.5;
  }
  if (heldItem?.holdEffect === 'choice-specs' && key === 'spa') {
    value *= 1.5;
  }
  if (heldItem?.holdEffect === 'choice-scarf' && key === 'spe') {
    value *= 1.5;
  }
  if (heldItem?.holdEffect === 'assault-vest' && key === 'spd') {
    value *= 1.5;
  }
  if (heldItem?.holdEffect === 'stat-boost' && heldItem.holdStat === key) {
    value *= heldItem.holdValue || 1.15;
  }
  if (heldItem?.holdEffect === 'eviolite' && (key === 'def' || key === 'spd') && monsterCanStillEvolve(monster)) {
    value *= 1.5;
  }
  if (key === 'spe' && encounter?.weather?.type === 'sun' && ability.slug === 'chlorophyll') {
    value *= 1.5;
  }
  if (key === 'spe' && encounter?.weather?.type === 'rain' && ability.slug === 'swift-swim') {
    value *= 1.5;
  }
  return Math.max(1, Math.floor(value));
}

function accuracyMultiplier(attacker, defender, encounter = null) {
  const attackerStage = attacker.stages?.accuracy || 0;
  const defenderStage = defender.stages?.evasion || 0;
  let multiplier = stageMultiplier(attackerStage) / stageMultiplier(defenderStage);
  const heldItem = getHeldItem(attacker);
  if (heldItem?.holdEffect === 'wide-lens') {
    multiplier *= 1.1;
  }
  if (heldItem?.holdEffect === 'zoom-lens' && effectiveStat(attacker, 'spe', encounter) < effectiveStat(defender, 'spe', encounter)) {
    multiplier *= 1.2;
  }
  return multiplier;
}

function critChanceFor(monster) {
  const heldItem = getHeldItem(monster);
  const itemBonus = heldItem?.holdEffect === 'scope-lens' || heldItem?.holdEffect === 'crit-boost' ? 1 : 0;
  const chromeBonus = hasAura(monster, 'chrome') ? 0.08 : 0;
  return Math.min(0.62, 0.08 + chromeBonus + ((monster.critBoost || 0) + itemBonus) * 0.08);
}

function canMonsterUseMove(monster, moveState) {
  const move = MOVE_MAP.get(moveState?.id);
  if (!move || !moveState || moveState.pp <= 0) {
    return false;
  }
  const heldItem = getHeldItem(monster);
  if (heldItem?.holdEffect === 'assault-vest' && move.category === 'status') {
    return false;
  }
  if ((heldItem?.holdEffect === 'choice-band' || heldItem?.holdEffect === 'choice-specs' || heldItem?.holdEffect === 'choice-scarf')
    && monster.choiceLockMoveId && monster.choiceLockMoveId !== move.id) {
    return false;
  }
  return true;
}

function weatherPowerMultiplier(moveType, encounter) {
  if (!encounter?.weather || encounter.weather.type === 'clear') {
    return 1;
  }
  if (encounter.weather.type === 'sun') {
    if (moveType === 'fire') {
      return 1.2;
    }
    if (moveType === 'water') {
      return 0.85;
    }
  }
  if (encounter.weather.type === 'rain') {
    if (moveType === 'water') {
      return 1.2;
    }
    if (moveType === 'fire') {
      return 0.85;
    }
  }
  return 1;
}

function abilityMoveMultiplier(monster, move, encounter) {
  const ability = getMonsterAbility(monster);
  const lowHp = monster.currentHp <= monster.stats.hp / 3;
  let multiplier = 1;
  if (lowHp && ((ability.slug === 'blaze' && move.type === 'fire')
    || (ability.slug === 'torrent' && move.type === 'water')
    || (ability.slug === 'overgrow' && move.type === 'grass')
    || (ability.slug === 'swarm' && move.type === 'bug'))) {
    multiplier *= 1.3;
  }
  if (ability.slug === 'battle-aura' && encounter?.weather?.type === 'clear' && move.category !== 'status') {
    multiplier *= 1.04;
  }
  if (ability.slug === 'technician' && move.category !== 'status' && (move.power || 0) <= 60) {
    multiplier *= 1.22;
  }
  if (ability.slug === 'prism-surge' && monster.types.includes(move.type)) {
    multiplier *= 1.1;
  }
  return multiplier;
}

function stabMultiplier(monster, move) {
  if (!monster.types.includes(move.type)) {
    return 1;
  }
  return getMonsterAbility(monster).slug === 'adaptability' ? 1.5 : 1.2;
}

function secondaryEffectMultiplier(monster) {
  return getMonsterAbility(monster).slug === 'serene-grace' ? 1.8 : 1;
}

function defensiveAbilityMultiplier(defender, move) {
  const ability = getMonsterAbility(defender);
  let multiplier = 1;
  if (ability.slug === 'thick-fat' && (move.type === 'fire' || move.type === 'ice')) {
    multiplier *= 0.75;
  }
  if (ability.slug === 'multiscale' && defender.currentHp === defender.stats.hp) {
    multiplier *= 0.72;
  }
  return multiplier;
}

function blocksIndirectDamage(monster) {
  return getMonsterAbility(monster).slug === 'magic-guard';
}

function moveItemMultiplier(attacker, move, effectiveness) {
  const heldItem = getHeldItem(attacker);
  let multiplier = 1;
  if (heldItem?.holdEffect === 'life-orb') {
    multiplier *= 1.2;
  }
  if (heldItem?.holdEffect === 'expert-belt' && effectiveness > 1) {
    multiplier *= 1.18;
  }
  if (heldItem?.holdEffect === 'muscle-band' && move.category === 'physical') {
    multiplier *= 1.1;
  }
  if (heldItem?.holdEffect === 'wise-glasses' && move.category === 'special') {
    multiplier *= 1.1;
  }
  if (heldItem?.holdEffect === 'type-boost' && heldItem.holdType === move.type) {
    multiplier *= 1.15;
  }
  return multiplier;
}

function maybeTriggerLowHpHold(monster, encounter) {
  const heldItem = getHeldItem(monster);
  if (!heldItem || monster.currentHp <= 0) {
    return;
  }

  if (heldItem.holdEffect === 'berry') {
    if ((heldItem.berryEffect === 'heal-low' || heldItem.berryEffect === 'heal-low-percent') && monster.currentHp <= monster.stats.hp / 2) {
      const healed = heldItem.berryEffect === 'heal-low-percent'
        ? healMonster(monster, Math.floor(monster.stats.hp * heldItem.berryValue))
        : healMonster(monster, 10);
      consumeHeldItem(monster, encounter, 'It restored ' + healed + ' HP.');
      return;
    }
    if (heldItem.berryEffect === 'cure-any' && monster.status) {
      monster.status = null;
      consumeHeldItem(monster, encounter, 'It cured the holder\'s status.');
      return;
    }
    if (heldItem.berryEffect === 'cure-status' && monster.status?.type === heldItem.berryValue) {
      monster.status = null;
      consumeHeldItem(monster, encounter, 'It cured the holder\'s status.');
      return;
    }
    if (heldItem.berryEffect === 'boost-low' && monster.currentHp <= monster.stats.hp / 3) {
      monster.stages[heldItem.berryValue] = clamp((monster.stages[heldItem.berryValue] || 0) + 1, -6, 6);
      consumeHeldItem(monster, encounter, 'It raised ' + heldItem.berryValue.toUpperCase() + '.');
      return;
    }
    if (heldItem.berryEffect === 'crit-low' && monster.currentHp <= monster.stats.hp / 3) {
      monster.critBoost = (monster.critBoost || 0) + 1;
      consumeHeldItem(monster, encounter, 'It sharpened critical hits.');
    }
  }
}

function maybeApplyDefensiveItem(defender, move, effectiveness, encounter) {
  const heldItem = getHeldItem(defender);
  if (heldItem?.holdEffect === 'berry' && heldItem.berryEffect === 'resist-type' && effectiveness > 1 && heldItem.berryValue === move.type) {
    consumeHeldItem(defender, encounter, 'It softened the super-effective blow.');
    return 0.5;
  }
  if (heldItem?.holdEffect === 'super-guard' && effectiveness > 1) {
    return 0.85;
  }
  return 1;
}

function maybePreventKnockout(defender, damage, encounter) {
  if (damage < defender.currentHp) {
    return damage;
  }
  const heldItem = getHeldItem(defender);
  const ability = getMonsterAbility(defender);
  if (ability.slug === 'sturdy' && defender.currentHp === defender.stats.hp) {
    logLine(encounter, (defender.nickname || defender.name) + ' endured the hit with Sturdy.');
    return defender.currentHp - 1;
  }
  if (heldItem?.holdEffect === 'focus-sash' && defender.currentHp === defender.stats.hp) {
    consumeHeldItem(defender, encounter, 'It let the holder hang on with 1 HP.');
    return defender.currentHp - 1;
  }
  if (heldItem?.holdEffect === 'focus-band' && Math.random() < 0.12) {
    logLine(encounter, (defender.nickname || defender.name) + ' hung on thanks to Focus Band.');
    return defender.currentHp - 1;
  }
  return damage;
}

function applyAfterHitEffects(attacker, defender, move, damage, effectiveness, encounter) {
  const attackerItem = getHeldItem(attacker);
  const defenderItem = getHeldItem(defender);
  const attackerAbility = getMonsterAbility(attacker);
  const defenderAbility = getMonsterAbility(defender);
  if (move.effect === 'drain' && damage > 0) {
    const drainScale = attackerItem?.holdEffect === 'big-root' ? 0.65 : 0.5;
    const healed = healMonster(attacker, Math.max(1, Math.floor(damage * drainScale)));
    logLine(encounter, (attacker.nickname || attacker.name) + ' siphoned ' + healed + ' HP.');
  }
  if (move.effect === 'recoil' && damage > 0 && attacker.currentHp > 0 && !blocksIndirectDamage(attacker)) {
    const recoil = Math.max(1, Math.floor(damage * 0.18));
    attacker.currentHp = Math.max(1, attacker.currentHp - recoil);
    logLine(encounter, (attacker.nickname || attacker.name) + ' was rattled by recoil.');
  }
  if (attackerItem?.holdEffect === 'shell-bell' && damage > 0) {
    const healed = healMonster(attacker, Math.max(1, Math.floor(damage / 8)));
    if (healed > 0) {
      logLine(encounter, (attacker.nickname || attacker.name) + ' recovered HP with Shell Bell.');
    }
  }
  if (attackerItem?.holdEffect === 'life-orb' && attacker.currentHp > 0 && !blocksIndirectDamage(attacker)) {
    const recoil = Math.max(1, Math.floor(attacker.stats.hp * 0.1));
    attacker.currentHp = Math.max(1, attacker.currentHp - recoil);
    logLine(encounter, (attacker.nickname || attacker.name) + ' was chipped by Life Orb.');
  }
  if (defenderItem?.holdEffect === 'rocky-helmet' && move.category === 'physical' && attacker.currentHp > 0 && !blocksIndirectDamage(attacker)) {
    const recoil = Math.max(1, Math.floor(attacker.stats.hp * 0.12));
    attacker.currentHp = Math.max(0, attacker.currentHp - recoil);
    logLine(encounter, (attacker.nickname || attacker.name) + ' took recoil from Rocky Helmet.');
  }
  if (defenderAbility.slug === 'iron-barbs' && move.category === 'physical' && attacker.currentHp > 0 && !blocksIndirectDamage(attacker)) {
    const recoil = Math.max(1, Math.floor(attacker.stats.hp * 0.1));
    attacker.currentHp = Math.max(0, attacker.currentHp - recoil);
    logLine(encounter, (attacker.nickname || attacker.name) + ' was scraped by Iron Barbs.');
  }
  if (defenderItem?.holdEffect === 'weakness-policy' && effectiveness > 1) {
    defender.stages.atk = clamp((defender.stages.atk || 0) + 2, -6, 6);
    defender.stages.spa = clamp((defender.stages.spa || 0) + 2, -6, 6);
    consumeHeldItem(defender, encounter, 'It triggered Weakness Policy and boosted both offenses.');
  }
  if (attackerAbility.slug === 'prism-surge' && damage > 0 && attacker.types.includes(move.type)) {
    const healed = healMonster(attacker, Math.max(1, Math.floor(attacker.stats.hp * 0.08)));
    if (healed > 0) {
      logLine(encounter, (attacker.nickname || attacker.name) + ' shimmered with Prism Surge and recovered HP.');
    }
  }
  if (damage > 0 && defender.currentHp > 0) {
    const flinchChance = extraAuraFlinchChance(attacker, defender, move);
    if (flinchChance > 0 && Math.random() < flinchChance) {
      defender.flinched = true;
      logLine(encounter, (defender.nickname || defender.name) + ' flinched from the chroma pressure.');
    }
  }
  maybeTriggerLowHpHold(attacker, encounter);
  maybeTriggerLowHpHold(defender, encounter);
}

function targetBlocksExtraEffects(defender) {
  return getHeldItem(defender)?.holdEffect === 'covert-cloak';
}

function chooseBestEnemyMove(monster, target, encounter = null) {
  if (monster.choiceLockMoveId) {
    const lockedIndex = monster.moves.findIndex((moveState) => moveState.id === monster.choiceLockMoveId && canMonsterUseMove(monster, moveState));
    if (lockedIndex >= 0) {
      return lockedIndex;
    }
  }
  const hpRatio = monster.currentHp / Math.max(1, monster.stats.hp);
  if (hpRatio <= 0.35) {
    const healIndex = monster.moves.findIndex((moveState) => canMonsterUseMove(monster, moveState) && ['heal', 'cleanse'].includes(MOVE_MAP.get(moveState.id)?.effect));
    if (healIndex >= 0) {
      return healIndex;
    }
  }
  let best = monster.moves.findIndex((moveState) => canMonsterUseMove(monster, moveState));
  let bestScore = -1;
  monster.moves.forEach((moveState, index) => {
    if (!canMonsterUseMove(monster, moveState)) {
      return;
    }
    const move = MOVE_MAP.get(moveState.id);
    const effectiveness = move.category === 'status' ? 1 : typeMultiplier(move.type, target.types);
    let baseScore = 0;
    if (move.category === 'status') {
      if (move.effect === 'heal') {
        baseScore = hpRatio <= 0.5 ? 44 : 12;
      } else if (move.effect === 'cleanse') {
        baseScore = monster.status ? 42 : 18;
      } else if (move.effect === 'weather-rain') {
        baseScore = encounter?.weather?.type === 'rain' ? 8 : (monster.types.includes('water') ? 30 : 18);
      } else if (move.effect === 'weather-sun') {
        baseScore = encounter?.weather?.type === 'sun' ? 8 : (monster.types.includes('fire') || monster.types.includes('grass') ? 30 : 18);
      } else if (move.effect === 'buff-def' || move.effect === 'buff-spd') {
        baseScore = monster.stages[move.effect === 'buff-def' ? 'def' : 'spd'] <= 1 ? 24 : 12;
      } else if (move.effect === 'buff-atk' || move.effect === 'buff-spa' || move.effect === 'buff-spe' || move.effect === 'focus') {
        baseScore = hpRatio > 0.45 ? 22 : 14;
      } else {
        baseScore = 16;
      }
    } else {
      baseScore = (move.power || 0)
        * stabMultiplier(monster, move)
        * effectiveness
        * weatherPowerMultiplier(move.type, encounter)
        * abilityMoveMultiplier(monster, move, encounter)
        * moveItemMultiplier(monster, move, effectiveness);
      if (move.effect === 'debuff-def' && target.stages?.def > -3) {
        baseScore += 18;
      }
      if (move.effect === 'debuff-atk' && target.stages?.atk > -3) {
        baseScore += 12;
      }
      if (move.effect === 'recoil') {
        baseScore *= hpRatio > 0.45 ? 1.1 : 0.82;
      }
    }
    if (baseScore > bestScore) {
      bestScore = baseScore;
      best = index;
    }
  });
  return best === -1 ? 0 : best;
}

function logLine(encounter, text) {
  encounter.log.push(text);
  encounter.log = encounter.log.slice(-20);
  encounter.latestMessage = text;
}

function randomChoice(list, rng = Math.random) {
  return list[Math.floor(rng() * list.length)];
}

function pickWeightedEntry(entries, rng = Math.random) {
  const options = Array.isArray(entries) ? entries.filter((entry) => Number(entry?.weight || 0) > 0) : [];
  const totalWeight = options.reduce((sum, entry) => sum + Number(entry.weight || 0), 0);
  if (!totalWeight) {
    return options[0] || null;
  }
  let cursor = rng() * totalWeight;
  for (const entry of options) {
    cursor -= Number(entry.weight || 0);
    if (cursor <= 0) {
      return entry;
    }
  }
  return options[options.length - 1] || null;
}
function rebuildMonsterLearnset(monster, species, options = {}) {
  const unlockedMoves = availableMoveIdsForLevel(species, monster.level);
  const keptMoves = normalizeMoveStates(monster.moves).filter((moveState) => unlockedMoves.includes(moveState.id));
  for (const moveId of unlockedMoves.slice(-4)) {
    if (keptMoves.length >= 4) {
      break;
    }
    if (!keptMoves.some((moveState) => moveState.id === moveId)) {
      const move = MOVE_MAP.get(moveId);
      keptMoves.push({ id: move.id, pp: move.pp, maxPp: move.pp });
    }
  }
  monster.moves = keptMoves.slice(0, 4);
  if (options.restoreFullPp) {
    for (const moveState of monster.moves) {
      const move = MOVE_MAP.get(moveState.id);
      moveState.maxPp = moveState.maxPp || move?.pp || 1;
      moveState.pp = moveState.maxPp;
    }
  }
}

function applySpeciesToMonster(monster, species) {
  monster.speciesId = species.id;
  monster.speciesSlug = species.slug;
  monster.name = species.name;
  monster.types = species.types;
  monster.baseStats = species.baseStats;
  monster.starterEligible = species.starterEligible;
  monster.abilitySlug = monster.hiddenAbilityUnlocked
    ? species.hiddenAbilitySlug
    : abilitySlugForSpecies(species, hashSeedFromString(monster.uid));
  monster.stats = resolvedMonsterStats(monster, species);
  monster.currentHp = monster.stats.hp;
  rebuildMonsterLearnset(monster, species);
  monster.formMode = null;
  monster.formName = null;
  monster.formMoveSet = null;
  monster.baseBattleForm = null;
  clearBattleStateFlags(monster);
}

function setMonsterLevel(monster, targetLevel) {
  const species = SPECIES_MAP.get(monster.speciesId);
  if (!species) {
    return false;
  }
  const normalizedLevel = clamp(Number(targetLevel || 1), 1, 100);
  if (monster.level === normalizedLevel) {
    return false;
  }
  restoreBaseBattleForm(monster);
  monster.level = normalizedLevel;
  monster.experience = 0;
  monster.stats = resolvedMonsterStats(monster, species);
  monster.currentHp = monster.stats.hp;
  rebuildMonsterLearnset(monster, species);
  return true;
}

function evolutionTargetForStone(species, itemSlug) {
  if (!species) {
    return null;
  }
  if (itemSlug && species.stoneEvolutionMap?.[itemSlug]) {
    return SPECIES_MAP.get(species.stoneEvolutionMap[itemSlug]) || null;
  }
  return species.evolvesTo ? SPECIES_MAP.get(species.evolvesTo) || null : null;
}

function evolveMonsterToNextSpecies(monster, log = null, reason = '', targetSpeciesId = null) {
  const species = SPECIES_MAP.get(monster.speciesId);
  const nextSpecies = targetSpeciesId ? SPECIES_MAP.get(targetSpeciesId) : evolutionTargetForStone(species, null);
  if (!species || !nextSpecies) {
    return false;
  }
  restoreBaseBattleForm(monster);
  const previousName = monster.nickname || monster.name;
  applySpeciesToMonster(monster, nextSpecies);
  if (log) {
    log.push(reason
      ? previousName + ' evolved into ' + nextSpecies.name + ' using ' + reason + '.'
      : previousName + ' evolved into ' + nextSpecies.name + '.');
  }
  return true;
}

function devolveMonsterToRoot(monster, log = null, reason = '') {
  const species = SPECIES_MAP.get(monster.speciesId);
  const rootSpecies = familyRootSpecies(species);
  if (!species || !rootSpecies || rootSpecies.id === species.id) {
    return false;
  }
  const previousName = monster.nickname || monster.name;
  restoreBaseBattleForm(monster);
  applySpeciesToMonster(monster, rootSpecies);
  if (log) {
    log.push(reason
      ? previousName + ' reverted to ' + rootSpecies.name + ' using ' + reason + '.'
      : previousName + ' reverted to ' + rootSpecies.name + '.');
  }
  return true;
}

function maybeEvolve(monster, log = null) {
  const species = SPECIES_MAP.get(monster.speciesId);
  if (!species?.evolvesTo || monster.level < species.evolveLevel) {
    return false;
  }
  return evolveMonsterToNextSpecies(monster, log, '', species.evolvesTo);
}

function expToNextLevel(level) {
  return 60 + level * 18;
}

function grantExp(monster, amount, log = null) {
  if (!monster || monster.currentHp <= 0) {
    return;
  }
  monster.experience += amount;
  while (monster.experience >= expToNextLevel(monster.level) && monster.level < 100) {
    monster.experience -= expToNextLevel(monster.level);
    monster.level += 1;
    const species = SPECIES_MAP.get(monster.speciesId);
    monster.stats = resolvedMonsterStats(monster, species);
    monster.currentHp = monster.stats.hp;
    if (log) {
      log.push(`${monster.nickname || monster.name} reached level ${monster.level}.`);
    }
    maybeEvolve(monster, log);
  }
}

function cloneMonster(monster) {
  return structuredClone(monster);
}

function buildStarterBag(userId) {
  const persistent = getInventoryMap(userId);
  const bag = {
    potion: 2,
    'poke-ball': 3,
  };
  for (const [slug, quantity] of Object.entries(persistent)) {
    const item = ITEM_MAP.get(slug);
    if (!item?.carryIntoRun) {
      continue;
    }
    bag[slug] = (bag[slug] || 0) + Math.min(quantity, 3);
  }
  return bag;
}

function modeStarterCap(mode, challengeRule) {
  if (challengeRule?.starterCap) {
    return challengeRule.starterCap;
  }
  if (mode === 'endless') {
    return 15;
  }
  return 10;
}

function modeMaxWave(mode) {
  if (mode === 'classic') {
    return 30;
  }
  if (mode === 'challenge') {
    return 20;
  }
  return null;
}

function buildRunSummary(run, outcome, extras = {}) {
  return {
    mode: run.mode,
    challengeSlug: run.challengeSlug,
    label: run.special?.label || null,
    specialKind: run.special?.kind || null,
    wave: run.wave,
    outcome,
    runCash: run.money,
    bankedCash: extras.bankedCash || 0,
    battleAccountCash: extras.battleAccountCash || 0,
    totalAccountCashEarned: extras.totalAccountCashEarned || 0,
    endingAccountCash: extras.endingAccountCash || 0,
    captures: run.captures,
    createdAt: run.createdAt,
    endedAt: nowIso(),
    party: run.party.map((monster) => ({ name: monster.nickname || monster.name, level: monster.level, hp: monster.currentHp })),
  };
}

function persistRun(rowId, run) {
  db.prepare('UPDATE runs SET run_json = ?, updated_at = ? WHERE id = ?').run(writeJson(run), nowIso(), rowId);
}

function getActiveRunRow(userId) {
  return db.prepare('SELECT * FROM runs WHERE user_id = ? AND status = ? ORDER BY id DESC LIMIT 1').get(userId, 'active');
}

export function getActiveRun(userId) {
  const row = getActiveRunRow(userId);
  if (!row) {
    return null;
  }
  const parsedRun = readJson(row.run_json, null);
  const hydrated = normalizeRunState(parsedRun);
  if (hydrated.changed) {
    persistRun(row.id, hydrated.run);
  }
  return {
    id: row.id,
    mode: row.mode,
    challengeSlug: row.challenge_slug,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    run: hydrated.run,
  };
}

function syncRunMonstersToCollection(run) {
  const seen = new Set();
  for (const monster of [...run.party, ...run.bench]) {
    if (monster.sourceCollectionId && !seen.has(monster.sourceCollectionId)) {
      seen.add(monster.sourceCollectionId);
      const snapshot = cloneMonster(monster);
      snapshot.currentHp = snapshot.stats.hp;
      snapshot.status = null;
      resetCombatState(snapshot);
      removeStarterPerk(snapshot);
      delete snapshot.trainerLoadoutBoosts;
      updateCollectionMonster(monster.sourceCollectionId, snapshot);
    }
  }
}

function finishRun(userId, rowId, run, outcome) {
  syncRunMonstersToCollection(run);
  const bankedCash = Math.max(0, Math.round(run.money || 0));
  const endingAccountCash = bankedCash > 0 ? changeUserCash(userId, bankedCash) : getUserById(userId)?.cash || 0;
  const user = getUserById(userId);
  user.meta.bestWave = { ...defaultMeta().bestWave, ...(user.meta.bestWave || {}) };
  user.meta.gymWins = normalizedGymWins(user.meta);
  user.meta.arenaRecord = normalizeArenaRecord(user.meta);
  user.meta.bestWave[run.mode] = Math.max(user.meta.bestWave[run.mode] || 0, run.wave);
  bumpProgressStat(user.meta, 'runsCompleted', 1);
  if (outcome === 'victory') {
    bumpProgressStat(user.meta, 'runWins', 1);
  } else {
    bumpProgressStat(user.meta, 'runLosses', 1);
  }
  if (run.mode === 'classic' && outcome === 'victory') {
    user.meta.classicClears += 1;
    if (!user.meta.unlockedModes.includes('endless')) {
      user.meta.unlockedModes.push('endless');
    }
  }
  if (run.mode === 'challenge' && outcome === 'victory') {
    user.meta.challengeClears += 1;
  }
  if (run.mode === 'gym' && outcome === 'victory' && run.special?.battleSlug) {
    user.meta.gymWins[run.special.battleSlug] = nowIso();
    if (run.special?.extra?.leagueSlug && GYM_LEAGUE_MAP.has(run.special.extra.leagueSlug)) {
      user.meta.favoriteLeagueSlug = run.special.extra.leagueSlug;
    }
    appendActivityLog(user.meta, `${run.special.extra?.opponentName || run.special.label} was cleared on the ${run.special.extra?.leagueName || 'league'} board.`);
  }
  if (run.mode === 'arena' && ['victory', 'defeat'].includes(outcome)) {
    if (outcome === 'victory') {
      user.meta.arenaRecord.wins += 1;
      bumpProgressStat(user.meta, 'arenaWins', 1);
    } else {
      user.meta.arenaRecord.losses += 1;
    }
    const ladderResult = applyArenaLadderResult(user.meta, run, outcome);
    const ladderSummary = ladderResult
      ? `${ladderResult.delta >= 0 ? '+' : ''}${formatNumber(ladderResult.delta)} ladder pts, ${ladderResult.after.label}${ladderResult.rankChanged ? ladderResult.climbed ? ' reached' : ' after a drop' : ''}.`
      : '';
    appendActivityLog(user.meta, `${run.special?.label || 'Arena challenge'} ended in ${outcome}.${ladderSummary ? ` ${ladderSummary}` : ''}`);
  }
  if (run.mode === 'adventure' && ['victory', 'defeat'].includes(outcome)) {
    appendActivityLog(user.meta, `${run.special?.label || 'Adventure route'} ended in ${outcome}.`);
  }
  if (bankedCash > 0) {
    bumpProgressStat(user.meta, 'goldEarned', bankedCash);
  }
  const trainerResult = applyTrainerExperience(user.meta, outcome === 'victory' ? 90 + run.wave * 6 : 28 + run.wave * 2);
  if (trainerResult.levelsGained > 0) {
    appendActivityLog(user.meta, 'Trainer level ' + trainerResult.afterLevel + ' reached.');
  }
  user.meta.lastRunSummary = buildRunSummary(run, outcome, {
    bankedCash,
    battleAccountCash: run.accountCashEarned || 0,
    totalAccountCashEarned: (run.accountCashEarned || 0) + bankedCash,
    endingAccountCash,
  });
  saveUserMeta(userId, user.meta);
  db.prepare('UPDATE runs SET status = ?, summary_json = ?, run_json = ?, updated_at = ? WHERE id = ?')
    .run(outcome, writeJson(user.meta.lastRunSummary), writeJson(run), nowIso(), rowId);
}

function buildEnemyMonster(species, level, kind, wave, challengeRule, rebirthDifficulty = 1) {
  const monster = makeMonsterInstance(species.id, level, { seedOffset: wave + species.id, metLocation: species.biome, metLevel: level, origin: 'enemy-spawn' });
  const waveScaling = 1 + clamp((wave - 1) / 220, 0, 0.24);
  const multiplier = (kind === 'boss' ? 1.24 : kind === 'trainer' ? 1.12 : 1.04) * waveScaling;
  const bulk = (challengeRule?.enemyDamageBonus || 1) * (kind === 'boss' ? 1.12 : kind === 'trainer' ? 1.06 : 1) * waveScaling;
  for (const key of ['hp', 'atk', 'def', 'spa', 'spd', 'spe']) {
    monster.stats[key] = Math.floor(monster.stats[key] * multiplier);
  }
  monster.currentHp = monster.stats.hp;
  monster.enemyBonus = bulk;
  return monster;
}

function pickEncounterWeather(biome, typeFocus, kind, rng) {
  const sunBiomes = new Set(['Sunscar Plains', 'Ashen Crater', 'Howling Mesa', 'Obsidian Ridge']);
  const rainBiomes = new Set(['Azure Shoals', 'Coral Labyrinth', 'Aurora Reef', 'Storm Garden']);
  if (sunBiomes.has(biome) && rng() < (kind === 'boss' ? 0.9 : 0.55)) {
    return makeWeatherState('sun', 5);
  }
  if (rainBiomes.has(biome) && rng() < (kind === 'boss' ? 0.9 : 0.55)) {
    return makeWeatherState('rain', 5);
  }
  if (typeFocus === 'fire' && rng() < 0.16) {
    return makeWeatherState('sun', 5);
  }
  if (typeFocus === 'water' && rng() < 0.16) {
    return makeWeatherState('rain', 5);
  }
  return makeWeatherState();
}

function generateEncounter(run) {
  const challengeRule = run.challengeSlug ? CHALLENGE_MAP.get(run.challengeSlug)?.rule : null;
  const wave = run.wave;
  const world = getWorldState(run.userId || 0);
  const bossFrequency = challengeRule?.bossFrequency || (run.mode === 'endless' ? 25 : 10);
  let kind = 'wild';
  if (run.mode !== 'endless' && wave % bossFrequency === 0) {
    kind = 'boss';
  } else if (run.mode !== 'endless' && wave % 5 === 0) {
    kind = 'trainer';
  } else if (run.mode === 'endless' && wave % bossFrequency === 0) {
    kind = 'boss';
  }

  const availableRegions = world.regions.filter((entry) => entry.unlocked);
  const regionIndex = (wave + Math.floor(world.clock.totalMinutes / 20)) % Math.max(1, availableRegions.length);
  const region = availableRegions[regionIndex] || world.activeRegion;
  const eventTypeBias = world.event.typeBias || [];
  const candidateTypes = [...new Set([...(region?.preferredTypes || []), ...eventTypeBias])];
  const typeFocus = candidateTypes.length
    ? candidateTypes[(wave + run.party[0].speciesId) % candidateTypes.length]
    : TYPES[(wave + run.party[0].speciesId) % TYPES.length];
  const stageTarget = run.mode === 'endless'
    ? wave < 20 ? 1 : wave < 50 ? 2 : wave < 90 ? 3 : 4
    : wave < 10 ? 1 : wave < 22 ? 2 : wave < 30 ? 3 : 4;
  const speciesPool = SPECIES.filter((species) => {
    if (species.stage > stageTarget) {
      return false;
    }
    if (!species.types.includes(typeFocus)) {
      return false;
    }
    if (species.rarity === 'legendary' || species.rarity === 'mythic') {
      return false;
    }
    if (region?.biomeHints?.length && !region.biomeHints.includes(species.biome) && !species.types.some((type) => region.preferredTypes.includes(type))) {
      return false;
    }
    if (world.phase === 'night' && ['ghost', 'dark'].some((type) => species.types.includes(type))) {
      return true;
    }
    return true;
  });
  const rng = seeded((run.wave * 97 + run.money * 13 + run.party.length * 31) >>> 0);
  const count = kind === 'boss' ? (run.mode === 'endless' ? 2 : 3) : kind === 'trainer' ? 2 : 1;
  const baseLevel = run.mode === 'endless'
    ? 8 + Math.floor(run.wave * 2.05)
    : 6 + Math.floor(run.wave * 1.55) + (kind === 'boss' ? 4 : kind === 'trainer' ? 2 : 0);

  const enemyParty = [];
  const legendaryChance = (kind === 'boss' ? 0.2 : 0.04) + (world.event.legendaryBonus || 0);
  const rareChance = 0.1 + (world.event.rareBonus || 0);
  for (let index = 0; index < count; index += 1) {
    let species = speciesPool[Math.floor(rng() * speciesPool.length)] || randomChoice(SPECIES);
    const legends = legendaryRoster().filter((entry) => (
      entry.types.includes(typeFocus)
      || region?.biomeHints?.includes(entry.biome)
      || entry.types.some((type) => region?.preferredTypes?.includes(type))
    ));
    if ((kind === 'boss' || (kind === 'wild' && rng() < rareChance)) && legends.length && rng() < legendaryChance) {
      species = legends[Math.floor(rng() * legends.length)];
    }
    enemyParty.push(buildEnemyMonster(species, baseLevel + index, kind, wave, challengeRule, run.rebirthDifficultyMultiplier || 1));
  }

  const title = kind === 'boss'
    ? `${region?.name || 'Frontier'} Boss`
    : kind === 'trainer'
      ? `${TYPE_WORDS[typeFocus]} ${region?.npcTitle || 'Tamer'}`
      : `Wild ${typeFocus} surge`;
  const biome = region?.biomeHints?.[(wave + count) % Math.max(1, region.biomeHints.length)] || BIOMES[(wave + count) % BIOMES.length];
  const weather = pickEncounterWeather(biome, typeFocus, kind, rng);
  const log = [`Wave ${wave}: ${title} emerges in ${biome}.`, `${world.phaseLabel} covers the route. ${world.event.label}`];
  if (weather.type !== 'clear') {
    log.push(WEATHER_LABELS[weather.type] + ' fills the field.');
  }

  return {
    kind,
    title,
    biome,
    region: region?.name || 'Frontier',
    regionSlug: region?.slug || 'frontier',
    phase: world.phase,
    ambientEvent: world.event,
    weather,
    turn: 1,
    playerIndex: firstAliveIndex(run.party),
    enemyIndex: 0,
    enemyParty,
    playerDamageBonus: (challengeRule?.playerDamageBonus || 1) * (1 + Number(run?.progressionBoosts?.playerDamageBonus || 0)),
    canCapture: kind === 'wild',
    captureUsed: false,
    log,
    latestMessage: log[log.length - 1],
  };
}

function addToRunBag(run, itemSlug, quantity = 1) {
  run.bag[itemSlug] = (run.bag[itemSlug] || 0) + quantity;
}

function spendFromRunBag(run, itemSlug, quantity = 1) {
  if ((run.bag[itemSlug] || 0) < quantity) {
    return false;
  }
  run.bag[itemSlug] -= quantity;
  if (run.bag[itemSlug] <= 0) {
    delete run.bag[itemSlug];
  }
  return true;
}

function generateRewardChoices(run, encounter) {
  const wave = run.wave;
  const challengeRule = run.challengeSlug ? CHALLENGE_MAP.get(run.challengeSlug)?.rule : null;
  const cashMultiplier = challengeRule?.cashBonus || 1;
  const bossMultiplier = encounter.kind === 'boss' ? 1.7 : encounter.kind === 'trainer' ? 1.25 : 1;
  const cashAmount = Math.round((120 + wave * 28) * cashMultiplier * bossMultiplier);
  const unlockedItems = ITEMS.filter((item) => item.runShop !== false && item.unlockWave <= wave + 2);
  const rng = seeded((run.wave * 123 + run.money * 17 + run.captures * 19) >>> 0);
  const itemA = unlockedItems[Math.floor(rng() * unlockedItems.length)];
  const itemB = unlockedItems[Math.floor(rng() * unlockedItems.length)];
  return [
    { kind: 'cash', amount: cashAmount, label: `${formatNumber(cashAmount)} run cash` },
    { kind: 'item', slug: itemA.slug, quantity: itemA.slug.includes('chip') ? 1 : 2, label: `${itemA.name}${itemA.slug.includes('chip') ? '' : ' x2'}` },
    { kind: 'item', slug: itemB.slug, quantity: 1, label: itemB.name },
    { kind: 'heal', amount: 0.3, label: 'Patch the whole squad' },
  ];
}

function generateShopOffers(run) {
  const challengeRule = run.challengeSlug ? CHALLENGE_MAP.get(run.challengeSlug)?.rule : null;
  const trainerShopDiscount = Math.max(0, Math.min(0.3, Number(run?.progressionBoosts?.shopDiscount || 0)));
  const discount = (challengeRule?.shopDiscount || 1) * (1 - trainerShopDiscount);
  const markup = challengeRule?.shopMarkup || 1;
  const unlockedItems = ITEMS.filter((item) => item.runShop !== false && item.unlockWave <= run.wave + 3);
  const rng = seeded((run.wave * 211 + run.money * 7 + run.party[0].speciesId) >>> 0);
  const offers = [];
  while (offers.length < 5 && unlockedItems.length) {
    const item = unlockedItems[Math.floor(rng() * unlockedItems.length)];
    if (offers.some((offer) => offer.slug === item.slug)) {
      continue;
    }
    offers.push({
      slug: item.slug,
      price: Math.max(40, Math.round(item.price * discount * markup * (1 + run.wave * 0.02))),
    });
  }
  return offers;
}

function createBattleRewards(run, encounter) {
  run.pendingReward = {
    rewardChoices: generateRewardChoices(run, encounter),
    shopOffers: generateShopOffers(run),
    encounterKind: encounter.kind,
  };
}

function setEncounterWeather(encounter, type, turns = 5) {
  if (!WEATHER_LABELS[type]) {
    return;
  }
  encounter.weather = makeWeatherState(type, turns);
  logLine(encounter, WEATHER_LABELS[type] + ' takes over the field.');
}

function lockChoiceMove(attacker, move) {
  const heldItem = getHeldItem(attacker);
  if (heldItem?.holdEffect === 'choice-band' || heldItem?.holdEffect === 'choice-specs' || heldItem?.holdEffect === 'choice-scarf') {
    attacker.choiceLockMoveId = attacker.choiceLockMoveId || move.id;
  }
}

function applySecondaryMoveEffects(attacker, defender, move, encounter) {
  if (defender.currentHp <= 0 || targetBlocksExtraEffects(defender)) {
    if (defender.currentHp > 0 && targetBlocksExtraEffects(defender) && ['burn', 'poison', 'paralyze', 'debuff-atk', 'debuff-def'].includes(move.effect)) {
      logLine(encounter, (defender.nickname || defender.name) + ' ignored the extra effect with Covert Cloak.');
    }
    return;
  }
  const chanceMultiplier = secondaryEffectMultiplier(attacker);
  if (move.effect === 'burn' && !defender.status && auraBlocksStatus(defender, attacker)) {
    logLine(encounter, (defender.nickname || defender.name) + '\'s aura repelled the burn.');
  } else if (move.effect === 'burn' && !defender.status && Math.random() < Math.min(0.9, 0.3 * chanceMultiplier)) {
    defender.status = { type: 'burn' };
    logLine(encounter, (defender.nickname || defender.name) + ' is burned.');
  }
  if (move.effect === 'poison' && !defender.status && auraBlocksStatus(defender, attacker)) {
    logLine(encounter, (defender.nickname || defender.name) + '\'s aura repelled the poison.');
  } else if (move.effect === 'poison' && !defender.status && Math.random() < Math.min(0.9, 0.35 * chanceMultiplier)) {
    defender.status = { type: 'poison' };
    logLine(encounter, (defender.nickname || defender.name) + ' is poisoned.');
  }
  if (move.effect === 'paralyze' && !defender.status && auraBlocksStatus(defender, attacker)) {
    logLine(encounter, (defender.nickname || defender.name) + '\'s aura repelled the paralysis.');
  } else if (move.effect === 'paralyze' && !defender.status && Math.random() < Math.min(0.9, 0.28 * chanceMultiplier)) {
    defender.status = { type: 'paralyze' };
    logLine(encounter, (defender.nickname || defender.name) + ' is paralyzed.');
  }
  if (move.effect === 'debuff-atk') {
    defender.stages.atk = clamp((defender.stages.atk || 0) - 1, -6, 6);
    logLine(encounter, (defender.nickname || defender.name) + "'s Attack fell.");
  }
  if (move.effect === 'debuff-def') {
    defender.stages.def = clamp((defender.stages.def || 0) - 1, -6, 6);
    logLine(encounter, (defender.nickname || defender.name) + "'s Defense fell.");
  }
}

function applyReactiveAbility(defender, attacker, move, encounter) {
  if (move.category !== 'physical' || attacker.currentHp <= 0 || attacker.status) {
    return;
  }
  const ability = getMonsterAbility(defender);
  if (ability.slug === 'static' && Math.random() < 0.22 && !auraBlocksStatus(attacker, defender)) {
    attacker.status = { type: 'paralyze' };
    logLine(encounter, (attacker.nickname || attacker.name) + ' was paralyzed by Static.');
  }
  if (ability.slug === 'poison-point' && Math.random() < 0.2 && !attacker.status && !auraBlocksStatus(attacker, defender)) {
    attacker.status = { type: 'poison' };
    logLine(encounter, (attacker.nickname || attacker.name) + ' was poisoned by Poison Point.');
  }
  if (ability.slug === 'flame-body' && Math.random() < 0.2 && !attacker.status && !auraBlocksStatus(attacker, defender)) {
    attacker.status = { type: 'burn' };
    logLine(encounter, (attacker.nickname || attacker.name) + ' was burned by Flame Body.');
  }
}

function applyMove(attacker, defender, moveState, encounter, side, options = {}) {
  const move = MOVE_MAP.get(moveState.id);
  if (!move || moveState.pp <= 0 || attacker.currentHp <= 0) {
    return;
  }
  maybeTransferMirageStatus(attacker, defender, encounter);
  maybeTransferMirageStatus(defender, attacker, encounter);
  encounter.lastMoveType = move.type;
  encounter.lastMoveCategory = move.category;
  encounter.lastMoveEffect = move.effect;

  const moveName = moveState.displayName || move.name;
  if (!canMonsterUseMove(attacker, moveState)) {
    logLine(encounter, (attacker.nickname || attacker.name) + ' could not use that move.');
    return;
  }
  if (attacker.flinched) {
    attacker.flinched = false;
    logLine(encounter, (attacker.nickname || attacker.name) + ' flinched and could not act.');
    return;
  }
  if (attacker.status?.type === 'paralyze' && Math.random() < 0.25) {
    logLine(encounter, (attacker.nickname || attacker.name) + ' is paralyzed and cannot act.');
    return;
  }

  moveState.pp = Math.max(0, moveState.pp - 1);
  if (getMonsterAbility(defender).slug === 'pressure' && moveState.pp > 0) {
    moveState.pp = Math.max(0, moveState.pp - 1);
  }
  lockChoiceMove(attacker, move);

  const zMode = options.battleMode === 'z' && move.category !== 'status' && canUseZMove(attacker, move);
  const accuracy = Math.min(100, move.accuracy * accuracyMultiplier(attacker, defender, encounter));
  if (Math.random() * 100 > accuracy) {
    logLine(encounter, (attacker.nickname || attacker.name) + ' used ' + moveName + ', but it missed.');
    return;
  }
  if (zMode) {
    attacker.zMoveUsed = true;
    logLine(encounter, (attacker.nickname || attacker.name) + ' channeled Z-Power into ' + moveName + '!');
  }

  if (move.category === 'status') {
    if (move.effect === 'heal') {
      const healed = healMonster(attacker, Math.floor(attacker.stats.hp * 0.34));
      logLine(encounter, (attacker.nickname || attacker.name) + ' restored ' + healed + ' HP with ' + moveName + '.');
    } else if (move.effect === 'cleanse') {
      const healed = healMonster(attacker, Math.floor(attacker.stats.hp * 0.2));
      attacker.status = null;
      logLine(encounter, (attacker.nickname || attacker.name) + ' was refreshed by ' + moveName + ' and restored ' + healed + ' HP.');
    } else if (move.effect === 'buff-atk') {
      attacker.stages.atk = clamp((attacker.stages.atk || 0) + 2, -6, 6);
      logLine(encounter, (attacker.nickname || attacker.name) + ' sharply raised its Attack with ' + moveName + '.');
    } else if (move.effect === 'buff-def') {
      attacker.stages.def = clamp((attacker.stages.def || 0) + 2, -6, 6);
      logLine(encounter, (attacker.nickname || attacker.name) + ' fortified its Defense with ' + moveName + '.');
    } else if (move.effect === 'buff-spd') {
      attacker.stages.spd = clamp((attacker.stages.spd || 0) + 2, -6, 6);
      logLine(encounter, (attacker.nickname || attacker.name) + ' fortified its Special Defense with ' + moveName + '.');
    } else if (move.effect === 'focus') {
      attacker.stages.spa = clamp((attacker.stages.spa || 0) + 1, -6, 6);
      attacker.stages.spe = clamp((attacker.stages.spe || 0) + 1, -6, 6);
      logLine(encounter, (attacker.nickname || attacker.name) + ' focused its power with ' + moveName + '.');
    } else if (move.effect === 'buff-spa') {
      attacker.stages.spa = clamp((attacker.stages.spa || 0) + 2, -6, 6);
      logLine(encounter, (attacker.nickname || attacker.name) + ' sharply raised Sp. Atk with ' + moveName + '.');
    } else if (move.effect === 'buff-spe') {
      attacker.stages.spe = clamp((attacker.stages.spe || 0) + 2, -6, 6);
      logLine(encounter, (attacker.nickname || attacker.name) + ' sharply raised Speed with ' + moveName + '.');
    } else if (move.effect === 'weather-sun') {
      setEncounterWeather(encounter, 'sun', 5);
    } else if (move.effect === 'weather-rain') {
      setEncounterWeather(encounter, 'rain', 5);
    }
    maybeTriggerLowHpHold(attacker, encounter);
    return;
  }

  if (move.type === 'ground' && getMonsterAbility(defender).slug === 'levitate' && !defender.types.includes('flying')) {
    logLine(encounter, (defender.nickname || defender.name) + ' floated above the Ground-type attack.');
    return;
  }

  const effectiveness = typeMultiplier(move.type, defender.types);
  if (effectiveness === 0) {
    logLine(encounter, (defender.nickname || defender.name) + ' is immune to ' + moveName + '.');
    return;
  }
  const attackStat = move.category === 'physical' ? effectiveStat(attacker, 'atk', encounter) : effectiveStat(attacker, 'spa', encounter);
  const defenseStat = move.category === 'physical' ? effectiveStat(defender, 'def', encounter) : effectiveStat(defender, 'spd', encounter);
  const stab = stabMultiplier(attacker, move);
  const critHit = Math.random() < critChanceFor(attacker);
  const crit = critHit ? (getMonsterAbility(attacker).slug === 'sniper' ? 1.9 : 1.5) : 1;
  const variance = 0.9 + Math.random() * 0.12;
  const zPowerBonus = zMode ? 1.6 : 1;
  const base = Math.floor((((2 * attacker.level) / 5 + 2) * (move.power || 0) * zPowerBonus * attackStat) / Math.max(1, defenseStat) / 50) + 2;
  const sideBonus = side === 'enemy'
    ? (attacker.enemyBonus || 1)
    : (encounter.playerDamageBonus || 1);
  const itemMultiplier = moveItemMultiplier(attacker, move, effectiveness);
  const defensiveMultiplier = maybeApplyDefensiveItem(defender, move, effectiveness, encounter);
  const abilityDefense = defensiveAbilityMultiplier(defender, move);
  let damage = Math.max(1, Math.floor(base
    * stab
    * effectiveness
    * crit
    * variance
    * sideBonus
    * weatherPowerMultiplier(move.type, encounter)
    * abilityMoveMultiplier(attacker, move, encounter)
    * auraDamageMultiplier(attacker, defender, move)
    * itemMultiplier
    * defensiveMultiplier
    * abilityDefense));
  damage = maybePreventKnockout(defender, damage, encounter);
  defender.currentHp = Math.max(0, defender.currentHp - damage);
  const critText = critHit ? ' Critical hit!' : '';
  const effectText = effectiveness > 1 ? ' It is super effective!' : effectiveness < 1 ? ' It is resisted.' : '';
  const zText = zMode ? ' as a Z-Move' : '';
  logLine(encounter, (attacker.nickname || attacker.name) + ' used ' + moveName + zText + ' for ' + damage + ' damage.' + critText + effectText);

  applySecondaryMoveEffects(attacker, defender, move, encounter);
  applyReactiveAbility(defender, attacker, move, encounter);
  applyAfterHitEffects(attacker, defender, move, damage, effectiveness, encounter);
}

function applyEndTurnStatus(monster, encounter) {
  if (!monster || monster.currentHp <= 0 || !monster.status) {
    return;
  }
  if ((monster.status.type === 'burn' || monster.status.type === 'poison') && !blocksIndirectDamage(monster)) {
    const damage = Math.max(1, Math.floor(monster.stats.hp * 0.08));
    monster.currentHp = Math.max(0, monster.currentHp - damage);
    logLine(encounter, (monster.nickname || monster.name) + ' suffers ' + damage + ' damage from ' + monster.status.type + '.');
    maybeTriggerLowHpHold(monster, encounter);
  }
}

function applyEndTurnPassives(monster, encounter) {
  if (!monster || monster.currentHp <= 0) {
    return;
  }
  const heldItem = getHeldItem(monster);
  const ability = getMonsterAbility(monster);
  if (heldItem?.holdEffect === 'leftovers') {
    const healed = healMonster(monster, Math.max(1, Math.floor(monster.stats.hp * 0.08)));
    if (healed > 0) {
      logLine(encounter, (monster.nickname || monster.name) + ' recovered HP with Leftovers.');
    }
  }
  if (ability.slug === 'rain-dish' && encounter?.weather?.type === 'rain') {
    const healed = healMonster(monster, Math.max(1, Math.floor(monster.stats.hp * 0.07)));
    if (healed > 0) {
      logLine(encounter, (monster.nickname || monster.name) + ' recovered HP in the rain.');
    }
  }
  maybeTriggerLowHpHold(monster, encounter);
}

function advanceWeather(encounter) {
  if (!encounter?.weather || encounter.weather.type === 'clear') {
    return;
  }
  encounter.weather.turns -= 1;
  if (encounter.weather.turns <= 0) {
    encounter.weather = makeWeatherState();
    logLine(encounter, 'The weather returned to normal.');
  }
}

function awardVictory(userId, run, encounter) {
  const challengeRule = run.challengeSlug ? CHALLENGE_MAP.get(run.challengeSlug)?.rule : null;
  const premiumBoosts = normalizedRunPremiumBoosts(run);
  const progressionBoosts = { ...blankTrainerBonusMap(), ...(run.progressionBoosts || {}) };
  const basePayout = Math.round((85 + run.wave * 20) * (encounter.kind === 'boss' ? 1.75 : encounter.kind === 'trainer' ? 1.2 : 1) * (challengeRule?.cashBonus || 1));
  const payout = Math.round(basePayout * premiumBoosts.cashMultiplier * (1 + Number(progressionBoosts.cashBonus || 0)));
  const accountPayout = Math.max(30, Math.round(payout * 0.24));
  run.money += payout;
  run.totalRunCashEarned = (run.totalRunCashEarned || 0) + payout;
  run.accountCashEarned = (run.accountCashEarned || 0) + accountPayout;
  changeUserCash(userId, accountPayout);
  const baseExp = 32 + run.wave * 8 + (encounter.kind === 'boss' ? 44 : encounter.kind === 'trainer' ? 18 : 0);
  const exp = Math.max(8, Math.round(baseExp * premiumBoosts.expMultiplier * (1 + Number(progressionBoosts.expBonus || 0))));
  const recoveryRatio = 0.09 + Number(progressionBoosts.healAfterBattleBonus || 0);
  const ppRestore = 1 + Math.max(0, Math.floor(Number(progressionBoosts.ppAfterBattleBonus || 0)));
  for (const monster of run.party) {
    if (monster.currentHp > 0) {
      grantExp(monster, exp, encounter.log);
      encounter.enemyParty.forEach((enemy) => {
        const species = SPECIES_MAP.get(enemy.speciesId);
        if (species) {
          grantEffortValues(monster, species, encounter.kind === 'boss' ? 12 : 8);
        }
      });
    }
  }
  for (const monster of run.party) {
    if (monster.currentHp > 0) {
      healMonster(monster, Math.floor(monster.stats.hp * recoveryRatio));
      restoreMovePp(monster, ppRestore);
      resetCombatState(monster);
    }
  }
  const user = getUserById(userId);
  if (user) {
    bumpProgressStat(user.meta, 'goldEarned', accountPayout);
    if (encounter.kind === 'trainer') {
      bumpProgressStat(user.meta, 'trainerVictories', 1);
    }
    if (encounter.kind === 'boss') {
      bumpProgressStat(user.meta, 'bossVictories', 1);
    }
    const result = applyTrainerExperience(user.meta, 26 + run.wave * 4 + (encounter.kind === 'boss' ? 34 : encounter.kind === 'trainer' ? 18 : 8));
    if (result.levelsGained > 0) {
      appendActivityLog(user.meta, `Trainer level ${result.afterLevel} reached.`);
    }
    saveUserMeta(userId, user.meta);
  }
  logLine(encounter, 'Victory grants ' + formatNumber(payout) + ' run cash, ' + formatNumber(accountPayout) + ' account cash, and ' + exp + ' XP.');
  if (progressionBoosts.expBonus > 0 || progressionBoosts.cashBonus > 0 || progressionBoosts.healAfterBattleBonus > 0 || progressionBoosts.ppAfterBattleBonus > 0) {
    logLine(encounter, 'Trainer build applied: EXP +' + Math.round(Number(progressionBoosts.expBonus || 0) * 100) + '% / Cash +' + Math.round(Number(progressionBoosts.cashBonus || 0) * 100) + '% / Recovery +' + Math.round(Number(progressionBoosts.healAfterBattleBonus || 0) * 100) + '%.');
  }
  if (premiumBoosts.expBonus > 0 || premiumBoosts.cashBonus > 0) {
    logLine(encounter, 'Premium perks applied: EXP +' + Math.round(premiumBoosts.expBonus * 100) + '% / Cash +' + Math.round(premiumBoosts.cashBonus * 100) + '%.');
  }
  if (run.special?.singleEncounter) {
    run.encounter = null;
    finishRun(userId, run.rowId, run, 'victory');
    return { finished: true, outcome: 'victory' };
  }
  createBattleRewards(run, encounter);
  run.encounter = null;
  const maxWave = modeMaxWave(run.mode);
  if (maxWave && run.wave >= maxWave) {
    finishRun(userId, run.rowId, run, 'victory');
    return { finished: true, outcome: 'victory' };
  }
  return { finished: false };
}

function handleKnockouts(userId, run, encounter) {
  while (encounter.enemyIndex < encounter.enemyParty.length && encounter.enemyParty[encounter.enemyIndex].currentHp <= 0) {
    const defeated = encounter.enemyParty[encounter.enemyIndex];
    logLine(encounter, `${defeated.nickname || defeated.name} was knocked out.`);
    encounter.enemyIndex += 1;
    if (encounter.enemyIndex < encounter.enemyParty.length) {
      logLine(encounter, `${encounter.title} sends in another monster.`);
    }
  }

  if (encounter.enemyIndex >= encounter.enemyParty.length) {
    return awardVictory(userId, run, encounter);
  }

  while (encounter.playerIndex < run.party.length && run.party[encounter.playerIndex].currentHp <= 0) {
    const nextIndex = firstAliveIndex(run.party);
    if (nextIndex === -1) {
      finishRun(userId, run.rowId, run, 'defeat');
      return { finished: true, outcome: 'defeat' };
    }
    encounter.playerIndex = nextIndex;
    logLine(encounter, `${run.party[nextIndex].nickname || run.party[nextIndex].name} steps back into the fight.`);
    break;
  }

  return { finished: false };
}

function captureBonusForItem(userId, item, encounter, target, species) {
  if (!item) {
    return 0;
  }
  if (item.slug === 'master-ball') {
    return 1;
  }
  let bonus = item.bonus || 0;
  if (item.slug === 'quick-ball' && encounter.turn === 1) {
    bonus += 0.18;
  }
  if (item.slug === 'timer-ball') {
    bonus += Math.min(0.24, encounter.turn * 0.03);
  }
  if (item.slug === 'dusk-ball' && /moon|whisper|phantom|crystal/i.test(encounter.biome)) {
    bonus += 0.16;
  }
  if (item.slug === 'net-ball' && target.types.some((type) => type === 'bug' || type === 'water')) {
    bonus += 0.14;
  }
  if (item.slug === 'dive-ball' && target.types.includes('water')) {
    bonus += 0.14;
  }
  if (item.slug === 'nest-ball' && target.level <= 12) {
    bonus += 0.12;
  }
  if (item.slug === 'repeat-ball' && getCollection(userId).some((entry) => entry.monster.speciesId === species.id)) {
    bonus += 0.16;
  }
  if (item.slug === 'beast-ball' && species.rarity === 'mythic') {
    bonus += 0.4;
  }
  return bonus;
}

function captureStatusBonus(target) {
  const status = target?.status?.type;
  if (!status) {
    return 0;
  }
  if (status === 'sleep' || status === 'freeze') {
    return 0.14;
  }
  if (status === 'poison' || status === 'burn' || status === 'paralyze') {
    return 0.08;
  }
  return 0.04;
}

function awardMonsterCollectionProgress(meta, species) {
  bumpProgressStat(meta, 'monstersCaught', 1);
  const result = applyTrainerExperience(meta, 24 + (species?.rarity === 'rare' ? 8 : 0));
  if (result.levelsGained > 0) {
    appendActivityLog(meta, 'Trainer level ' + result.afterLevel + ' reached.');
  }
  return result;
}

function recordMonsterCatch(userId, species) {
  const user = getUserById(userId);
  if (!user) {
    return;
  }
  awardMonsterCollectionProgress(user.meta, species);
  saveUserMeta(userId, user.meta);
}
const INCUBATOR_CAPACITY = 3;
const INCUBATOR_HATCH_MINUTES = 30;
const INCUBATOR_RECENT_SPECIES_LIMIT = 10;

function parseIncubatorTimestamp(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeIncubatorRecentSpeciesIds(ids) {
  const validSpeciesIds = new Set(SPECIES.map((species) => species.id));
  return (Array.isArray(ids) ? ids : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && validSpeciesIds.has(value))
    .slice(-INCUBATOR_RECENT_SPECIES_LIMIT);
}

function normalizeIncubatorMeta(meta) {
  const sourceEggs = Array.isArray(meta?.incubator) ? meta.incubator : [];
  let changed = !Array.isArray(meta?.incubator);
  const eggs = [];
  for (const entry of sourceEggs) {
    const speciesId = Number(entry?.speciesId);
    const species = SPECIES_MAP.get(speciesId);
    const startedAtMs = parseIncubatorTimestamp(entry?.startedAtMs ?? entry?.startedAt ?? entry?.createdAt);
    const readyAtMs = parseIncubatorTimestamp(entry?.readyAtMs ?? entry?.readyAt);
    if (!species || !Number.isFinite(startedAtMs) || !Number.isFinite(readyAtMs) || readyAtMs <= startedAtMs) {
      changed = true;
      continue;
    }
    const id = typeof entry?.id === 'string' && entry.id.trim() ? entry.id.trim() : randomId(6);
    const label = String(entry?.label || `${TYPE_WORDS[species.types[0]] || 'Mystery'} Egg`).slice(0, 48);
    if (
      id !== entry?.id
      || label !== entry?.label
      || startedAtMs !== entry?.startedAtMs
      || readyAtMs !== entry?.readyAtMs
    ) {
      changed = true;
    }
    eggs.push({
      id,
      speciesId,
      label,
      startedAtMs,
      readyAtMs,
    });
  }
  if (eggs.length > INCUBATOR_CAPACITY) {
    eggs.length = INCUBATOR_CAPACITY;
    changed = true;
  }
  const recentSpeciesIds = normalizeIncubatorRecentSpeciesIds(meta?.incubatorRecentSpeciesIds);
  const currentRecent = Array.isArray(meta?.incubatorRecentSpeciesIds) ? meta.incubatorRecentSpeciesIds : [];
  if (
    !Array.isArray(meta?.incubatorRecentSpeciesIds)
    || recentSpeciesIds.length !== currentRecent.length
    || recentSpeciesIds.some((value, index) => value !== Number(currentRecent[index]))
    || eggs.length !== sourceEggs.length
  ) {
    changed = true;
  }
  return {
    eggs,
    recentSpeciesIds,
    changed,
  };
}

function setIncubatorMeta(meta, incubatorState) {
  meta.incubator = incubatorState.eggs.map((egg) => ({
    id: egg.id,
    speciesId: egg.speciesId,
    label: egg.label,
    startedAtMs: egg.startedAtMs,
    readyAtMs: egg.readyAtMs,
  }));
  meta.incubatorRecentSpeciesIds = incubatorState.recentSpeciesIds.slice(-INCUBATOR_RECENT_SPECIES_LIMIT);
}

function incubatorWeightForSpecies(species) {
  const rarityWeight = species.rarity === 'common'
    ? 7
    : species.rarity === 'rare'
      ? 3.8
      : species.rarity === 'epic'
        ? 1.8
        : 1;
  const stageWeight = species.stage <= 1
    ? 1.15
    : species.stage === 2
      ? 1
      : species.stage === 3
        ? 0.72
        : 0.55;
  return rarityWeight * stageWeight;
}

function selectIncubatorSpecies(recentSpeciesIds) {
  const basePool = SPECIES.filter((species) => !['legendary', 'mythic'].includes(species.rarity));
  const recentSet = new Set(recentSpeciesIds.slice(-6));
  const freshPool = basePool.filter((species) => !recentSet.has(species.id));
  const pool = freshPool.length >= Math.max(12, Math.floor(basePool.length * 0.25)) ? freshPool : basePool;
  const totalWeight = pool.reduce((sum, species) => sum + incubatorWeightForSpecies(species), 0);
  let ticket = Math.random() * Math.max(totalWeight, 1);
  for (const species of pool) {
    ticket -= incubatorWeightForSpecies(species);
    if (ticket <= 0) {
      return species;
    }
  }
  return pool[pool.length - 1] || null;
}

function incubatorLevelForSpecies(species) {
  return clamp(3 + Number(species?.stage || 1) * 2, 5, 12);
}

function incubatorEggView(egg, referenceMs = Date.now()) {
  const species = SPECIES_MAP.get(egg.speciesId) || null;
  const hatchSpanMs = Math.max(1, egg.readyAtMs - egg.startedAtMs);
  const remainingMs = Math.max(0, egg.readyAtMs - referenceMs);
  return {
    ...egg,
    species,
    ready: remainingMs <= 0,
    remainingMs,
    remainingMinutes: remainingMs <= 0 ? 0 : Math.ceil(remainingMs / 60000),
    progressPercent: clamp(Math.round(((referenceMs - egg.startedAtMs) / hatchSpanMs) * 100), 0, 100),
    startedAt: new Date(egg.startedAtMs).toISOString(),
    readyAt: new Date(egg.readyAtMs).toISOString(),
  };
}

function incubatorView(meta, reference = new Date()) {
  const referenceMs = parseIncubatorTimestamp(reference instanceof Date ? reference.getTime() : reference) || Date.now();
  return normalizeIncubatorMeta(meta).eggs
    .map((egg) => incubatorEggView(egg, referenceMs))
    .sort((left, right) => left.readyAtMs - right.readyAtMs || left.startedAtMs - right.startedAtMs);
}

export function startIncubatorEgg(userId) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const incubatorState = normalizeIncubatorMeta(user.meta);
  if (incubatorState.eggs.length >= INCUBATOR_CAPACITY) {
    throw new Error('The incubator is already full.');
  }
  const species = selectIncubatorSpecies(incubatorState.recentSpeciesIds);
  if (!species) {
    throw new Error('No incubator species are available right now.');
  }
  const startedAtMs = Date.now();
  const egg = {
    id: randomId(6),
    speciesId: species.id,
    label: `${TYPE_WORDS[species.types[0]] || 'Mystery'} Egg`,
    startedAtMs,
    readyAtMs: startedAtMs + INCUBATOR_HATCH_MINUTES * 60 * 1000,
  };
  incubatorState.eggs.push(egg);
  incubatorState.recentSpeciesIds.push(species.id);
  incubatorState.recentSpeciesIds = incubatorState.recentSpeciesIds.slice(-INCUBATOR_RECENT_SPECIES_LIMIT);
  setIncubatorMeta(user.meta, incubatorState);
  saveUserMeta(userId, user.meta);
  return incubatorEggView(egg);
}

export function claimIncubatorEgg(userId, eggId) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const incubatorState = normalizeIncubatorMeta(user.meta);
  const eggIndex = incubatorState.eggs.findIndex((entry) => entry.id === String(eggId || ''));
  if (eggIndex === -1) {
    throw new Error('Egg not found.');
  }
  const egg = incubatorState.eggs[eggIndex];
  if (egg.readyAtMs > Date.now()) {
    throw new Error('That egg is still incubating.');
  }
  const species = SPECIES_MAP.get(egg.speciesId);
  if (!species) {
    throw new Error('That egg cannot hatch right now.');
  }
  const hatchLevel = incubatorLevelForSpecies(species);
  const hatched = makeMonsterInstance(species.id, hatchLevel, {
    seedOffset: user.id * 977 + egg.readyAtMs,
    metLocation: 'Guild Nursery',
    metLevel: hatchLevel,
    origin: 'incubator-hatch',
  });
  db.prepare('INSERT INTO collection (user_id, monster_json, starter_unlocked, favorite, created_at) VALUES (?, ?, 1, 0, ?)')
    .run(userId, writeJson(hatched), nowIso());
  incubatorState.eggs.splice(eggIndex, 1);
  setIncubatorMeta(user.meta, incubatorState);
  awardMonsterCollectionProgress(user.meta, species);
  appendActivityLog(user.meta, `${hatched.name} hatched in the Guild Nursery.`);
  saveUserMeta(userId, user.meta);
  return hatched;
}

export function removeIncubatorEgg(userId, eggId) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const incubatorState = normalizeIncubatorMeta(user.meta);
  const eggIndex = incubatorState.eggs.findIndex((entry) => entry.id === String(eggId || ''));
  if (eggIndex === -1) {
    throw new Error('Egg not found.');
  }
  const [removed] = incubatorState.eggs.splice(eggIndex, 1);
  setIncubatorMeta(user.meta, incubatorState);
  saveUserMeta(userId, user.meta);
  return incubatorEggView(removed);
}

function attemptCapture(userId, run, encounter, slug) {
  const orbSlug = slug || 'capture-orb';
  const captureItem = ITEM_MAP.get(orbSlug);
  if (!captureItem || captureItem.category !== 'capture') {
    return 'That capture item is invalid.';
  }
  if (!encounter.canCapture) {
    return 'This encounter cannot be captured right now.';
  }
  if (!spendFromRunBag(run, orbSlug, 1)) {
    return 'You do not have that capture item.';
  }
  const target = encounter.enemyParty[encounter.enemyIndex];
  const activeHunter = run.party[encounter.playerIndex];
  const species = SPECIES_MAP.get(target.speciesId);
  const hpRatio = target.currentHp / Math.max(1, target.stats.hp);
  const itemBonus = captureBonusForItem(userId, captureItem, encounter, target, species);
  if (captureItem.slug === 'master-ball') {
    const captured = cloneMonster(target);
    captured.uid = randomId(8);
    captured.currentHp = captured.stats.hp;
    captured.status = null;
    captured.stages = defaultStages();
    clearBattleStateFlags(captured);
    captured.caughtAt = nowIso();
    captured.metLocation = encounter.biome;
    captured.metLevel = target.level;
    captured.origin = 'captured';
    db.prepare('INSERT INTO collection (user_id, monster_json, starter_unlocked, favorite, created_at) VALUES (?, ?, 1, 0, ?)')
      .run(userId, writeJson(captured), nowIso());
    if (run.bench.length < 4) {
      run.bench.push(captured);
    }
    run.captures += 1;
    recordMonsterCatch(userId, species);
    logLine(encounter, captureItem.name + ' sealed the catch instantly.');
    return awardVictory(userId, run, encounter);
  }
  const hpBonus = Math.pow(1 - hpRatio, 2) * 0.48;
  const statusBonus = captureStatusBonus(target);
  const baseChance = species.catchRate * 0.38 + hpBonus + itemBonus + statusBonus;
  const challengeRule = run.challengeSlug ? CHALLENGE_MAP.get(run.challengeSlug)?.rule : null;
  const perkCaptureBonus = activeHunter?.starterPerk?.captureBonus || 0;
  const worldCaptureBonus = encounter.ambientEvent?.rareBonus ? 0.04 : 0;
  const trainerCaptureBonus = Number(run?.progressionBoosts?.captureBonus || 0);
  const chance = clamp(baseChance + (challengeRule?.captureBonus || 0) + perkCaptureBonus + worldCaptureBonus + trainerCaptureBonus, 0.04, 0.92);
  if (Math.random() <= chance) {
    const captured = cloneMonster(target);
    captured.uid = randomId(8);
    captured.currentHp = captured.stats.hp;
    captured.status = null;
    captured.stages = defaultStages();
    clearBattleStateFlags(captured);
    captured.caughtAt = nowIso();
    captured.metLocation = encounter.biome;
    captured.metLevel = target.level;
    captured.origin = 'captured';
    db.prepare('INSERT INTO collection (user_id, monster_json, starter_unlocked, favorite, created_at) VALUES (?, ?, 1, 0, ?)')
      .run(userId, writeJson(captured), nowIso());
    if (run.bench.length < 4) {
      run.bench.push(captured);
    }
    run.captures += 1;
    recordMonsterCatch(userId, species);
    logLine(encounter, (captured.nickname || captured.name) + ' was captured successfully.');
    return awardVictory(userId, run, encounter);
  }
  const statusText = target.status?.type ? ' even while it was ' + target.status.type : '';
  logLine(encounter, captureItem.name + ' failed and the target broke free' + statusText + '.');
  return null;
}

function useBattleItem(run, encounter, itemSlug) {
  const item = ITEM_MAP.get(itemSlug);
  if (!item) {
    return 'Unknown item.';
  }
  if (!spendFromRunBag(run, itemSlug, 1)) {
    return 'Item not available.';
  }
  const active = run.party[encounter.playerIndex] || run.party[firstAliveIndex(run.party)];
  const fainted = run.party.find((monster) => monster.currentHp <= 0);

  if (item.category === 'healing') {
    if (!active || active.currentHp <= 0) {
      addToRunBag(run, itemSlug, 1);
      return 'Healing items require an active conscious monster.';
    }
    const healed = healMonster(active, item.amount >= 9999 ? active.stats.hp : item.amount);
    const ppRecovered = restoreMovePp(active, 1);
    logLine(encounter, (active.nickname || active.name) + ' recovered ' + healed + ' HP using ' + item.name + '.');
    if (ppRecovered > 0) {
      logLine(encounter, (active.nickname || active.name) + ' also restored a little move energy.');
    }
    return null;
  }

  if (item.category === 'pp') {
    if (!active) {
      addToRunBag(run, itemSlug, 1);
      return 'No active monster can use that.';
    }
    for (const move of active.moves) {
      move.pp = Math.min(move.maxPp, move.pp + (item.amount >= 90 ? move.maxPp : item.amount));
    }
    logLine(encounter, (active.nickname || active.name) + ' restored move energy with ' + item.name + '.');
    return null;
  }

  if (item.category === 'status') {
    const targets = item.slug === 'phoenix-salt' ? run.party : active ? [active] : [];
    if (!targets.length) {
      addToRunBag(run, itemSlug, 1);
      return 'No active monster can use that.';
    }
    targets.forEach((monster) => {
      if (monster.currentHp > 0) {
        monster.status = null;
      }
    });
    logLine(encounter, item.name + ' cleared harmful conditions.');
    return null;
  }

  if (item.category === 'revive') {
    if (!fainted) {
      addToRunBag(run, itemSlug, 1);
      return 'No fainted monster needs revival.';
    }
    reviveMonster(fainted, item.amount || 0.5);
    logLine(encounter, (fainted.nickname || fainted.name) + ' returned to the fight with ' + item.name + '.');
    return null;
  }

  if (item.category === 'capture') {
    addToRunBag(run, itemSlug, 1);
    return 'Use the dedicated capture action for capture items.';
  }

  if (item.category === 'level') {
    if (!active) {
      addToRunBag(run, itemSlug, 1);
      return 'No active monster can use that.';
    }
    grantExp(active, expToNextLevel(active.level), encounter.log);
    logLine(encounter, (active.nickname || active.name) + ' surged in power from ' + item.name + '.');
    return null;
  }

  if (item.category === 'buff') {
    if (!active) {
      addToRunBag(run, itemSlug, 1);
      return 'No active monster can use that.';
    }
    const statMap = {
      'attack-chip': 'atk',
      'guard-chip': 'def',
      'focus-chip': 'spa',
      'ward-chip': 'spd',
      'haste-chip': 'spe',
    };
    const key = statMap[item.slug];
    active.bonusStats = normalizeStatSpread(active.bonusStats);
    active.bonusStats[key] += 6;
    rebuildMonsterBoosts(active);
    const species = SPECIES_MAP.get(active.speciesId);
    active.stats = resolvedMonsterStats(active, species);
    active.currentHp = Math.min(active.currentHp + 6, active.stats.hp);
    logLine(encounter, (active.nickname || active.name) + ' permanently improved ' + key.toUpperCase() + ' with ' + item.name + '.');
    return null;
  }

  if (item.category === 'team-heal') {
    run.party.forEach((monster) => {
      if (monster.currentHp > 0) {
        healMonster(monster, Math.floor(monster.stats.hp * 0.25));
      }
    });
    const totalPp = restorePartyPp(run.party, 1);
    logLine(encounter, 'The team shared a field ration and recovered some strength.');
    if (totalPp > 0) {
      logLine(encounter, 'The team recovered a little move energy too.');
    }
    return null;
  }

  addToRunBag(run, itemSlug, 1);
  return 'This item cannot be used mid-battle.';
}

function enemyTurn(run, encounter) {
  const enemy = encounter.enemyParty[encounter.enemyIndex];
  const player = run.party[encounter.playerIndex];
  if (!enemy || !player || enemy.currentHp <= 0 || player.currentHp <= 0) {
    return;
  }
  const moveIndex = chooseBestEnemyMove(enemy, player, encounter);
  applyMove(enemy, player, enemy.moves[moveIndex], encounter, 'enemy');
}

function sortTurnOrder(playerMonster, playerMove, enemyMonster, enemyMove, encounter) {
  const playerPriority = battleMovePriority(playerMonster, playerMove);
  const enemyPriority = battleMovePriority(enemyMonster, enemyMove);
  if (playerPriority !== enemyPriority) {
    return playerPriority > enemyPriority ? 'player' : 'enemy';
  }
  const playerSpeed = effectiveStat(playerMonster, 'spe', encounter);
  const enemySpeed = effectiveStat(enemyMonster, 'spe', encounter);
  return playerSpeed >= enemySpeed ? 'player' : 'enemy';
}

function resolveEndOfTurn(userId, run, encounter) {
  if (!run.encounter) {
    return { finished: false };
  }
  applyEndTurnStatus(run.party[encounter.playerIndex], encounter);
  applyEndTurnStatus(encounter.enemyParty[encounter.enemyIndex], encounter);
  applyEndTurnPassives(run.party[encounter.playerIndex], encounter);
  applyEndTurnPassives(encounter.enemyParty[encounter.enemyIndex], encounter);
  run.party.forEach((monster) => {
    monster.flinched = false;
  });
  encounter.enemyParty.forEach((monster) => {
    monster.flinched = false;
  });
  const outcome = handleKnockouts(userId, run, encounter);
  if (!outcome.finished && run.encounter) {
    advanceWeather(encounter);
    encounter.turn += 1;
  }
  return outcome;
}

function attemptRun(userId, run, encounter) {
  if (encounter.kind !== 'wild') {
    return 'You cannot run from trainers or bosses.';
  }
  const player = run.party[encounter.playerIndex];
  const enemy = encounter.enemyParty[encounter.enemyIndex];
  const speedGap = effectiveStat(player, 'spe', encounter) - effectiveStat(enemy, 'spe', encounter);
  const chance = clamp(0.45 + speedGap / 220 + (encounter.turn === 1 ? 0.2 : 0), 0.25, 0.95);
  if (Math.random() <= chance) {
    const penalty = Math.max(20, Math.floor(run.wave * 8));
    logLine(encounter, 'You escaped the battle, but dropped ' + formatNumber(penalty) + ' run cash on the way out.');
    run.money = Math.max(0, run.money - penalty);
    run.wave += 1;
    run.encounter = generateEncounter(run);
    return null;
  }
  logLine(encounter, 'Could not get away!');
  enemyTurn(run, encounter);
  resolveEndOfTurn(userId, run, encounter);
  return 'Escape failed.';
}

function savedRosterRunParty(userId, mode) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const collection = persistentEligibleCollectionEntries(getCollection(userId));
  const validIds = collectionIdSet(collection);
  const collectionMap = new Map(collection.map((entry) => [entry.id, entry]));
  const savedPartyIds = normalizePartyCollectionIds(user.meta.partyCollectionIds, validIds);
  const partnerCollectionId = validIds.includes(Number(user.meta.partnerCollectionId || 0))
    ? Number(user.meta.partnerCollectionId)
    : null;
  const orderedEntries = [];
  const seen = new Set();
  const pushEntry = (collectionId) => {
    const normalizedId = Number(collectionId || 0);
    if (!normalizedId || seen.has(normalizedId)) {
      return;
    }
    const entry = collectionMap.get(normalizedId);
    if (!entry) {
      return;
    }
    seen.add(normalizedId);
    orderedEntries.push(entry);
  };
  pushEntry(partnerCollectionId);
  savedPartyIds.forEach((collectionId) => pushEntry(collectionId));

  if (!orderedEntries.length) {
    throw new Error('Set a partner or saved party monster before launching Partner Style.');
  }

  return buildSavedRosterParty(orderedEntries, mode);
}

function buildSavedRosterParty(entries, mode) {
  return (entries || []).map((entry) => {
    const monster = normalizeMonster(cloneMonster(entry.monster), entry.id).monster;
    const species = SPECIES_MAP.get(monster.speciesId);
    if (!species) {
      throw new Error('One of the saved roster monsters could not be loaded.');
    }
    const startingLevel = Math.max(pickStarterLevel(mode), Number(monster.level || 1));
    monster.level = startingLevel;
    monster.stats = resolvedMonsterStats(monster, species, startingLevel, monster.statBoosts, monster.nature);
    monster.currentHp = monster.stats.hp;
    monster.status = null;
    rebuildMonsterLearnset(monster, species, { restoreFullPp: true });
    monster.sourceCollectionId = entry.id;
    resetCombatState(monster);
    monster.currentHp = monster.stats.hp;
    return monster;
  });
}

function specialRunParty(userId, mode) {
  try {
    return savedRosterRunParty(userId, mode);
  } catch (error) {
    if (error?.message !== 'Set a partner or saved party monster before launching Partner Style.') {
      throw error;
    }
  }
  let collection = sortCollectionEntriesForDisplay(persistentEligibleCollectionEntries(getCollection(userId))).slice(0, PARTY_SLOT_COUNT);
  if (!collection.length) {
    collection = sortCollectionEntriesForDisplay(getStarterPool(userId)).slice(0, PARTY_SLOT_COUNT);
  }
  if (!collection.length) {
    throw new Error('Add at least one stored monster before launching a special board.');
  }
  return buildSavedRosterParty(collection, mode);
}

export function createRunForUser(userId, { mode, challengeSlug, starterIds, draftSlug }) {
  const user = getUserById(userId);
  const challenge = challengeSlug ? CHALLENGE_MAP.get(challengeSlug) : null;
  const requestedDraftSlug = String(draftSlug || '').trim() || 'classic-style';
  const useSavedRoster = requestedDraftSlug === 'partner-party-style';
  const draft = useSavedRoster
    ? { slug: requestedDraftSlug, name: 'Partner Style' }
    : getStarterDraft(requestedDraftSlug);
  if (!['classic', 'endless', 'challenge'].includes(mode)) {
    throw new Error('Unknown mode.');
  }
  if (!user.meta.unlockedModes.includes(mode) && mode !== 'challenge') {
    throw new Error('That mode is not unlocked yet.');
  }

  const challengeRule = challenge?.rule || null;
  let selected = [];
  let party = [];

  if (useSavedRoster) {
    party = savedRosterRunParty(userId, mode);
  } else {
    const starterPool = getStarterPool(userId);
    const requestedStarters = Array.isArray(starterIds) ? starterIds.filter(Boolean) : starterIds ? [starterIds] : [];
    selected = starterPool.filter((entry) => requestedStarters.includes(String(entry.id)));
    if (selected.length !== 1) {
      throw new Error('Pick exactly one starter.');
    }
    if (!draft.starterIds.includes(selected[0].monster.speciesId)) {
      throw new Error('Pick one starter from the active starter draft.');
    }

    if (challengeRule?.allowedType && selected.some((entry) => !entry.species.types.includes(challengeRule.allowedType))) {
      throw new Error('This challenge only allows ' + challengeRule.allowedType + ' starters.');
    }

    const cost = selected.reduce((sum, entry) => sum + (entry.species?.starterCost || 0), 0);
    const starterCap = modeStarterCap(mode, challengeRule);
    if (cost > starterCap) {
      throw new Error('Starter team cost ' + cost + ' exceeds the cap of ' + starterCap + '.');
    }

    party = selected.map((entry) => {
      const monster = cloneMonster(entry.monster);
      const startingLevel = Math.max(pickStarterLevel(mode), Number(entry.monster.level || 1));
      monster.level = startingLevel;
      monster.stats = resolvedMonsterStats(monster, SPECIES_MAP.get(monster.speciesId), startingLevel, monster.statBoosts, monster.nature);
      monster.currentHp = monster.stats.hp;
      monster.status = null;
      rebuildMonsterLearnset(monster, SPECIES_MAP.get(monster.speciesId), { restoreFullPp: true });
      monster.sourceCollectionId = entry.id;
      resetCombatState(monster);
      applyStarterPerk(monster);
      monster.currentHp = monster.stats.hp;
      return monster;
    });
  }

  if (challengeRule?.allowedType && party.some((monster) => !SPECIES_MAP.get(monster.speciesId)?.types.includes(challengeRule.allowedType))) {
    throw new Error('This challenge only allows ' + challengeRule.allowedType + ' starters.');
  }

  const trainerBonuses = trainerGearBonuses(user.meta);
  const premiumBoosts = premiumRunBoostsForUser(userId);
  const trainerProgress = trainerProgressionSummary(user);
  applyTrainerGearBonusesToParty(party, trainerBonuses);

  const activeRow = getActiveRunRow(userId);
  if (activeRow) {
    db.prepare('UPDATE runs SET status = ?, updated_at = ? WHERE id = ?').run('abandoned', nowIso(), activeRow.id);
  }

  const startingCash = (challengeRule?.startingCash || (mode === 'endless' ? 700 : mode === 'challenge' ? 500 : 450)) + Math.round(trainerProgress.bonuses.startingCashBonus || 0);
  const run = {
    userId,
    mode,
    challengeSlug: challengeSlug || null,
    starterDraftSlug: draft.slug,
    wave: 1,
    money: startingCash,
    startingCash,
    totalRunCashEarned: 0,
    accountCashEarned: 0,
    party,
    bench: [],
    bag: buildStarterBag(userId),
    captures: 0,
    createdAt: nowIso(),
    pendingReward: null,
    encounter: null,
    premiumBoosts,
    progressionBoosts: { ...trainerProgress.bonuses },
    trainerProfile: {
      classSlug: trainerProgress.activeClass.slug,
      className: trainerProgress.activeClass.name,
      titleSlug: trainerProgress.selectedTitle.slug,
      titleName: trainerProgress.selectedTitle.name,
      level: trainerProgress.profile.level,
    },

    notes: useSavedRoster
      ? [
          'Run started in ' + mode + ' mode.',
          'Partner Style: your saved partner / party squad entered the run.',
          party.map((monster) => monster.nickname || monster.name).join(', ') + ' deployed from persistent storage.',
        ]
      : [
          'Run started in ' + mode + ' mode.',
          'Starter Draft: ' + draft.name + '.',
          selected[0].monster.name + ' joined with ' + (getStarterPerk(selected[0].monster.speciesId)?.name || 'starter momentum') + '.',
        ],
  };

  if (trainerBonuses.hasBoost) {
    const loadoutSources = trainerBonuses.sources || trainerBonuses.equipped || [];
    const loadoutLabel = loadoutSources.map((entry) => entry.name).join(' + ');
    run.notes.push('Loadout bonus active: ' + loadoutLabel + '.');
    run.notes.push('Party stat bonus: ' + statSpreadSummary(trainerBonuses.statBoosts, '%'));
  }

  run.notes.push('Trainer title: ' + trainerProgress.selectedTitle.name + ' / Class: ' + trainerProgress.activeClass.name + '.');
  if (trainerProgress.bonuses.startingCashBonus > 0) {
    run.notes.push('Trainer build bonus: +' + Math.round(trainerProgress.bonuses.startingCashBonus) + ' starting cash.');
  }

  if (premiumBoosts.expBonus > 0 || premiumBoosts.cashBonus > 0) {
    run.notes.push('Premium boosts active: EXP +' + Math.round(premiumBoosts.expBonus * 100) + '% / Cash +' + Math.round(premiumBoosts.cashBonus * 100) + '%.');
  }

  run.trainerLoadout = {
    equipped: (trainerBonuses.sources || trainerBonuses.equipped || []).map((entry) => entry.slug),
    statBoosts: trainerBonuses.statBoosts,
  };

  bumpProgressStat(user.meta, 'runsStarted', 1);
  saveUserMeta(userId, user.meta);

  const result = db.prepare('INSERT INTO runs (user_id, status, mode, challenge_slug, summary_json, run_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, 'active', mode, challengeSlug || null, null, writeJson(run), nowIso(), nowIso());
  run.rowId = result.lastInsertRowid;
  run.encounter = generateEncounter(run);
  persistRun(run.rowId, run);
  return run;
}

export function abandonRun(userId) {
  const active = getActiveRun(userId);
  if (!active) {
    return;
  }
  finishRun(userId, active.id, active.run, 'abandoned');
}

export function performRunAction(userId, action) {
  const active = getActiveRun(userId);
  if (!active) {
    throw new Error('No active run.');
  }
  const run = active.run;
  run.rowId = active.id;
  if (!run.encounter) {
    run.encounter = generateEncounter(run);
  }
  const encounter = run.encounter;

  if (action.type === 'switch') {
    const targetIndex = Number(action.targetIndex);
    if (!run.party[targetIndex] || run.party[targetIndex].currentHp <= 0) {
      throw new Error('That monster cannot switch in.');
    }
    const current = run.party[encounter.playerIndex];
    if (current && targetIndex !== encounter.playerIndex && current.currentHp > 0 && getMonsterAbility(current).slug === 'regenerator') {
      const healed = healMonster(current, Math.max(1, Math.floor(current.stats.hp * 0.2)));
      if (healed > 0) {
        logLine(encounter, (current.nickname || current.name) + ' restored HP with Regenerator.');
      }
    }
    encounter.playerIndex = targetIndex;
    logLine(encounter, (run.party[targetIndex].nickname || run.party[targetIndex].name) + ' was switched in.');
    enemyTurn(run, encounter);
    let outcome = handleKnockouts(userId, run, encounter);
    if (!outcome.finished && run.encounter) {
      outcome = resolveEndOfTurn(userId, run, encounter);
    }
    persistRun(active.id, run);
    return run;
  }

  if (action.type === 'item') {
    const itemError = useBattleItem(run, encounter, action.itemSlug);
    if (itemError) {
      throw new Error(itemError);
    }
    enemyTurn(run, encounter);
    let outcome = handleKnockouts(userId, run, encounter);
    if (!outcome.finished && run.encounter) {
      outcome = resolveEndOfTurn(userId, run, encounter);
    }
    persistRun(active.id, run);
    return run;
  }

  if (action.type === 'transform') {
    const player = run.party[encounter.playerIndex];
    const mode = action.transformMode;
    const transformed = mode === 'mega'
      ? canMegaEvolve(player) && applyBattleForm(player, 'mega', encounter)
      : mode === 'ultra'
        ? canUltraBurst(player) && applyBattleForm(player, 'ultra', encounter)
        : mode === 'dynamax'
          ? canDynamax(player) && applyBattleForm(player, 'dynamax', encounter)
          : canVariantShift(player) && applyBattleForm(player, 'variant', encounter);
    if (!transformed) {
      const labels = {
        mega: 'Mega Evolution',
        ultra: 'Ultra Burst',
        dynamax: 'Dynamax',
        variant: 'Variant Form',
      };
      throw new Error((labels[mode] || 'That transformation') + ' is not available right now.');
    }
    enemyTurn(run, encounter);
    let outcome = handleKnockouts(userId, run, encounter);
    if (!outcome.finished && run.encounter) {
      outcome = resolveEndOfTurn(userId, run, encounter);
    }
    persistRun(active.id, run);
    return run;
  }

  if (action.type === 'run') {
    const runResult = attemptRun(userId, run, encounter);
    if (runResult && runResult !== 'Escape failed.') {
      throw new Error(runResult);
    }
    persistRun(active.id, run);
    return run;
  }

  if (action.type === 'capture') {
    const result = attemptCapture(userId, run, encounter, action.itemSlug);
    if (typeof result === 'string') {
      throw new Error(result);
    }
    if (run.encounter) {
      enemyTurn(run, encounter);
      let outcome = handleKnockouts(userId, run, encounter);
      if (!outcome.finished && run.encounter) {
        outcome = resolveEndOfTurn(userId, run, encounter);
      }
    }
    persistRun(active.id, run);
    return run;
  }

  const player = run.party[encounter.playerIndex];
  const enemy = encounter.enemyParty[encounter.enemyIndex];
  const moveIndex = Number(action.moveIndex);
  const playerMove = player.moves[moveIndex];
  const playerMoveData = MOVE_MAP.get(playerMove?.id);
  if (!playerMove || playerMove.pp <= 0) {
    throw new Error('That move cannot be used.');
  }
  if (action.battleMode === 'z' && (!playerMoveData || playerMoveData.category === 'status' || !canUseZMove(player, playerMoveData))) {
    throw new Error('Z-Power is not available for that move.');
  }

  const enemyMove = enemy.moves[chooseBestEnemyMove(enemy, player, encounter)];
  const first = sortTurnOrder(player, playerMove, enemy, enemyMove, encounter);

  if (first === 'player') {
    applyMove(player, enemy, playerMove, encounter, 'player', { battleMode: action.battleMode });
    let outcome = handleKnockouts(userId, run, encounter);
    if (!outcome.finished && run.encounter) {
      enemyTurn(run, encounter);
      outcome = handleKnockouts(userId, run, encounter);
    }
  } else {
    enemyTurn(run, encounter);
    let outcome = handleKnockouts(userId, run, encounter);
    if (!outcome.finished && run.encounter) {
      applyMove(player, enemy, playerMove, encounter, 'player', { battleMode: action.battleMode });
      outcome = handleKnockouts(userId, run, encounter);
    }
  }

  if (run.encounter) {
    resolveEndOfTurn(userId, run, encounter);
  }

  persistRun(active.id, run);
  return run;
}

export function handleRewardAction(userId, action) {
  const active = getActiveRun(userId);
  if (!active) {
    throw new Error('No active run.');
  }
  const run = active.run;
  run.rowId = active.id;
  if (!run.pendingReward) {
    throw new Error('No reward is waiting.');
  }

  if (action.type === 'claim') {
    if (run.pendingReward.claimed) {
      throw new Error('A reward has already been claimed for this wave.');
    }
    const index = Number(action.rewardIndex);
    const reward = run.pendingReward.rewardChoices[index];
    if (!reward) {
      throw new Error('Reward not found.');
    }
    if (reward.kind === 'cash') {
      run.money += reward.amount;
    } else if (reward.kind === 'item') {
      addToRunBag(run, reward.slug, reward.quantity || 1);
    } else if (reward.kind === 'heal') {
      run.party.forEach((monster) => {
        if (monster.currentHp > 0) {
          healMonster(monster, Math.floor(monster.stats.hp * reward.amount));
          restoreMovePp(monster, 1);
        }
      });
    }
    run.pendingReward.claimed = true;
    persistRun(active.id, run);
    return run;
  }

  if (action.type === 'buy') {
    const offer = run.pendingReward.shopOffers.find((entry) => entry.slug === action.itemSlug);
    if (!offer) {
      throw new Error('Offer not found.');
    }
    const quantity = [1, 3].includes(Number(action.quantity)) ? Number(action.quantity) : 1;
    const totalPrice = offer.price * quantity;
    if (run.money < totalPrice) {
      throw new Error('Not enough run cash.');
    }
    run.money -= totalPrice;
    addToRunBag(run, offer.slug, quantity);
    persistRun(active.id, run);
    return run;
  }

  if (action.type === 'reroll') {
    if (!spendFromRunBag(run, 'reroll-ticket', 1)) {
      throw new Error('No reroll ticket available.');
    }
    run.pendingReward.rewardChoices = generateRewardChoices(run, { kind: run.pendingReward.encounterKind });
    run.pendingReward.shopOffers = generateShopOffers(run);
    persistRun(active.id, run);
    return run;
  }

  if (action.type === 'continue') {
    run.pendingReward = null;
    run.wave += 1;
    run.encounter = generateEncounter(run);
    persistRun(active.id, run);
    return run;
  }

  throw new Error('Unknown reward action.');
}

export function getRunSnapshot(userId) {
  const active = getActiveRun(userId);
  if (!active) {
    return null;
  }
  const run = active.run;
  run.rowId = active.id;
  if (!run.encounter && !run.pendingReward) {
    run.encounter = generateEncounter(run);
    persistRun(active.id, run);
  }
  markSpeciesSeen(userId, [
    ...run.party.map((monster) => monster.speciesId),
    ...(run.encounter?.enemyParty || []).map((monster) => monster.speciesId),
  ]);
  return run;
}

function smtpReadFactory(socket) {
  let buffer = '';
  const queue = [];
  let resolver = null;

  function flush() {
    while (true) {
      const lines = buffer.split(/\r?\n/);
      if (lines.length < 2) {
        return;
      }
      const completeLines = [];
      let consumed = 0;
      let finalLine = null;
      for (const line of lines) {
        if (!line) {
          consumed += 1;
          continue;
        }
        completeLines.push(line);
        consumed += 1;
        if (/^\d{3} /.test(line)) {
          finalLine = line;
          break;
        }
        if (!/^\d{3}-/.test(line)) {
          finalLine = line;
          break;
        }
      }
      if (!finalLine) {
        return;
      }
      queue.push(completeLines.join('\n'));
      buffer = lines.slice(consumed).join('\n');
      if (resolver) {
        const next = resolver;
        resolver = null;
        next(queue.shift());
      }
    }
  }

  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    flush();
  });

  socket.on('error', (error) => {
    if (resolver) {
      const next = resolver;
      resolver = null;
      next(Promise.reject(error));
    }
  });

  return function readResponse() {
    if (queue.length) {
      return Promise.resolve(queue.shift());
    }
    return new Promise((resolve) => {
      resolver = resolve;
    });
  };
}

async function smtpCommand(socket, readResponse, command, expectedPrefix = '2') {
  if (command) {
    socket.write(`${command}\r\n`);
  }
  const response = await readResponse();
  if (response instanceof Promise) {
    return response;
  }
  const code = String(response).slice(0, 1);
  if (expectedPrefix && code !== expectedPrefix) {
    throw new Error(`SMTP command failed: ${response}`);
  }
  return response;
}

async function sendMail({ to, subject, html, text }) {
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass || !config.smtpFrom) {
    return { ok: false, reason: 'not-configured' };
  }

  const socket = tls.connect({
    host: config.smtpHost,
    port: config.smtpPort,
    servername: config.smtpHost,
  });

  const readResponse = smtpReadFactory(socket);
  await new Promise((resolve, reject) => {
    socket.once('secureConnect', resolve);
    socket.once('error', reject);
  });

  await smtpCommand(socket, readResponse, null, '2');
  await smtpCommand(socket, readResponse, `EHLO ${config.smtpHost}`, '2');
  await smtpCommand(socket, readResponse, 'AUTH LOGIN', '3');
  await smtpCommand(socket, readResponse, Buffer.from(config.smtpUser).toString('base64'), '3');
  await smtpCommand(socket, readResponse, Buffer.from(config.smtpPass).toString('base64'), '2');
  await smtpCommand(socket, readResponse, `MAIL FROM:<${config.smtpUser}>`, '2');
  await smtpCommand(socket, readResponse, `RCPT TO:<${to}>`, '2');
  await smtpCommand(socket, readResponse, 'DATA', '3');

  const body = [
    `From: ${config.smtpFrom}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    html || `<pre>${escapeHtml(text || '')}</pre>`,
    '.',
  ].join('\r\n');
  socket.write(`${body}\r\n`);
  await smtpCommand(socket, readResponse, null, '2');
  await smtpCommand(socket, readResponse, 'QUIT', '2');
  socket.end();
  return { ok: true };
}

export async function requestPasswordReset(email) {
  const normalizedEmail = normalizeEmail(email);
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);
  if (!row) {
    return { ok: true, sent: false };
  }
  const user = inflateUser(row);
  const token = randomId(32);
  const tokenHash = hashValue(token);
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE users SET reset_token_hash = ?, reset_expires = ? WHERE id = ?').run(tokenHash, expires, user.id);
  const resetUrl = `${config.appOrigin}/reset-password?token=${token}`;
  const mail = await sendMail({
    to: user.email,
    subject: 'Moemon Arena password reset',
    text: `Reset your password here: ${resetUrl}`,
    html: `<p>Use the secure link below to reset your password:</p><p><a href="${escapeHtml(resetUrl)}">${escapeHtml(resetUrl)}</a></p><p>This link expires in 1 hour.</p>`,
  });
  return { ok: true, sent: mail.ok, reason: mail.reason || null, resetUrl };
}

export function resetPasswordWithToken(token, password) {
  const tokenHash = hashValue(token);
  const row = db.prepare('SELECT * FROM users WHERE reset_token_hash = ? AND reset_expires > ?').get(tokenHash, nowIso());
  if (!row) {
    throw new Error('That reset link is invalid or expired.');
  }
  db.prepare('UPDATE users SET password_hash = ?, reset_token_hash = NULL, reset_expires = NULL WHERE id = ?')
    .run(hashPassword(password), row.id);
}

export function adminGrantCash(adminUserId, targetUserId, amount) {
  const user = getUserById(targetUserId);
  if (!user) {
    throw new Error('Target user not found.');
  }
  const newCash = Math.max(0, user.cash + Number(amount || 0));
  db.prepare('UPDATE users SET cash = ? WHERE id = ?').run(newCash, targetUserId);
  logAdmin(adminUserId, targetUserId, 'grant-cash', { amount: Number(amount || 0), newCash });
  return getUserById(targetUserId);
}

export function adminGrantItem(adminUserId, targetUserId, itemSlug, quantity) {
  addInventory(targetUserId, itemSlug, Number(quantity || 0));
  const active = getActiveRun(targetUserId);
  if (active) {
    active.run.bag[itemSlug] = (active.run.bag[itemSlug] || 0) + Number(quantity || 0);
    persistRun(active.id, active.run);
  }
  logAdmin(adminUserId, targetUserId, 'grant-item', { itemSlug, quantity: Number(quantity || 0) });
}

export function adminGrantMonster(adminUserId, targetUserId, speciesSlug, level = 8) {
  const species = SPECIES_SLUG_MAP.get(speciesSlug) || SPECIES_MAP.get(Number(speciesSlug));
  if (!species) {
    throw new Error('Monster species not found.');
  }
  const monster = makeMonsterInstance(species.id, Number(level || 8), { seedOffset: targetUserId, metLocation: 'Admin Vault', metLevel: Number(level || 8), origin: 'admin-gift' });
  db.prepare('INSERT INTO collection (user_id, monster_json, starter_unlocked, favorite, created_at) VALUES (?, ?, 1, 0, ?)')
    .run(targetUserId, writeJson(monster), nowIso());
  logAdmin(adminUserId, targetUserId, 'grant-monster', { speciesId: species.id, level: Number(level || 8) });
}
function syncCollectionMonsterToRun(targetUserId, collectionId, updatedMonster) {
  const active = getActiveRun(targetUserId);
  if (!active) {
    return;
  }
  const applyTo = (monster) => {
    if (!monster || Number(monster.sourceCollectionId || 0) !== Number(collectionId)) {
      return false;
    }
    const species = SPECIES_MAP.get(updatedMonster.speciesId);
    if (!species) {
      return false;
    }
    const ratio = monster.stats?.hp ? monster.currentHp / Math.max(1, monster.stats.hp) : 1;
    const wasAlive = monster.currentHp > 0;
    monster.nickname = String(updatedMonster.nickname || '');
    monster.level = clamp(Math.floor(Number(updatedMonster.level || monster.level || 1)), 1, 100);
    monster.experience = Math.max(0, Math.floor(Number(updatedMonster.experience || 0)));
    monster.nature = updatedMonster.nature;
    monster.auraKey = updatedMonster.auraKey;
    monster.auraPalette = updatedMonster.auraPalette;
    monster.hiddenAbilityUnlocked = !!updatedMonster.hiddenAbilityUnlocked;
    monster.abilitySlug = updatedMonster.abilitySlug;
    monster.heldItemSlug = updatedMonster.heldItemSlug || null;
    monster.ivs = normalizeStatSpread(updatedMonster.ivs, 31);
    monster.evs = normalizeStatSpread(updatedMonster.evs, 252);
    monster.bonusStats = normalizeStatSpread(updatedMonster.bonusStats);
    monster.starterPerk = updatedMonster.starterPerk ? cloneMonster(updatedMonster.starterPerk) : null;
    monster.healingBoost = Number(updatedMonster.healingBoost || 0);
    monster.metLocation = updatedMonster.metLocation;
    monster.metLevel = updatedMonster.metLevel;
    monster.caughtAt = updatedMonster.caughtAt;
    monster.origin = updatedMonster.origin;
    monster.boxTag = updatedMonster.boxTag;
    monster.speciesId = updatedMonster.speciesId;
    monster.speciesSlug = species.slug;
    monster.name = species.name;
    monster.types = species.types;
    monster.baseStats = species.baseStats;
    monster.starterEligible = species.starterEligible;
    rebuildMonsterBoosts(monster);
    monster.moves = cloneMonster(normalizeMoveStates(updatedMonster.moves));
    rebuildMonsterLearnset(monster, species, { restoreFullPp: true });
    monster.stats = resolvedMonsterStats(monster, species, monster.level, monster.statBoosts, monster.nature);
    monster.currentHp = wasAlive ? Math.max(1, Math.min(monster.stats.hp, Math.round(monster.stats.hp * ratio))) : 0;
    return true;
  };
  let changed = false;
  changed = active.run.party.some((monster) => applyTo(monster)) || changed;
  changed = (active.run.bench || []).some((monster) => applyTo(monster)) || changed;
  if (changed) {
    persistRun(active.id, active.run);
  }
}

export function adminSetMonsterLevel(adminUserId, targetUserId, collectionId, level) {
  const entry = getCollectionEntry(targetUserId, Number(collectionId));
  if (!entry) {
    throw new Error('Monster entry not found for that user.');
  }
  const species = SPECIES_MAP.get(entry.monster.speciesId);
  const safeLevel = clamp(Math.floor(Number(level || 1)), 1, 100);
  const monster = normalizeMonster(cloneMonster(entry.monster), entry.id).monster;
  monster.level = safeLevel;
  rebuildMonsterLearnset(monster, species, { restoreFullPp: true });
  monster.stats = resolvedMonsterStats(monster, species, safeLevel, monster.statBoosts, monster.nature);
  monster.currentHp = monster.stats.hp;
  updateCollectionMonster(entry.id, monster, targetUserId);
  
  logAdmin(adminUserId, targetUserId, 'set-monster-level', { collectionId: entry.id, level: safeLevel });
  return getCollectionEntry(targetUserId, entry.id);
}

export function adminAdjustMonsterBonusStat(adminUserId, targetUserId, collectionId, statKey, amount) {
  const entry = getCollectionEntry(targetUserId, Number(collectionId));
  if (!entry) {
    throw new Error('Monster entry not found for that user.');
  }
  if (!STAT_KEYS.includes(statKey)) {
    throw new Error('Unknown stat key.');
  }
  const delta = clamp(Math.floor(Number(amount || 0)), -40, 40);
  if (!delta) {
    throw new Error('Stat delta cannot be zero.');
  }
  const monster = normalizeMonster(cloneMonster(entry.monster), entry.id).monster;
  const species = SPECIES_MAP.get(monster.speciesId);
  monster.bonusStats = normalizeStatSpread(monster.bonusStats);
  monster.bonusStats[statKey] = Math.max(0, monster.bonusStats[statKey] + delta);
  rebuildMonsterBoosts(monster);
  monster.stats = resolvedMonsterStats(monster, species, monster.level, monster.statBoosts, monster.nature);
  monster.currentHp = Math.min(monster.currentHp || monster.stats.hp, monster.stats.hp);
  updateCollectionMonster(entry.id, monster, targetUserId);
  
  logAdmin(adminUserId, targetUserId, 'adjust-monster-stat', { collectionId: entry.id, statKey, amount: delta });
  return getCollectionEntry(targetUserId, entry.id);
}

export function adminSetRunWave(adminUserId, targetUserId, wave) {
  const active = getActiveRun(targetUserId);
  if (!active) {
    throw new Error('Target user has no active run.');
  }
  const safeWave = clamp(Math.floor(Number(wave || 1)), 1, 999);
  active.run.wave = safeWave;
  if (active.run.pendingReward) {
    active.run.pendingReward = null;
  }
  active.run.encounter = generateEncounter(active.run);
  persistRun(active.id, active.run);
  logAdmin(adminUserId, targetUserId, 'set-run-wave', { wave: safeWave });
  return active.run;
}

export function adminSetRole(adminUserId, targetUserId, role) {
  if (!['player', 'admin'].includes(role)) {
    throw new Error('Role must be player or admin.');
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetUserId);
  logAdmin(adminUserId, targetUserId, 'set-role', { role });
}

export function adminUnlockMode(adminUserId, targetUserId, mode) {
  const user = getUserById(targetUserId);
  if (!user.meta.unlockedModes.includes(mode)) {
    user.meta.unlockedModes.push(mode);
    saveUserMeta(targetUserId, user.meta);
  }
  logAdmin(adminUserId, targetUserId, 'unlock-mode', { mode });
}

export function adminClearRun(adminUserId, targetUserId) {
  const active = getActiveRun(targetUserId);
  if (active) {
    finishRun(targetUserId, active.id, active.run, 'admin-cleared');
  }
  logAdmin(adminUserId, targetUserId, 'clear-run', {});
}

export function createAdmin(email, password, username = 'Administrator') {
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizeEmail(email));
  if (existing) {
    db.prepare('UPDATE users SET role = ?, password_hash = ? WHERE id = ?').run('admin', hashPassword(password), existing.id);
    return getUserById(existing.id);
  }
  const user = createUser({ username, email, password });
  db.prepare('UPDATE users SET role = ?, cash = ? WHERE id = ?').run('admin', 5000, user.id);
  return getUserById(user.id);
}

export function getAdminOverview() {
  const users = listUsers(30);
  const activeRuns = db.prepare('SELECT COUNT(*) as count FROM runs WHERE status = ?').get('active').count;
  const totalRuns = db.prepare('SELECT COUNT(*) as count FROM runs').get().count;
  return {
    users,
    activeRuns,
    totalRuns,
    logs: db.prepare('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 20').all().map((row) => ({
      ...row,
      details: readJson(row.details_json, {}),
    })),
  };
}

const TRAINER_BONUS_KEYS = ['expBonus', 'cashBonus', 'captureBonus', 'healAfterBattleBonus', 'playerDamageBonus', 'missionBonus', 'ppAfterBattleBonus', 'startingCashBonus', 'shopDiscount'];

function zeroTrainerBonuses() {
  return Object.fromEntries(TRAINER_BONUS_KEYS.map((key) => [key, 0]));
}

function blankTrainerBonusMap() {
  return zeroTrainerBonuses();
}
function mergeTrainerBonusSets(target, source = {}, multiplier = 1) {
  for (const key of TRAINER_BONUS_KEYS) {
    target[key] += Number(source?.[key] || 0) * multiplier;
  }
  return target;
}

function multiplyTrainerBonuses(source = {}, multiplier = 1) {
  const next = zeroTrainerBonuses();
  return mergeTrainerBonusSets(next, source, multiplier);
}

function trainerLevelRequirement(level) {
  return 120 + Math.max(0, level - 1) * 45;
}

function trainerClassLevelRequirement(level) {
  return 80 + Math.max(0, level - 1) * 30;
}

function levelStateFromExperience(totalExp, cap, requirementForLevel) {
  let level = 1;
  let remaining = Math.max(0, Math.floor(Number(totalExp || 0)));
  while (level < cap) {
    const needed = requirementForLevel(level);
    if (remaining < needed) {
      break;
    }
    remaining -= needed;
    level += 1;
  }
  const expForNextLevel = level >= cap ? 0 : requirementForLevel(level);
  const progressPercent = expForNextLevel ? Math.round((remaining / expForNextLevel) * 100) : 100;
  return {
    level,
    expIntoLevel: remaining,
    expForNextLevel,
    progressPercent,
  };
}

function ensureTrainerProfile(meta) {
  meta.trainerProfile = {
    ...defaultMeta().trainerProfile,
    ...(meta?.trainerProfile || {}),
  };
  meta.trainerProfile.skillTree = { ...(meta.trainerProfile.skillTree || {}) };
  meta.trainerProfile.classExperience = { ...(meta.trainerProfile.classExperience || {}) };
  meta.trainerProfile.classSlug = TRAINER_CLASS_MAP.has(meta.trainerProfile.classSlug)
    ? meta.trainerProfile.classSlug
    : TRAINER_CLASSES[0].slug;
  meta.trainerProfile.titleSlug = TRAINER_TITLE_MAP.has(meta.trainerProfile.titleSlug)
    ? meta.trainerProfile.titleSlug
    : TRAINER_TITLES[0].slug;
  return meta.trainerProfile;
}

const ARENA_RANK_TIERS = [
  { slug: 'bronze', name: 'Bronze', tone: 'warning', pointsPerDivision: 80, levelBonus: 0, statBonusPerStat: 0 },
  { slug: 'silver', name: 'Silver', tone: 'default', pointsPerDivision: 95, levelBonus: 2, statBonusPerStat: 2 },
  { slug: 'gold', name: 'Gold', tone: 'electric', pointsPerDivision: 110, levelBonus: 4, statBonusPerStat: 4 },
  { slug: 'platinum', name: 'Platinum', tone: 'water', pointsPerDivision: 130, levelBonus: 6, statBonusPerStat: 6 },
  { slug: 'diamond', name: 'Diamond', tone: 'psychic', pointsPerDivision: 150, levelBonus: 8, statBonusPerStat: 8 },
];
const ARENA_RANK_DIVISIONS = ['V', 'IV', 'III', 'II', 'I'];
const ARENA_RANK_STEPS = (() => {
  let pointsFloor = 0;
  return ARENA_RANK_TIERS.flatMap((tier, tierIndex) => ARENA_RANK_DIVISIONS.map((division, divisionIndex) => {
    const minPoints = pointsFloor;
    const pointsRequired = tier.pointsPerDivision;
    pointsFloor += pointsRequired;
    return {
      slug: `${tier.slug}-${division.toLowerCase()}`,
      rankIndex: tierIndex * ARENA_RANK_DIVISIONS.length + divisionIndex,
      tierSlug: tier.slug,
      tierIndex,
      tierName: tier.name,
      division,
      divisionIndex,
      label: `${tier.name} ${division}`,
      tone: tier.tone,
      minPoints,
      pointsRequired,
      nextThreshold: pointsFloor,
      levelBonus: tier.levelBonus + divisionIndex,
      statBonusPerStat: tier.statBonusPerStat + divisionIndex,
    };
  }));
})();
const ARENA_RANK_CAP = ARENA_RANK_STEPS[ARENA_RANK_STEPS.length - 1]?.nextThreshold || 0;

function normalizeArenaRecord(meta) {
  return {
    wins: Math.max(0, Math.floor(Number(meta?.arenaRecord?.wins || 0))),
    losses: Math.max(0, Math.floor(Number(meta?.arenaRecord?.losses || 0))),
  };
}

function normalizeArenaLadder(meta) {
  const safePoints = Math.max(0, Math.floor(Number(meta?.arenaLadder?.points || 0)));
  const safeHighest = Math.max(safePoints, Math.floor(Number(meta?.arenaLadder?.highestPoints || 0)));
  return {
    points: Math.min(ARENA_RANK_CAP, safePoints),
    highestPoints: Math.min(ARENA_RANK_CAP, safeHighest),
  };
}

function arenaRankState(metaOrLadder) {
  const ladder = typeof metaOrLadder === 'number'
    ? { points: Math.max(0, Math.floor(Number(metaOrLadder || 0))), highestPoints: Math.max(0, Math.floor(Number(metaOrLadder || 0))) }
    : metaOrLadder && Object.prototype.hasOwnProperty.call(metaOrLadder, 'points') && !Object.prototype.hasOwnProperty.call(metaOrLadder, 'arenaLadder')
      ? {
        points: Math.max(0, Math.floor(Number(metaOrLadder.points || 0))),
        highestPoints: Math.max(0, Math.floor(Number(metaOrLadder.highestPoints || metaOrLadder.points || 0))),
      }
      : normalizeArenaLadder(metaOrLadder);
  const points = Math.min(ARENA_RANK_CAP, Math.max(0, ladder.points));
  const step = [...ARENA_RANK_STEPS].reverse().find((entry) => points >= entry.minPoints) || ARENA_RANK_STEPS[0];
  const next = ARENA_RANK_STEPS[step.rankIndex + 1] || null;
  const pointsIntoRank = points - step.minPoints;
  const pointsForNext = Math.max(1, step.nextThreshold - step.minPoints);
  const pointsToNext = next ? Math.max(0, next.minPoints - points) : 0;
  return {
    ...step,
    points,
    highestPoints: ladder.highestPoints,
    currentThreshold: step.minPoints,
    nextThreshold: next ? next.minPoints : null,
    nextLabel: next ? next.label : 'Arena Cap',
    pointsIntoRank,
    pointsForNext,
    pointsToNext,
    progressPercent: next ? Math.round((pointsIntoRank / pointsForNext) * 100) : 100,
    capped: !next,
  };
}

function arenaScalingProfile(queueType, requesterMeta, opponentMeta = null) {
  const normalizedQueue = ['ranked', 'advanced', 'hard', 'casual'].includes(queueType) ? queueType : 'casual';
  const requesterRank = arenaRankState(requesterMeta);
  const opponentRank = opponentMeta ? arenaRankState(opponentMeta) : requesterRank;
  const referenceIndex = normalizedQueue === 'ranked'
    ? Math.max(requesterRank.rankIndex, opponentRank.rankIndex)
    : normalizedQueue === 'advanced'
      ? Math.max(requesterRank.rankIndex + 2, opponentRank.rankIndex)
      : normalizedQueue === 'hard'
        ? Math.max(requesterRank.rankIndex + 1, opponentRank.rankIndex)
        : opponentRank.rankIndex;
  const scaleStep = ARENA_RANK_STEPS[Math.min(ARENA_RANK_STEPS.length - 1, Math.max(0, referenceIndex))] || ARENA_RANK_STEPS[0];
  const baseLevelBonus = normalizedQueue === 'ranked' ? 4 : normalizedQueue === 'advanced' ? 6 : normalizedQueue === 'hard' ? 3 : 0;
  const baseStatBonus = normalizedQueue === 'ranked' ? 2 : normalizedQueue === 'advanced' ? 3 : normalizedQueue === 'hard' ? 1 : 0;
  return {
    queueType: normalizedQueue,
    requesterRank,
    opponentRank,
    scaleStep,
    levelBonus: baseLevelBonus + scaleStep.levelBonus,
    bonusStats: baseStatBonus + scaleStep.statBonusPerStat,
  };
}

function arenaPointDeltaForOutcome(outcome, playerRankIndex, opponentRankIndex) {
  const difficultyGap = clamp(Math.floor(Number(opponentRankIndex || 0)) - Math.floor(Number(playerRankIndex || 0)), -8, 8);
  if (outcome === 'victory') {
    return clamp(24 + difficultyGap * 3, 14, 46);
  }
  if (outcome === 'defeat') {
    return -clamp(16 - difficultyGap * 2, 6, 28);
  }
  return 0;
}

function applyArenaLadderResult(meta, run, outcome) {
  if (run?.special?.extra?.queueType !== 'ranked') {
    return null;
  }
  meta.arenaLadder = normalizeArenaLadder(meta);
  const before = arenaRankState(meta.arenaLadder);
  const playerRankIndex = Math.floor(Number(run?.special?.extra?.playerArenaRankIndex ?? before.rankIndex));
  const opponentRankIndex = Math.floor(Number(run?.special?.extra?.opponentArenaRankIndex ?? before.rankIndex));
  const delta = arenaPointDeltaForOutcome(outcome, playerRankIndex, opponentRankIndex);
  meta.arenaLadder.points = clamp(before.points + delta, 0, ARENA_RANK_CAP);
  meta.arenaLadder.highestPoints = Math.max(before.highestPoints, meta.arenaLadder.points);
  const after = arenaRankState(meta.arenaLadder);
  return {
    before,
    after,
    delta: after.points - before.points,
    rankChanged: after.label !== before.label,
    climbed: after.rankIndex > before.rankIndex,
  };
}

function normalizedArenaRecord(meta) {
  return normalizeArenaRecord(meta);
}
function normalizedProgressStats(meta) {
  return {
    ...defaultMeta().progressStats,
    ...(meta?.progressStats || {}),
  };
}

function bumpProgressStat(meta, key, amount = 1) {
  meta.progressStats = normalizedProgressStats(meta);
  const delta = Number(amount || 0);
  meta.progressStats[key] = Math.max(0, Math.floor(Number(meta.progressStats?.[key] || 0) + delta));
  return meta.progressStats[key];
}

function trainerBonusSummary(meta) {
  const profile = ensureTrainerProfile(meta);
  const profileState = levelStateFromExperience(profile.experience, TRAINER_LEVEL_CAP, trainerLevelRequirement);
  const activeClass = TRAINER_CLASS_MAP.get(profile.classSlug) || TRAINER_CLASSES[0];
  const candidateSubclass = TRAINER_SUBCLASS_MAP.get(profile.subclassSlug || '');
  const activeSubclass = candidateSubclass && candidateSubclass.classSlugs.includes(activeClass.slug) && profileState.level >= candidateSubclass.unlockLevel
    ? candidateSubclass
    : null;
  const selectedTitle = TRAINER_TITLE_MAP.get(profile.titleSlug) || TRAINER_TITLES[0];
  const bonuses = zeroTrainerBonuses();
  const sources = [];
  mergeTrainerBonusSets(bonuses, activeClass.bonuses);
  sources.push({ type: 'class', label: activeClass.name, name: activeClass.name, slug: activeClass.slug });
  if (activeSubclass) {
    mergeTrainerBonusSets(bonuses, activeSubclass.bonuses);
    sources.push({ type: 'subclass', label: activeSubclass.name, name: activeSubclass.name, slug: activeSubclass.slug });
  }
  for (const node of TRAINER_SKILL_TREE) {
    const rank = clamp(Math.floor(Number(profile.skillTree?.[node.slug] || 0)), 0, node.maxRank);
    if (rank > 0) {
      mergeTrainerBonusSets(bonuses, node.bonusesPerRank, rank);
      sources.push({ type: 'skill', label: `${node.name} ${rank}/${node.maxRank}`, name: node.name, slug: node.slug });
    }
  }
  const rebirths = Math.max(0, Math.floor(Number(profile.rebirths || 0)));
  const rebirthBonuses = multiplyTrainerBonuses({ expBonus: 0.02, cashBonus: 0.02, captureBonus: 0.01, playerDamageBonus: 0.015 }, rebirths);
  if (rebirths > 0) {
    mergeTrainerBonusSets(bonuses, rebirthBonuses);
    sources.push({ type: 'rebirth', label: `Rebirth x${rebirths}`, name: 'Rebirth', slug: 'rebirth' });
  }
  const spentSkillPoints = TRAINER_SKILL_TREE.reduce((sum, node) => sum + clamp(Math.floor(Number(profile.skillTree?.[node.slug] || 0)), 0, node.maxRank), 0);
  return {
    profile,
    profileState,
    activeClass,
    activeSubclass,
    selectedTitle,
    bonuses,
    sources,
    rebirthBonuses,
    spentSkillPoints,
    availableSkillPoints: Math.max(0, profileState.level - 1 - spentSkillPoints),
    rebirthDifficultyMultiplier: Number((1 + rebirths * 0.1).toFixed(2)),
  };
}

function applyTrainerExperience(meta, amount) {
  const summary = trainerBonusSummary(meta);
  const profile = summary.profile;
  const before = summary.profileState;
  const gained = Math.max(0, Math.round(Number(amount || 0) * (1 + Math.max(0, Number(summary.bonuses.expBonus || 0)))));
  if (!gained) {
    return { expGained: 0, beforeLevel: before.level, afterLevel: before.level, levelsGained: 0, expIntoLevel: before.expIntoLevel, expForNextLevel: before.expForNextLevel };
  }
  profile.experience = Math.max(0, Math.floor(Number(profile.experience || 0)) + gained);
  profile.classExperience[summary.activeClass.slug] = Math.max(0, Math.floor(Number(profile.classExperience?.[summary.activeClass.slug] || 0)) + gained);
  const after = levelStateFromExperience(profile.experience, TRAINER_LEVEL_CAP, trainerLevelRequirement);
  return { expGained: gained, beforeLevel: before.level, afterLevel: after.level, levelsGained: after.level - before.level, expIntoLevel: after.expIntoLevel, expForNextLevel: after.expForNextLevel };
}

function missionMetricValue(progressStats, metric) {
  if (metric === 'battleWins') {
    return Number(progressStats.trainerVictories || 0) + Number(progressStats.bossVictories || 0);
  }
  return Number(progressStats?.[metric] || 0);
}

function missionPeriodKey(scope, reference = new Date()) {
  const date = reference instanceof Date ? new Date(reference) : new Date(reference);
  if (scope === 'monthly') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  if (scope === 'weekly') {
    const start = new Date(date);
    const offset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - offset);
    return start.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function selectedMissionTemplates(scope, periodKey) {
  const pool = [...(MISSION_POOLS[scope] || [])];
  const desiredCount = scope === 'monthly' ? 2 : 3;
  const rng = seeded(parseInt(hashValue(`${scope}:${periodKey}`).slice(0, 8), 16) >>> 0);
  const picks = [];
  while (pool.length && picks.length < desiredCount) {
    picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return picks;
}

function rewardLabelForMission(template) {
  const labels = [];
  if (template?.rewards?.cash) {
    labels.push(`${formatNumber(template.rewards.cash)} gold`);
  }
  if (template?.rewards?.item) {
    labels.push(`${ITEM_MAP.get(template.rewards.item)?.name || template.rewards.item} x${formatNumber(template.rewards.quantity || 1)}`);
  }
  if (template?.rewards?.exp) {
    labels.push(`${formatNumber(template.rewards.exp)} EXP`);
  }
  return labels.join(' / ') || 'Reward pending';
}

function ensureMissionBoard(meta, scope, reference = new Date()) {
  meta.missions = { ...defaultMeta().missions, ...(meta?.missions || {}) };
  const periodKey = missionPeriodKey(scope, reference);
  const current = meta.missions[scope];
  const progressStats = normalizedProgressStats(meta);
  const templates = selectedMissionTemplates(scope, periodKey);
  if (!current || current.periodKey !== periodKey || !Array.isArray(current.entries)) {
    meta.missions[scope] = {
      periodKey,
      entries: templates.map((template) => ({ slug: template.slug, baseline: missionMetricValue(progressStats, template.metric), claimedAt: null })),
    };
    return { board: meta.missions[scope], changed: true };
  }
  const entries = current.entries.map((entry) => ({ slug: String(entry?.slug || ''), baseline: Math.max(0, Math.floor(Number(entry?.baseline || 0))), claimedAt: entry?.claimedAt || null })).filter((entry) => MISSION_TEMPLATE_MAP.has(entry.slug));
  if (entries.length !== current.entries.length) {
    meta.missions[scope] = {
      periodKey,
      entries: templates.map((template) => ({ slug: template.slug, baseline: missionMetricValue(progressStats, template.metric), claimedAt: null })),
    };
    return { board: meta.missions[scope], changed: true };
  }
  meta.missions[scope] = { periodKey, entries };
  return { board: meta.missions[scope], changed: false };
}

function buildMissionSnapshots(meta, reference = new Date()) {
  const progressStats = normalizedProgressStats(meta);
  const snapshot = { daily: [], weekly: [], monthly: [], changed: false };
  for (const scope of ['daily', 'weekly', 'monthly']) {
    const ensured = ensureMissionBoard(meta, scope, reference);
    if (ensured.changed) {
      snapshot.changed = true;
    }
    snapshot[scope] = ensured.board.entries.map((entry) => {
      const template = MISSION_TEMPLATE_MAP.get(entry.slug);
      const progress = Math.max(0, missionMetricValue(progressStats, template.metric) - Math.max(0, Number(entry.baseline || 0)));
      const target = Number(template.target || 1);
      const claimed = !!entry.claimedAt;
      const complete = progress >= target;
      return { ...template, progress, target, claimed, complete, progressPercent: Math.min(100, Math.round((progress / Math.max(1, target)) * 100)), rewardLabel: rewardLabelForMission(template) };
    });
  }
  return snapshot;
}
function normalizedMiniGameStats(meta) {
  const defaults = { ...defaultMeta().miniGameStats, prizeWheelWins: 0, whackWins: 0, cooldowns: {} };
  const stats = { ...defaults, ...(meta?.miniGameStats || {}) };
  stats.cooldowns = { ...(stats.cooldowns || {}) };
  return stats;
}

function ensureTrainerGearMeta(meta) {
  meta.trainerGear = { ...defaultMeta().trainerGear, ...(meta?.trainerGear || {}) };
  meta.trainerGear.auras = { ...(meta.trainerGear.auras || {}) };
  meta.trainerGear.hats = { ...(meta.trainerGear.hats || {}) };
  return meta.trainerGear;
}

function trainerGearStateView(meta) {
  const gearMeta = ensureTrainerGearMeta(meta);
  const auraInventory = TRAINER_AURA_GEAR.map((entry) => ({ ...entry, quantity: Math.max(0, Math.floor(Number(gearMeta.auras?.[entry.slug] || 0))), equipped: gearMeta.equippedAuraSlug === entry.slug }));
  const hatInventory = TRAINER_HAT_GEAR.map((entry) => ({ ...entry, quantity: Math.max(0, Math.floor(Number(gearMeta.hats?.[entry.slug] || 0))), equipped: gearMeta.equippedHatSlug === entry.slug }));
  return {
    auraInventory,
    hatInventory,
    equippedAura: auraInventory.find((entry) => entry.equipped && entry.quantity > 0) || null,
    equippedHat: hatInventory.find((entry) => entry.equipped && entry.quantity > 0) || null,
  };
}

function trainerGearBonuses(meta) {
  const gear = trainerGearStateView(meta);
  const sources = [gear.equippedAura, gear.equippedHat].filter(Boolean);
  const statBoosts = Object.fromEntries(STAT_KEYS.map((key) => [key, 0]));
  for (const source of sources) {
    for (const key of STAT_KEYS) {
      statBoosts[key] += Number(source?.statBoosts?.[key] || 0);
    }
  }
  return { equipped: sources, sources, statBoosts, hasBoost: sources.length > 0 };
}

function applyTrainerGearBonusesToParty(party, bonuses) {
  const loadoutBoosts = normalizeStatSpread(bonuses?.statBoosts);
  const hasBoost = STAT_KEYS.some((key) => loadoutBoosts[key] > 0);
  for (const monster of party || []) {
    if (!monster) {
      continue;
    }
    if (hasBoost) {
      monster.trainerLoadoutBoosts = { ...loadoutBoosts };
    } else {
      delete monster.trainerLoadoutBoosts;
    }
    const species = SPECIES_MAP.get(monster.speciesId);
    if (!species) {
      continue;
    }
    const hpRatio = monster.stats?.hp ? monster.currentHp / Math.max(1, monster.stats.hp) : 1;
    monster.stats = resolvedMonsterStats(monster, species, monster.level, monster.statBoosts, monster.nature);
    monster.currentHp = monster.currentHp > 0
      ? Math.max(1, Math.min(monster.stats.hp, Math.round(monster.stats.hp * hpRatio)))
      : 0;
  }
  return party;
}

function buildLeaderboardEntries(currentUserId, limit = 8, options = {}) {
  const users = listUsers(Math.max(24, limit * 4));
  const sortBy = options.sortBy === 'arena' ? 'arena' : 'overall';
  const ranked = users.map((user) => {
    const progression = trainerProgressionSummary(user);
    const progressStats = normalizedProgressStats(user.meta);
    const bestWave = Math.max(Number(user.meta.bestWave?.classic || 0), Number(user.meta.bestWave?.challenge || 0), Number(user.meta.bestWave?.endless || 0));
    const totalWins = Number(progressStats.runWins || 0) + Number(progressStats.arenaWins || 0) + Number(progressStats.trainerVictories || 0) + Number(progressStats.bossVictories || 0);
    const monstersCaught = Number(progressStats.monstersCaught || 0);
    const arenaLadder = normalizeArenaLadder(user.meta);
    const arenaRank = arenaRankState(arenaLadder);
    const overallScore = bestWave * 18 + totalWins * 110 + monstersCaught * 7 + progression.profile.level * 25 + arenaLadder.points * 12;
    const arenaScore = arenaLadder.points * 28 + totalWins * 32 + bestWave * 8 + progression.profile.level * 10;
    return {
      userId: user.id,
      username: user.username,
      title: progression.selectedTitle.name,
      className: progression.activeClass.name,
      level: progression.profile.level,
      bestWave,
      totalWins,
      monstersCaught,
      score: overallScore,
      arenaScore,
      arenaPoints: arenaLadder.points,
      arenaHighestPoints: arenaLadder.highestPoints,
      arenaRankLabel: arenaRank.label,
      arenaRankTone: arenaRank.tone,
      arenaRankIndex: arenaRank.rankIndex,
      arenaNextRankLabel: arenaRank.nextLabel,
      arenaProgressPercent: arenaRank.progressPercent,
      arenaPointsToNext: arenaRank.pointsToNext,
      isCurrentUser: user.id === currentUserId,
    };
  }).sort((left, right) => {
    if (sortBy === 'arena') {
      return right.arenaPoints - left.arenaPoints
        || right.totalWins - left.totalWins
        || right.bestWave - left.bestWave
        || left.username.localeCompare(right.username);
    }
    return right.score - left.score
      || right.arenaPoints - left.arenaPoints
      || right.bestWave - left.bestWave
      || left.username.localeCompare(right.username);
  });
  ranked.forEach((entry, index) => {
    entry.rank = index + 1;
  });
  return { entries: ranked.slice(0, limit), currentUser: ranked.find((entry) => entry.userId === currentUserId) || null };
}

function buildBotChallengeDeck() {
  const pool = SPECIES.filter((species) => !['legendary', 'mythic'].includes(species.rarity));
  const templates = [
    { slug: 'route-rival', name: 'Route Rival', format: 'casual', difficulty: 'normal', seed: 11, baseLevel: 14 },
    { slug: 'board-veteran', name: 'Board Veteran', format: 'ranked', difficulty: 'hard', seed: 37, baseLevel: 22 },
    { slug: 'arena-overclock', name: 'Arena Overclock', format: 'advanced', difficulty: 'advanced', seed: 73, baseLevel: 30 },
  ];
  return templates.map((template, templateIndex) => ({
    ...template,
    roster: Array.from({ length: 6 }, (_, slotIndex) => {
      const species = pool[(template.seed + slotIndex * 13) % pool.length] || pool[0];
      return makeMonsterInstance(species.id, template.baseLevel + slotIndex * 2, { seedOffset: template.seed * 97 + templateIndex * 11 + slotIndex, metLocation: 'Arena Board', metLevel: template.baseLevel + slotIndex * 2, origin: 'arena-bot' });
    }),
  }));
}

function trainerProgressionSummary(user) {
  const meta = user.meta;
  const progressStats = normalizedProgressStats(meta);
  const summary = trainerBonusSummary(meta);
  const profileState = summary.profileState;
  const classState = levelStateFromExperience(summary.profile.classExperience?.[summary.activeClass.slug] || 0, TRAINER_CLASS_LEVEL_CAP, trainerClassLevelRequirement);
  const profile = { ...summary.profile, level: profileState.level, expIntoLevel: profileState.expIntoLevel, expForNextLevel: profileState.expForNextLevel, availableSkillPoints: summary.availableSkillPoints };
  const allClasses = TRAINER_CLASSES.map((entry) => {
    const mastery = levelStateFromExperience(summary.profile.classExperience?.[entry.slug] || 0, TRAINER_CLASS_LEVEL_CAP, trainerClassLevelRequirement);
    return { ...entry, unlocked: profileState.level >= entry.unlockLevel, equipped: entry.slug === summary.activeClass.slug, masteryLevel: mastery.level, masteryPercent: mastery.progressPercent };
  });
  const allSubclasses = TRAINER_SUBCLASSES.map((entry) => ({ ...entry, unlocked: profileState.level >= entry.unlockLevel, equipped: entry.slug === summary.activeSubclass?.slug, matchesActiveClass: entry.classSlugs.includes(summary.activeClass.slug) }));
  const allTitles = TRAINER_TITLES.map((entry) => ({ ...entry, unlocked: profileState.level >= entry.unlockLevel, equipped: entry.slug === summary.selectedTitle.slug }));
  const skillNodes = TRAINER_SKILL_TREE.map((entry) => {
    const rank = clamp(Math.floor(Number(summary.profile.skillTree?.[entry.slug] || 0)), 0, entry.maxRank);
    const unlocked = profileState.level >= entry.unlockLevel;
    return { ...entry, rank, unlocked, canUpgrade: unlocked && rank < entry.maxRank && summary.availableSkillPoints > 0, totalBonuses: multiplyTrainerBonuses(entry.bonusesPerRank, rank) };
  });
  const rebirthRequirements = [
    { label: 'Reach trainer level 40', met: profileState.level >= 40 },
    { label: 'Win 10 runs', met: Number(progressStats.runWins || 0) >= 10 },
    { label: 'Reach classic wave 30', met: Number(meta.bestWave?.classic || 0) >= 30 },
  ];
  const totalRuns = Math.max(Number(progressStats.runsCompleted || 0), Number(progressStats.runsStarted || 0));
  const totalWins = Number(progressStats.runWins || 0) + Number(progressStats.arenaWins || 0) + Number(progressStats.trainerVictories || 0) + Number(progressStats.bossVictories || 0);
  return {
    profile,
    activeClass: summary.activeClass,
    activeSubclass: summary.activeSubclass,
    selectedTitle: summary.selectedTitle,
    bonuses: summary.bonuses,
    sources: summary.sources,
    progressPercent: profileState.progressPercent,
    totalRuns,
    totalWins,
    winRate: totalRuns ? Math.round((Number(progressStats.runWins || 0) / totalRuns) * 100) : 0,
    activeClassMastery: { level: classState.level, expIntoLevel: classState.expIntoLevel, expForNextLevel: classState.expForNextLevel },
    allClasses,
    allSubclasses,
    allTitles,
    skillNodes,
    rebirthBonuses: summary.rebirthBonuses,
    rebirthDifficultyMultiplier: summary.rebirthDifficultyMultiplier,
    rebirthRequirements,
    rebirthReady: rebirthRequirements.every((entry) => entry.met),
  };
}

function saveMetaOnly(userId, meta) {
  saveUserMeta(userId, meta);
  return getUserById(userId);
}
const SOCIAL_MESSAGE_STORE = [];

export function setPlayerAvatar(userId, avatarSlug) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  if (!PLAYER_SPRITE_MAP.has(avatarSlug)) {
    throw new Error('Unknown avatar.');
  }
  user.meta.avatarSlug = avatarSlug;
  return saveMetaOnly(userId, user.meta);
}

export function setPartnerMonster(userId, collectionId) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const normalized = Number(collectionId || 0);
  if (!normalized) {
    user.meta.partnerCollectionId = null;
    return saveMetaOnly(userId, user.meta);
  }
  const entry = getCollectionEntry(userId, normalized);
  if (!entry) {
    throw new Error('Partner monster not found.');
  }
  user.meta.partnerCollectionId = entry.id;
  return saveMetaOnly(userId, user.meta);
}

export function setTrainerGearEquip(userId, slot, gearSlug) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const gearMeta = ensureTrainerGearMeta(user.meta);
  if (slot === 'aura') {
    if (!gearSlug) {
      gearMeta.equippedAuraSlug = null;
    } else if (Number(gearMeta.auras?.[gearSlug] || 0) > 0 && TRAINER_AURA_GEAR_MAP.has(gearSlug)) {
      gearMeta.equippedAuraSlug = gearSlug;
    } else {
      throw new Error('Aura not owned yet.');
    }
  } else if (slot === 'hat') {
    if (!gearSlug) {
      gearMeta.equippedHatSlug = null;
    } else if (Number(gearMeta.hats?.[gearSlug] || 0) > 0 && TRAINER_HAT_GEAR_MAP.has(gearSlug)) {
      gearMeta.equippedHatSlug = gearSlug;
    } else {
      throw new Error('Hat not owned yet.');
    }
  } else {
    throw new Error('Unknown trainer gear slot.');
  }
  return saveMetaOnly(userId, user.meta);
}

export function getSettingsState(userId) {
  const state = getHubState(userId);
  return {
    ...state,
    arenaRecord: normalizeArenaRecord(state.user.meta),
    leagues: GYM_LEAGUES,
    emojiSets: Object.entries(CHAT_EMOJI_SETS).map(([slug, entry]) => ({ slug, ...entry })),
    displayThemes: DISPLAY_THEMES,
    colorModes: COLOR_MODES,
    fontModes: FONT_MODES,
  };
}

export function updatePlayerSettings(userId, updates = {}) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const next = user.meta;
  if (updates.preferredRegionSlug !== undefined) {
    if (!WORLD_REGION_MAP.has(updates.preferredRegionSlug)) {
      throw new Error('Unknown region.');
    }
    next.preferredRegionSlug = updates.preferredRegionSlug;
  }
  if (updates.favoriteLeagueSlug !== undefined) {
    if (!GYM_LEAGUE_MAP.has(updates.favoriteLeagueSlug)) {
      throw new Error('Unknown league.');
    }
    next.favoriteLeagueSlug = updates.favoriteLeagueSlug;
  }
  if (updates.chatEmojiSet !== undefined) {
    if (!CHAT_EMOJI_SETS[updates.chatEmojiSet]) {
      throw new Error('Unknown emoji set.');
    }
    next.chatEmojiSet = updates.chatEmojiSet;
  }
  if (updates.hudMode !== undefined) {
    if (!['cozy', 'minimal', 'compact', 'immersive'].includes(updates.hudMode)) {
      throw new Error('Unknown HUD mode.');
    }
    next.hudMode = updates.hudMode;
  }
  if (updates.motionMode !== undefined) {
    if (!['full', 'soft', 'reduced'].includes(updates.motionMode)) {
      throw new Error('Unknown motion mode.');
    }
    next.motionMode = updates.motionMode;
  }
  if (updates.displayTheme !== undefined) {
    if (!DISPLAY_THEME_MAP.has(updates.displayTheme)) {
      throw new Error('Unknown display theme.');
    }
    next.displayTheme = updates.displayTheme;
  }
  if (updates.colorMode !== undefined) {
    if (!COLOR_MODE_MAP.has(updates.colorMode)) {
      throw new Error('Unknown color mode.');
    }
    next.colorMode = updates.colorMode;
  }
  if (updates.fontMode !== undefined) {
    if (!FONT_MODE_MAP.has(updates.fontMode)) {
      throw new Error('Unknown font mode.');
    }
    next.fontMode = updates.fontMode;
  }
  if (updates.soundEnabled !== undefined) {
    next.soundEnabled = !!updates.soundEnabled;
  }
  return saveMetaOnly(userId, next);
}

export function setTrainerClass(userId, classSlug) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const trainer = trainerProgressionSummary(user);
  const entry = TRAINER_CLASS_MAP.get(classSlug);
  if (!entry) {
    throw new Error('Unknown trainer class.');
  }
  if (trainer.profile.level < entry.unlockLevel) {
    throw new Error('That class is still locked.');
  }
  const profile = ensureTrainerProfile(user.meta);
  profile.classSlug = entry.slug;
  if (!TRAINER_SUBCLASS_MAP.get(profile.subclassSlug || '')?.classSlugs.includes(entry.slug)) {
    profile.subclassSlug = null;
  }
  return saveMetaOnly(userId, user.meta);
}

export function setTrainerTitle(userId, titleSlug) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const trainer = trainerProgressionSummary(user);
  const entry = TRAINER_TITLE_MAP.get(titleSlug);
  if (!entry) {
    throw new Error('Unknown trainer title.');
  }
  if (trainer.profile.level < entry.unlockLevel) {
    throw new Error('That title is still locked.');
  }
  ensureTrainerProfile(user.meta).titleSlug = entry.slug;
  return saveMetaOnly(userId, user.meta);
}

export function upgradeTrainerSkill(userId, skillSlug) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const node = TRAINER_SKILL_MAP.get(skillSlug);
  if (!node) {
    throw new Error('Unknown trainer skill.');
  }
  const trainer = trainerProgressionSummary(user);
  const currentRank = clamp(Math.floor(Number(trainer.profile.skillTree?.[skillSlug] || 0)), 0, node.maxRank);
  if (trainer.profile.level < node.unlockLevel) {
    throw new Error('That skill is still locked.');
  }
  if (currentRank >= node.maxRank) {
    throw new Error('That skill is already maxed.');
  }
  if (trainer.profile.availableSkillPoints <= 0) {
    throw new Error('No trainer skill points are available.');
  }
  ensureTrainerProfile(user.meta).skillTree[skillSlug] = currentRank + 1;
  return saveMetaOnly(userId, user.meta);
}

export function resetTrainerSkills(userId) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  ensureTrainerProfile(user.meta).skillTree = {};
  return saveMetaOnly(userId, user.meta);
}

export function claimMissionReward(userId, scope, missionSlug) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const missions = buildMissionSnapshots(user.meta);
  const mission = (missions?.[scope] || []).find((entry) => entry.slug === missionSlug);
  if (!mission) {
    throw new Error('Mission not found.');
  }
  if (mission.claimed) {
    throw new Error('Mission reward already claimed.');
  }
  if (!mission.complete) {
    throw new Error('Mission is not complete yet.');
  }
  const boardEntry = user.meta.missions?.[scope]?.entries?.find((entry) => entry.slug === missionSlug);
  if (!boardEntry) {
    throw new Error('Mission board is out of sync.');
  }
  const missionBonus = 1 + Math.max(0, Number(trainerBonusSummary(user.meta).bonuses.missionBonus || 0));
  if (mission.rewards?.cash) {
    changeUserCash(userId, Math.round(Number(mission.rewards.cash) * missionBonus));
  }
  if (mission.rewards?.item) {
    addInventory(userId, mission.rewards.item, Number(mission.rewards.quantity || 1));
  }
  if (mission.rewards?.exp) {
    applyTrainerExperience(user.meta, Math.round(Number(mission.rewards.exp) * missionBonus));
  }
  boardEntry.claimedAt = nowIso();
  bumpProgressStat(user.meta, 'missionsClaimed', 1);
  appendActivityLog(user.meta, `${mission.name} reward claimed.`);
  saveUserMeta(userId, user.meta);
  return mission;
}

function botRosterFallback(seed = 0) {
  const deck = buildBotChallengeDeck();
  return deck[seed % Math.max(1, deck.length)].roster;
}

function socialMessagesForUser(userId, roomType) {
  return SOCIAL_MESSAGE_STORE.filter((message) => message.roomType === roomType).filter((message) => roomType !== 'direct' || message.senderUserId === userId || message.targetUserId === userId).slice(-18);
}

export function getSocialState(userId) {
  const base = getHubState(userId);
  const arenaLeaderboard = buildLeaderboardEntries(userId, 12, { sortBy: 'arena' });
  const players = listUsers(16)
    .filter((entry) => entry.id !== userId)
    .map((entry) => {
      const arenaRank = arenaRankState(entry.meta);
      return {
        id: entry.id,
        username: entry.username,
        arenaPoints: arenaRank.points,
        arenaRankLabel: arenaRank.label,
        arenaRankTone: arenaRank.tone,
      };
    });
  const playerChallenges = players.slice(0, 4).map((player, index) => {
    const roster = getCollection(player.id).slice(0, 6).map((entry) => entry.monster);
    return {
      user: player,
      format: 'player ghost',
      difficulty: index === 0 ? 'casual' : index === 1 ? 'ranked' : 'hard',
      roster: roster.length ? roster : botRosterFallback(index),
    };
  });
  return {
    ...base,
    players,
    playerChallenges,
    botChallenges: buildBotChallengeDeck(),
    arenaLeaderboard,
    leaderboardChallenges: arenaLeaderboard.entries.filter((entry) => !entry.isCurrentUser),
    globalMessages: socialMessagesForUser(userId, 'global'),
    directMessages: socialMessagesForUser(userId, 'direct'),
    emojiSet: { slug: base.user.meta.chatEmojiSet, ...(CHAT_EMOJI_SETS[base.user.meta.chatEmojiSet] || CHAT_EMOJI_SETS.cute) },
    emojiCategories: SOCIAL_EMOJI_CATEGORIES,
    arenaRecord: normalizeArenaRecord(base.user.meta),
    arenaLadder: arenaRankState(base.user.meta),
  };
}

export function postChatMessage(userId, roomType, body, targetUserId = 0, attachments = {}) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const normalizedRoom = roomType === 'direct' ? 'direct' : 'global';
  const trimmedBody = String(body || '').trim().slice(0, 360);
  const imageUrl = String(attachments?.imageUrl || '').trim().slice(0, 300);
  const linkUrl = String(attachments?.linkUrl || '').trim().slice(0, 300);
  const linkLabel = String(attachments?.linkLabel || '').trim().slice(0, 64);
  if (!trimmedBody && !imageUrl && !linkUrl) {
    throw new Error('Enter a message or add an attachment first.');
  }
  let target = null;
  if (normalizedRoom === 'direct') {
    target = getUserById(Number(targetUserId || 0));
    if (!target || target.id === userId) {
      throw new Error('Pick another player for a whisper.');
    }
  }
  SOCIAL_MESSAGE_STORE.push({ id: randomId(6), roomType: normalizedRoom, senderUserId: user.id, senderName: user.username, targetUserId: target?.id || null, targetName: target?.username || null, body: trimmedBody, imageUrl, linkUrl, linkLabel, createdAt: nowIso() });
  while (SOCIAL_MESSAGE_STORE.length > 60) {
    SOCIAL_MESSAGE_STORE.shift();
  }
  return SOCIAL_MESSAGE_STORE[SOCIAL_MESSAGE_STORE.length - 1];
}

function scaleArenaRoster(baseRoster, levelBonus = 0, bonusStats = 0, seedBase = 0) {
  const normalizedLevelBonus = Math.max(0, Math.floor(Number(levelBonus || 0)));
  const normalizedBonusStats = Math.max(0, Math.floor(Number(bonusStats || 0)));
  return baseRoster.map((monster, index) => {
    const next = normalizeMonster(cloneMonster(monster), seedBase + index + 1).monster;
    next.level = clamp(Math.floor(Number(next.level || 1)) + normalizedLevelBonus, 1, 100);
    next.bonusStats = normalizeStatSpread(next.bonusStats);
    if (normalizedBonusStats > 0) {
      for (const key of STAT_KEYS) {
        next.bonusStats[key] += normalizedBonusStats;
      }
    }
    rebuildMonsterBoosts(next);
    const species = SPECIES_MAP.get(next.speciesId);
    if (species) {
      next.stats = resolvedMonsterStats(next, species, next.level, next.statBoosts, next.nature);
      next.currentHp = next.stats.hp;
    }
    next.status = null;
    resetCombatState(next);
    return next;
  });
}

function arenaRosterFromUser(userId, options = {}) {
  const entries = persistentRosterEntriesForUser(userId, true);
  const baseRoster = entries.length
    ? entries.slice(0, 6).map((entry) => cloneMonster(entry.monster))
    : botRosterFallback(userId % 3).map((monster) => cloneMonster(monster));
  return scaleArenaRoster(baseRoster, options.levelBonus || 0, options.bonusStats || 0, userId * 97);
}

export function startArenaChallenge(userId, source, value) {
  const requester = getUserById(userId);
  if (!requester) {
    throw new Error('User not found.');
  }
  const normalizedSource = String(source || '').trim();
  if (normalizedSource === 'bot') {
    const deck = buildBotChallengeDeck().find((entry) => entry.slug === String(value || '').trim());
    if (!deck) {
      throw new Error('Arena board target not found.');
    }
    const queueType = deck.format === 'ranked' ? 'ranked' : deck.difficulty === 'advanced' ? 'advanced' : deck.difficulty === 'hard' ? 'hard' : 'casual';
    const scaling = arenaScalingProfile(queueType, requester.meta);
    const enemyParty = scaleArenaRoster(deck.roster, scaling.levelBonus, scaling.bonusStats, hashSeedFromString(deck.slug));
    return createSpecialRunForUser(userId, {
      mode: 'arena',
      label: deck.name,
      title: `${deck.name} Arena`,
      regionName: 'Arena Board',
      regionSlug: 'arena-board',
      biome: 'Arena Floor',
      enemyParty,
      typeFocus: SPECIES_MAP.get(enemyParty[0]?.speciesId)?.types?.[0] || 'normal',
      encounterKind: deck.difficulty === 'advanced' ? 'boss' : 'trainer',
      introLine: `${deck.name} calibrates to ${scaling.scaleStep.label} pressure on the ${deck.format} queue.`,
      extra: {
        source: normalizedSource,
        queueType: scaling.queueType,
        opponentName: deck.name,
        difficulty: deck.difficulty,
        playerArenaRankLabel: scaling.requesterRank.label,
        playerArenaRankIndex: scaling.requesterRank.rankIndex,
        opponentArenaRankLabel: scaling.scaleStep.label,
        opponentArenaRankIndex: scaling.scaleStep.rankIndex,
        enemyLevelBonus: scaling.levelBonus,
        enemyBonusStats: scaling.bonusStats,
      },
    });
  }

  const targetUserId = Number(value || 0);
  const targetUser = getUserById(targetUserId);
  if (!targetUser || targetUser.id === userId) {
    throw new Error('Pick another player for this arena challenge.');
  }
  const ranked = normalizedSource === 'leaderboard';
  const scaling = arenaScalingProfile(ranked ? 'ranked' : 'casual', requester.meta, targetUser.meta);
  const enemyParty = arenaRosterFromUser(targetUser.id, {
    levelBonus: scaling.levelBonus,
    bonusStats: ranked ? scaling.bonusStats : Math.max(0, scaling.bonusStats - 2),
  });
  const label = ranked ? `Ranked Ghost vs ${targetUser.username}` : `Casual Spar vs ${targetUser.username}`;
  return createSpecialRunForUser(userId, {
    mode: 'arena',
    label,
    title: label,
    regionName: 'Arena Board',
    regionSlug: 'arena-board',
    biome: ranked ? 'Champion Arena' : 'Practice Arena',
    enemyParty,
    typeFocus: SPECIES_MAP.get(enemyParty[0]?.speciesId)?.types?.[0] || 'normal',
    encounterKind: ranked ? 'boss' : 'trainer',
    introLine: ranked
      ? `${targetUser.username}'s ${scaling.opponentRank.label} ghost data locks onto the arena floor and scales to your bracket.`
      : `${targetUser.username}'s saved roster arrives for a practice spar.`,
    extra: {
      source: normalizedSource,
      queueType: ranked ? 'ranked' : 'casual',
      opponentUserId: targetUser.id,
      opponentName: targetUser.username,
      playerArenaRankLabel: scaling.requesterRank.label,
      playerArenaRankIndex: scaling.requesterRank.rankIndex,
      opponentArenaRankLabel: scaling.opponentRank.label,
      opponentArenaRankIndex: scaling.opponentRank.rankIndex,
      enemyLevelBonus: scaling.levelBonus,
      enemyBonusStats: ranked ? scaling.bonusStats : Math.max(0, scaling.bonusStats - 2),
    },
  });
}
const MINI_GAME_COOLDOWNS = {
  mine: 25,
  dice: 20,
  'prize-wheel': 90,
  'aura-gamble': 120,
  'who-is-that': 45,
  'type-quiz': 45,
  'battle-forecast': 60,
  'stat-scout': 60,
  'rarity-radar': 60,
  'whack-a-mon': 40,
  'power-pivot': 55,
  'type-edge': 55,
};
const MINI_GAME_CATALOG = [
  { slug: 'mine', name: 'Mining Tunnel', summary: 'Dig out light gold and occasional drops, but token yield is much leaner than before.', rewardHint: 'Gold + Drops', tone: 'warning' },
  { slug: 'dice', name: 'Dice Table', summary: 'A lower hit-rate roll with smaller spikes and no guaranteed token refund.', rewardHint: 'High Variance', tone: 'default' },
  { slug: 'prize-wheel', name: 'Prize Wheel', summary: 'Spins now lean toward whiffs, with rarer token wedges and occasional gold or bonus crates.', rewardHint: 'Wheel Bonus', tone: 'electric' },
  { slug: 'aura-gamble', name: 'Aura Jackpot', summary: 'Jackpots and gear drops are much rarer now, with slimmer token backup on misses.', rewardHint: 'Gear Roll', tone: 'fairy' },
  { slug: 'who-is-that', name: "Who's That Mon?", summary: 'Route silhouette clues now pay off when you actually read the board correctly.', rewardHint: 'Knowledge', tone: 'default' },
  { slug: 'type-quiz', name: 'Type Quiz', summary: 'Call the right primary typing for a smaller but steadier skill-based payout.', rewardHint: 'Quiz', tone: 'water' },
  { slug: 'battle-forecast', name: 'Battle Forecast', summary: 'Read the scenario correctly for a modest payout instead of pure RNG.', rewardHint: 'Forecast', tone: 'electric' },
  { slug: 'stat-scout', name: 'Stat Scout', summary: 'Track the likely battle-focus stat for a compact skill payout.', rewardHint: 'Scout', tone: 'grass' },
  { slug: 'rarity-radar', name: 'Rarity Radar', summary: 'Harder rarity calls still pay a bit better when you connect.', rewardHint: 'Radar', tone: 'ghost' },
  { slug: 'whack-a-mon', name: 'Whack-a-Mon', summary: 'A lane-clue reflex puzzle with lighter tokens and no free win button.', rewardHint: 'Reflex', tone: 'fighting' },
  { slug: 'power-pivot', name: 'Power Pivot', summary: 'Pick the strongest route signature on the board for a higher-end skill payout.', rewardHint: 'BST Read', tone: 'warning' },
  { slug: 'type-edge', name: 'Type Edge', summary: 'Choose the attack type that actually breaks the highlighted route armor.', rewardHint: 'Counter Pick', tone: 'electric' },
  { slug: 'daily-crate', name: 'Daily Crate', summary: 'One free reward claim each day with a smaller token payout and a rotating stash bonus.', rewardHint: 'Daily', tone: 'success' },
];
const MINI_GAME_ITEM_REWARD_CATALOG = [
  { slug: 'rare-candy-cache', rewardType: 'item', itemSlug: 'rare-candy', quantity: 1, cost: 30, repeatable: true, tone: 'warning', description: 'A steady token sink that converts wins into fast monster growth.' },
  { slug: 'rare-candy-crate', rewardType: 'item', itemSlug: 'rare-candy', quantity: 3, cost: 82, repeatable: true, tone: 'warning', description: 'A bulk candy bundle for long-term roster leveling.' },
  { slug: 'elite-orb-pack', rewardType: 'item', itemSlug: 'elite-orb', quantity: 2, cost: 56, repeatable: true, tone: 'electric', description: 'Arcade-exclusive catch pressure for tougher storage hunts.' },
  { slug: 'elite-orb-crate', rewardType: 'item', itemSlug: 'elite-orb', quantity: 5, cost: 124, repeatable: true, tone: 'electric', description: 'A bigger capture bundle for players turning steady wins into rare-hunt pressure.' },
  { slug: 'reroll-ticket-stack', rewardType: 'item', itemSlug: 'reroll-ticket', quantity: 3, cost: 44, repeatable: true, tone: 'default', description: 'Refresh more reward boards and shop lanes off token income.' },
  { slug: 'reroll-ticket-cache-plus', rewardType: 'item', itemSlug: 'reroll-ticket', quantity: 6, cost: 84, repeatable: true, tone: 'default', description: 'A deeper reroll stack for players farming long reward-board sessions.' },
  { slug: 'phoenix-salt-pack', rewardType: 'item', itemSlug: 'phoenix-salt', quantity: 2, cost: 58, repeatable: true, tone: 'fire', description: 'A compact recovery pack for longer clears and boss retries.' },
  { slug: 'field-ration-pack', rewardType: 'item', itemSlug: 'field-ration', quantity: 3, cost: 52, repeatable: true, tone: 'success', description: 'A reliable team-heal bundle that turns careful play into extra route sustain.' },
  { slug: 'adamant-mint-cache', rewardType: 'item', itemSlug: 'adamant-mint', quantity: 1, cost: 74, repeatable: true, tone: 'warning', description: 'Lock in a stronger physical build without waiting on market rotations.' },
  { slug: 'modest-mint-cache', rewardType: 'item', itemSlug: 'modest-mint', quantity: 1, cost: 74, repeatable: true, tone: 'water', description: 'A direct token sink for special attackers that need a cleaner nature swap.' },
  { slug: 'jolly-mint-cache', rewardType: 'item', itemSlug: 'jolly-mint', quantity: 1, cost: 74, repeatable: true, tone: 'electric', description: 'Convert arcade wins into a speed-focused mint for fast sweepers.' },
  { slug: 'timid-mint-cache', rewardType: 'item', itemSlug: 'timid-mint', quantity: 1, cost: 74, repeatable: true, tone: 'ghost', description: 'A lighter redeemable for special sweepers that want immediate speed support.' },
  { slug: 'tutor-scroll-cache', rewardType: 'item', itemSlug: 'tutor-scroll', quantity: 1, cost: 126, repeatable: true, tone: 'psychic', description: 'Pick up extra move-teaching pressure from the arcade board.' },
  { slug: 'ability-capsule-cache', rewardType: 'item', itemSlug: 'ability-capsule', quantity: 1, cost: 96, repeatable: true, tone: 'psychic', description: 'Swap standard abilities without waiting on market rotations.' },
  { slug: 'ability-patch-cache', rewardType: 'item', itemSlug: 'ability-patch', quantity: 1, cost: 168, repeatable: true, tone: 'fairy', description: 'A premium token sink for hidden ability projects.' },
  { slug: 'deleveler-swap', rewardType: 'item', itemSlug: 'deleveler', quantity: 1, cost: 118, repeatable: true, tone: 'ghost', description: 'Reset a stored monster down to level 1 from arcade earnings.' },
  { slug: 'genome-maxer-cache', rewardType: 'item', itemSlug: 'genome-maxer', quantity: 1, cost: 188, repeatable: true, tone: 'dragon', description: 'An expensive exchange for late-game stat rebuilding from token wins.' },
  { slug: 'variant-prism-cache', rewardType: 'item', itemSlug: 'variant-prism', quantity: 1, cost: 154, repeatable: true, tone: 'fairy', description: 'Turn a long arcade grind into variant-route collection pressure.' },
  { slug: 'mega-emblem-cache', rewardType: 'item', itemSlug: 'mega-emblem', quantity: 1, cost: 196, repeatable: true, tone: 'electric', description: 'A heavier sink for transformation-focused builds.' },
  { slug: 'omega-emblem-cache', rewardType: 'item', itemSlug: 'omega-emblem', quantity: 1, cost: 236, repeatable: true, tone: 'dragon', description: 'An extra late-game redeemable for stronger transformation builds and boss clears.' },
  { slug: 'max-band-cache', rewardType: 'item', itemSlug: 'max-band', quantity: 1, cost: 214, repeatable: true, tone: 'warning', description: 'A late-game maxing tool for account-wide projects.' },
  { slug: 'mirage-prism-cache', rewardType: 'item', itemSlug: 'mirage-prism', quantity: 1, cost: 176, repeatable: true, tone: 'ghost', description: 'A rarer conversion path for special-form hunting.' },
  { slug: 'premium-exp-pass-cache', rewardType: 'item', itemSlug: 'premium-exp-pass', quantity: 1, cost: 240, repeatable: true, tone: 'success', description: 'A late-game token conversion into passive account EXP gain.' },
  { slug: 'premium-credit-chip-cache', rewardType: 'item', itemSlug: 'premium-credit-chip', quantity: 1, cost: 260, repeatable: true, tone: 'warning', description: 'A longer token grind that becomes permanent cash flow.' },
  { slug: 'premium-hybrid-license-cache', rewardType: 'item', itemSlug: 'premium-hybrid-license', quantity: 1, cost: 360, repeatable: true, tone: 'electric', description: 'The most expensive arcade sink, tuned for endgame account progression.' },
];

function miniGameGearRewardCost(entry, baseCost) {
  return baseCost + Math.round(totalStats(normalizeStatSpread(entry.statBoosts)) * 1.35);
}

const MINI_GAME_REWARD_CATALOG = [
  ...MINI_GAME_ITEM_REWARD_CATALOG.map((entry) => ({
    ...entry,
    rewardName: ITEM_MAP.get(entry.itemSlug)?.name || entry.itemSlug,
  })),
  ...TRAINER_AURA_GEAR.map((entry) => ({
    slug: `${entry.slug}-unlock`,
    rewardType: 'aura',
    rewardName: entry.name,
    gearSlug: entry.slug,
    cost: miniGameGearRewardCost(entry, 56),
    repeatable: false,
    tone: entry.tone,
    description: entry.description,
  })),
  ...TRAINER_HAT_GEAR.map((entry) => ({
    slug: `${entry.slug}-unlock`,
    rewardType: 'hat',
    rewardName: entry.name,
    gearSlug: entry.slug,
    cost: miniGameGearRewardCost(entry, 52),
    repeatable: false,
    tone: entry.tone,
    description: entry.description,
  })),
];

const MINI_GAME_TOKEN_BALANCE = {
  mine: { tokenMin: 0, tokenMax: 1, cashMin: 55, cashMax: 90 },
  dice: { winChance: 0.12, winTokenMin: 1, winTokenMax: 3, lossTokenMin: 0, lossTokenMax: 0 },
  'aura-gamble': { winChance: 0.05, winTokenMin: 1, winTokenMax: 2, lossTokenMin: 0, lossTokenMax: 0, jackpotChance: 0.015 },
  'prize-wheel': { tokenChance: 0.14, goldChance: 0.26, bonusChance: 0.04, tokenMin: 1, tokenMax: 2, goldMin: 60, goldMax: 110, lossTokenMin: 0, lossTokenMax: 0 },
  'who-is-that': { winChance: 0.25, winTokenMin: 2, winTokenMax: 3, lossTokenMin: 0, lossTokenMax: 0 },
  'type-quiz': { winChance: 0.25, winTokenMin: 2, winTokenMax: 3, lossTokenMin: 0, lossTokenMax: 0 },
  'battle-forecast': { winChance: 0.25, winTokenMin: 2, winTokenMax: 3, lossTokenMin: 0, lossTokenMax: 0 },
  'stat-scout': { winChance: 0.25, winTokenMin: 2, winTokenMax: 3, lossTokenMin: 0, lossTokenMax: 0 },
  'rarity-radar': { winChance: 0.2, winTokenMin: 2, winTokenMax: 4, lossTokenMin: 0, lossTokenMax: 0 },
  'whack-a-mon': { winChance: 0.2, winTokenMin: 1, winTokenMax: 2, lossTokenMin: 0, lossTokenMax: 0 },
  'power-pivot': { winChance: 0.2, winTokenMin: 2, winTokenMax: 4, lossTokenMin: 0, lossTokenMax: 0 },
  'type-edge': { winChance: 0.2, winTokenMin: 2, winTokenMax: 4, lossTokenMin: 0, lossTokenMax: 0 },
};

const MINI_GAME_BONUS_DROP_TABLES = {
  mine: [
    { weight: 58 },
    { weight: 20, itemSlug: 'reroll-ticket', quantity: 1 },
    { weight: 14, itemSlug: 'rare-candy', quantity: 1 },
    { weight: 8, itemSlug: 'elite-orb', quantity: 1 },
  ],
  'daily-crate': [
    { weight: 40 },
    { weight: 34, itemSlug: 'reroll-ticket', quantity: 1 },
    { weight: 26, itemSlug: 'rare-candy', quantity: 1 },
  ],
  dice: [
    { weight: 82 },
    { weight: 12, itemSlug: 'rare-candy', quantity: 1 },
    { weight: 6, itemSlug: 'reroll-ticket', quantity: 1 },
  ],
  'prize-wheel-win': [
    { weight: 68 },
    { weight: 18, itemSlug: 'reroll-ticket', quantity: 1 },
    { weight: 14, itemSlug: 'rare-candy', quantity: 1 },
  ],
  'prize-wheel-bonus': [
    { weight: 42, itemSlug: 'reroll-ticket', quantity: 1 },
    { weight: 34, itemSlug: 'rare-candy', quantity: 1 },
    { weight: 24, itemSlug: 'elite-orb', quantity: 1 },
  ],
  'knowledge-win': [
    { weight: 86 },
    { weight: 14, itemSlug: 'reroll-ticket', quantity: 1 },
  ],
};

function miniGameRangeValue(min, max) {
  const safeMin = Math.floor(Number(min || 0));
  const safeMax = Math.floor(Number(max || safeMin));
  if (safeMax <= safeMin) {
    return safeMin;
  }
  return safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
}

function rollMiniGameDrop(userId, table) {
  const entries = Array.isArray(table) ? table.filter((entry) => Number(entry?.weight || 0) > 0) : [];
  const totalWeight = entries.reduce((sum, entry) => sum + Number(entry.weight || 0), 0);
  if (!totalWeight) {
    return null;
  }
  let cursor = Math.random() * totalWeight;
  for (const entry of entries) {
    cursor -= Number(entry.weight || 0);
    if (cursor <= 0) {
      if (!entry.itemSlug) {
        return null;
      }
      const quantity = Math.max(1, Math.floor(Number(entry.quantity || 1)));
      addInventory(userId, entry.itemSlug, quantity);
      return {
        itemSlug: entry.itemSlug,
        quantity,
        itemName: ITEM_MAP.get(entry.itemSlug)?.name || entry.itemSlug,
      };
    }
  }
  return null;
}

function appendMiniGameBonusParts(summary, bonusParts) {
  const base = String(summary || 'Mini-game completed').trim().replace(/[.!?]+$/, '');
  const parts = (bonusParts || []).filter(Boolean);
  return parts.length ? `${base}. Bonus: ${parts.join(' / ')}.` : `${base}.`;
}

function miniGameTokenLabel(amount) {
  return `${formatNumber(amount)} arcade token${amount === 1 ? '' : 's'}`;
}

function miniGameCooldownsRemaining(stats, referenceMs = Date.now()) {
  return Object.fromEntries(Object.entries(stats.cooldowns || {}).map(([slug, value]) => [slug, Math.max(0, Math.ceil((Number(value || 0) - referenceMs) / 1000))]));
}

function setMiniGameCooldown(stats, slug, seconds) {
  if (seconds > 0) {
    stats.cooldowns[slug] = Date.now() + seconds * 1000;
  }
}

function miniGameItemExchangeBundleQuantity(item) {
  if (!item || item.category === 'premium') {
    return 0;
  }
  if (item.price >= 1400) {
    return 1;
  }
  if (item.price >= 700) {
    return 2;
  }
  if (item.price >= 280) {
    return 3;
  }
  return 5;
}

function miniGameItemExchangeTokens(item, quantity) {
  return Math.max(1, Math.round((Number(item?.price || 0) * Math.max(1, Number(quantity || 1))) / 650));
}

function miniGameItemBundlesForUser(userId) {
  return getPersistentInventory(userId)
    .map((entry) => {
      const item = entry.item;
      const bundleQuantity = miniGameItemExchangeBundleQuantity(item);
      if (!item || !bundleQuantity || Number(entry.quantity || 0) < bundleQuantity) {
        return null;
      }
      return {
        itemSlug: item.slug,
        itemName: item.name,
        quantity: bundleQuantity,
        tokens: miniGameItemExchangeTokens(item, bundleQuantity),
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.tokens - left.tokens || left.itemName.localeCompare(right.itemName));
}

function miniGameMonsterExchangeState(userId) {
  const user = getUserById(userId);
  if (!user) {
    return { monsterEntries: [], lockedMonsterCount: 0 };
  }
  const collection = persistentEligibleCollectionEntries(getCollection(userId));
  const validIds = collectionIdSet(collection);
  const partyIds = new Set(normalizePartyCollectionIds(user.meta.partyCollectionIds, validIds).filter(Boolean));
  const partnerId = validIds.includes(Number(user.meta.partnerCollectionId || 0)) ? Number(user.meta.partnerCollectionId) : null;
  let lockedMonsterCount = 0;
  const rarityBonusMap = { common: 0, uncommon: 0, rare: 1, epic: 2, legendary: 3, mythic: 4 };
  const monsterEntries = [];
  for (const entry of collection) {
    const protectedEntry = entry.favorite || entry.id === partnerId || partyIds.has(entry.id);
    if (protectedEntry) {
      lockedMonsterCount += 1;
      continue;
    }
    const rarity = entry.species?.rarity || entry.monster?.rarity || 'common';
    const tokens = Math.min(
      10,
      Math.max(
        1,
        Math.floor(Number(entry.monster?.level || 1) / 18)
          + Number(rarityBonusMap[rarity] || 0)
          + Math.floor(totalStats(entry.monster?.stats || {}) / 560)
      )
    );
    monsterEntries.push({
      collectionId: entry.id,
      monsterName: entry.monster.nickname || entry.monster.name,
      speciesName: entry.species?.name || entry.monster.name,
      level: Number(entry.monster.level || 1),
      rarity,
      tokens,
      heldItemName: ITEM_MAP.get(entry.monster.heldItemSlug || '')?.name || '',
    });
  }
  monsterEntries.sort((left, right) => right.tokens - left.tokens || right.level - left.level || left.monsterName.localeCompare(right.monsterName));
  return { monsterEntries: monsterEntries.slice(0, 18), lockedMonsterCount };
}

function miniGameTokenExchangeState(userId) {
  const monsterState = miniGameMonsterExchangeState(userId);
  return {
    itemBundles: miniGameItemBundlesForUser(userId),
    monsterEntries: monsterState.monsterEntries,
    lockedMonsterCount: monsterState.lockedMonsterCount,
  };
}

function rewardShopEntriesForUser(user, stats) {
  const gearMeta = ensureTrainerGearMeta(user.meta);
  const inventory = getPersistentInventory(user.id);
  return MINI_GAME_REWARD_CATALOG.map((entry) => {
    const ownedQuantity = entry.rewardType === 'item'
      ? Number(inventory.find((item) => item.item.slug === entry.itemSlug)?.quantity || 0)
      : entry.rewardType === 'aura'
        ? Number(gearMeta.auras?.[entry.gearSlug] || 0)
        : Number(gearMeta.hats?.[entry.gearSlug] || 0);
    const alreadyOwnedExclusive = entry.repeatable === false && ownedQuantity > 0;
    return { ...entry, name: entry.rewardName, canRedeem: Number(stats.tokens || 0) >= entry.cost && !alreadyOwnedExclusive, alreadyOwnedExclusive, ownedQuantity };
  });
}
function rotatedMiniGameSlice(entries, cursor, count) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!list.length || count <= 0) {
    return [];
  }
  const start = Math.abs(Math.floor(Number(cursor || 0))) % list.length;
  const results = [];
  for (let index = 0; index < Math.min(count, list.length); index += 1) {
    results.push(list[(start + index) % list.length]);
  }
  return results;
}

function rotatedMiniGameOptions(options, cursor) {
  const list = Array.isArray(options) ? options.slice() : [];
  if (list.length <= 1) {
    return list;
  }
  const shift = Math.abs(Math.floor(Number(cursor || 0))) % list.length;
  return list.map((entry, index) => list[(index + shift) % list.length]);
}

function buildMiniGameOptions(correctOption, distractors, cursor, keyFn = (entry) => String(entry)) {
  const seen = new Set();
  const unique = [];
  for (const entry of [correctOption, ...(distractors || [])]) {
    if (!entry) {
      continue;
    }
    const key = keyFn(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(entry);
    if (unique.length >= 4) {
      break;
    }
  }
  return rotatedMiniGameOptions(unique, cursor);
}

function miniGameSpeciesPool() {
  return SPECIES.filter((species) => !['legendary', 'mythic'].includes(species.rarity));
}

function miniGameSpeciesBattleFocus(species) {
  const stats = species?.stats || {};
  const keys = ['atk', 'spa', 'spe'];
  return keys.reduce((bestKey, key) => Number(stats[key] || 0) > Number(stats[bestKey] || 0) ? key : bestKey, keys[0]);
}

function miniGameAnswerLabel(prompt, value) {
  const options = Array.isArray(prompt?.options)
    ? prompt.options
    : Array.isArray(prompt?.slots)
      ? prompt.slots
      : [];
  const option = options.find((entry) => String(entry?.key ?? entry?.slug ?? entry) === String(value));
  if (option?.label) {
    return option.label;
  }
  if (option?.name) {
    return option.name;
  }
  return titleLabel(String(value || ''));
}

const MINI_GAME_FORECAST_SCENARIOS = [
  {
    prompt: 'Enemy scouts show a frail sweeper with no sustain and weak backup. Which forecast sounds safest?',
    answer: 'burst',
    options: [
      { key: 'burst', label: 'Short burst exchange' },
      { key: 'stall', label: 'Long sustain battle' },
      { key: 'ambush', label: 'Immediate ambush' },
      { key: 'pivot', label: 'Slow pivot war' },
    ],
  },
  {
    prompt: 'A bulky healer and chip-heavy backline are setting up. Which forecast fits best?',
    answer: 'stall',
    options: [
      { key: 'burst', label: 'Short burst exchange' },
      { key: 'stall', label: 'Long sustain battle' },
      { key: 'ambush', label: 'Immediate ambush' },
      { key: 'pivot', label: 'Slow pivot war' },
    ],
  },
  {
    prompt: 'Route radio warns of a jump-in opener before your team stabilizes. Which forecast is right?',
    answer: 'ambush',
    options: [
      { key: 'burst', label: 'Short burst exchange' },
      { key: 'stall', label: 'Long sustain battle' },
      { key: 'ambush', label: 'Immediate ambush' },
      { key: 'pivot', label: 'Slow pivot war' },
    ],
  },
  {
    prompt: 'The enemy line looks balanced but keeps resetting tempo with swaps and utility. What forecast fits?',
    answer: 'pivot',
    options: [
      { key: 'burst', label: 'Short burst exchange' },
      { key: 'stall', label: 'Long sustain battle' },
      { key: 'ambush', label: 'Immediate ambush' },
      { key: 'pivot', label: 'Slow pivot war' },
    ],
  },
];

const MINI_GAME_WHACK_SCENARIOS = [
  { prompt: 'The runaway mon cut one lane clockwise from North Lane. Where did it land?', answer: 'east' },
  { prompt: 'The route ping flashed the lane directly opposite East Lane. Which lane was it?', answer: 'west' },
  { prompt: 'The board marked the lane one step counter-clockwise from South Lane. Which lane should you hit?', answer: 'east' },
  { prompt: 'The scanner locked onto the lane directly south of the starting North marker. Where do you swing?', answer: 'south' },
  { prompt: 'The signal skipped two steps clockwise from West Lane. Which lane is correct?', answer: 'east' },
  { prompt: 'The runaway mon looped one step counter-clockwise from East Lane. Where did it pop up?', answer: 'north' },
];

function basicMiniGamePromptState(stats) {
  const pool = miniGameSpeciesPool();
  const fallbackSpecies = pool[0] || { slug: 'mystery', name: 'Mystery', types: ['normal'], rarity: 'common', stats: { atk: 1, spa: 1, spe: 1 } };
  const rarityOptions = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const laneOptions = [
    { key: 'north', label: 'North Lane' },
    { key: 'east', label: 'East Lane' },
    { key: 'south', label: 'South Lane' },
    { key: 'west', label: 'West Lane' },
  ];

  const silhouetteCursor = Number(stats.silhouetteCursor || 0);
  const silhouetteTarget = pool[silhouetteCursor % Math.max(1, pool.length)] || fallbackSpecies;
  const silhouetteOptions = buildMiniGameOptions(
    { slug: silhouetteTarget.slug, name: silhouetteTarget.name },
    rotatedMiniGameSlice(pool.filter((species) => species.slug !== silhouetteTarget.slug), silhouetteCursor + 5, 3).map((species) => ({ slug: species.slug, name: species.name })),
    silhouetteCursor + 1,
    (entry) => entry.slug
  );

  const typeQuizCursor = Number(stats.typeQuizCursor || 0);
  const typeTarget = pool[(typeQuizCursor + 7) % Math.max(1, pool.length)] || fallbackSpecies;
  const typeCorrect = typeTarget.types?.[0] || 'normal';
  const typeQuizOptions = buildMiniGameOptions(
    typeCorrect,
    rotatedMiniGameSlice(TYPES.filter((type) => type !== typeCorrect && !(typeTarget.types || []).includes(type)), typeQuizCursor + 3, 3),
    typeQuizCursor + 1,
    (entry) => entry
  );

  const forecastCursor = Number(stats.forecastCursor || 0);
  const forecastScenario = MINI_GAME_FORECAST_SCENARIOS[forecastCursor % MINI_GAME_FORECAST_SCENARIOS.length];
  const forecastOptions = buildMiniGameOptions(
    forecastScenario.options.find((option) => option.key === forecastScenario.answer),
    forecastScenario.options.filter((option) => option.key !== forecastScenario.answer),
    forecastCursor + 1,
    (entry) => entry.key
  );

  const statScoutCursor = Number(stats.statScoutCursor || 0);
  const statTarget = pool[(statScoutCursor + 11) % Math.max(1, pool.length)] || fallbackSpecies;
  const statCorrect = miniGameSpeciesBattleFocus(statTarget);
  const statScoutOptions = buildMiniGameOptions(
    { key: statCorrect, label: statCorrect === 'spa' ? 'Sp. Attack' : statCorrect === 'spe' ? 'Speed' : 'Attack' },
    [
      { key: 'atk', label: 'Attack' },
      { key: 'spa', label: 'Sp. Attack' },
      { key: 'spe', label: 'Speed' },
    ].filter((entry) => entry.key !== statCorrect),
    statScoutCursor + 2,
    (entry) => entry.key
  );

  const rarityRadarCursor = Number(stats.rarityRadarCursor || 0);
  const rarityTarget = pool[(rarityRadarCursor + 17) % Math.max(1, pool.length)] || fallbackSpecies;
  const rarityCorrect = rarityOptions.includes(rarityTarget.rarity) ? rarityTarget.rarity : 'common';
  const rarityRadarOptions = buildMiniGameOptions(
    rarityCorrect,
    rotatedMiniGameSlice(rarityOptions.filter((entry) => entry !== rarityCorrect), rarityRadarCursor + 2, 3),
    rarityRadarCursor + 3,
    (entry) => entry
  );

  const whackCursor = Number(stats.whackCursor || 0);
  const whackScenario = MINI_GAME_WHACK_SCENARIOS[whackCursor % MINI_GAME_WHACK_SCENARIOS.length];
  const whackOptions = buildMiniGameOptions(
    laneOptions.find((entry) => entry.key === whackScenario.answer),
    laneOptions.filter((entry) => entry.key !== whackScenario.answer),
    whackCursor + 1,
    (entry) => entry.key
  );

  const powerPivotCursor = Number(stats.powerPivotCursor || 0);
  const powerPivotPool = rotatedMiniGameSlice(pool, powerPivotCursor * 3 + 5, 4);
  const powerPivotCandidates = powerPivotPool.length ? powerPivotPool : [fallbackSpecies];
  const powerPivotTarget = powerPivotCandidates.reduce((best, species) => totalStats(species?.stats || {}) > totalStats(best?.stats || {}) ? species : best, powerPivotCandidates[0]);
  const powerPivotOptions = rotatedMiniGameOptions(powerPivotCandidates.map((species) => ({ slug: species.slug, name: species.name })), powerPivotCursor + 1);

  const typeEdgeCursor = Number(stats.typeEdgeCursor || 0);
  const targetType = TYPES[typeEdgeCursor % Math.max(1, TYPES.length)] || 'normal';
  const effectiveTypes = TYPES.filter((type) => (TYPE_CHART[type]?.[targetType] ?? 1) > 1);
  const typeEdgeCorrect = effectiveTypes[typeEdgeCursor % Math.max(1, effectiveTypes.length)] || 'fighting';
  const typeEdgeOptions = buildMiniGameOptions(
    typeEdgeCorrect,
    rotatedMiniGameSlice(TYPES.filter((type) => type !== typeEdgeCorrect && (TYPE_CHART[type]?.[targetType] ?? 1) <= 1), typeEdgeCursor + 4, 3),
    typeEdgeCursor + 2,
    (entry) => entry
  );

  return {
    silhouette: {
      clue: `Scanner ping: ${silhouetteTarget.types.map((type) => titleLabel(type)).join('/')} route signature, ${silhouetteTarget.name.length} letters, ${titleLabel(silhouetteTarget.rarity || 'common')} tier.`,
      options: silhouetteOptions,
      correctAnswer: silhouetteTarget.slug,
    },
    typeQuiz: {
      prompt: `Which primary type fits ${typeTarget.name}?`,
      options: typeQuizOptions,
      correctAnswer: typeCorrect,
    },
    battleForecast: {
      prompt: forecastScenario.prompt,
      options: forecastOptions,
      correctAnswer: forecastScenario.answer,
    },
    statScout: {
      prompt: `${statTarget.name}'s route card spikes hardest in which stat?`,
      options: statScoutOptions,
      correctAnswer: statCorrect,
    },
    rarityRadar: {
      prompt: `How rare should ${rarityTarget.name} read from this route ping?`,
      options: rarityRadarOptions,
      correctAnswer: rarityCorrect,
    },
    prizeWheel: {
      headline: 'Wheel board now leans lighter on pure token hits, with gold wedges, bonus crates, and more dead spins in the mix.',
      segments: [
        { label: 'Tokens', tone: 'warning' },
        { label: 'Gold', tone: 'success' },
        { label: 'Bonus Crate', tone: 'electric' },
        { label: 'Whiff', tone: 'default' },
      ],
    },
    whackAMon: {
      prompt: whackScenario.prompt,
      slots: whackOptions,
      correctAnswer: whackScenario.answer,
    },
    powerPivot: {
      prompt: 'Which route signature reads strongest overall from the current board?',
      options: powerPivotOptions,
      correctAnswer: powerPivotTarget.slug,
    },
    typeEdge: {
      prompt: `Which attack type breaks ${titleLabel(targetType)} route armor super effectively?`,
      options: typeEdgeOptions,
      correctAnswer: typeEdgeCorrect,
    },
  };
}

export function getMiniGamesState(userId) {
  const base = getHubState(userId);
  const stats = normalizedMiniGameStats(base.user.meta);
  const prompts = basicMiniGamePromptState(stats);
  return {
    ...base,
    games: MINI_GAME_CATALOG,
    stats,
    cooldowns: miniGameCooldownsRemaining(stats),
    gear: trainerGearStateView(base.user.meta),
    rewardShop: rewardShopEntriesForUser(base.user, stats),
    tokenExchange: miniGameTokenExchangeState(base.user.id),
    prizeWheel: prompts.prizeWheel,
    silhouette: prompts.silhouette,
    typeQuiz: prompts.typeQuiz,
    battleForecast: prompts.battleForecast,
    statScout: prompts.statScout,
    rarityRadar: prompts.rarityRadar,
    whackAMon: prompts.whackAMon,
    powerPivot: prompts.powerPivot,
    typeEdge: prompts.typeEdge,
    dailyReward: { ready: stats.lastDailyClaimDate !== new Date().toISOString().slice(0, 10), lastClaimDate: stats.lastDailyClaimDate },
    collectionCount: base.collection.length,
    activityLog: base.activityLog,
  };
}

export function playMiniGame(userId, gameSlug, options = {}) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const stats = normalizedMiniGameStats(user.meta);
  user.meta.miniGameStats = stats;
  const cooldowns = miniGameCooldownsRemaining(stats);
  if ((cooldowns[gameSlug] || 0) > 0) {
    throw new Error('That mini-game is still cooling down.');
  }
  const prompts = basicMiniGamePromptState(stats);
  const answerDrivenGames = {
    'who-is-that': { promptKey: 'silhouette', statField: 'silhouetteWins', cursorKey: 'silhouetteCursor' },
    'type-quiz': { promptKey: 'typeQuiz', statField: 'quizWins', cursorKey: 'typeQuizCursor' },
    'battle-forecast': { promptKey: 'battleForecast', statField: 'forecastWins', cursorKey: 'forecastCursor' },
    'stat-scout': { promptKey: 'statScout', statField: 'statScoutWins', cursorKey: 'statScoutCursor' },
    'rarity-radar': { promptKey: 'rarityRadar', statField: 'rarityRadarWins', cursorKey: 'rarityRadarCursor' },
    'whack-a-mon': { promptKey: 'whackAMon', statField: 'whackWins', cursorKey: 'whackCursor' },
    'power-pivot': { promptKey: 'powerPivot', statField: 'powerPivotWins', cursorKey: 'powerPivotCursor' },
    'type-edge': { promptKey: 'typeEdge', statField: 'typeEdgeWins', cursorKey: 'typeEdgeCursor' },
  };
  const submittedAnswer = String(options?.answer || '').trim();
  stats.played = Number(stats.played || 0) + 1;
  let win = false;
  let tokensGained = 0;
  let summary = 'Mini-game completed';
  let bonusParts = [];

  if (gameSlug === 'daily-crate') {
    const todayKey = new Date().toISOString().slice(0, 10);
    if (stats.lastDailyClaimDate === todayKey) {
      throw new Error('Daily crate already claimed today.');
    }
    stats.lastDailyClaimDate = todayKey;
    win = true;
    tokensGained = 4;
    addInventory(userId, 'potion', 2);
    const drop = rollMiniGameDrop(userId, MINI_GAME_BONUS_DROP_TABLES['daily-crate']);
    bonusParts = ['Potion x2'];
    if (drop) {
      bonusParts.push(`${drop.itemName} x${formatNumber(drop.quantity)}`);
    }
    summary = `Daily crate claimed for ${miniGameTokenLabel(tokensGained)}`;
  } else if (gameSlug === 'mine') {
    const balance = MINI_GAME_TOKEN_BALANCE.mine;
    win = true;
    tokensGained = miniGameRangeValue(balance.tokenMin, balance.tokenMax);
    const cash = miniGameRangeValue(balance.cashMin, balance.cashMax);
    changeUserCash(userId, cash);
    user.meta.miningTrips = Number(user.meta.miningTrips || 0) + 1;
    bonusParts = [`${formatNumber(cash)} gold`];
    const drop = rollMiniGameDrop(userId, MINI_GAME_BONUS_DROP_TABLES.mine);
    if (drop) {
      bonusParts.push(`${drop.itemName} x${formatNumber(drop.quantity)}`);
    }
    if (tokensGained <= 0) {
      stats.mineFails = Number(stats.mineFails || 0) + 1;
      summary = 'Mining Tunnel returned gold but no arcade tokens';
    } else {
      summary = `Mining Tunnel returned ${miniGameTokenLabel(tokensGained)}`;
    }
  } else if (gameSlug === 'dice') {
    const balance = MINI_GAME_TOKEN_BALANCE.dice;
    win = Math.random() < balance.winChance;
    tokensGained = win
      ? miniGameRangeValue(balance.winTokenMin, balance.winTokenMax)
      : miniGameRangeValue(balance.lossTokenMin, balance.lossTokenMax);
    user.meta.diceGames = Number(user.meta.diceGames || 0) + 1;
    if (win) {
      user.meta.diceWins = Number(user.meta.diceWins || 0) + 1;
      const drop = rollMiniGameDrop(userId, MINI_GAME_BONUS_DROP_TABLES.dice);
      if (drop) {
        bonusParts.push(`${drop.itemName} x${formatNumber(drop.quantity)}`);
      }
      summary = `Dice Table hit for ${miniGameTokenLabel(tokensGained)}`;
    } else {
      stats.diceLosses = Number(stats.diceLosses || 0) + 1;
      summary = tokensGained > 0
        ? `Dice Table missed, but ${miniGameTokenLabel(tokensGained)} slipped back as consolation`
        : 'Dice Table missed and paid nothing this round';
    }
  } else if (gameSlug === 'aura-gamble') {
    const balance = MINI_GAME_TOKEN_BALANCE['aura-gamble'];
    stats.auraGambles = Number(stats.auraGambles || 0) + 1;
    win = Math.random() < balance.winChance;
    tokensGained = win
      ? miniGameRangeValue(balance.winTokenMin, balance.winTokenMax)
      : miniGameRangeValue(balance.lossTokenMin, balance.lossTokenMax);
    const jackpot = Math.random() < balance.jackpotChance;
    if (jackpot) {
      const gearMeta = ensureTrainerGearMeta(user.meta);
      win = true;
      tokensGained = Math.max(tokensGained, balance.winTokenMin + 1);
      stats.gambleJackpots = Number(stats.gambleJackpots || 0) + 1;
      if (Math.random() < 0.5) {
        const aura = TRAINER_AURA_GEAR[Math.floor(Math.random() * TRAINER_AURA_GEAR.length)];
        gearMeta.auras[aura.slug] = Number(gearMeta.auras?.[aura.slug] || 0) + 1;
        bonusParts.push(aura.name);
      } else {
        const hat = TRAINER_HAT_GEAR[Math.floor(Math.random() * TRAINER_HAT_GEAR.length)];
        gearMeta.hats[hat.slug] = Number(gearMeta.hats?.[hat.slug] || 0) + 1;
        bonusParts.push(hat.name);
      }
      summary = `Aura Jackpot cracked open a gear hit and ${miniGameTokenLabel(tokensGained)}`;
    } else if (win) {
      summary = `Aura Jackpot paid ${miniGameTokenLabel(tokensGained)}`;
    } else {
      summary = tokensGained > 0
        ? `Aura Jackpot fizzled, but ${miniGameTokenLabel(tokensGained)} was refunded`
        : 'Aura Jackpot fizzled out with no token refund';
    }
  } else if (gameSlug === 'prize-wheel') {
    const balance = MINI_GAME_TOKEN_BALANCE['prize-wheel'];
    const roll = Math.random();
    if (roll < balance.tokenChance) {
      win = true;
      tokensGained = miniGameRangeValue(balance.tokenMin, balance.tokenMax);
      const drop = rollMiniGameDrop(userId, MINI_GAME_BONUS_DROP_TABLES['prize-wheel-win']);
      if (drop) {
        bonusParts.push(`${drop.itemName} x${formatNumber(drop.quantity)}`);
      }
      summary = `Prize Wheel landed on a token wedge for ${miniGameTokenLabel(tokensGained)}`;
    } else if (roll < balance.tokenChance + balance.goldChance) {
      win = true;
      tokensGained = 0;
      const gold = miniGameRangeValue(balance.goldMin, balance.goldMax);
      changeUserCash(userId, gold);
      bonusParts.push(`${formatNumber(gold)} gold`);
      summary = `Prize Wheel landed on a gold wedge and banked ${formatNumber(gold)} gold`;
    } else if (roll < balance.tokenChance + balance.goldChance + balance.bonusChance) {
      win = true;
      tokensGained = 1;
      const drop = rollMiniGameDrop(userId, MINI_GAME_BONUS_DROP_TABLES['prize-wheel-bonus']);
      if (drop) {
        bonusParts.push(`${drop.itemName} x${formatNumber(drop.quantity)}`);
      }
      summary = `Prize Wheel hit the bonus crate lane for ${miniGameTokenLabel(tokensGained)}`;
    } else {
      tokensGained = miniGameRangeValue(balance.lossTokenMin, balance.lossTokenMax);
      summary = tokensGained > 0
        ? `Prize Wheel whiffed, but ${miniGameTokenLabel(tokensGained)} bounced back`
        : 'Prize Wheel whiffed and paid nothing this spin';
    }
    if (win) {
      stats.prizeWheelWins = Number(stats.prizeWheelWins || 0) + 1;
    }
  } else if (answerDrivenGames[gameSlug]) {
    const balance = MINI_GAME_TOKEN_BALANCE[gameSlug] || { winTokenMin: 2, winTokenMax: 3, lossTokenMin: 0, lossTokenMax: 0 };
    const config = answerDrivenGames[gameSlug];
    const prompt = prompts[config.promptKey] || {};
    const correctAnswer = String(prompt.correctAnswer || '');
    const correctLabel = miniGameAnswerLabel(prompt, correctAnswer);
    const gameName = MINI_GAME_CATALOG.find((entry) => entry.slug === gameSlug)?.name || 'Mini-game';
    stats[config.cursorKey] = Number(stats[config.cursorKey] || 0) + 1;
    win = !!correctAnswer && submittedAnswer === correctAnswer;
    tokensGained = win
      ? miniGameRangeValue(balance.winTokenMin, balance.winTokenMax)
      : miniGameRangeValue(balance.lossTokenMin, balance.lossTokenMax);
    if (win) {
      stats[config.statField] = Number(stats[config.statField] || 0) + 1;
      const drop = rollMiniGameDrop(userId, MINI_GAME_BONUS_DROP_TABLES['knowledge-win']);
      if (drop) {
        bonusParts.push(`${drop.itemName} x${formatNumber(drop.quantity)}`);
      }
      summary = `${gameName} cleared for ${miniGameTokenLabel(tokensGained)}`;
    } else {
      summary = tokensGained > 0
        ? `${gameName} missed${correctAnswer ? `, and ${correctLabel} was the right call` : ''}, but ${miniGameTokenLabel(tokensGained)} was still banked`
        : `${gameName} missed${correctAnswer ? `, and ${correctLabel} was the right call` : ''}`;
    }
  } else {
    throw new Error('That mini-game is not available right now.');
  }

  if (MINI_GAME_COOLDOWNS[gameSlug]) {
    setMiniGameCooldown(stats, gameSlug, MINI_GAME_COOLDOWNS[gameSlug]);
  }

  stats.tokens = Number(stats.tokens || 0) + tokensGained;
  if (win) {
    stats.wins = Number(stats.wins || 0) + 1;
    stats.streak = Number(stats.streak || 0) + 1;
    stats.bestStreak = Math.max(Number(stats.bestStreak || 0), Number(stats.streak || 0));
    bumpProgressStat(user.meta, 'minigameWins', 1);
  } else {
    stats.streak = 0;
  }
  summary = appendMiniGameBonusParts(summary, bonusParts);
  appendActivityLog(user.meta, summary);
  saveUserMeta(userId, user.meta);
  return { summary, win, tokensGained };
}

export function redeemMiniGameReward(userId, rewardSlug) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const stats = normalizedMiniGameStats(user.meta);
  const reward = rewardShopEntriesForUser(user, stats).find((entry) => entry.slug === rewardSlug);
  if (!reward) {
    throw new Error('Reward not found.');
  }
  if (!reward.canRedeem) {
    throw new Error('That reward is not redeemable right now.');
  }
  stats.tokens = Number(stats.tokens || 0) - reward.cost;
  if (reward.rewardType === 'item') {
    addInventory(userId, reward.itemSlug, reward.quantity || 1);
  } else {
    const gearMeta = ensureTrainerGearMeta(user.meta);
    if (reward.rewardType === 'aura') {
      gearMeta.auras[reward.gearSlug] = Number(gearMeta.auras?.[reward.gearSlug] || 0) + 1;
    } else {
      gearMeta.hats[reward.gearSlug] = Number(gearMeta.hats?.[reward.gearSlug] || 0) + 1;
    }
  }
  user.meta.miniGameStats = stats;
  appendActivityLog(user.meta, `${reward.rewardName} redeemed from the arcade shop.`);
  saveUserMeta(userId, user.meta);
  return reward;
}

export function exchangeMiniGameInventoryItem(userId, itemSlug, quantity) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const normalizedQuantity = Math.max(1, Math.floor(Number(quantity || 0)));
  const bundle = miniGameItemBundlesForUser(userId).find((entry) => entry.itemSlug === itemSlug && entry.quantity === normalizedQuantity);
  if (!bundle) {
    throw new Error('That stash bundle is not available for token exchange right now.');
  }
  if (!spendInventory(userId, bundle.itemSlug, bundle.quantity)) {
    throw new Error('That stash bundle is no longer available.');
  }
  const stats = normalizedMiniGameStats(user.meta);
  stats.tokens = Number(stats.tokens || 0) + bundle.tokens;
  user.meta.miniGameStats = stats;
  appendActivityLog(user.meta, `${bundle.itemName} x${formatNumber(bundle.quantity)} converted into ${formatNumber(bundle.tokens)} arcade tokens.`);
  saveUserMeta(userId, user.meta);
  return { ...bundle, tokensGained: bundle.tokens };
}

export function exchangeMiniGameMonster(userId, collectionId) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  if (getActiveRun(userId)) {
    throw new Error('Finish your active run before exchanging storage monsters.');
  }
  const targetId = Number(collectionId || 0);
  const bundle = miniGameMonsterExchangeState(userId).monsterEntries.find((entry) => entry.collectionId === targetId);
  if (!bundle) {
    throw new Error('That monster is protected or no longer eligible for token exchange.');
  }
  const entry = getCollectionEntry(userId, targetId);
  if (!entry) {
    throw new Error('Monster not found.');
  }
  if (entry.monster.heldItemSlug && ITEM_MAP.has(entry.monster.heldItemSlug)) {
    addInventory(userId, entry.monster.heldItemSlug, 1);
  }
  db.prepare('DELETE FROM collection WHERE id = ? AND user_id = ?').run(targetId, userId);
  const stats = normalizedMiniGameStats(user.meta);
  stats.tokens = Number(stats.tokens || 0) + bundle.tokens;
  user.meta.miniGameStats = stats;
  appendActivityLog(user.meta, `${bundle.monsterName} exchanged for ${formatNumber(bundle.tokens)} arcade tokens.`);
  saveUserMeta(userId, user.meta);
  return { ...bundle, tokensGained: bundle.tokens };
}
const MAP_SEARCH_PROFILES = {
  sanctuary: {
    label: 'Tall Grass',
    tone: 'success',
    intros: ['You step into the grass and the flowers bend around your boots.', 'Warm wind slides across the field as the scanner starts sweeping.'],
    suspense: ['The wind suddenly stops.', 'Something moved behind the flowers.'],
    falseAlarms: ['The shape vanishes before the scanner can lock on.', 'Whatever was there slips back into the brush.'],
    clues: ['You found fresh footprints near the blossoms.', 'Bent stems point toward a stronger presence nearby.'],
    itemFinds: ['A hidden patch yields {item}.', 'You brush aside the grass and uncover {item}.'],
    cashFinds: ['A passing trainer dropped {cash} credits in the path.', 'Coins glint between the roots: {cash} credits added.'],
    trainerFinds: ['You searched carefully and your route timing improves.', 'The route feels easier to read after that sweep.'],
    rareBuild: ['The air feels different.', 'A powerful presence is nearby.'],
    encounterLines: ['{species} bursts from the grass.', '{species} flashes between the petals and reveals itself.'],
    ambient: ['Birdsong cuts out for a second as the route listens back.', 'Tall grass leans in one direction like something just passed through.'],
    rewardItems: ['oran-berry', 'sitrus-berry', 'cheri-berry', 'berry-juice', 'poke-ball'],
  },
  ruins: {
    label: 'Ancient Ruins',
    tone: 'warning',
    intros: ['You cross a cracked stone threshold and the route turns colder.', 'Dust rolls along the ruin floor as the scanner wakes up.'],
    suspense: ['Something echoes from the next chamber.', 'A carved wall vibrates for a split second.'],
    falseAlarms: ['The echo dies before anything appears.', 'A strong trace was here, but it slipped back into cover.'],
    clues: ['You found fresh claw marks across a broken pillar.', 'Dust patterns reveal a heavier route deeper inside.'],
    itemFinds: ['A relic cache breaks open and reveals {item}.', 'A cracked urn still holds {item}.'],
    cashFinds: ['Old tribute coins are still here: {cash} credits added.', 'You salvage {cash} credits worth of relic shards.'],
    trainerFinds: ['You study the ruin layout and gain cleaner search control.', 'Your route sense improves while tracing the old hallways.'],
    rareBuild: ['The ruin air grows heavier.', 'Ancient power stirs under the stone.'],
    encounterLines: ['{species} emerges from behind a shattered pillar.', '{species} steps out of the ruin shadows.'],
    ambient: ['A loose stone rolls somewhere deeper inside.', 'Dust hangs in the air where something just moved.'],
    rewardItems: ['great-ball', 'super-potion', 'oran-berry', 'poke-ball', 'berry-juice'],
  },
  peak: {
    label: 'Highland Route',
    tone: 'electric',
    intros: ['Thin mountain air pushes against you as the scan begins.', 'Cloud shadow covers the path while the route board lights up.'],
    suspense: ['Loose gravel shifts above you.', 'Something cuts through the fog and disappears.'],
    falseAlarms: ['The shadow drops out of sight before you can track it.', 'Whatever was there climbed out of the scanner cone.'],
    clues: ['Fresh scrape marks score the ridge rock.', 'A burst of static suggests something stronger nearby.'],
    itemFinds: ['A supply cache wedged in the rocks contains {item}.', 'A glint under the shale turns out to be {item}.'],
    cashFinds: ['A dropped climbing purse holds {cash} credits.', 'The wind uncovers {cash} credits under a loose board.'],
    trainerFinds: ['Your timing sharpens against the tougher mountain rhythm.', 'You adapt to the highland route and search more cleanly.'],
    rareBuild: ['The clouds press lower around the ridge.', 'Static builds in the air.'],
    encounterLines: ['{species} drops onto the ridge path.', '{species} breaks through the fog and reveals itself.'],
    ambient: ['Wind howls once and then cuts out completely.', 'Fog parts for a moment and then seals again.'],
    rewardItems: ['great-ball', 'super-potion', 'wacan-berry', 'salac-berry', 'poke-ball'],
  },
  depths: {
    label: 'Cavern Search',
    tone: 'ghost',
    intros: ['You step into the cave and the sound changes immediately.', 'Cold air leaks through the cavern as the scanner starts its sweep.'],
    suspense: ['Something moved deeper in the dark.', 'You hear stone scrape against stone nearby.'],
    falseAlarms: ['The echo collapses before the target shows itself.', 'A shape was there, then the tunnel swallowed it again.'],
    clues: ['You find fresh claw marks in the wall.', 'Loose stones trace a route toward stronger activity.'],
    itemFinds: ['A glitter seam in the wall hides {item}.', 'A lost explorer pouch still contains {item}.'],
    cashFinds: ['You recover {cash} credits from an abandoned tunnel kit.', 'Ore scraps trade out for {cash} credits.'],
    trainerFinds: ['You learn the cave echo pattern and search with more control.', 'The cavern tension teaches you how to track quieter movement.'],
    rareBuild: ['The darkness ahead feels heavier.', 'A powerful presence waits deeper inside.'],
    encounterLines: ['{species} pushes out of the darkness.', '{species} appears where the tunnel forks.'],
    ambient: ['Water drips somewhere deeper in the cave.', 'The tunnel gives back one extra echo that is not yours.'],
    rewardItems: ['super-potion', 'dusk-stone', 'kasib-berry', 'great-ball', 'poke-ball'],
  },
  island: {
    label: 'Coastal Route',
    tone: 'water',
    intros: ['You step onto the shoreline and the scanner catches the tide rhythm.', 'Salt wind rolls across the route as waves break nearby.'],
    suspense: ['Something splashes just out of sight.', 'A dark shape passes under the surface and vanishes.'],
    falseAlarms: ['The water settles before the scanner can lock on.', 'The shadow disappears under the next wave.'],
    clues: ['Wet tracks lead away from the surf.', 'Broken shells mark where something rare moved through.'],
    itemFinds: ['A tide pool hides {item}.', 'You find {item} tucked between the rocks.'],
    cashFinds: ['You recover {cash} credits from a washed-up wallet.', 'Coins trapped in the tide line add up to {cash} credits.'],
    trainerFinds: ['You match the tide rhythm and your search timing improves.', 'You learn to catch movement between the waves.'],
    rareBuild: ['The water goes unnaturally still.', 'A powerful presence moves below the surface.'],
    encounterLines: ['{species} surges out of the water line.', '{species} rises from the tide and reveals itself.'],
    ambient: ['Waves hush for a second before crashing again.', 'A shadow glides under the surface beside the path.'],
    rewardItems: ['passho-berry', 'great-ball', 'sitrus-berry', 'berry-juice', 'poke-ball'],
  },
  default: {
    label: 'Adventure Route',
    tone: 'default',
    intros: ['You step into the route and the search board starts humming.'],
    suspense: ['Something shifts just beyond the scanner edge.'],
    falseAlarms: ['The signal fades before it becomes a battle.'],
    clues: ['You found traces that push the search deeper.'],
    itemFinds: ['You recover {item} from the route.'],
    cashFinds: ['You pick up {cash} credits from the path.'],
    trainerFinds: ['You searched carefully and learned from the route.'],
    rareBuild: ['The air feels different.', 'A powerful presence is nearby.'],
    encounterLines: ['{species} appears from the route.'],
    ambient: ['The route answers with one more sign of movement.'],
    rewardItems: ['poke-ball', 'oran-berry', 'berry-juice'],
  },
};

function mapSearchProfileForRegion(region) {
  return MAP_SEARCH_PROFILES[region?.category] || MAP_SEARCH_PROFILES.default;
}

function renderMapSearchLine(template, values = {}) {
  let text = String(template || '');
  Object.entries(values).forEach(([key, value]) => {
    text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value || ''));
  });
  return text;
}

function normalizeMapAdventureLog(entries) {
  return Array.isArray(entries)
    ? entries
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        text: String(entry.text || '').trim(),
        tone: String(entry.tone || 'default').trim() || 'default',
        reward: String(entry.reward || '').trim(),
        at: entry.at || nowIso(),
      }))
      .filter((entry) => entry.text)
      .slice(0, 12)
    : [];
}

function pushMapAdventureLog(entries, text, tone = 'default', reward = '') {
  const next = normalizeMapAdventureLog(entries);
  next.unshift({ text, tone, reward, at: nowIso() });
  return next.slice(0, 12);
}

function mapLevelRequirement(level) {
  return 4 + Math.min(6, Math.floor((Math.max(1, level) - 1) / 2));
}

function mapLevelStateFromExperience(experience) {
  let remaining = Math.max(0, Math.floor(Number(experience || 0)));
  let level = 1;
  let expForNextLevel = mapLevelRequirement(level);
  while (remaining >= expForNextLevel) {
    remaining -= expForNextLevel;
    level += 1;
    expForNextLevel = mapLevelRequirement(level);
  }
  return {
    level,
    expIntoLevel: remaining,
    expForNextLevel,
    expPercent: Math.round((remaining / Math.max(1, expForNextLevel)) * 100),
  };
}

function baseMapSearchRegionState(region) {
  const profile = mapSearchProfileForRegion(region);
  return {
    searches: 0,
    experience: 0,
    chain: 0,
    bestChain: 0,
    rareMeter: 0,
    lastEncounter: '',
    lastResult: 'Every search now builds route chain, rare signal, and a live adventure log.',
    lastResultTone: profile.tone,
    lastExpGain: 0,
    lastCashGain: 0,
    lastTrainerExpGain: 0,
    lastRewardLabel: 'Fresh route board',
    lastRewardTone: profile.tone,
    lastRewardDetail: 'Searches can now reveal clues, items, EXP, cash, or a live encounter.',
    lastItemReward: null,
    pendingEncounter: null,
    storySteps: [profile.intros[0], profile.suspense[0], 'The route is quiet for now, but the first clue is out there.'],
    adventureLog: [],
    lastSearchAt: null,
  };
}

function normalizeMapSearchRegionState(current, region) {
  const base = baseMapSearchRegionState(region);
  const next = { ...base, ...(current || {}) };
  next.searches = Math.max(0, Math.floor(Number(next.searches || 0)));
  next.experience = Math.max(0, Math.floor(Number(next.experience || 0)));
  next.chain = Math.max(0, Math.floor(Number(next.chain || 0)));
  next.bestChain = Math.max(next.chain, Math.floor(Number(next.bestChain || 0)));
  next.rareMeter = clamp(Math.floor(Number(next.rareMeter || 0)), 0, 100);
  next.lastExpGain = Math.max(0, Math.floor(Number(next.lastExpGain || 0)));
  next.lastCashGain = Math.max(0, Math.floor(Number(next.lastCashGain || 0)));
  next.lastTrainerExpGain = Math.max(0, Math.floor(Number(next.lastTrainerExpGain || 0)));
  next.pendingEncounter = next.pendingEncounter?.speciesId ? { ...next.pendingEncounter } : null;
  next.storySteps = Array.isArray(next.storySteps)
    ? next.storySteps.map((entry) => String(entry || '').trim()).filter(Boolean).slice(-5)
    : base.storySteps;
  next.adventureLog = normalizeMapAdventureLog(next.adventureLog);
  next.lastItemReward = next.lastItemReward?.itemSlug ? { ...next.lastItemReward } : null;
  return next;
}

function mapSearchOddsForState(region, regionState) {
  const levelState = mapLevelStateFromExperience(regionState.experience);
  const encounterChance = clamp(0.2 + levelState.level * 0.025 + Math.min(regionState.chain, 18) * 0.016 + regionState.rareMeter * 0.0025, 0.2, 0.82);
  const rareChance = clamp(0.07 + levelState.level * 0.015 + Math.min(regionState.chain, 20) * 0.012 + regionState.rareMeter * 0.004, 0.07, 0.78);
  const legendaryChance = levelState.level >= 4
    ? clamp(0.01 + Math.max(0, regionState.chain - 8) * 0.006 + regionState.rareMeter * 0.002, 0.01, 0.22)
    : 0;
  return {
    mapLevel: levelState.level,
    encounterChance,
    rareChance,
    legendaryChance,
  };
}

function stableSpeciesSlice(pool, key, count) {
  return pool
    .slice()
    .sort((left, right) => hashValue(`${key}:${left.id}`).localeCompare(hashValue(`${key}:${right.id}`)))
    .slice(0, count);
}

function mapSearchStateForRegion(meta, region) {
  meta.mapSearch = { regions: {}, ...(meta?.mapSearch || {}) };
  meta.mapSearch.regions = { ...(meta.mapSearch.regions || {}) };
  const current = normalizeMapSearchRegionState(meta.mapSearch.regions[region.slug], region);
  const levelState = mapLevelStateFromExperience(current.experience);
  const odds = mapSearchOddsForState(region, current);
  const profile = mapSearchProfileForRegion(region);
  const allowLegends = levelState.level >= 4;
  const speciesPool = mapSpeciesPoolForRegion(region, { allowLegends });
  const rarePool = speciesPool.filter((species) => species.rarity === 'rare');
  const legendPool = speciesPool.filter((species) => ['legendary', 'mythic'].includes(species.rarity));
  const commonPool = speciesPool.filter((species) => species.rarity !== 'rare' && !['legendary', 'mythic'].includes(species.rarity));
  const featuredSightings = [
    ...stableSpeciesSlice(rarePool, `${region.slug}:rare:${current.searches}`, 2),
    ...stableSpeciesSlice(commonPool, `${region.slug}:common:${current.searches}`, 2),
    ...stableSpeciesSlice(legendPool, `${region.slug}:legend:${current.searches}`, 1),
  ].filter((species, index, list) => species && list.findIndex((entry) => entry.id === species.id) === index).slice(0, 4);
  return {
    regionSlug: region.slug,
    regionName: region.name,
    biome: region.biomeHints?.[0] || region.name,
    personalityLabel: profile.label,
    personalityTone: profile.tone,
    mapLevel: levelState.level,
    totalSearches: current.searches,
    expIntoLevel: levelState.expIntoLevel,
    expForNextLevel: levelState.expForNextLevel,
    expPercent: levelState.expPercent,
    currentChanceLabel: `${Math.round(odds.encounterChance * 100)}% encounter`,
    currentRareLabel: `${Math.round(odds.rareChance * 100)}% rare`,
    currentLegendLabel: odds.legendaryChance > 0 ? `${Math.round(odds.legendaryChance * 100)}% legendary` : 'Legends asleep',
    chain: current.chain,
    bestChain: current.bestChain,
    chainLabel: current.chain ? `Chain x${formatNumber(current.chain)}` : 'Chain cold',
    rareMeter: current.rareMeter,
    rareMeterLabel: `${formatNumber(current.rareMeter)}% rare signal`,
    searchMomentum: current.chain >= 10 ? 'Your senses are improving and the route is heating up.' : current.chain >= 4 ? 'You are getting closer to something stronger.' : current.searches ? 'The route is starting to answer your searches.' : 'Fresh route board. Every search can trigger a real event.',
    lastEncounter: current.lastEncounter || 'No encounter logged yet.',
    lastResult: current.lastResult || baseMapSearchRegionState(region).lastResult,
    lastResultTone: current.lastResultTone || profile.tone,
    lastExpGain: current.lastExpGain || 0,
    lastCashGain: current.lastCashGain || 0,
    lastTrainerExpGain: current.lastTrainerExpGain || 0,
    lastRewardLabel: current.lastRewardLabel || 'Fresh route board',
    lastRewardTone: current.lastRewardTone || profile.tone,
    lastRewardDetail: current.lastRewardDetail || '',
    lastItemReward: current.lastItemReward || null,
    pendingEncounter: current.pendingEncounter || null,
    storySteps: current.storySteps,
    storyFresh: current.lastSearchAt ? Date.now() - new Date(current.lastSearchAt).getTime() <= 18000 : false,
    adventureLog: current.adventureLog,
    featuredSightings,
  };
}

function mapSpeciesPoolForRegion(region, options = {}) {
  const allowLegends = !!options.allowLegends;
  return SPECIES.filter((species) => {
    if (!allowLegends && ['legendary', 'mythic'].includes(species.rarity)) {
      return false;
    }
    if (region?.preferredTypes?.length && !species.types.some((type) => region.preferredTypes.includes(type)) && !(region.biomeHints || []).includes(species.biome)) {
      return false;
    }
    return true;
  });
}

function resolveMapSearchEncounter(region, regionState, profile, rng) {
  const odds = mapSearchOddsForState(region, regionState);
  const allowLegends = odds.mapLevel >= 4 && regionState.rareMeter >= 35;
  const speciesPool = mapSpeciesPoolForRegion(region, { allowLegends });
  const rarePool = speciesPool.filter((species) => species.rarity === 'rare');
  const legendaryPool = speciesPool.filter((species) => ['legendary', 'mythic'].includes(species.rarity));
  const commonPool = speciesPool.filter((species) => species.rarity !== 'rare' && !['legendary', 'mythic'].includes(species.rarity));
  let species = null;
  if (legendaryPool.length && rng() < odds.legendaryChance) {
    species = randomChoice(legendaryPool, rng);
  } else if (rarePool.length && rng() < odds.rareChance) {
    species = randomChoice(rarePool, rng);
  } else {
    species = randomChoice(commonPool.length ? commonPool : speciesPool, rng);
  }
  if (!species) {
    return null;
  }
  const rarity = species.rarity || 'common';
  const rareEncounter = rarity === 'rare';
  const legendaryEncounter = ['legendary', 'mythic'].includes(rarity);
  const levelBonus = legendaryEncounter ? 6 : rareEncounter ? 2 : 0;
  return {
    species,
    rarity,
    tone: legendaryEncounter ? 'psychic' : rareEncounter ? 'warning' : 'success',
    level: Math.max(10, Number(region.routeLevel || 12) + odds.mapLevel * 2 + Math.floor(regionState.chain / 4) + levelBonus),
    storySteps: legendaryEncounter
      ? [...profile.rareBuild.slice(0, 2), renderMapSearchLine(randomChoice(profile.encounterLines, rng), { species: species.name })]
      : rareEncounter
        ? [randomChoice(profile.suspense, rng), ...profile.rareBuild.slice(0, 2), renderMapSearchLine(randomChoice(profile.encounterLines, rng), { species: species.name })]
        : [randomChoice(profile.intros, rng), randomChoice(profile.suspense, rng), renderMapSearchLine(randomChoice(profile.encounterLines, rng), { species: species.name })],
  };
}

function resolveMapSearchSideEvent(region, regionState, profile, rng) {
  const roll = rng();
  if (roll < 0.28) {
    const itemSlug = randomChoice(profile.rewardItems, rng);
    const item = ITEM_MAP.get(itemSlug) || ITEM_MAP.get('poke-ball');
    return {
      kind: 'item',
      tone: 'success',
      rewardTone: 'success',
      rewardLabel: item?.name || 'Route find',
      rewardDetail: `${item?.name || 'Route find'} added to your stash.`,
      itemSlug: item?.slug || 'poke-ball',
      quantity: 1,
      expGain: 2,
      cashGain: 0,
      trainerExpGain: 0,
      rareMeterDelta: 6,
      lastEncounter: 'No battle signal. Something still left a reward behind.',
      lastResult: renderMapSearchLine(randomChoice(profile.itemFinds, rng), { item: item?.name || 'a route item' }),
      storySteps: [randomChoice(profile.intros, rng), randomChoice(profile.suspense, rng), renderMapSearchLine(randomChoice(profile.itemFinds, rng), { item: item?.name || 'a route item' })],
      itemReward: { itemSlug: item?.slug || 'poke-ball', itemName: item?.name || 'Route find', quantity: 1 },
    };
  }
  if (roll < 0.5) {
    const cashGain = 80 + regionState.mapLevel * 22 + seededInt(rng, 0, 60);
    return {
      kind: 'cash',
      tone: 'warning',
      rewardTone: 'warning',
      rewardLabel: `${formatNumber(cashGain)} credits`,
      rewardDetail: `Account cash +${formatNumber(cashGain)}.`,
      itemSlug: null,
      quantity: 0,
      expGain: 2,
      cashGain,
      trainerExpGain: 0,
      rareMeterDelta: 8,
      lastEncounter: 'A route trace slips away, but something else pays off.',
      lastResult: renderMapSearchLine(randomChoice(profile.cashFinds, rng), { cash: formatNumber(cashGain) }),
      storySteps: [randomChoice(profile.intros, rng), randomChoice(profile.ambient, rng), renderMapSearchLine(randomChoice(profile.cashFinds, rng), { cash: formatNumber(cashGain) })],
      itemReward: null,
    };
  }
  if (roll < 0.76) {
    const trainerExpGain = 10 + regionState.mapLevel * 4;
    const rareMeterDelta = 14 + regionState.mapLevel * 3;
    return {
      kind: 'clue',
      tone: 'warning',
      rewardTone: 'warning',
      rewardLabel: 'Rare clue',
      rewardDetail: `Rare signal +${formatNumber(rareMeterDelta)} and trainer EXP +${formatNumber(trainerExpGain)}.`,
      itemSlug: null,
      quantity: 0,
      expGain: 1,
      cashGain: 0,
      trainerExpGain,
      rareMeterDelta,
      lastEncounter: 'A strong presence was here, but it moved first.',
      lastResult: `${randomChoice(profile.falseAlarms, rng)} ${randomChoice(profile.clues, rng)}`,
      storySteps: [randomChoice(profile.intros, rng), randomChoice(profile.suspense, rng), randomChoice(profile.falseAlarms, rng), randomChoice(profile.clues, rng)],
      itemReward: null,
    };
  }
  const trainerExpGain = 16 + regionState.mapLevel * 5;
  return {
    kind: 'training',
    tone: 'default',
    rewardTone: 'default',
    rewardLabel: 'Adventure insight',
    rewardDetail: `Trainer EXP +${formatNumber(trainerExpGain)} and map EXP +2.`,
    itemSlug: null,
    quantity: 0,
    expGain: 3,
    cashGain: 0,
    trainerExpGain,
    rareMeterDelta: 10,
    lastEncounter: 'The route stays quiet, but you learned from it.',
    lastResult: randomChoice(profile.trainerFinds, rng),
    storySteps: [randomChoice(profile.intros, rng), randomChoice(profile.ambient, rng), randomChoice(profile.trainerFinds, rng)],
    itemReward: null,
  };
}

function buildMapAdventureEnemyParty(region, mapLevel, adventureMode, userSeed = 0) {
  const kind = adventureMode === 'boss' ? 'boss' : adventureMode === 'trainer' ? 'trainer' : 'wild';
  const count = kind === 'boss' ? 3 : kind === 'trainer' ? 2 : 1;
  const allowLegends = kind === 'boss' && mapLevel >= 4;
  const seed = parseInt(hashValue(`${region.slug}:${mapLevel}:${adventureMode}:${userSeed}`).slice(0, 8), 16) >>> 0;
  const rng = seeded(seed);
  const speciesPool = mapSpeciesPoolForRegion(region, { allowLegends });
  const legends = legendaryRoster().filter((species) => species.types.some((type) => region.preferredTypes.includes(type)) || (region.biomeHints || []).includes(species.biome));
  const baseLevel = Math.max(10, Number(region.routeLevel || 12) + mapLevel * 2 + (kind === 'boss' ? 6 : kind === 'trainer' ? 3 : 0));
  const enemyParty = [];
  for (let index = 0; index < count; index += 1) {
    let species = speciesPool[Math.floor(rng() * Math.max(1, speciesPool.length))] || randomChoice(SPECIES);
    if (kind === 'boss' && legends.length && rng() < 0.35) {
      species = legends[Math.floor(rng() * legends.length)];
    }
    enemyParty.push(buildEnemyMonster(species, baseLevel + index, kind, mapLevel * 10 + userSeed + index + 1, null, 1));
  }
  return enemyParty;
}

export function getMapState(userId) {
  const base = getHubState(userId);
  const activeRun = getActiveRun(userId);
  const selectedRegion = base.world.regions.find((region) => region.slug === base.user.meta.preferredRegionSlug) || base.world.activeRegion;
  const categoryLabels = {
    sanctuary: { label: 'Sanctuary', tone: 'success' },
    ruins: { label: 'Ruins', tone: 'warning' },
    peak: { label: 'Peak', tone: 'electric' },
    depths: { label: 'Depths', tone: 'ghost' },
    island: { label: 'Island', tone: 'water' },
  };
  const regions = base.world.regions.map((region) => {
    const regionState = mapSearchStateForRegion(base.user.meta, region);
    const categoryMeta = categoryLabels[region.category] || { label: 'Region', tone: 'default' };
    return {
      ...region,
      selected: region.slug === selectedRegion.slug,
      categoryLabel: categoryMeta.label,
      categoryTone: categoryMeta.tone,
      chain: regionState.chain,
      rareMeter: regionState.rareMeter,
      searchMood: regionState.personalityLabel,
      adventureModes: [
        { slug: 'wild', label: 'Wild Route', available: region.unlocked },
        { slug: 'trainer', label: 'Trainer Route', available: region.unlocked && regionState.mapLevel >= 2 },
        { slug: 'boss', label: 'Boss Route', available: region.unlocked && regionState.mapLevel >= 4 },
      ],
    };
  });
  return {
    ...base,
    regions,
    searchBoard: { ...mapSearchStateForRegion(base.user.meta, selectedRegion), runLocked: !!activeRun },
    chatPreview: socialMessagesForUser(userId, 'global').slice(-6),
    activityLog: base.activityLog,
  };
}

export function searchMapRoute(userId, regionSlug) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  if (getActiveRun(userId)) {
    throw new Error('Finish your current run before scanning a fresh route.');
  }
  const region = WORLD_REGION_MAP.get(regionSlug) || getWorldState(userId).activeRegion;
  user.meta.mapSearch = { regions: {}, ...(user.meta.mapSearch || {}) };
  user.meta.mapSearch.regions = { ...(user.meta.mapSearch.regions || {}) };
  const current = normalizeMapSearchRegionState(user.meta.mapSearch.regions[region.slug], region);
  if (current.pendingEncounter?.speciesId) {
    throw new Error('Resolve the current route encounter before searching again.');
  }
  const profile = mapSearchProfileForRegion(region);
  const nextSearchCount = current.searches + 1;
  const nextChain = Math.min(40, current.chain + 1);
  const seed = parseInt(hashValue(`${userId}:${region.slug}:${nextSearchCount}:${current.experience}:${current.chain}:${current.rareMeter}`).slice(0, 8), 16) >>> 0;
  const rng = seeded(seed);
  let rareMeter = clamp(current.rareMeter + 6 + Math.floor(nextChain / 2), 0, 100);
  const previewState = { ...current, searches: nextSearchCount, chain: nextChain, bestChain: Math.max(current.bestChain, nextChain), rareMeter };
  const encounterOdds = mapSearchOddsForState(region, previewState);
  const beforeLevel = mapLevelStateFromExperience(current.experience);
  let pendingEncounter = null;
  let lastEncounter = current.lastEncounter || 'No encounter logged yet.';
  let lastResult = current.lastResult || baseMapSearchRegionState(region).lastResult;
  let lastResultTone = profile.tone;
  let lastRewardLabel = 'Route sweep complete';
  let lastRewardTone = profile.tone;
  let lastRewardDetail = 'The route stays active even without a direct battle.';
  let lastItemReward = null;
  let expGain = 1;
  let cashGain = 0;
  let trainerExpGain = 0;
  let storySteps = [randomChoice(profile.intros, rng), randomChoice(profile.suspense, rng)];
  let adventureLog = current.adventureLog;

  if (rng() < encounterOdds.encounterChance) {
    const encounter = resolveMapSearchEncounter(region, previewState, profile, rng);
    if (encounter?.species) {
      pendingEncounter = {
        speciesId: encounter.species.id,
        level: encounter.level,
        rarity: encounter.rarity,
        species: { id: encounter.species.id, name: encounter.species.name, rarity: encounter.species.rarity, types: encounter.species.types },
      };
      storySteps = encounter.storySteps;
      lastEncounter = `${encounter.species.name} locked onto the scanner.`;
      lastResult = ['legendary', 'mythic'].includes(encounter.rarity)
        ? `${encounter.species.name} answered the rare signal and can be challenged right now.`
        : encounter.rarity === 'rare'
          ? `${encounter.species.name} was teased out of hiding and is ready to battle.`
          : `${encounter.species.name} appears on the route and can be challenged now.`;
      lastResultTone = encounter.tone;
      lastRewardLabel = ['legendary', 'mythic'].includes(encounter.rarity) ? 'Legendary encounter' : encounter.rarity === 'rare' ? 'Rare encounter' : 'Wild encounter';
      lastRewardTone = encounter.tone;
      lastRewardDetail = `Encounter level ${formatNumber(encounter.level)}. Search odds are now ${Math.round(encounterOdds.encounterChance * 100)}% on this route.`;
      expGain += ['legendary', 'mythic'].includes(encounter.rarity) ? 3 : encounter.rarity === 'rare' ? 2 : 1;
      rareMeter = ['legendary', 'mythic'].includes(encounter.rarity) ? 18 : encounter.rarity === 'rare' ? 24 : Math.max(8, rareMeter - 12);
      adventureLog = pushMapAdventureLog(adventureLog, `${encounter.species.name} sighted in ${region.name}.`, encounter.tone, lastRewardLabel);
    }
  }

  if (!pendingEncounter) {
    const sideEvent = resolveMapSearchSideEvent(region, { ...previewState, mapLevel: encounterOdds.mapLevel }, profile, rng);
    expGain = Math.max(expGain, sideEvent.expGain || 1);
    cashGain = sideEvent.cashGain || 0;
    trainerExpGain = sideEvent.trainerExpGain || 0;
    rareMeter = clamp(rareMeter + Number(sideEvent.rareMeterDelta || 0), 0, 100);
    lastEncounter = sideEvent.lastEncounter;
    lastResult = sideEvent.lastResult;
    lastResultTone = sideEvent.tone;
    lastRewardLabel = sideEvent.rewardLabel;
    lastRewardTone = sideEvent.rewardTone;
    lastRewardDetail = sideEvent.rewardDetail;
    lastItemReward = sideEvent.itemReward;
    storySteps = sideEvent.storySteps;
    if (sideEvent.itemSlug) {
      addInventory(userId, sideEvent.itemSlug, Math.max(1, Number(sideEvent.quantity || 1)));
      adventureLog = pushMapAdventureLog(adventureLog, `${ITEM_MAP.get(sideEvent.itemSlug)?.name || 'Route item'} added to your stash.`, 'success', sideEvent.rewardLabel);
    }
    if (cashGain > 0) {
      changeUserCash(userId, cashGain);
      adventureLog = pushMapAdventureLog(adventureLog, `${formatNumber(cashGain)} credits recovered from ${region.name}.`, 'warning', sideEvent.rewardLabel);
    }
    if (trainerExpGain > 0) {
      const trainerResult = applyTrainerExperience(user.meta, trainerExpGain);
      if (trainerResult.levelsGained > 0) {
        appendActivityLog(user.meta, `Trainer level ${trainerResult.afterLevel} reached.`);
      }
      adventureLog = pushMapAdventureLog(adventureLog, `Trainer EXP +${formatNumber(trainerExpGain)} from ${region.name}.`, 'default', sideEvent.rewardLabel);
    }
    adventureLog = pushMapAdventureLog(adventureLog, `${region.name}: ${lastResult}`, sideEvent.tone, sideEvent.rewardLabel);
  }

  const totalExperience = current.experience + expGain;
  const afterLevel = mapLevelStateFromExperience(totalExperience);
  if (afterLevel.level > beforeLevel.level) {
    storySteps.push(`${region.name} reached Map Lv ${formatNumber(afterLevel.level)}.`);
    adventureLog = pushMapAdventureLog(adventureLog, `${region.name} reached Map Lv ${formatNumber(afterLevel.level)}.`, 'success', 'Map level up');
  }

  user.meta.mapSearch.regions[region.slug] = {
    ...current,
    searches: nextSearchCount,
    experience: totalExperience,
    chain: nextChain,
    bestChain: Math.max(current.bestChain, nextChain),
    rareMeter,
    lastEncounter,
    lastResult,
    lastResultTone,
    lastExpGain: expGain,
    lastCashGain: cashGain,
    lastTrainerExpGain: trainerExpGain,
    lastRewardLabel,
    lastRewardTone,
    lastRewardDetail,
    lastItemReward,
    pendingEncounter,
    storySteps,
    adventureLog,
    lastSearchAt: nowIso(),
  };
  appendActivityLog(user.meta, `${region.name} search: ${lastRewardLabel}.`);
  saveUserMeta(userId, user.meta);
  return mapSearchStateForRegion(user.meta, region);
}

export function startMapSearchEncounter(userId, regionSlug) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  if (getActiveRun(userId)) {
    throw new Error('Finish your current run before launching a route search encounter.');
  }
  const region = WORLD_REGION_MAP.get(regionSlug) || getWorldState(userId).activeRegion;
  const current = normalizeMapSearchRegionState(user.meta.mapSearch?.regions?.[region.slug], region);
  const pendingEncounter = current.pendingEncounter || null;
  if (!pendingEncounter?.speciesId) {
    throw new Error('No search encounter is waiting on that route.');
  }
  const species = SPECIES_MAP.get(Number(pendingEncounter.speciesId || 0));
  if (!species) {
    throw new Error('That route sighting is no longer available.');
  }
  const enemyParty = [buildEnemyMonster(species, Math.max(10, Number(pendingEncounter.level || region.routeLevel || 12)), 'wild', Math.max(1, Number(current.searches || 1)), null, 1)];
  const run = createSpecialRunForUser(userId, {
    mode: 'adventure',
    label: `${region.name} Search Encounter`,
    title: `${species.name} Search Encounter`,
    regionName: region.name,
    regionSlug: region.slug,
    biome: region.biomeHints?.[0] || region.name,
    enemyParty,
    typeFocus: species.types?.[0] || region.preferredTypes?.[0] || 'normal',
    encounterKind: 'wild',
    allowCapture: true,
    introLine: `${species.name} bursts out of the scanner blind spot near ${region.name}.`,
    extra: {
      source: 'map-search',
      regionSlug: region.slug,
      regionName: region.name,
      opponentName: species.name,
    },
  });
  const profile = mapSearchProfileForRegion(region);
  user.meta.mapSearch.regions[region.slug] = {
    ...current,
    pendingEncounter: null,
    lastEncounter: `${species.name} engaged in battle.`,
    lastResult: `${species.name} was pulled into a live route battle from the adventure board.`,
    lastResultTone: 'warning',
    lastRewardLabel: 'Battle started',
    lastRewardTone: 'warning',
    lastRewardDetail: `Route chain stays active at x${formatNumber(current.chain)} while the battle resolves.`,
    storySteps: ['You move in on the signal.', renderMapSearchLine(randomChoice(profile.encounterLines), { species: species.name }), `Battle starts on the ${region.name} route.`],
    adventureLog: pushMapAdventureLog(current.adventureLog, `${species.name} engaged from ${region.name}.`, 'warning', 'Battle started'),
    lastSearchAt: nowIso(),
  };
  appendActivityLog(user.meta, `${species.name} engaged from the ${region.name} search board.`);
  saveUserMeta(userId, user.meta);
  return run;
}

export function fleeMapSearchEncounter(userId, regionSlug) {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const region = WORLD_REGION_MAP.get(regionSlug);
  if (region) {
    const current = normalizeMapSearchRegionState(user.meta.mapSearch?.regions?.[region.slug], region);
    if (current.searches || current.pendingEncounter) {
      const profile = mapSearchProfileForRegion(region);
      const nextChain = Math.max(0, current.chain - 3);
      const nextRareMeter = clamp(current.rareMeter + 8, 0, 100);
      user.meta.mapSearch.regions[region.slug] = {
        ...current,
        chain: nextChain,
        rareMeter: nextRareMeter,
        pendingEncounter: null,
        lastEncounter: 'You let the sighting go.',
        lastResult: 'The signal fades, but the route stays warmer for the next search.',
        lastResultTone: profile.tone,
        lastRewardLabel: 'Signal released',
        lastRewardTone: profile.tone,
        lastRewardDetail: `Chain drops to x${formatNumber(nextChain)} while the rare signal rises to ${formatNumber(nextRareMeter)}%.`,
        storySteps: [randomChoice(profile.suspense), randomChoice(profile.falseAlarms), 'The route calms down, but you learned where it moved.'],
        adventureLog: pushMapAdventureLog(current.adventureLog, `A sighting slipped away in ${region.name}.`, profile.tone, 'Signal released'),
        lastSearchAt: nowIso(),
      };
      appendActivityLog(user.meta, `A route sighting was skipped in ${region.name}.`);
      saveUserMeta(userId, user.meta);
    }
  }
  return true;
}

export function startMapAdventure(userId, regionSlug, adventureMode = 'wild') {
  const user = getUserById(userId);
  if (!user) {
    throw new Error('User not found.');
  }
  const region = WORLD_REGION_MAP.get(regionSlug) || getWorldState(userId).activeRegion;
  const normalizedMode = ['wild', 'trainer', 'boss'].includes(adventureMode) ? adventureMode : 'wild';
  const regionState = mapSearchStateForRegion(user.meta, region);
  if (normalizedMode === 'trainer' && regionState.mapLevel < 2) {
    throw new Error('Trainer routes unlock at map level 2.');
  }
  if (normalizedMode === 'boss' && regionState.mapLevel < 4) {
    throw new Error('Boss routes unlock at map level 4.');
  }
  const enemyParty = buildMapAdventureEnemyParty(region, regionState.mapLevel, normalizedMode, userId);
  const titlePrefix = normalizedMode === 'boss' ? 'Boss Route' : normalizedMode === 'trainer' ? 'Trainer Route' : 'Wild Route';
  const run = createSpecialRunForUser(userId, {
    mode: 'adventure',
    label: `${region.name} ${titlePrefix}`,
    title: `${region.name} ${titlePrefix}`,
    regionName: region.name,
    regionSlug: region.slug,
    biome: region.biomeHints?.[0] || region.name,
    enemyParty,
    typeFocus: region.preferredTypes?.[0] || SPECIES_MAP.get(enemyParty[0]?.speciesId)?.types?.[0] || 'normal',
    encounterKind: normalizedMode === 'boss' ? 'boss' : normalizedMode === 'trainer' ? 'trainer' : 'wild',
    allowCapture: normalizedMode === 'wild',
    introLine: `${titlePrefix} opens in ${region.name} at map level ${regionState.mapLevel}.`,
    extra: {
      source: 'map-adventure',
      regionSlug: region.slug,
      regionName: region.name,
      adventureMode: normalizedMode,
    },
  });
  const current = normalizeMapSearchRegionState(user.meta.mapSearch?.regions?.[region.slug], region);
  user.meta.mapSearch.regions[region.slug] = {
    ...current,
    lastEncounter: `${titlePrefix} opened from the adventure board.`,
    lastResult: `${titlePrefix} launched in ${region.name}.`,
    lastResultTone: normalizedMode === 'boss' ? 'warning' : normalizedMode === 'trainer' ? 'default' : 'success',
    lastRewardLabel: titlePrefix,
    lastRewardTone: normalizedMode === 'boss' ? 'warning' : normalizedMode === 'trainer' ? 'default' : 'success',
    lastRewardDetail: `${titlePrefix} uses your current map level and route progress for scaling.`,
    storySteps: [`You choose the ${titlePrefix.toLowerCase()}.`, `${region.name} opens into a live encounter path.`, 'Adventure begins immediately.'],
    adventureLog: pushMapAdventureLog(current.adventureLog, `${titlePrefix} launched in ${region.name}.`, normalizedMode === 'boss' ? 'warning' : normalizedMode === 'trainer' ? 'default' : 'success', titlePrefix),
    lastSearchAt: nowIso(),
  };
  appendActivityLog(user.meta, `${region.name} ${titlePrefix.toLowerCase()} launched.`);
  saveUserMeta(userId, user.meta);
  return run;
}

function normalizedGymWins(meta) {

  return { ...(meta?.gymWins || {}) };
}
function nextGymSpotlight(user) {
  const gymWins = normalizedGymWins(user.meta);
  const unlockLevel = worldUnlockLevel(user);
  for (let leagueIndex = 0; leagueIndex < GYM_LEAGUES.length; leagueIndex += 1) {
    if (unlockLevel < leagueIndex + 1) {
      break;
    }
    const league = GYM_LEAGUES[leagueIndex];
    for (const leader of league.leaders) {
      const slug = `${league.slug}-leader-${leader.slug}`;
      if (!gymWins[slug]) {
        return {
          kind: 'gym',
          title: `${league.name} Gym Call`,
          label: `${leader.name} wants a challenger`,
          description: `${leader.badgeName} is up for grabs before the board rotates.`,
          ctaLabel: 'Challenge Gym',
          tone: leader.type,
          actionPath: '/gyms/start',
          fields: { battleSlug: slug },
        };
      }
    }
    const leadersCleared = league.leaders.every((leader) => gymWins[`${league.slug}-leader-${leader.slug}`]);
    if (!leadersCleared) {
      continue;
    }
    for (const member of league.eliteFour) {
      const slug = `${league.slug}-elite-${member.slug}`;
      if (!gymWins[slug]) {
        return {
          kind: 'elite',
          title: `${league.name} Elite Signal`,
          label: `${member.name} is waiting`,
          description: `${league.name}'s Elite Four room opened up. Strike before rotation.`,
          ctaLabel: 'Enter Elite Room',
          tone: member.type,
          actionPath: '/gyms/start',
          fields: { battleSlug: slug },
        };
      }
    }
    const eliteCleared = league.eliteFour.every((member) => gymWins[`${league.slug}-elite-${member.slug}`]);
    const championSlug = `${league.slug}-champion-${league.champion.slug}`;
    if (eliteCleared && !gymWins[championSlug]) {
      return {
        kind: 'champion',
        title: `${league.name} Champion Alert`,
        label: `${league.champion.name} opened the title room`,
        description: `${league.champion.title} is live while this banner is active.`,
        ctaLabel: 'Fight Champion',
        tone: league.champion.type,
        actionPath: '/gyms/start',
        fields: { battleSlug: championSlug },
      };
    }
  }
  return null;
}

function buildTimedSpotlight(user, world) {
  const botDeck = buildBotChallengeDeck();
  const options = [];
  const gymSpotlight = nextGymSpotlight(user);
  if (gymSpotlight) {
    options.push(gymSpotlight);
  }
  options.push({
    kind: 'boss',
    title: 'Daily Boss Sighting',
    label: `${world.dailyBoss?.name || 'Astravault Omega'} breached ${world.activeRegion.name}`,
    description: `A timed alpha interception is open in ${world.activeRegion.name}.`,
    ctaLabel: 'Intercept Boss',
    tone: world.dailyBoss?.types?.[0] || 'warning',
    actionPath: '/maps/adventure',
    fields: { regionSlug: world.activeRegion.slug, adventureMode: 'boss' },
  });
  const bot = botDeck[Math.floor(world.clock.totalMinutes / 10 + user.id) % Math.max(1, botDeck.length)];
  options.push({
    kind: 'arena',
    title: 'Arena Pop-Up',
    label: `${bot.name} flashed across the board`,
    description: `${bot.format} is active for this timed challenger slot.`,
    ctaLabel: 'Enter Arena',
    tone: 'warning',
    actionPath: '/social/challenge',
    fields: { source: 'bot', value: bot.slug },
  });
  const slot = Math.floor(world.clock.totalMinutes / 10);
  const chosen = options[slot % Math.max(1, options.length)];
  return {
    ...chosen,
    slot,
    minutesRemaining: 10 - (world.clock.minute % 10),
    expiresAtLabel: `${10 - (world.clock.minute % 10)}m left`,
  };
}

export function getHubState(userId) {
  pruneLegacyStorageEntries(userId);
  ensureStarterDraftCandidates(userId);
  const user = getUserById(userId);
  const collection = getCollection(userId);
  const progression = trainerProgressionSummary(user);
  const missions = buildMissionSnapshots(user.meta);
  if (missions.changed) {
    saveUserMeta(userId, user.meta);
  }
  const leaderboard = buildLeaderboardEntries(userId, 8);
  const seenSpeciesIds = markSpeciesSeen(userId, collection.map((entry) => entry.monster.speciesId));
  const caughtSpeciesIds = normalizeSpeciesIds(collection.map((entry) => entry.monster.speciesId));
  const visibleCollection = collection.filter((entry) => !isHiddenLegacyStarter(entry.monster));
  const eligibleCollection = persistentEligibleCollectionEntries(visibleCollection);
  const validIds = collectionIdSet(eligibleCollection);
  let metaDirty = false;
  const partyIds = normalizePartyCollectionIds(user.meta.partyCollectionIds, validIds);
  if (JSON.stringify(partyIds) !== JSON.stringify(user.meta.partyCollectionIds || [])) {
    user.meta.partyCollectionIds = partyIds;
    metaDirty = true;
  }
  const normalizedPartnerCollectionId = validIds.includes(Number(user.meta.partnerCollectionId || 0))
    ? Number(user.meta.partnerCollectionId)
    : null;
  if (normalizedPartnerCollectionId !== Number(user.meta.partnerCollectionId || 0)) {
    user.meta.partnerCollectionId = normalizedPartnerCollectionId;
    metaDirty = true;
  }
  if (metaDirty) {
    saveUserMeta(userId, user.meta);
  }
  const world = getWorldState(userId);
  const starterCandidates = visibleCollection.filter((entry) => isStarterCandidateMonster(entry.monster));
  const capturedCollection = sortCollectionEntriesForDisplay(
    visibleCollection.filter((entry) => !isStarterCandidateMonster(entry.monster)),
    { partyIds, partnerCollectionId: normalizedPartnerCollectionId },
  );
  const active = getActiveRun(userId);
  const partnerEntry = normalizedPartnerCollectionId ? visibleCollection.find((entry) => entry.id === normalizedPartnerCollectionId) || null : null;
  const partyEntries = partyIds.map((id) => capturedCollection.find((entry) => entry.id === id) || null);
  const pcBoxes = PC_BOX_LABELS.map((boxTag) => ({
    name: boxTag,
    entries: capturedCollection.filter((entry) => (entry.monster.boxTag || PC_BOX_LABELS[0]) === boxTag),
  }));
  return {
    user,
    world,
    identity: {
      sprite: PLAYER_SPRITE_MAP.get(user.meta.avatarSlug) || PLAYER_SPRITES[0],
      sprites: PLAYER_SPRITES,
      spriteBonus: trainerSpriteBonus(user.meta.avatarSlug) || null,
      spriteBonuses: PLAYER_SPRITE_BONUS_MAP,
      partner: partnerEntry,
      incubator: incubatorView(user.meta),
      trainerGear: trainerGearStateView(user.meta),
      trainerBonuses: trainerGearBonuses(user.meta),
    },
    partySlots: partyEntries,
    pcBoxes,
    activityLog: Array.isArray(user.meta.activityLog) ? user.meta.activityLog : [],
    progression,
    missions,
    leaderboard,
    arenaRecord: normalizeArenaRecord(user.meta),
    arenaLadder: arenaRankState(user.meta),
    activityStats: {
      miningTrips: Number(user.meta.miningTrips || 0),
      diceGames: Number(user.meta.diceGames || 0),
      diceWins: Number(user.meta.diceWins || 0),
      auraGambles: Number(normalizedMiniGameStats(user.meta).auraGambles || 0),
      gambleJackpots: Number(normalizedMiniGameStats(user.meta).gambleJackpots || 0),
    },
    cooldowns: miniGameCooldownsRemaining(normalizedMiniGameStats(user.meta)),
    allCollectionEntries: collection,
    collection: capturedCollection,
    favoriteEntries: sortCollectionEntriesForDisplay(
      capturedCollection.filter((entry) => entry.favorite),
      { partyIds, partnerCollectionId: normalizedPartnerCollectionId },
    ),
    seenSpeciesIds,
    caughtSpeciesIds,
    starterPool: starterCandidates,
    starterCandidates,
    starterReserveCount: starterCandidates.length,
    capturedCollection,
    starterDrafts: buildStarterDrafts().map((draft) => ({
      ...draft,
      starters: draft.starters.map((starter) => ({
        ...starter,
        entry: starterCandidates.find((entry) => entry.monster.speciesId === starter.id) || null,
      })),
    })),
    activeRun: active?.run || null,
    persistentInventory: getPersistentInventory(userId),
    spotlightMarket: world.marketRotation.items,
    challengeSpotlight: buildTimedSpotlight(user, world),
    dailyBoss: world.dailyBoss,
    lastRuns: db.prepare('SELECT mode, status, summary_json, created_at, updated_at FROM runs WHERE user_id = ? ORDER BY id DESC LIMIT 6').all(userId)
      .map((row) => ({
        mode: row.mode,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        summary: readJson(row.summary_json, null),
      })),
  };
}

export function getTrainerCardState(userId) {
  const state = getHubState(userId);
  const favoriteMonster = state.favoriteEntries[0]?.monster || state.capturedCollection[0]?.monster || state.starterPool[0]?.monster || null;
  return {
    ...state,
    favoriteMonster,
    leaderboard: buildLeaderboardEntries(userId, 12),
    badgesEarned: Object.keys(normalizedGymWins(state.user.meta)).length,
  };
}
export function purchasePersistentItem(userId, itemSlug, quantity = 1) {
  const user = getUserById(userId);
  const item = ITEM_MAP.get(itemSlug);
  if (!user || !item) {
    throw new Error('Item not found.');
  }
  if (item.marketEnabled === false) {
    throw new Error('That item is not sold in the guild market yet.');
  }
  const normalizedQuantity = [1, 3, 5, 10].includes(Number(quantity)) ? Number(quantity) : 1;
  const unitPrice = persistentItemUnitPrice(item, userId);
  const totalPrice = unitPrice * normalizedQuantity;
  if (user.cash < totalPrice) {
    throw new Error('Not enough account cash.');
  }
  db.prepare('UPDATE users SET cash = ? WHERE id = ?').run(user.cash - totalPrice, userId);
  addInventory(userId, itemSlug, normalizedQuantity);
  bumpProgressStat(user.meta, 'marketPurchases', normalizedQuantity);
  applyTrainerExperience(user.meta, 12 * normalizedQuantity);
  saveUserMeta(userId, user.meta);
  return getUserById(userId);
}





































































