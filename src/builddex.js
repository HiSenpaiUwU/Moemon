import { CONTENT } from './core.js';

const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
const STAT_LABELS = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
const MOVE_UNLOCKS = [1, 4, 7, 10, 13, 16, 19, 22, 25, 29, 33, 37, 41, 46, 51, 56, 61, 67, 73, 79, 85, 91, 96, 100];
const HOLD_ITEM_SLUGS = [
  'leftovers',
  'life-orb',
  'choice-band',
  'choice-specs',
  'choice-scarf',
  'assault-vest',
  'focus-sash',
  'expert-belt',
  'muscle-band',
  'wise-glasses',
  'scope-lens',
  'shell-bell',
  'big-root',
  'rocky-helmet',
  'eviolite',
  'covert-cloak',
  'weakness-policy',
  'wide-lens',
  'clear-amulet',
  'ability-shield',
  'power-bracer',
  'guard-talisman',
  'mind-ribbon',
  'spirit-locket',
  'rush-boots',
  'quick-claw',
  'kings-rock',
];
const HOLD_ITEM_POOL = HOLD_ITEM_SLUGS.map((slug) => CONTENT.itemMap.get(slug)).filter(Boolean);

function statTotal(stats) {
  const safe = stats || {};
  return STAT_KEYS.reduce((sum, key) => sum + Number(safe[key] || 0), 0);
}

function titleLabel(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function generationForSpecies(species) {
  const familyIndex = Number(species?.family || species?.id || 1);
  return Math.max(1, Math.min(6, Math.ceil(familyIndex / 31)));
}

function moveUnlockLevel(species, index) {
  const stageShift = species?.stage === 1 ? 0 : species?.stage === 2 ? -4 : species?.stage === 3 ? -8 : -12;
  return Math.max(1, Math.min(100, (MOVE_UNLOCKS[index] || 100) + stageShift));
}

function orderedStats(stats) {
  return STAT_KEYS
    .map((key) => ({ key, value: Number(stats?.[key] || 0), label: STAT_LABELS[key] }))
    .sort((left, right) => right.value - left.value || left.key.localeCompare(right.key));
}

function findNature(up, down) {
  return CONTENT.natures.find((nature) => nature.up === up && nature.down === down) || null;
}

function neutralNature() {
  return CONTENT.natures.find((nature) => !nature.up && !nature.down) || CONTENT.natures[0] || null;
}

function inferRoleProfile(species) {
  const stats = species.baseStats || {};
  const total = statTotal(stats);
  const ordered = orderedStats(stats);
  const offense = Math.max(Number(stats.atk || 0), Number(stats.spa || 0));
  const bulk = Number(stats.hp || 0) + Math.max(Number(stats.def || 0), Number(stats.spd || 0));
  const speed = Number(stats.spe || 0);
  const attackAxis = stats.atk >= stats.spa + 12 ? 'physical' : stats.spa >= stats.atk + 12 ? 'special' : 'mixed';
  const fast = speed >= Math.max(88, offense - 14);
  const bulky = bulk >= 175;
  let roleKey = 'balanced-pivot';
  let roleLabel = 'Balanced Pivot';
  let plan = 'Play around safe switch cycles, flexible coverage, and steady pressure.';

  if (attackAxis === 'physical') {
    if (fast) {
      roleKey = 'physical-sweeper';
      roleLabel = 'Physical Sweeper';
      plan = 'Pressure early with speed, force trades, and keep momentum with your strongest physical STAB.';
    } else if (bulky) {
      roleKey = 'physical-bruiser';
      roleLabel = 'Physical Bruiser';
      plan = 'Absorb a hit, trade heavy damage back, and use bulk to stay on the field.';
    } else {
      roleKey = 'physical-breaker';
      roleLabel = 'Physical Breaker';
      plan = 'Punch holes with strong physical swings and avoid long drawn-out exchanges.';
    }
  } else if (attackAxis === 'special') {
    if (fast) {
      roleKey = 'special-sweeper';
      roleLabel = 'Special Sweeper';
      plan = 'Push tempo with fast special pressure and punish slower teams before they stabilize.';
    } else if (bulky) {
      roleKey = 'special-bruiser';
      roleLabel = 'Special Bruiser';
      plan = 'Use your bulk to earn extra turns and convert them into repeated special damage.';
    } else {
      roleKey = 'special-breaker';
      roleLabel = 'Special Breaker';
      plan = 'Break defensive lines with raw special power and coverage.';
    }
  } else if (fast) {
    roleKey = 'mixed-tempo';
    roleLabel = 'Mixed Tempo';
    plan = 'Mix physical and special pressure so opponents cannot answer with one wall.';
  }

  if (bulky && offense <= 102) {
    if (Number(stats.def || 0) >= Number(stats.spd || 0)) {
      roleKey = 'physical-wall';
      roleLabel = 'Physical Wall';
      plan = 'Anchor the fight, sponge physical hits, and slow the pace with utility.';
    } else {
      roleKey = 'special-wall';
      roleLabel = 'Special Wall';
      plan = 'Check special attackers, soak pressure, and win through sustain plus control.';
    }
  }

  return {
    attackAxis,
    fast,
    bulky,
    roleKey,
    roleLabel,
    plan,
    total,
    offense,
    bulk,
    speed,
    stageLabel: species.stage === 1 ? 'Base form' : species.stage === 2 ? 'Mid evolution' : species.stage === 3 ? 'Final form' : 'Ascended form',
    statOrder: ordered,
  };
}

function chooseNature(profile) {
  if (profile.roleKey === 'physical-wall') {
    return findNature('def', 'spa') || findNature('def', 'atk') || neutralNature();
  }
  if (profile.roleKey === 'special-wall') {
    return findNature('spd', 'atk') || findNature('spd', 'spa') || neutralNature();
  }
  if (profile.attackAxis === 'physical') {
    return profile.fast
      ? (findNature('spe', 'spa') || findNature('atk', 'spa') || neutralNature())
      : (findNature('atk', 'spa') || findNature('def', 'spa') || neutralNature());
  }
  if (profile.attackAxis === 'special') {
    return profile.fast
      ? (findNature('spe', 'atk') || findNature('spa', 'atk') || neutralNature())
      : (findNature('spa', 'atk') || findNature('spd', 'atk') || neutralNature());
  }
  return profile.fast
    ? (findNature('spe', 'def') || findNature('spe', 'spd') || neutralNature())
    : (findNature('atk', 'spd') || findNature('spa', 'def') || neutralNature());
}

function scoreMove(move, species, profile) {
  let score = Number(move.tier || 0) * 30;
  if (move.category === 'status') {
    score += profile.bulky ? 40 : 18;
  } else {
    score += Number(move.power || 0);
    if (species.types.includes(move.type)) {
      score += 38;
    }
    if (profile.attackAxis !== 'mixed') {
      score += move.category === profile.attackAxis ? 26 : -10;
    } else {
      score += 12;
    }
  }
  if (move.priority > 0) {
    score += profile.fast ? 10 : 18;
  }
  if (Number(move.accuracy || 100) < 90) {
    score -= 6;
  }
  if (/buff|heal|weather|guard|screen|seed/.test(String(move.effect || ''))) {
    score += profile.bulky ? 16 : 8;
  }
  if (/paralyze|burn|poison|sleep|freeze/.test(String(move.effect || ''))) {
    score += 11;
  }
  if (/high damage|special attack|attack break|speed control/i.test(String(move.role || ''))) {
    score += 8;
  }
  return score;
}

function selectBuildMoves(species, profile) {
  const learnsetRows = (species.movePool || []).map((moveId, index) => {
    const move = CONTENT.moveMap.get(moveId);
    if (!move) {
      return null;
    }
    return {
      id: move.id,
      name: move.name,
      type: move.type,
      category: move.category,
      role: move.role || (move.category === 'status' ? 'Support' : 'Attack'),
      power: move.power,
      accuracy: move.accuracy,
      pp: move.pp,
      maxPp: move.pp,
      priority: move.priority || 0,
      effect: move.effect || 'damage',
      tier: move.tier || 1,
      description: move.description,
      unlockLevel: moveUnlockLevel(species, index),
      score: scoreMove(move, species, profile),
    };
  }).filter(Boolean);

  const rankedMoves = [...learnsetRows].sort((left, right) => right.score - left.score || left.unlockLevel - right.unlockLevel || left.id - right.id);
  const attacks = rankedMoves.filter((row) => row.category !== 'status');
  const stabAttacks = attacks.filter((row) => species.types.includes(row.type));
  const matchingAttacks = profile.attackAxis === 'mixed' ? attacks : attacks.filter((row) => row.category === profile.attackAxis);
  const supportMoves = rankedMoves.filter((row) => row.category === 'status');
  const used = new Set();
  const coreMoves = [];
  const pick = (row) => {
    if (!row || used.has(row.id)) {
      return;
    }
    used.add(row.id);
    coreMoves.push(row);
  };

  pick(stabAttacks.find((row) => profile.attackAxis === 'mixed' || row.category === profile.attackAxis) || stabAttacks[0] || matchingAttacks[0] || attacks[0]);
  pick(matchingAttacks.find((row) => !used.has(row.id) && row.type !== coreMoves[0]?.type) || matchingAttacks.find((row) => !used.has(row.id)) || attacks.find((row) => !used.has(row.id)));
  if (profile.roleKey.includes('wall') || profile.roleKey.includes('bruiser')) {
    pick(supportMoves.find((row) => !used.has(row.id)) || attacks.find((row) => !used.has(row.id)));
    pick(supportMoves.find((row) => !used.has(row.id) && row.effect !== coreMoves[2]?.effect) || attacks.find((row) => !used.has(row.id)));
  } else {
    pick(supportMoves.find((row) => !used.has(row.id)) || attacks.find((row) => !used.has(row.id)));
    pick(attacks.find((row) => !used.has(row.id) && row.type !== coreMoves[0]?.type) || rankedMoves.find((row) => !used.has(row.id)));
  }
  while (coreMoves.length < 4) {
    pick(rankedMoves.find((row) => !used.has(row.id)));
  }

  const flexMoves = rankedMoves.filter((row) => !used.has(row.id)).slice(0, 6);
  return {
    coreMoves,
    flexMoves,
    allMoves: [...learnsetRows].sort((left, right) => left.unlockLevel - right.unlockLevel || right.score - left.score || left.id - right.id),
    supportCount: supportMoves.length,
    lowPowerCount: attacks.filter((row) => Number(row.power || 0) <= 60).length,
    critLean: rankedMoves.filter((row) => /crit/i.test(String(row.role || '')) || /crit/i.test(String(row.effect || ''))).length,
    weatherCount: supportMoves.filter((row) => /^weather-/.test(String(row.effect || ''))).length,
    inaccurateCount: attacks.filter((row) => Number(row.accuracy || 100) < 90).length,
    drainCount: attacks.filter((row) => /drain/i.test(String(row.effect || ''))).length,
  };
}

function abilityScore(abilitySlug, species, profile, moveBundle) {
  let score = 8;
  switch (abilitySlug) {
    case 'adaptability':
      score += 34 + moveBundle.coreMoves.filter((row) => species.types.includes(row.type) && row.category !== 'status').length * 5;
      break;
    case 'prism-surge':
      score += 36 + moveBundle.coreMoves.filter((row) => species.types.includes(row.type) && row.category !== 'status').length * 5;
      break;
    case 'technician':
      score += 12 + moveBundle.lowPowerCount * 8;
      break;
    case 'sniper':
      score += 10 + moveBundle.critLean * 10;
      break;
    case 'regenerator':
      score += (profile.bulky ? 24 : 10) + moveBundle.supportCount * 4;
      break;
    case 'multiscale':
      score += profile.bulky ? 24 : 12;
      break;
    case 'sturdy':
      score += profile.fast ? 20 : 16;
      break;
    case 'magic-guard':
      score += 22;
      break;
    case 'swift-swim':
      score += species.types.includes('water') ? 18 : 10;
      score += moveBundle.weatherCount ? 8 : 0;
      break;
    case 'chlorophyll':
      score += species.types.includes('grass') || species.types.includes('fire') ? 18 : 10;
      score += moveBundle.weatherCount ? 8 : 0;
      break;
    case 'guts':
      score += profile.attackAxis === 'physical' ? 22 : 6;
      break;
    case 'serene-grace':
      score += 16;
      break;
    case 'levitate':
      score += 18;
      break;
    case 'pressure':
      score += profile.bulky ? 16 : 10;
      break;
    case 'battle-aura':
      score += 12;
      break;
    default:
      score += 10;
      break;
  }
  if (abilitySlug === species.hiddenAbilitySlug) {
    score += 2;
  }
  return score;
}

function chooseAbility(species, profile, moveBundle) {
  const options = [...new Set([...(species.abilityPool || []), species.hiddenAbilitySlug].filter(Boolean))]
    .map((slug) => ({
      slug,
      info: CONTENT.abilityMap.get(slug) || { slug, name: titleLabel(slug.replace(/-/g, ' ')), description: '' },
      score: abilityScore(slug, species, profile, moveBundle),
    }))
    .sort((left, right) => right.score - left.score || left.info.name.localeCompare(right.info.name));
  return {
    primary: options[0]?.info || null,
    alternatives: options.slice(1, 3).map((entry) => entry.info),
  };
}

function itemScore(item, species, profile, moveBundle, ability) {
  let score = 4;
  switch (item.slug) {
    case 'eviolite':
      score += species.evolvesTo ? (profile.bulky ? 46 : 30) : -8;
      break;
    case 'leftovers':
      score += profile.bulky ? 34 : 14;
      break;
    case 'rocky-helmet':
      score += profile.roleKey.includes('wall') ? 30 : 10;
      break;
    case 'life-orb':
      score += moveBundle.supportCount <= 1 ? 34 : 18;
      break;
    case 'choice-band':
      score += profile.attackAxis === 'physical' && moveBundle.supportCount === 0 ? 38 : 8;
      break;
    case 'choice-specs':
      score += profile.attackAxis === 'special' && moveBundle.supportCount === 0 ? 38 : 8;
      break;
    case 'choice-scarf':
      score += profile.fast ? 18 : 30;
      score += moveBundle.supportCount ? -6 : 0;
      break;
    case 'assault-vest':
      score += moveBundle.supportCount === 0 ? 30 : -6;
      break;
    case 'focus-sash':
      score += !profile.bulky && profile.fast ? 32 : 12;
      break;
    case 'expert-belt':
      score += moveBundle.supportCount <= 1 ? 24 : 14;
      break;
    case 'muscle-band':
      score += profile.attackAxis === 'physical' ? 24 : 4;
      break;
    case 'wise-glasses':
      score += profile.attackAxis === 'special' ? 24 : 4;
      break;
    case 'scope-lens':
      score += ability?.slug === 'sniper' ? 34 : 10 + moveBundle.critLean * 6;
      break;
    case 'shell-bell':
      score += 14 + moveBundle.drainCount * 4;
      break;
    case 'big-root':
      score += moveBundle.drainCount ? 30 : -6;
      break;
    case 'weakness-policy':
      score += profile.bulky ? 24 : 12;
      break;
    case 'wide-lens':
      score += moveBundle.inaccurateCount ? 24 : 4;
      break;
    case 'clear-amulet':
      score += profile.attackAxis === 'physical' || profile.bulky ? 20 : 8;
      break;
    case 'ability-shield':
      score += ['adaptability', 'prism-surge', 'regenerator', 'magic-guard', 'multiscale'].includes(ability?.slug) ? 20 : 8;
      break;
    case 'power-bracer':
      score += profile.attackAxis === 'physical' ? 18 : 6;
      break;
    case 'guard-talisman':
      score += profile.roleKey === 'physical-wall' ? 18 : 6;
      break;
    case 'mind-ribbon':
      score += profile.attackAxis === 'special' ? 18 : 6;
      break;
    case 'spirit-locket':
      score += profile.roleKey === 'special-wall' ? 18 : 6;
      break;
    case 'rush-boots':
      score += profile.fast ? 18 : 6;
      break;
    case 'quick-claw':
      score += !profile.fast ? 16 : 6;
      break;
    case 'kings-rock':
      score += 12;
      break;
    default:
      break;
  }
  return score;
}

function chooseItems(species, profile, moveBundle, ability) {
  const ranked = HOLD_ITEM_POOL
    .map((item) => ({ item, score: itemScore(item, species, profile, moveBundle, ability) }))
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name));
  return {
    primary: ranked[0]?.item || null,
    alternatives: ranked.slice(1, 4).map((entry) => entry.item),
  };
}

function evolutionTargets(species) {
  const options = [];
  if (species?.evolvesTo) {
    const target = CONTENT.speciesMap.get(species.evolvesTo);
    if (target) {
      options.push({ slug: target.slug, name: target.name, via: `Lv ${species.evolveLevel || 0}` });
    }
  }
  Object.entries(species?.stoneEvolutionMap || {}).forEach(([stoneSlug, targetId]) => {
    const target = CONTENT.speciesMap.get(targetId);
    const stone = CONTENT.itemMap.get(stoneSlug);
    if (target && stone && !options.some((entry) => entry.slug === target.slug && entry.via === stone.name)) {
      options.push({ slug: target.slug, name: target.name, via: stone.name });
    }
  });
  return options;
}

function buildGuideNotes(species, profile, nature, ability, items, moveBundle) {
  const notes = [];
  if (species.evolvesTo) {
    const target = CONTENT.speciesMap.get(species.evolvesTo);
    if (target) {
      notes.push(`This form still scales upward. Re-check the build when it evolves into ${target.name}.`);
    }
  }
  if (species.hiddenAbilitySlug && ability?.slug !== species.hiddenAbilitySlug) {
    const hidden = CONTENT.abilityMap.get(species.hiddenAbilitySlug);
    if (hidden) {
      notes.push(`Hidden ability option: ${hidden.name} can open a different endgame ceiling later on.`);
    }
  }
  if (items.primary?.slug === 'eviolite') {
    notes.push('Eviolite is the cleanest bridge item here while this species can still evolve.');
  }
  if (moveBundle.supportCount >= 2) {
    notes.push('The learnset has enough utility to pivot between pressure and control without feeling one-note.');
  }
  if (profile.roleKey.includes('wall')) {
    notes.push('Win through positioning, sustain, and forcing awkward trades rather than trying to sweep outright.');
  }
  if (nature?.up) {
    notes.push(`${nature.name} is recommended to lean even harder into ${STAT_LABELS[nature.up]}.`);
  }
  return notes.slice(0, 4);
}

function blankSpread(value = 0) {
  return Object.fromEntries(STAT_KEYS.map((key) => [key, value]));
}

function compactEvSummary(spread) {
  return STAT_KEYS
    .filter((key) => Number(spread?.[key] || 0) > 0)
    .map((key) => `${STAT_LABELS[key]} ${Number(spread[key] || 0)}`)
    .join(' / ') || 'No EV focus';
}

function compactIvSummary(spread) {
  const custom = STAT_KEYS.filter((key) => Number(spread?.[key] ?? 31) !== 31);
  return custom.length
    ? ['31 all', ...custom.map((key) => `${STAT_LABELS[key]} ${Number(spread[key] || 0)}`)].join(' / ')
    : '31 all';
}

function spreadHighlights(spread, prefix, fallback = 'Standard line') {
  const entries = STAT_KEYS
    .map((key) => ({ key, value: Number(spread?.[key] || 0), label: STAT_LABELS[key] }))
    .filter((entry) => entry.value > 0)
    .sort((left, right) => right.value - left.value || left.key.localeCompare(right.key));
  if (!entries.length) {
    return [{ key: 'none', value: 0, label: `${prefix} ${fallback}` }];
  }
  return entries.slice(0, 3).map((entry) => ({ ...entry, label: `${prefix} ${entry.label} ${entry.value}` }));
}

function primaryOffenseStat(profile, species) {
  if (profile.attackAxis === 'physical') {
    return 'atk';
  }
  if (profile.attackAxis === 'special') {
    return 'spa';
  }
  return Number(species?.baseStats?.atk || 0) >= Number(species?.baseStats?.spa || 0) ? 'atk' : 'spa';
}

function preferredBulkStat(species) {
  return Number(species?.baseStats?.def || 0) >= Number(species?.baseStats?.spd || 0) ? 'def' : 'spd';
}

function recommendEvSpread(species, profile) {
  const spread = blankSpread(0);
  const offenseStat = primaryOffenseStat(profile, species);
  const otherOffenseStat = offenseStat === 'atk' ? 'spa' : 'atk';
  const bulkStat = preferredBulkStat(species);
  let rationale = 'Spread the EVs into the stats this role actually uses.';

  if (profile.roleKey === 'physical-wall') {
    spread.hp = 252;
    spread.def = 252;
    spread.spd = 4;
    rationale = 'Max HP and Defense first so this wall can soak physical pressure and still keep a small special cushion.';
  } else if (profile.roleKey === 'special-wall') {
    spread.hp = 252;
    spread.spd = 252;
    spread.def = 4;
    rationale = 'Max HP and Special Defense first so this wall can stabilize against special pressure.';
  } else if (profile.attackAxis === 'mixed') {
    if (profile.fast) {
      spread.spe = 252;
      spread[offenseStat] = 128;
      spread[otherOffenseStat] = 128;
      rationale = 'Max Speed first, then split the attacking EVs so both sides of the movepool stay live.';
    } else if (profile.bulky) {
      spread.hp = 252;
      spread[offenseStat] = 128;
      spread[otherOffenseStat] = 128;
      rationale = 'Max HP first, then split the attacking EVs so the build can trade from both sides without feeling flimsy.';
    } else {
      spread[offenseStat] = 252;
      spread[otherOffenseStat] = 128;
      spread.spe = 128;
      rationale = 'Lean into the stronger offense, then keep enough Speed and second-side pressure to stay mixed.';
    }
  } else if (profile.attackAxis === 'physical') {
    if (profile.fast || profile.roleKey.includes('sweeper') || profile.roleKey.includes('breaker')) {
      spread.atk = 252;
      spread.spe = 252;
      spread.hp = 4;
      rationale = 'Max Attack and Speed so the build actually sweeps instead of landing in an awkward middle ground.';
    } else {
      spread.hp = 252;
      spread.atk = 252;
      spread[bulkStat === 'def' ? 'spd' : 'def'] = 4;
      rationale = 'Max HP and Attack so the bruiser profile keeps its damage while earning a sturdier entry.';
    }
  } else if (profile.attackAxis === 'special') {
    if (profile.fast || profile.roleKey.includes('sweeper') || profile.roleKey.includes('breaker')) {
      spread.spa = 252;
      spread.spe = 252;
      spread.hp = 4;
      rationale = 'Max Special Attack and Speed so the build can pressure early and keep tempo.';
    } else {
      spread.hp = 252;
      spread.spa = 252;
      spread[bulkStat === 'def' ? 'spd' : 'def'] = 4;
      rationale = 'Max HP and Special Attack so the special bruiser profile converts bulk into extra damage windows.';
    }
  } else if (profile.fast) {
    spread[offenseStat] = 252;
    spread.spe = 252;
    spread.hp = 4;
    rationale = 'Fast pivots still want Speed maxed plus one real damage stat.';
  } else {
    spread.hp = 252;
    spread[offenseStat] = 252;
    spread[bulkStat === 'def' ? 'spd' : 'def'] = 4;
    rationale = 'Balanced pivots usually get more value from HP plus one pressure stat than from splitting everything thin.';
  }

  return {
    spread,
    summary: compactEvSummary(spread),
    highlights: spreadHighlights(spread, 'EV'),
    rationale,
    total: Object.values(spread).reduce((sum, value) => sum + Number(value || 0), 0),
  };
}

function recommendIvSpread(species, profile) {
  const spread = blankSpread(31);
  let rationale = 'Max every IV for the cleanest all-purpose line.';
  if (profile.attackAxis === 'special' || profile.roleKey === 'special-wall') {
    spread.atk = 0;
    rationale = 'Drop Attack to 0 on special-first builds so the unused stat stays out of the way.';
  } else if (profile.attackAxis === 'physical' || profile.roleKey === 'physical-wall') {
    spread.spa = 0;
    rationale = 'Drop Special Attack to 0 when the build is fully physical or purely defensive on that axis.';
  } else if (profile.attackAxis === 'mixed') {
    rationale = 'Keep 31 IVs across the board so both attacking stats and both defensive checks stay live.';
  }
  return {
    spread,
    summary: compactIvSummary(spread),
    highlights: spreadHighlights(STAT_KEYS.some((key) => Number(spread[key] || 31) !== 31)
      ? Object.fromEntries(STAT_KEYS.map((key) => [key, Number(spread[key] || 31) === 31 ? 0 : Number(spread[key] || 0)]))
      : { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, 'IV', '31 all'),
    rationale,
  };
}

function createBuildGuide(species) {
  const profile = inferRoleProfile(species);
  const nature = chooseNature(profile);
  const moveBundle = selectBuildMoves(species, profile);
  const abilityChoices = chooseAbility(species, profile, moveBundle);
  const itemChoices = chooseItems(species, profile, moveBundle, abilityChoices.primary);
  const evBuild = recommendEvSpread(species, profile);
  const ivBuild = recommendIvSpread(species, profile);
  return {
    speciesId: species.id,
    slug: species.slug,
    name: species.name,
    generation: generationForSpecies(species),
    stage: species.stage,
    stageLabel: profile.stageLabel,
    rarity: species.rarity,
    types: [...(species.types || [])],
    baseStats: { ...(species.baseStats || {}) },
    total: profile.total,
    roleKey: profile.roleKey,
    roleLabel: profile.roleLabel,
    plan: profile.plan,
    attackAxis: profile.attackAxis,
    fast: profile.fast,
    bulky: profile.bulky,
    nature,
    ability: abilityChoices.primary,
    altAbilities: abilityChoices.alternatives,
    item: itemChoices.primary,
    altItems: itemChoices.alternatives,
    evSpread: evBuild.spread,
    evSummary: evBuild.summary,
    evHighlights: evBuild.highlights,
    evRationale: evBuild.rationale,
    evTotal: evBuild.total,
    ivSpread: ivBuild.spread,
    ivSummary: ivBuild.summary,
    ivHighlights: ivBuild.highlights,
    ivRationale: ivBuild.rationale,
    statLeaders: profile.statOrder.slice(0, 3),
    coreMoves: moveBundle.coreMoves,
    flexMoves: moveBundle.flexMoves,
    allMoves: moveBundle.allMoves,
    moveCount: moveBundle.allMoves.length,
    evolutions: evolutionTargets(species),
    notes: buildGuideNotes(species, profile, nature, abilityChoices.primary, itemChoices, moveBundle),
    searchText: `${species.id} ${species.name} ${species.slug} ${species.types.join(' ')} ${profile.roleLabel} ${(abilityChoices.primary?.name || '')} ${(itemChoices.primary?.name || '')} ${evBuild.summary} ${ivBuild.summary}`.toLowerCase(),
  };
}

const BUILD_GUIDES = CONTENT.species.map((species) => createBuildGuide(species)).sort((left, right) => left.speciesId - right.speciesId);
const BUILD_GUIDE_MAP = new Map(BUILD_GUIDES.map((guide) => [guide.slug, guide]));
const BUILD_GUIDE_ID_MAP = new Map(BUILD_GUIDES.map((guide) => [guide.speciesId, guide]));

function resolveGuide(reference) {
  if (reference === undefined || reference === null || reference === '') {
    return null;
  }
  const numeric = Number(reference);
  if (Number.isInteger(numeric) && BUILD_GUIDE_ID_MAP.has(numeric)) {
    return BUILD_GUIDE_ID_MAP.get(numeric);
  }
  return BUILD_GUIDE_MAP.get(String(reference).trim().toLowerCase()) || null;
}

export function getBuildDexState(selectedReference = '') {
  const selected = resolveGuide(selectedReference) || BUILD_GUIDES[0] || null;
  const roleMap = new Map();
  BUILD_GUIDES.forEach((guide) => {
    if (!roleMap.has(guide.roleKey)) {
      roleMap.set(guide.roleKey, { key: guide.roleKey, label: guide.roleLabel, count: 0 });
    }
    roleMap.get(guide.roleKey).count += 1;
  });
  return {
    guides: BUILD_GUIDES,
    selected,
    typeOptions: CONTENT.types.map((type) => ({ key: type, label: titleLabel(type) })),
    roleOptions: [...roleMap.values()].sort((left, right) => left.label.localeCompare(right.label)),
  };
}

