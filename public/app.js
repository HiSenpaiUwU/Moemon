const tabGroups = document.querySelectorAll('[data-tab-group]');

function activateTab(group, target) {
  const buttons = group.querySelectorAll('[data-tab-target]');
  const panels = group.querySelectorAll('[data-tab-panel]');
  buttons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.tabTarget === target);
  });
  panels.forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.tabPanel === target);
  });
}

for (const group of tabGroups) {
  const firstButton = group.querySelector('[data-tab-target]');
  if (firstButton && !group.querySelector('[data-tab-target].is-active')) {
    activateTab(group, firstButton.dataset.tabTarget);
  }
  group.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tab-target]');
    if (!button || !group.contains(button)) {
      return;
    }
    activateTab(group, button.dataset.tabTarget);
  });
}

for (const list of document.querySelectorAll('[data-autoscroll]')) {
  list.scrollTop = list.scrollHeight;
}

function insertTextAtCursor(input, text) {
  const currentValue = input.value || '';
  const start = Number.isInteger(input.selectionStart) ? input.selectionStart : currentValue.length;
  const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : currentValue.length;
  const before = currentValue.slice(0, start);
  const after = currentValue.slice(end);
  const needsSpace = before && !/\s$/.test(before);
  const insertion = `${needsSpace ? ' ' : ''}${text} `;
  input.value = `${before}${insertion}${after}`;
  const nextPosition = before.length + insertion.length;
  if (typeof input.setSelectionRange === 'function') {
    input.setSelectionRange(nextPosition, nextPosition);
  }
  input.focus();
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-emoji-target][data-emoji-value]');
  if (!button) {
    return;
  }
  const input = document.getElementById(button.dataset.emojiTarget);
  if (!input) {
    return;
  }
  const emoji = button.dataset.emojiValue || '';
  insertTextAtCursor(input, emoji);
  const picker = button.closest('details');
  if (picker) {
    picker.open = false;
  }
});

for (const screen of document.querySelectorAll('[data-battle-message]')) {
  const text = screen.dataset.text || screen.textContent || '';
  if (!text) {
    continue;
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    screen.textContent = text;
    continue;
  }
  screen.textContent = '';
  let index = 0;
  const tick = () => {
    index += 1;
    screen.textContent = text.slice(0, index);
    if (index < text.length) {
      window.setTimeout(tick, 16);
    }
  };
  tick();
}

function activateDraft(switcher, slug) {
  switcher.querySelectorAll('.draft-card').forEach((card) => {
    const radio = card.querySelector('[data-draft-radio]');
    card.classList.toggle('is-active', radio?.value === slug);
  });
  switcher.querySelectorAll('[data-draft-panel]').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.draftPanel === slug);
  });
  const activePanel = switcher.querySelector(`[data-draft-panel="${slug}"]`);
  if (!activePanel) {
    return;
  }
  const selectedStarter = activePanel.querySelector('input[name="starter"]:checked');
  if (!selectedStarter) {
    const firstStarter = activePanel.querySelector('input[name="starter"]:not([disabled])');
    if (firstStarter) {
      firstStarter.checked = true;
    }
  }
}

for (const switcher of document.querySelectorAll('[data-draft-switcher]')) {
  const initial = switcher.querySelector('[data-draft-radio]:checked') || switcher.querySelector('[data-draft-radio]');
  if (initial) {
    activateDraft(switcher, initial.value);
  }
  switcher.addEventListener('change', (event) => {
    const radio = event.target.closest('[data-draft-radio]');
    if (!radio || !switcher.contains(radio)) {
      return;
    }
    activateDraft(switcher, radio.value);
  });
}

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && !document.body.classList.contains('motion-reduced')) {
  const ambientNodes = Array.from(document.querySelectorAll('.lab-resident, .region-card, .monster-pulse'));
  if (ambientNodes.length) {
    const cadence = document.body.classList.contains('motion-soft') ? 3200 : 1800;
    window.setInterval(() => {
      const node = ambientNodes[Math.floor(Math.random() * ambientNodes.length)];
      if (!node) {
        return;
      }
      node.classList.add('ambient-pop');
      window.setTimeout(() => node.classList.remove('ambient-pop'), 900);
    }, cadence);
  }
}

function normalizeHttpUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function compactUrlLabel(value) {
  try {
    const parsed = new URL(value);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return value;
  }
}

function initChatComposers() {
  document.querySelectorAll('[data-chat-composer]').forEach((form) => {
    const imageInput = form.querySelector('[data-chat-image-input]');
    const linkInput = form.querySelector('[data-chat-link-input]');
    const labelInput = form.querySelector('[data-chat-link-label]');
    const preview = form.querySelector('[data-chat-preview]');
    const imageWrap = form.querySelector('[data-chat-preview-image-wrap]');
    const image = form.querySelector('[data-chat-preview-image]');
    const linkCard = form.querySelector('[data-chat-preview-link]');
    const linkLabel = form.querySelector('[data-chat-preview-link-label]');
    const linkUrl = form.querySelector('[data-chat-preview-link-url]');
    if (!preview) {
      return;
    }

    const updatePreview = () => {
      const imageValue = normalizeHttpUrl(imageInput?.value || '');
      const linkValue = normalizeHttpUrl(linkInput?.value || '');
      const labelValue = (labelInput?.value || '').trim();
      const hasPreview = !!(imageValue || linkValue);
      preview.hidden = !hasPreview;

      if (imageWrap && image) {
        imageWrap.hidden = !imageValue;
        if (imageValue) {
          image.src = imageValue;
        } else {
          image.removeAttribute('src');
        }
      }

      if (linkCard && linkLabel && linkUrl) {
        linkCard.hidden = !linkValue;
        if (linkValue) {
          linkCard.href = linkValue;
          linkLabel.textContent = labelValue || compactUrlLabel(linkValue);
          linkUrl.textContent = linkValue;
        } else {
          linkCard.removeAttribute('href');
          linkLabel.textContent = 'Link preview';
          linkUrl.textContent = '';
        }
      }
    };

    [imageInput, linkInput, labelInput].forEach((input) => {
      if (!input) {
        return;
      }
      input.addEventListener('input', updatePreview);
      input.addEventListener('change', updatePreview);
    });

    updatePreview();
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function titleLabel(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function statTotal(stats) {
  const safe = stats || {};
  return Number(safe.hp || 0) + Number(safe.atk || 0) + Number(safe.def || 0) + Number(safe.spa || 0) + Number(safe.spd || 0) + Number(safe.spe || 0);
}

function renderBadge(label, tone = 'default') {
  return `<span class="badge badge-${tone}">${escapeHtml(label)}</span>`;
}

function numericId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function readCollectionDashboardData() {
  const node = document.getElementById('collection-dashboard-data');
  if (!node) {
    return null;
  }
  try {
    return JSON.parse(node.textContent || '{}');
  } catch {
    return null;
  }
}

function typeMultiplier(chart, moveType, targetTypes = []) {
  return targetTypes.reduce((multiplier, targetType) => multiplier * (chart?.[moveType]?.[targetType] ?? 1), 1);
}

function formatMultiplier(value) {
  return Number(value.toFixed(2)).toString();
}

function initPokedexFilters() {
  const controls = document.querySelector('[data-dex-controls]');
  const cards = Array.from(document.querySelectorAll('[data-dex-card]'));
  if (!controls || !cards.length) {
    return;
  }
  const searchInput = controls.querySelector('[data-dex-search]');
  const typeSelect = controls.querySelector('[data-dex-type]');
  const generationSelect = controls.querySelector('[data-dex-generation]');
  const minTotalInput = controls.querySelector('[data-dex-min-total]');
  const maxTotalInput = controls.querySelector('[data-dex-max-total]');
  const favoritesOnlyInput = controls.querySelector('[data-dex-favorites-only]');
  const resultCount = document.querySelector('[data-dex-result-count]');

  const applyFilters = () => {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const type = typeSelect?.value || '';
    const generation = generationSelect?.value || '';
    const minTotal = Number(minTotalInput?.value || 0);
    const maxTotal = Number(maxTotalInput?.value || 999);
    const favoritesOnly = !!favoritesOnlyInput?.checked;
    let visibleCount = 0;

    for (const card of cards) {
      const matchesQuery = !query || (card.dataset.search || '').includes(query);
      const cardTypes = (card.dataset.types || '').split(',').filter(Boolean);
      const matchesType = !type || cardTypes.includes(type);
      const matchesGeneration = !generation || card.dataset.gen === generation;
      const total = Number(card.dataset.total || 0);
      const matchesTotal = total >= minTotal && total <= maxTotal;
      const matchesFavorite = !favoritesOnly || card.dataset.favorite === '1';
      const visible = matchesQuery && matchesType && matchesGeneration && matchesTotal && matchesFavorite;
      card.hidden = !visible;
      if (visible) {
        visibleCount += 1;
      }
    }

    if (resultCount) {
      resultCount.textContent = `${visibleCount} entries`;
    }
  };

  [searchInput, typeSelect, generationSelect, minTotalInput, maxTotalInput, favoritesOnlyInput].forEach((input) => {
    if (!input) {
      return;
    }
    input.addEventListener(input.type === 'search' || input.type === 'number' ? 'input' : 'change', applyFilters);
  });

  applyFilters();
}

function initTeamBuilder(dashboard) {
  const root = document.querySelector('[data-team-builder]');
  if (!root || !dashboard) {
    return;
  }
  const slotsNode = root.querySelector('[data-team-slots]');
  const inputs = Array.from(root.querySelectorAll('[data-team-input]'));
  const libraryCards = Array.from(root.querySelectorAll('[data-team-library-card]'));
  const searchInput = root.querySelector('[data-team-search]');
  const countNode = root.querySelector('[data-team-count]');
  const totalNode = root.querySelector('[data-team-total]');
  const averageNode = root.querySelector('[data-team-average]');
  const typesNode = root.querySelector('[data-team-types]');
  const coverageText = root.querySelector('[data-team-coverage-text]');
  const strengthsText = root.querySelector('[data-team-strengths-text]');
  const weaknessesText = root.querySelector('[data-team-weaknesses-text]');
  const collectionById = new Map((dashboard.collection || []).map((entry) => [entry.id, entry]));
  const teamSize = inputs.length || 6;
  const allTypes = dashboard.types || [];
  const chart = dashboard.typeChart || {};
  let draggedIndex = null;
  let team = Array.from({ length: teamSize }, (_, index) => numericId(inputs[index]?.value) || numericId(dashboard.party?.[index]) || null);

  function renderTypeBadges(types) {
    return (types || []).map((type) => renderBadge(titleLabel(type), type)).join(' ');
  }

  function teamMembers() {
    return team.map((id) => collectionById.get(id)).filter(Boolean);
  }

  function analyzeTeam() {
    const members = teamMembers();
    const total = members.reduce((sum, entry) => sum + Number(entry.totalStats || 0), 0);
    const typeCoverage = [...new Set(members.flatMap((entry) => entry.types || []))];
    const matchupRows = allTypes.map((type) => {
      let weak = 0;
      let resist = 0;
      let immune = 0;
      members.forEach((entry) => {
        const multiplier = typeMultiplier(chart, type, entry.types || []);
        if (multiplier === 0) {
          immune += 1;
        } else if (multiplier > 1) {
          weak += 1;
        } else if (multiplier < 1) {
          resist += 1;
        }
      });
      return { type, weak, resist, immune };
    });
    const strengths = matchupRows
      .filter((entry) => entry.resist || entry.immune)
      .sort((left, right) => (right.immune + right.resist) - (left.immune + left.resist) || left.weak - right.weak)
      .slice(0, 4)
      .map((entry) => `${titleLabel(entry.type)} (${entry.immune ? `${entry.immune} immune` : `${entry.resist} resist`})`);
    const weaknesses = matchupRows
      .filter((entry) => entry.weak > Math.max(entry.resist + entry.immune, 0))
      .sort((left, right) => right.weak - left.weak || (left.resist + left.immune) - (right.resist + right.immune))
      .slice(0, 4)
      .map((entry) => `${titleLabel(entry.type)} (${entry.weak} weak)`);
    return {
      filledCount: members.length,
      total,
      average: members.length ? Math.round(total / members.length) : 0,
      typeCount: typeCoverage.length,
      coverage: typeCoverage.length ? typeCoverage.map((type) => titleLabel(type)).join(', ') : 'None yet.',
      strengths: strengths.length ? strengths.join(', ') : 'No standout resistances yet.',
      weaknesses: weaknesses.length ? weaknesses.join(', ') : 'No major overlap yet.',
    };
  }

  function slotMarkup(entry, index) {
    if (!entry) {
      return `
        <article class="team-slot-card" data-team-slot data-slot-index="${index}">
          <div>
            <h3>Slot ${index + 1}</h3>
            <p class="muted">Drop a monster here or use the add buttons from your collection pool.</p>
          </div>
        </article>
      `;
    }
    const initials = escapeHtml((entry.name || entry.speciesName || '??').slice(0, 2).toUpperCase());
    return `
      <article class="team-slot-card is-filled" data-team-slot data-slot-index="${index}" data-team-id="${entry.id}" draggable="true">
        <div class="card-top">
          <div class="identity-hero compact-identity">
            <div class="monster-pulse">${initials}</div>
            <div>
              <h3>${escapeHtml(entry.name)}</h3>
              <p>${renderTypeBadges(entry.types)}</p>
            </div>
          </div>
          ${renderBadge(`Slot ${index + 1}`, 'warning')}
        </div>
        <p class="muted">Total stats ${escapeHtml(entry.totalStats)}</p>
        <div class="button-row gap-top">
          <button class="button ghost" type="button" data-team-remove-slot="${index}">Remove</button>
        </div>
      </article>
    `;
  }

  function renderSlots() {
    if (!slotsNode) {
      return;
    }
    slotsNode.innerHTML = team.map((id, index) => slotMarkup(collectionById.get(id), index)).join('');
  }

  function updateInputs() {
    inputs.forEach((input, index) => {
      input.value = team[index] || '';
    });
  }

  function updateLibrary() {
    const selectedIds = new Set(team.filter(Boolean));
    const filledCount = team.filter(Boolean).length;
    const query = (searchInput?.value || '').trim().toLowerCase();
    for (const card of libraryCards) {
      const entryId = numericId(card.dataset.teamEntryId);
      const addButton = card.querySelector('[data-team-add]');
      const selected = selectedIds.has(entryId);
      if (addButton) {
        addButton.disabled = selected || (filledCount >= teamSize && !selected);
        addButton.textContent = selected ? 'On team' : filledCount >= teamSize ? 'Team full' : 'Add to team';
      }
      const matchesQuery = !query || (card.dataset.search || '').includes(query);
      card.hidden = !matchesQuery;
    }
  }

  function renderAnalysis() {
    const analysis = analyzeTeam();
    if (countNode) {
      countNode.textContent = `${analysis.filledCount}/${teamSize}`;
    }
    if (totalNode) {
      totalNode.textContent = String(analysis.total);
    }
    if (averageNode) {
      averageNode.textContent = String(analysis.average);
    }
    if (typesNode) {
      typesNode.textContent = String(analysis.typeCount);
    }
    if (coverageText) {
      coverageText.textContent = analysis.coverage;
    }
    if (strengthsText) {
      strengthsText.textContent = analysis.strengths;
    }
    if (weaknessesText) {
      weaknessesText.textContent = analysis.weaknesses;
    }
  }

  function sync() {
    updateInputs();
    renderSlots();
    updateLibrary();
    renderAnalysis();
  }

  function addToTeam(entryId) {
    if (!entryId || team.includes(entryId)) {
      return;
    }
    const emptyIndex = team.findIndex((value) => !value);
    if (emptyIndex === -1) {
      return;
    }
    team[emptyIndex] = entryId;
    sync();
  }

  function removeFromSlot(index) {
    if (index < 0 || index >= team.length) {
      return;
    }
    team[index] = null;
    sync();
  }

  root.addEventListener('click', (event) => {
    const addButton = event.target.closest('[data-team-add]');
    if (addButton) {
      addToTeam(numericId(addButton.dataset.teamAdd));
      return;
    }
    const removeButton = event.target.closest('[data-team-remove-slot]');
    if (removeButton) {
      removeFromSlot(Number(removeButton.dataset.teamRemoveSlot));
    }
  });

  if (searchInput) {
    searchInput.addEventListener('input', updateLibrary);
  }

  if (slotsNode) {
    slotsNode.addEventListener('dragstart', (event) => {
      const slot = event.target.closest('[data-team-slot][data-team-id]');
      if (!slot) {
        return;
      }
      draggedIndex = Number(slot.dataset.slotIndex);
      event.dataTransfer.effectAllowed = 'move';
    });
    slotsNode.addEventListener('dragover', (event) => {
      if (event.target.closest('[data-team-slot]')) {
        event.preventDefault();
      }
    });
    slotsNode.addEventListener('drop', (event) => {
      const slot = event.target.closest('[data-team-slot]');
      if (!slot || draggedIndex === null) {
        return;
      }
      event.preventDefault();
      const targetIndex = Number(slot.dataset.slotIndex);
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= team.length || targetIndex === draggedIndex) {
        draggedIndex = null;
        return;
      }
      [team[draggedIndex], team[targetIndex]] = [team[targetIndex], team[draggedIndex]];
      draggedIndex = null;
      sync();
    });
    slotsNode.addEventListener('dragend', () => {
      draggedIndex = null;
    });
  }

  sync();
}

function initBattleSimulator(dashboard) {
  const root = document.querySelector('[data-battle-sim]');
  if (!root || !dashboard) {
    return;
  }
  const playerSelect = root.querySelector('[data-sim-player]');
  const opponentSelect = root.querySelector('[data-sim-opponent]');
  const startButton = root.querySelector('[data-sim-start]');
  const resetButton = root.querySelector('[data-sim-reset]');
  const actionButtons = Array.from(root.querySelectorAll('[data-sim-action]'));
  const statusNode = root.querySelector('[data-sim-status]');
  const logNode = root.querySelector('[data-sim-log]');
  const playerCard = root.querySelector('[data-sim-card="player"]');
  const opponentCard = root.querySelector('[data-sim-card="opponent"]');
  const collectionById = new Map((dashboard.collection || []).map((entry) => [entry.id, entry]));
  const speciesById = new Map((dashboard.species || []).map((entry) => [entry.id, entry]));
  const chart = dashboard.typeChart || {};
  let battle = null;

  function bestAttackType(attacker, defender) {
    const attackTypes = attacker.types?.length ? attacker.types : ['normal'];
    return attackTypes.slice().sort((left, right) => typeMultiplier(chart, right, defender.types || []) - typeMultiplier(chart, left, defender.types || []))[0] || 'normal';
  }

  function makePlayerCombatant(entryId) {
    const entry = collectionById.get(numericId(entryId));
    if (!entry) {
      return null;
    }
    return {
      name: entry.name,
      types: entry.types,
      level: entry.level,
      stats: { ...entry.stats },
      currentHp: entry.stats.hp,
      defending: false,
    };
  }

  function makeOpponentCombatant(speciesId) {
    const species = speciesById.get(numericId(speciesId));
    if (!species) {
      return null;
    }
    return {
      name: species.name,
      types: species.types,
      level: 50,
      stats: {
        hp: Math.max(45, Number(species.baseStats?.hp || 45)),
        atk: Number(species.baseStats?.atk || 40),
        def: Number(species.baseStats?.def || 40),
        spa: Number(species.baseStats?.spa || 40),
        spd: Number(species.baseStats?.spd || 40),
        spe: Number(species.baseStats?.spe || 40),
      },
      currentHp: Math.max(45, Number(species.baseStats?.hp || 45)),
      defending: false,
    };
  }

  function hpPercent(combatant) {
    return Math.max(0, Math.min(100, Math.round((combatant.currentHp / Math.max(1, combatant.stats.hp)) * 100)));
  }

  function renderCombatant(node, combatant, label) {
    if (!node) {
      return;
    }
    if (!combatant) {
      node.innerHTML = `<div class="battle-sim-empty"><p class="muted">${escapeHtml(label)} not selected.</p></div>`;
      return;
    }
    node.innerHTML = `
      <article class="monster-card panelish battle-sim-side">
        <div class="card-top">
          <div>
            <p class="eyebrow">${escapeHtml(label)}</p>
            <h3>${escapeHtml(combatant.name)}</h3>
          </div>
          ${combatant.defending ? renderBadge('Defending', 'default') : ''}
        </div>
        <p>${(combatant.types || []).map((type) => renderBadge(titleLabel(type), type)).join(' ')}</p>
        <div class="health hp-bar"><span style="width:${hpPercent(combatant)}%"></span></div>
        <p class="muted">HP ${Math.max(0, combatant.currentHp)} / ${combatant.stats.hp}</p>
        <p class="muted">Atk ${combatant.stats.atk} - Def ${combatant.stats.def} - Spe ${combatant.stats.spe}</p>
      </article>
    `;
  }

  function renderLog(lines) {
    if (!logNode) {
      return;
    }
    logNode.innerHTML = lines.slice(-8).reverse().map((line, index) => `
      <li class="learnset-row ${index === 0 ? 'is-unlocked' : ''}">
        <strong>Turn note</strong>
        <span>${escapeHtml(line)}</span>
      </li>
    `).join('');
  }

  function updateUi() {
    const running = !!battle && !battle.finished;
    actionButtons.forEach((button) => {
      button.disabled = !running;
    });
    renderCombatant(playerCard, battle?.player || null, 'Your side');
    renderCombatant(opponentCard, battle?.opponent || null, 'Opponent');
    if (statusNode) {
      statusNode.textContent = battle?.status || 'Pick your lead and an opponent, then start a practice match.';
    }
    renderLog(battle?.log || ['Nothing has happened yet.']);
  }

  function pushLog(message) {
    battle.log.push(message);
    battle.status = message;
  }

  function damageAmount(attacker, defender) {
    const attackStat = Math.max(Number(attacker.stats.atk || 0), Number(attacker.stats.spa || 0));
    const defenseStat = Math.max(1, Math.round((Number(defender.stats.def || 0) + Number(defender.stats.spd || 0)) / 2));
    const attackType = bestAttackType(attacker, defender);
    const effectiveness = typeMultiplier(chart, attackType, defender.types || []);
    const stab = (attacker.types || []).includes(attackType) ? 1.2 : 1;
    const guard = defender.defending ? 0.5 : 1;
    const variance = 0.92 + Math.random() * 0.16;
    return {
      attackType,
      effectiveness,
      damage: Math.max(1, Math.floor((((attackStat / defenseStat) * 18) + attacker.level / 3) * stab * effectiveness * guard * variance)),
    };
  }

  function enemyChoice() {
    if (!battle) {
      return 'attack';
    }
    const hpRatio = battle.opponent.currentHp / Math.max(1, battle.opponent.stats.hp);
    if (hpRatio < 0.4 && Math.random() < 0.45) {
      return 'defend';
    }
    return 'attack';
  }

  function performAction(actor, defender, action, actorLabel) {
    if (!battle || battle.finished) {
      return;
    }
    if (action === 'defend') {
      actor.defending = true;
      pushLog(`${actorLabel} braces for the next hit.`);
      return;
    }
    actor.defending = false;
    const result = damageAmount(actor, defender);
    defender.currentHp = Math.max(0, defender.currentHp - result.damage);
    const effectivenessLabel = result.effectiveness >= 2
      ? ' It is super effective.'
      : result.effectiveness > 0 && result.effectiveness < 1
        ? ' It is not very effective.'
        : result.effectiveness === 0
          ? ' It has no effect.'
          : '';
    pushLog(`${actorLabel} attacks with ${titleLabel(result.attackType)} for ${result.damage} damage.${effectivenessLabel}`);
    defender.defending = false;
    if (defender.currentHp <= 0) {
      battle.finished = true;
      pushLog(`${defender.name} faints.`);
    }
  }

  function resolveTurn(playerAction) {
    if (!battle || battle.finished) {
      return;
    }
    const opponentAction = enemyChoice();
    const playerFirst = Number(battle.player.stats.spe || 0) >= Number(battle.opponent.stats.spe || 0);
    const turnOrder = playerFirst
      ? [
          { actor: battle.player, defender: battle.opponent, action: playerAction, label: battle.player.name },
          { actor: battle.opponent, defender: battle.player, action: opponentAction, label: battle.opponent.name },
        ]
      : [
          { actor: battle.opponent, defender: battle.player, action: opponentAction, label: battle.opponent.name },
          { actor: battle.player, defender: battle.opponent, action: playerAction, label: battle.player.name },
        ];

    turnOrder.forEach((step) => {
      if (!battle || battle.finished) {
        return;
      }
      performAction(step.actor, step.defender, step.action, step.label);
    });

    if (battle?.finished) {
      battle.status = battle.player.currentHp > 0 ? 'Practice win secured.' : 'Practice battle lost.';
    }
    updateUi();
  }

  function startBattle() {
    const player = makePlayerCombatant(playerSelect?.value);
    const opponent = makeOpponentCombatant(opponentSelect?.value);
    if (!player || !opponent) {
      return;
    }
    battle = {
      player,
      opponent,
      log: [`${player.name} steps into a practice battle against ${opponent.name}.`],
      status: 'Battle started. Choose Attack or Defend.',
      finished: false,
    };
    updateUi();
  }

  function resetBattle() {
    battle = null;
    updateUi();
  }

  if (startButton) {
    startButton.addEventListener('click', startBattle);
  }
  if (resetButton) {
    resetButton.addEventListener('click', resetBattle);
  }
  actionButtons.forEach((button) => {
    button.addEventListener('click', () => resolveTurn(button.dataset.simAction || 'attack'));
  });

  updateUi();
}

const collectionDashboard = readCollectionDashboardData();
initPokedexFilters();
initTeamBuilder(collectionDashboard);
initBattleSimulator(collectionDashboard);

function initBuildDexFilters() {
  const controls = document.querySelector('[data-build-controls]');
  const cards = Array.from(document.querySelectorAll('[data-build-card]'));
  if (!controls || !cards.length) {
    return;
  }
  const searchInput = controls.querySelector('[data-build-search]');
  const typeInput = controls.querySelector('[data-build-type]');
  const roleInput = controls.querySelector('[data-build-role]');
  const stageInput = controls.querySelector('[data-build-stage]');
  const resultCount = document.querySelector('[data-build-result-count]');

  const applyFilters = () => {
    const query = (searchInput?.value || '').trim().toLowerCase();
    const type = typeInput?.value || '';
    const role = roleInput?.value || '';
    const stage = stageInput?.value || '';
    let visibleCount = 0;

    cards.forEach((card) => {
      const searchText = (card.dataset.search || '').toLowerCase();
      const types = (card.dataset.types || '').split(',').filter(Boolean);
      const matchesQuery = !query || searchText.includes(query);
      const matchesType = !type || types.includes(type);
      const matchesRole = !role || card.dataset.role === role;
      const matchesStage = !stage || card.dataset.stage === stage;
      const visible = matchesQuery && matchesType && matchesRole && matchesStage;
      card.hidden = !visible;
      if (visible) {
        visibleCount += 1;
      }
    });

    if (resultCount) {
      resultCount.textContent = `${visibleCount} entries`;
    }
  };

  [searchInput, typeInput, roleInput, stageInput].forEach((input) => {
    if (!input) {
      return;
    }
    input.addEventListener(input.type === 'search' ? 'input' : 'change', applyFilters);
  });

  applyFilters();
}
function initMarketFilters() {
  const board = document.querySelector('[data-market-board]');
  if (!board) {
    return;
  }
  const controls = board.querySelector('[data-market-controls]');
  const cards = Array.from(board.querySelectorAll('[data-market-card]'));
  if (!controls || !cards.length) {
    return;
  }
  cards.forEach((card, index) => {
    card.dataset.marketOrder = String(index);
  });
  const sections = Array.from(board.querySelectorAll('[data-market-section]'));
  const searchInput = controls.querySelector('[data-market-search]');
  const categoryInput = controls.querySelector('[data-market-category]');
  const sortInput = controls.querySelector('[data-market-sort]');
  const affordableInput = controls.querySelector('[data-market-affordable]');
  const spotlightInput = controls.querySelector('[data-market-spotlight]');
  const countNode = board.querySelector('[data-market-count]');
  const emptyNode = board.querySelector('[data-market-empty]');

  const compareCards = (left, right, sortValue) => {
    const leftPrice = Number(left.dataset.price || 0);
    const rightPrice = Number(right.dataset.price || 0);
    if (sortValue === 'price-asc') {
      return leftPrice - rightPrice || Number(left.dataset.marketOrder || 0) - Number(right.dataset.marketOrder || 0);
    }
    if (sortValue === 'price-desc') {
      return rightPrice - leftPrice || Number(left.dataset.marketOrder || 0) - Number(right.dataset.marketOrder || 0);
    }
    if (sortValue === 'name-asc') {
      return String(left.querySelector('h3')?.textContent || '').localeCompare(String(right.querySelector('h3')?.textContent || ''))
        || Number(left.dataset.marketOrder || 0) - Number(right.dataset.marketOrder || 0);
    }
    return Number(left.dataset.marketOrder || 0) - Number(right.dataset.marketOrder || 0);
  };

  const applyFilters = () => {
    const query = String(searchInput?.value || '').trim().toLowerCase();
    const category = String(categoryInput?.value || '').trim();
    const sortValue = String(sortInput?.value || 'featured');
    const affordableOnly = !!affordableInput?.checked;
    const spotlightOnly = !!spotlightInput?.checked;
    let visibleCount = 0;

    sections.forEach((section) => {
      const results = section.querySelector('[data-market-results]');
      const sectionCards = Array.from(section.querySelectorAll('[data-market-card]'));
      let sectionVisible = 0;
      sectionCards.forEach((card) => {
        const searchText = String(card.dataset.search || '');
        const matchesQuery = !query || searchText.includes(query);
        const matchesCategory = !category || String(card.dataset.category || '') === category;
        const matchesAffordable = !affordableOnly || String(card.dataset.affordable || '0') === '1';
        const matchesSpotlight = !spotlightOnly || String(card.dataset.spotlight || '0') === '1';
        const visible = matchesQuery && matchesCategory && matchesAffordable && matchesSpotlight;
        card.hidden = !visible;
        if (visible) {
          visibleCount += 1;
          sectionVisible += 1;
        }
      });
      sectionCards.slice().sort((left, right) => compareCards(left, right, sortValue)).forEach((card) => {
        results?.appendChild(card);
      });
      section.hidden = sectionVisible === 0;
    });

    if (countNode) {
      countNode.textContent = `${visibleCount} items`;
    }
    if (emptyNode) {
      emptyNode.hidden = visibleCount > 0;
    }
  };

  [searchInput, categoryInput, sortInput, affordableInput, spotlightInput].forEach((input) => {
    if (!input) {
      return;
    }
    input.addEventListener(input.type === 'search' ? 'input' : 'change', applyFilters);
    if (input.type !== 'search') {
      input.addEventListener('input', applyFilters);
    }
  });

  applyFilters();
}
function initRewardShopFilters() {
  const board = document.querySelector('[data-reward-shop-board]');
  if (!board) {
    return;
  }
  const controls = board.querySelector('[data-reward-shop-controls]');
  const results = board.querySelector('[data-reward-shop-results]');
  const cards = Array.from(board.querySelectorAll('[data-reward-shop-card]'));
  if (!controls || !results || !cards.length) {
    return;
  }
  cards.forEach((card, index) => {
    card.dataset.rewardShopOrder = String(index);
  });
  const searchInput = controls.querySelector('[data-reward-shop-search]');
  const categoryInput = controls.querySelector('[data-reward-shop-category]');
  const sortInput = controls.querySelector('[data-reward-shop-sort]');
  const redeemableInput = controls.querySelector('[data-reward-shop-redeemable]');
  const exclusiveInput = controls.querySelector('[data-reward-shop-exclusive]');
  const countNode = board.querySelector('[data-reward-shop-count]');
  const emptyNode = board.querySelector('[data-reward-shop-empty]');

  const compareCards = (left, right, sortValue) => {
    const leftCost = Number(left.dataset.cost || 0);
    const rightCost = Number(right.dataset.cost || 0);
    if (sortValue === 'cost-asc') {
      return leftCost - rightCost || Number(left.dataset.rewardShopOrder || 0) - Number(right.dataset.rewardShopOrder || 0);
    }
    if (sortValue === 'cost-desc') {
      return rightCost - leftCost || Number(left.dataset.rewardShopOrder || 0) - Number(right.dataset.rewardShopOrder || 0);
    }
    if (sortValue === 'name-asc') {
      return String(left.querySelector('h3')?.textContent || '').localeCompare(String(right.querySelector('h3')?.textContent || ''))
        || Number(left.dataset.rewardShopOrder || 0) - Number(right.dataset.rewardShopOrder || 0);
    }
    return Number(left.dataset.rewardShopOrder || 0) - Number(right.dataset.rewardShopOrder || 0);
  };

  const applyFilters = () => {
    const query = String(searchInput?.value || '').trim().toLowerCase();
    const category = String(categoryInput?.value || '').trim();
    const sortValue = String(sortInput?.value || 'featured');
    const redeemableOnly = !!redeemableInput?.checked;
    const exclusiveOnly = !!exclusiveInput?.checked;
    let visibleCount = 0;

    cards.forEach((card) => {
      const searchText = String(card.dataset.search || '');
      const matchesQuery = !query || searchText.includes(query);
      const matchesCategory = !category || String(card.dataset.category || '') === category;
      const matchesRedeemable = !redeemableOnly || String(card.dataset.redeemable || '0') === '1';
      const matchesExclusive = !exclusiveOnly || String(card.dataset.exclusive || '0') === '1';
      const visible = matchesQuery && matchesCategory && matchesRedeemable && matchesExclusive;
      card.hidden = !visible;
      if (visible) {
        visibleCount += 1;
      }
    });

    cards.slice().sort((left, right) => compareCards(left, right, sortValue)).forEach((card) => {
      results.appendChild(card);
    });

    if (countNode) {
      countNode.textContent = `${visibleCount} rewards`;
    }
    if (emptyNode) {
      emptyNode.hidden = visibleCount > 0;
    }
  };

  [searchInput, categoryInput, sortInput, redeemableInput, exclusiveInput].forEach((input) => {
    if (!input) {
      return;
    }
    input.addEventListener(input.type === 'search' ? 'input' : 'change', applyFilters);
    if (input.type !== 'search') {
      input.addEventListener('input', applyFilters);
    }
  });

  applyFilters();
}
function initCollectionFilters() {
  for (const panel of document.querySelectorAll('[data-collection-filters]')) {
    const shell = panel.closest('.collection-shell');
    const results = shell?.querySelector('[data-collection-results]');
    if (!results) {
      continue;
    }
    const cards = Array.from(results.querySelectorAll('[data-collection-card]'));
    cards.forEach((card, index) => {
      card.dataset.originalOrder = String(index);
    });
    const countNode = panel.querySelector('[data-collection-count]');
    const emptyNode = shell.querySelector('[data-collection-empty]');
    const searchInput = panel.querySelector('[data-collection-search]');
    const typeInput = panel.querySelector('[data-collection-type]');
    const generationInput = panel.querySelector('[data-collection-generation]');
    const minTotalInput = panel.querySelector('[data-collection-min-total]');
    const maxTotalInput = panel.querySelector('[data-collection-max-total]');
    const sortInput = panel.querySelector('[data-collection-sort]');
    const favoritesInput = panel.querySelector('[data-collection-favorites]');

    const numericData = (card, key) => Number(card.dataset[key] || 0);
    const compare = (left, right, sortValue) => {
      const byNumberDesc = (key) => numericData(right, key) - numericData(left, key);
      const byNumberAsc = (key) => numericData(left, key) - numericData(right, key);
      if (sortValue === 'level-desc') {
        return byNumberDesc('level') || byNumberDesc('total') || numericData(left, 'originalOrder') - numericData(right, 'originalOrder');
      }
      if (sortValue === 'level-asc') {
        return byNumberAsc('level') || byNumberDesc('total') || numericData(left, 'originalOrder') - numericData(right, 'originalOrder');
      }
      if (sortValue === 'total-desc') {
        return byNumberDesc('total') || byNumberDesc('level') || numericData(left, 'originalOrder') - numericData(right, 'originalOrder');
      }
      if (sortValue === 'total-asc') {
        return byNumberAsc('total') || byNumberDesc('level') || numericData(left, 'originalOrder') - numericData(right, 'originalOrder');
      }
      if (sortValue === 'base-total-desc') {
        return byNumberDesc('baseTotal') || byNumberDesc('total') || numericData(left, 'originalOrder') - numericData(right, 'originalOrder');
      }
      if (sortValue === 'atk-desc') {
        return byNumberDesc('atk') || byNumberDesc('total') || numericData(left, 'originalOrder') - numericData(right, 'originalOrder');
      }
      if (sortValue === 'hp-desc') {
        return byNumberDesc('hp') || byNumberDesc('total') || numericData(left, 'originalOrder') - numericData(right, 'originalOrder');
      }
      if (sortValue === 'spe-desc') {
        return byNumberDesc('spe') || byNumberDesc('total') || numericData(left, 'originalOrder') - numericData(right, 'originalOrder');
      }
      if (sortValue === 'name-asc') {
        return String(left.dataset.name || '').localeCompare(String(right.dataset.name || '')) || numericData(left, 'originalOrder') - numericData(right, 'originalOrder');
      }
      return numericData(left, 'originalOrder') - numericData(right, 'originalOrder');
    };

    const applyFilters = () => {
      const searchValue = String(searchInput?.value || '').trim().toLowerCase();
      const typeValue = String(typeInput?.value || '').trim();
      const generationValue = String(generationInput?.value || '').trim();
      const minTotal = Number(minTotalInput?.value || 0);
      const maxTotal = Number(maxTotalInput?.value || 999);
      const sortValue = String(sortInput?.value || 'party');
      const favoritesOnly = !!favoritesInput?.checked;
      let visibleCount = 0;
      cards.forEach((card) => {
        const nameMatches = !searchValue || String(card.dataset.name || '').includes(searchValue);
        const types = String(card.dataset.types || '').split('|').filter(Boolean);
        const typeMatches = !typeValue || types.includes(typeValue);
        const generationMatches = !generationValue || String(card.dataset.generation || '') === generationValue;
        const total = Number(card.dataset.total || 0);
        const totalMatches = total >= minTotal && total <= maxTotal;
        const favoriteMatches = !favoritesOnly || String(card.dataset.favorite || '0') === '1';
        const visible = nameMatches && typeMatches && generationMatches && totalMatches && favoriteMatches;
        card.hidden = !visible;
        card.classList.toggle('is-filtered-out', !visible);
        if (visible) {
          visibleCount += 1;
        }
      });
      cards.slice().sort((left, right) => compare(left, right, sortValue)).forEach((card) => {
        results.appendChild(card);
      });
      if (countNode) {
        countNode.textContent = String(visibleCount);
      }
      if (emptyNode) {
        emptyNode.hidden = visibleCount > 0;
      }
    };

    [searchInput, typeInput, generationInput, minTotalInput, maxTotalInput].forEach((input) => {
      input?.addEventListener('input', applyFilters);
      input?.addEventListener('change', applyFilters);
    });
    sortInput?.addEventListener('change', applyFilters);
    favoritesInput?.addEventListener('change', applyFilters);
    applyFilters();
  }
}
function initPartyBuilder() {
  for (const form of document.querySelectorAll('[data-party-order-form]')) {
    const builder = form.querySelector('[data-party-builder]');
    const inputs = Array.from(form.querySelectorAll('[data-party-order-input]'));
    if (!builder || !inputs.length) {
      continue;
    }
    let draggedCard = null;
    const cards = () => Array.from(builder.querySelectorAll('[data-party-slot-card]'));
    const syncOrder = () => {
      cards().forEach((card, index) => {
        card.dataset.slotIndex = String(index);
        const heading = card.querySelector('h3');
        if (heading) {
          heading.textContent = `Slot ${index + 1}`;
        }
        if (inputs[index]) {
          inputs[index].value = card.dataset.collectionId || '';
        }
      });
    };
    builder.addEventListener('dragstart', (event) => {
      const card = event.target.closest('[data-party-slot-card][draggable="true"]');
      if (!card) {
        return;
      }
      draggedCard = card;
      draggedCard.classList.add('is-dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.dataset.collectionId || '');
    });
    builder.addEventListener('dragover', (event) => {
      const target = event.target.closest('[data-party-slot-card]');
      if (!draggedCard || !target || target === draggedCard) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    });
    builder.addEventListener('dragenter', (event) => {
      const target = event.target.closest('[data-party-slot-card]');
      if (!draggedCard || !target || target === draggedCard) {
        return;
      }
      target.classList.add('is-drop-target');
    });
    builder.addEventListener('dragleave', (event) => {
      const target = event.target.closest('[data-party-slot-card]');
      target?.classList.remove('is-drop-target');
    });
    builder.addEventListener('drop', (event) => {
      const target = event.target.closest('[data-party-slot-card]');
      if (!draggedCard || !target || target === draggedCard) {
        return;
      }
      event.preventDefault();
      const currentCards = cards();
      const draggedIndex = currentCards.indexOf(draggedCard);
      const targetIndex = currentCards.indexOf(target);
      target.classList.remove('is-drop-target');
      if (draggedIndex < targetIndex) {
        builder.insertBefore(draggedCard, target.nextSibling);
      } else {
        builder.insertBefore(draggedCard, target);
      }
      syncOrder();
    });
    builder.addEventListener('dragend', () => {
      draggedCard?.classList.remove('is-dragging');
      draggedCard = null;
      cards().forEach((card) => card.classList.remove('is-drop-target'));
    });
    syncOrder();
  }
}

function initBattleLab() {
  for (const panel of document.querySelectorAll('[data-battle-lab]')) {
    const dataNode = panel.querySelector('#collection-dashboard-data');
    const playerSelect = panel.querySelector('[data-battle-player]');
    const opponentSelect = panel.querySelector('[data-battle-opponent]');
    const playerCard = panel.querySelector('[data-battle-player-card]');
    const opponentCard = panel.querySelector('[data-battle-opponent-card]');
    const logNode = panel.querySelector('[data-battle-lab-log]');
    const actionButtons = Array.from(panel.querySelectorAll('[data-battle-action]'));
    if (!dataNode || !playerSelect || !opponentSelect || !playerCard || !opponentCard || !logNode) {
      continue;
    }
    const data = JSON.parse(dataNode.textContent || '{}');
    const collection = new Map((data.collection || []).map((entry) => [String(entry.id), entry]));
    const typeChart = data.typeChart || {};
    const statKeys = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
    let battle = null;
    const titleLabel = (value) => {
      const text = String(value || '');
      return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
    };
    const statTotal = (stats) => statKeys.reduce((sum, key) => sum + Number(stats?.[key] || 0), 0);
    const bestMultiplier = (types, targetTypes) => {
      return Math.max(...(types || ['normal']).map((type) => {
        return (targetTypes || ['normal']).reduce((multiplier, targetType) => multiplier * ((typeChart[type] || {})[targetType] ?? 1), 1);
      }));
    };
    const multiplierLabel = (multiplier) => {
      if (multiplier >= 2) {
        return 'super effective';
      }
      if (multiplier === 0) {
        return 'no effect';
      }
      if (multiplier < 1) {
        return 'resisted';
      }
      return 'neutral';
    };
    const renderFighter = (node, fighter, label) => {
      if (!fighter) {
        node.innerHTML = '<p class="muted">No fighter selected.</p>';
        return;
      }
      const hpPercent = Math.max(0, Math.round((fighter.hp / Math.max(1, fighter.stats.hp)) * 100));
      node.innerHTML = `
        <p class="eyebrow">${label}</p>
        <h3>${fighter.name}</h3>
        <div class="badge-row compact-row">${fighter.types.map((type) => `<span class="badge badge-${type}">${titleLabel(type)}</span>`).join(' ')}</div>
        <p class="muted">Lv ${fighter.level} - Total ${statTotal(fighter.stats)}</p>
        <div class="health hp-bar"><span style="width:${hpPercent}%"></span></div>
        <p class="battle-lab-statline">HP ${fighter.hp}/${fighter.stats.hp}${fighter.defending ? ' - Guarding' : ''}</p>
        <p class="battle-lab-statline">Atk ${fighter.stats.atk} - Def ${fighter.stats.def} - SpA ${fighter.stats.spa} - SpD ${fighter.stats.spd} - Spe ${fighter.stats.spe}</p>
      `;
    };
    const setLog = (message) => {
      logNode.textContent = message;
      const finished = !!battle?.winner;
      actionButtons.forEach((button) => {
        if (button.dataset.battleAction === 'reset') {
          button.disabled = false;
        } else {
          button.disabled = finished;
        }
      });
    };
    const hydrate = (id) => {
      const source = collection.get(String(id));
      if (!source) {
        return null;
      }
      return {
        id: source.id,
        name: source.name,
        level: source.level,
        types: [...source.types],
        stats: { ...source.stats },
        hp: Number(source.stats.hp || 1),
        defending: false,
      };
    };
    const calculateDamage = (attacker, defender) => {
      const attackValue = Math.max(Number(attacker.stats.atk || 0), Number(attacker.stats.spa || 0));
      const defenseValue = Math.max(1, Math.min(Number(defender.stats.def || 1), Number(defender.stats.spd || 1)));
      const base = Math.max(8, Math.round(attackValue * 0.38 + attacker.level * 0.9 - defenseValue * 0.16));
      const multiplier = bestMultiplier(attacker.types, defender.types);
      const critical = Math.random() < 0.12;
      let damage = Math.max(6, Math.round(base * multiplier));
      if (critical) {
        damage = Math.round(damage * 1.25);
      }
      if (defender.defending) {
        damage = Math.max(4, Math.floor(damage * 0.55));
      }
      return { damage, multiplier, critical };
    };
    const renderBattle = (message) => {
      renderFighter(playerCard, battle?.player, 'Trainer Side');
      renderFighter(opponentCard, battle?.opponent, 'Opponent Side');
      setLog(message);
    };
    const ensureDifferentSelection = () => {
      if (playerSelect.value !== opponentSelect.value) {
        return;
      }
      const alternative = Array.from(opponentSelect.options).find((option) => option.value !== playerSelect.value);
      if (alternative) {
        opponentSelect.value = alternative.value;
      }
    };
    const resetBattle = () => {
      ensureDifferentSelection();
      const player = hydrate(playerSelect.value);
      const opponent = hydrate(opponentSelect.value);
      if (!player || !opponent) {
        battle = null;
        renderBattle('Choose two Pokemon to begin the battle lab.');
        return;
      }
      battle = {
        turn: 1,
        winner: null,
        player,
        opponent,
      };
      renderBattle(`${player.name} faces ${opponent.name}. Attack or defend to simulate the next turn.`);
    };
    const enemyTurn = () => {
      if (!battle || battle.winner) {
        return '';
      }
      if (Math.random() < 0.25) {
        battle.opponent.defending = true;
        return `${battle.opponent.name} braced for the next hit.`;
      }
      const result = calculateDamage(battle.opponent, battle.player);
      const guarded = battle.player.defending;
      battle.player.hp = Math.max(0, battle.player.hp - result.damage);
      battle.player.defending = false;
      if (battle.player.hp <= 0) {
        battle.winner = 'opponent';
        return `${battle.opponent.name} struck back for ${result.damage} damage. ${battle.player.name} fainted.`;
      }
      return `${battle.opponent.name} hit back for ${result.damage} damage (${multiplierLabel(result.multiplier)}${result.critical ? ', critical' : ''}${guarded ? ', through guard' : ''}).`;
    };
    const handleAction = (action) => {
      if (!battle) {
        resetBattle();
        return;
      }
      if (battle.winner) {
        renderBattle(`${battle.winner === 'player' ? battle.player.name : battle.opponent.name} already won this duel. Reset to start another.`);
        return;
      }
      if (action === 'reset') {
        resetBattle();
        return;
      }
      let message = '';
      if (action === 'defend') {
        battle.player.defending = true;
        message = `${battle.player.name} raised its guard. ${enemyTurn()}`;
      } else {
        const result = calculateDamage(battle.player, battle.opponent);
        const guarded = battle.opponent.defending;
        battle.opponent.hp = Math.max(0, battle.opponent.hp - result.damage);
        battle.opponent.defending = false;
        message = `${battle.player.name} dealt ${result.damage} damage (${multiplierLabel(result.multiplier)}${result.critical ? ', critical' : ''}${guarded ? ', into guard' : ''}).`;
        if (battle.opponent.hp <= 0) {
          battle.winner = 'player';
          message += ` ${battle.opponent.name} fainted.`;
        } else {
          message += ` ${enemyTurn()}`;
        }
      }
      battle.turn += 1;
      renderBattle(message.trim());
    };
    playerSelect.addEventListener('change', resetBattle);
    opponentSelect.addEventListener('change', resetBattle);
    actionButtons.forEach((button) => {
      button.addEventListener('click', () => handleAction(button.dataset.battleAction || 'attack'));
    });
    resetBattle();
  }
}

initBuildDexFilters();
initChatComposers();
initMarketFilters();
initRewardShopFilters();
initCollectionFilters();
initPartyBuilder();
initBattleLab();









function initSearchStories() {
  document.querySelectorAll('[data-search-story][data-search-story-fresh]').forEach((card) => {
    const list = card.querySelector('[data-search-story-list]');
    const result = card.closest('.map-search-board')?.querySelector('[data-search-story-result]');
    if (!list) {
      return;
    }
    const steps = Array.from(list.querySelectorAll('li')).map((item) => item.textContent?.trim() || '').filter(Boolean);
    if (!steps.length) {
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('motion-reduced')) {
      if (result) {
        result.hidden = false;
      }
      return;
    }
    list.innerHTML = '';
    if (result) {
      result.hidden = true;
    }
    steps.forEach((step, index) => {
      window.setTimeout(() => {
        const row = document.createElement('li');
        row.textContent = step;
        row.classList.add('is-visible');
        list.appendChild(row);
        if (index === steps.length - 1 && result) {
          window.setTimeout(() => {
            result.hidden = false;
          }, 220);
        }
      }, 420 * index);
    });
  });
}

initSearchStories();

const moemonAppState = window.__moemonAppState || (window.__moemonAppState = {
  tabMemory: {},
  softNavigationReady: false,
  commandMenusReady: false,
  navigation: {
    requestId: 0,
    controller: null,
  },
});

function closestFromTarget(target, selector) {
  return target instanceof Element ? target.closest(selector) : null;
}

function syncCommandMenuState() {
  document.body.classList.toggle('command-menu-open', !!document.querySelector('[data-command-menu].is-open'));
}

function positionCommandMenuPanel(menu) {
  const trigger = menu.querySelector('[data-command-menu-trigger]');
  const panel = menu.querySelector('[data-command-menu-panel]');
  if (!trigger || !panel) {
    return;
  }
  if (window.matchMedia('(max-width: 760px)').matches) {
    const triggerRect = trigger.getBoundingClientRect();
    const top = Math.max(12, Math.round(triggerRect.bottom + 10));
    menu.style.setProperty('--command-menu-top', `${top}px`);
    return;
  }
  menu.style.removeProperty('--command-menu-top');
}

function setCommandMenuOpen(menu, open) {
  const trigger = menu.querySelector('[data-command-menu-trigger]');
  const panel = menu.querySelector('[data-command-menu-panel]');
  menu.classList.toggle('is-open', open);
  if (trigger) {
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (panel) {
    panel.hidden = !open;
  }
  if (open) {
    positionCommandMenuPanel(menu);
  }
  syncCommandMenuState();
}

function closeOpenCommandMenus(exceptMenu = null) {
  document.querySelectorAll('[data-command-menu].is-open').forEach((menu) => {
    if (menu !== exceptMenu) {
      setCommandMenuOpen(menu, false);
    }
  });
}

function initCommandMenus(root = document) {
  root.querySelectorAll('[data-command-menu]').forEach((menu) => {
    if (menu.dataset.commandHydrated === 'true') {
      if (menu.classList.contains('is-open')) {
        positionCommandMenuPanel(menu);
      }
      return;
    }
    menu.dataset.commandHydrated = 'true';

    const trigger = menu.querySelector('[data-command-menu-trigger]');
    if (trigger) {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        const nextOpen = !menu.classList.contains('is-open');
        closeOpenCommandMenus(nextOpen ? menu : null);
        setCommandMenuOpen(menu, nextOpen);
      });
    }

    menu.querySelectorAll('.command-link').forEach((link) => {
      link.addEventListener('click', () => {
        setCommandMenuOpen(menu, false);
      });
    });
  });

  if (moemonAppState.commandMenusReady) {
    syncCommandMenuState();
    return;
  }
  moemonAppState.commandMenusReady = true;

  document.addEventListener('click', (event) => {
    if (closestFromTarget(event.target, '[data-command-menu]')) {
      return;
    }
    closeOpenCommandMenus();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeOpenCommandMenus();
    }
  });

  window.addEventListener('resize', () => {
    document.querySelectorAll('[data-command-menu].is-open').forEach((menu) => {
      positionCommandMenuPanel(menu);
    });
  });
}

function safeSessionStorageSet(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function safeSessionStorageGet(key) {
  try {
    return window.sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeLocalStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore storage failures
  }
}

function safeLocalStorageGet(key) {
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function safeLocalStorageRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore storage failures
  }
}

const LEGACY_DEVICE_SAVE_STORAGE_KEY = 'moemon-device-save';
const DEVICE_SAVE_STORAGE_KEY = 'moemon-device-saves';
const DEVICE_SAVE_STORAGE_VERSION = 1;
const DEVICE_SAVE_MAX_ENTRIES = 12;

function parseStoredDeviceSaveEnvelope(rawValue) {
  if (!rawValue || typeof rawValue !== 'string') {
    return null;
  }
  try {
    const envelope = JSON.parse(rawValue);
    if (!envelope || typeof envelope.payload !== 'string' || typeof envelope.signature !== 'string') {
      return null;
    }
    const snapshot = JSON.parse(envelope.payload || '{}');
    if (!snapshot || typeof snapshot !== 'object') {
      return null;
    }
    return { envelope, snapshot };
  } catch {
    return null;
  }
}

function normalizeDeviceSaveValue(value) {
  return String(value || '').trim().toLowerCase();
}

function deviceSaveIdentity(snapshot) {
  const username = String(snapshot?.user?.username || '').trim();
  const email = String(snapshot?.user?.email || '').trim();
  const normalizedUsername = normalizeDeviceSaveValue(username);
  const normalizedEmail = normalizeDeviceSaveValue(email);
  return {
    username,
    email,
    normalizedUsername,
    normalizedEmail,
    key: normalizedEmail || normalizedUsername,
  };
}

function buildStoredDeviceSaveEntry(envelope, snapshot, savedAt = '') {
  const identity = deviceSaveIdentity(snapshot);
  if (!identity.key) {
    return null;
  }
  return {
    key: identity.key,
    username: identity.username,
    email: identity.email,
    normalizedUsername: identity.normalizedUsername,
    normalizedEmail: identity.normalizedEmail,
    envelope,
    snapshot,
    savedAt: savedAt || snapshot?.issuedAt || new Date().toISOString(),
  };
}

function matchesDeviceSaveMode(entry, mode = '') {
  const normalizedMode = String(mode || '').trim().toLowerCase();
  if (!normalizedMode) {
    return true;
  }
  const role = String(entry?.snapshot?.user?.role || '').trim().toLowerCase();
  if (normalizedMode === 'admin') {
    return role === 'admin';
  }
  if (normalizedMode === 'player') {
    return role !== 'admin';
  }
  return true;
}

function serializeStoredDeviceSaveEntries(entries) {
  return JSON.stringify({
    version: DEVICE_SAVE_STORAGE_VERSION,
    entries: entries.map((entry) => ({
      key: entry.key,
      savedAt: entry.savedAt,
      envelope: entry.envelope,
    })),
  });
}

function writeStoredDeviceSaveEntries(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    safeLocalStorageRemove(DEVICE_SAVE_STORAGE_KEY);
    safeLocalStorageRemove(LEGACY_DEVICE_SAVE_STORAGE_KEY);
    return;
  }
  safeLocalStorageSet(DEVICE_SAVE_STORAGE_KEY, serializeStoredDeviceSaveEntries(entries));
  safeLocalStorageRemove(LEGACY_DEVICE_SAVE_STORAGE_KEY);
}

function normalizeStoredDeviceSaveEntries(rawEntries) {
  const entries = [];
  for (const rawEntry of rawEntries || []) {
    const envelope = rawEntry?.envelope || rawEntry;
    const parsed = parseStoredDeviceSaveEnvelope(JSON.stringify(envelope));
    if (!parsed) {
      continue;
    }
    const entry = buildStoredDeviceSaveEntry(parsed.envelope, parsed.snapshot, rawEntry?.savedAt || parsed.snapshot?.issuedAt || '');
    if (entry) {
      entries.push(entry);
    }
  }
  return entries
    .sort((left, right) => String(right.savedAt || '').localeCompare(String(left.savedAt || '')))
    .slice(0, DEVICE_SAVE_MAX_ENTRIES);
}

function migrateLegacyStoredDeviceSave() {
  const legacyRaw = safeLocalStorageGet(LEGACY_DEVICE_SAVE_STORAGE_KEY);
  if (!legacyRaw) {
    return [];
  }
  const parsed = parseStoredDeviceSaveEnvelope(legacyRaw);
  if (!parsed) {
    safeLocalStorageRemove(LEGACY_DEVICE_SAVE_STORAGE_KEY);
    return [];
  }
  const entry = buildStoredDeviceSaveEntry(parsed.envelope, parsed.snapshot, parsed.snapshot?.issuedAt || '');
  if (!entry) {
    safeLocalStorageRemove(LEGACY_DEVICE_SAVE_STORAGE_KEY);
    return [];
  }
  writeStoredDeviceSaveEntries([entry]);
  return [entry];
}

function readStoredDeviceSaves() {
  const raw = safeLocalStorageGet(DEVICE_SAVE_STORAGE_KEY);
  if (!raw) {
    return migrateLegacyStoredDeviceSave();
  }
  try {
    const payload = JSON.parse(raw);
    if (!payload || Number(payload.version || 0) !== DEVICE_SAVE_STORAGE_VERSION || !Array.isArray(payload.entries)) {
      safeLocalStorageRemove(DEVICE_SAVE_STORAGE_KEY);
      return migrateLegacyStoredDeviceSave();
    }
    const normalized = normalizeStoredDeviceSaveEntries(payload.entries);
    if (!normalized.length) {
      safeLocalStorageRemove(DEVICE_SAVE_STORAGE_KEY);
      return migrateLegacyStoredDeviceSave();
    }
    if (normalized.length !== payload.entries.length) {
      writeStoredDeviceSaveEntries(normalized);
    }
    return normalized;
  } catch {
    safeLocalStorageRemove(DEVICE_SAVE_STORAGE_KEY);
    return migrateLegacyStoredDeviceSave();
  }
}

function upsertStoredDeviceSave(envelope) {
  const parsed = parseStoredDeviceSaveEnvelope(typeof envelope === 'string' ? envelope : JSON.stringify(envelope || {}));
  if (!parsed) {
    return readStoredDeviceSaves();
  }
  const nextEntry = buildStoredDeviceSaveEntry(parsed.envelope, parsed.snapshot, parsed.snapshot?.issuedAt || new Date().toISOString());
  if (!nextEntry) {
    return readStoredDeviceSaves();
  }
  const existing = readStoredDeviceSaves().filter((entry) => entry.key !== nextEntry.key);
  const nextEntries = [nextEntry, ...existing].slice(0, DEVICE_SAVE_MAX_ENTRIES);
  writeStoredDeviceSaveEntries(nextEntries);
  return nextEntries;
}

function matchStoredDeviceSave(loginValue, entries = readStoredDeviceSaves()) {
  const normalizedLogin = normalizeDeviceSaveValue(loginValue);
  if (!normalizedLogin) {
    return entries.length === 1 ? entries[0] : null;
  }
  return entries.find((entry) => entry.normalizedEmail === normalizedLogin || entry.normalizedUsername === normalizedLogin) || null;
}

function hydrateDeviceSaveInputs(root = document) {
  const entries = readStoredDeviceSaves();
  root.querySelectorAll('form').forEach((form) => {
    const backupInput = form.querySelector('[data-device-save-input]');
    if (!backupInput) {
      return;
    }
    const mode = backupInput.dataset.deviceSaveMode || '';
    const availableEntries = entries.filter((entry) => matchesDeviceSaveMode(entry, mode));
    const loginInput = form.querySelector('input[name="login"]');
    const syncBackupInput = () => {
      const matched = matchStoredDeviceSave(loginInput?.value || '', availableEntries);
      backupInput.value = matched?.envelope ? JSON.stringify(matched.envelope) : '';
    };
    syncBackupInput();
    if (loginInput && form.dataset.deviceSaveHydrated !== 'true') {
      loginInput.addEventListener('input', syncBackupInput);
      loginInput.addEventListener('change', syncBackupInput);
    }
    form.dataset.deviceSaveHydrated = 'true';
  });
}

function syncDeviceSaveSnapshot() {
  const node = document.getElementById('moemon-device-save');
  const raw = node?.textContent || '';
  if (!raw.trim()) {
    return readStoredDeviceSaves();
  }
  return upsertStoredDeviceSave(raw);
}

async function restoreStoredDeviceSave(entry, button, status) {
  if (!entry?.envelope) {
    status.textContent = 'That local save is no longer available.';
    return;
  }
  button.disabled = true;
  status.textContent = `Restoring ${entry.username || 'your saved account'}...`;
  try {
    const response = await fetch('/auth/device-restore', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ backup: entry.envelope }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || 'Restore failed.');
    }
    status.textContent = 'Save restored. Opening the hub...';
    window.location.assign(payload.redirect || '/hub');
  } catch (error) {
    button.disabled = false;
    status.textContent = error?.message || 'Restore failed.';
  }
}

function initDeviceSaveRestore(root = document) {
  const entries = readStoredDeviceSaves();
  root.querySelectorAll('[data-device-restore-slot]').forEach((slot) => {
    slot.replaceChildren();
    const mode = slot.dataset.deviceRestoreMode || '';
    const visibleEntries = entries.filter((entry) => matchesDeviceSaveMode(entry, mode));
    if (!visibleEntries.length) {
      slot.hidden = true;
      return;
    }

    visibleEntries.forEach((entry) => {
      const snapshot = entry.snapshot || {};
      const username = entry.username || snapshot.user?.username || 'saved trainer';
      const email = entry.email || snapshot.user?.email || '';
      const syncedAt = snapshot.issuedAt ? new Date(snapshot.issuedAt) : null;
      const syncedLabel = syncedAt && !Number.isNaN(syncedAt.getTime()) ? syncedAt.toLocaleString() : 'this device';

      const card = document.createElement('section');
      card.className = 'device-restore-card panelish';

      const heading = document.createElement('strong');
      heading.textContent = `Restore ${username}`;
      card.appendChild(heading);

      const copy = document.createElement('p');
      copy.className = 'muted';
      copy.textContent = email
        ? `${username} is stored on this device as ${email}.`
        : `A backup for ${username} is stored on this device.`;
      card.appendChild(copy);

      const actions = document.createElement('div');
      actions.className = 'button-row';

      const restoreButton = document.createElement('button');
      restoreButton.className = 'button accent';
      restoreButton.type = 'button';
      restoreButton.textContent = `Restore ${username}`;
      actions.appendChild(restoreButton);

      const useButton = document.createElement('button');
      useButton.className = 'button ghost';
      useButton.type = 'button';
      useButton.textContent = 'Use For Login';
      actions.appendChild(useButton);

      card.appendChild(actions);

      const status = document.createElement('p');
      status.className = 'muted device-restore-status';
      status.textContent = `Last synced ${syncedLabel}.`;
      card.appendChild(status);

      restoreButton.addEventListener('click', () => {
        restoreStoredDeviceSave(entry, restoreButton, status);
      });

      useButton.addEventListener('click', () => {
        const scope = slot.closest('.auth-card') || root;
        const loginField = scope.querySelector('input[name="login"]');
        const backupField = scope.querySelector('[data-device-save-input]');
        if (loginField) {
          loginField.value = entry.email || entry.username || '';
          loginField.dispatchEvent(new Event('input', { bubbles: true }));
          loginField.focus();
        }
        if (backupField) {
          backupField.value = JSON.stringify(entry.envelope);
        }
        status.textContent = `${username} is ready to sign in from this browser.`;
      });

      slot.hidden = false;
      slot.appendChild(card);
    });
  });
}

function tabMemoryKey(group, index = 0) {
  const base = group.dataset.tabGroup || group.id || `group-${index}`;
  return `moemon-tab:${base}`;
}

function rememberTabSelection(group, target, index = 0) {
  if (!group || !target) {
    return;
  }
  const key = tabMemoryKey(group, index);
  moemonAppState.tabMemory[key] = target;
  safeSessionStorageSet(key, target);
}

function readSavedTabSelection(group, index = 0) {
  const key = tabMemoryKey(group, index);
  return moemonAppState.tabMemory[key] || safeSessionStorageGet(key) || '';
}

function captureTabSelections(root = document) {
  root.querySelectorAll('[data-tab-group]').forEach((group, index) => {
    const activeTarget = group.querySelector('[data-tab-target].is-active')?.dataset.tabTarget
      || group.querySelector('[data-tab-panel].is-active')?.dataset.tabPanel
      || '';
    if (activeTarget) {
      rememberTabSelection(group, activeTarget, index);
    }
  });
}

function hydrateTabs(root = document) {
  root.querySelectorAll('[data-tab-group]').forEach((group, index) => {
    const firstButton = group.querySelector('[data-tab-target]');
    const preferredTarget = readSavedTabSelection(group, index)
      || group.querySelector('[data-tab-target].is-active')?.dataset.tabTarget
      || firstButton?.dataset.tabTarget
      || '';
    if (preferredTarget) {
      activateTab(group, preferredTarget);
    }
    if (group.dataset.tabHydrated === 'true') {
      return;
    }
    group.dataset.tabHydrated = 'true';
    group.addEventListener('click', (event) => {
      const button = event.target.closest('[data-tab-target]');
      if (!button || !group.contains(button)) {
        return;
      }
      activateTab(group, button.dataset.tabTarget);
      rememberTabSelection(group, button.dataset.tabTarget, index);
    });
  });
}

function hydrateAutoscroll(root = document) {
  root.querySelectorAll('[data-autoscroll]').forEach((list) => {
    list.scrollTop = list.scrollHeight;
  });
}

function hydrateBattleMessages(root = document) {
  root.querySelectorAll('[data-battle-message]').forEach((screen) => {
    if (screen.dataset.messageHydrated === 'true') {
      return;
    }
    screen.dataset.messageHydrated = 'true';
    const text = screen.dataset.text || screen.textContent || '';
    if (!text) {
      return;
    }
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      screen.textContent = text;
      return;
    }
    screen.textContent = '';
    let index = 0;
    const tick = () => {
      index += 1;
      screen.textContent = text.slice(0, index);
      if (index < text.length && screen.isConnected) {
        window.setTimeout(tick, 16);
      }
    };
    tick();
  });
}

function hydrateDraftSwitchers(root = document) {
  root.querySelectorAll('[data-draft-switcher]').forEach((switcher) => {
    const initial = switcher.querySelector('[data-draft-radio]:checked') || switcher.querySelector('[data-draft-radio]');
    if (initial) {
      activateDraft(switcher, initial.value);
    }
    if (switcher.dataset.draftHydrated === 'true') {
      return;
    }
    switcher.dataset.draftHydrated = 'true';
    switcher.addEventListener('change', (event) => {
      const radio = event.target.closest('[data-draft-radio]');
      if (!radio || !switcher.contains(radio)) {
        return;
      }
      activateDraft(switcher, radio.value);
    });
  });
}

function hydrateMoemonPage() {
  const dashboard = readCollectionDashboardData();
  hydrateTabs();
  hydrateAutoscroll();
  hydrateBattleMessages();
  hydrateDraftSwitchers();
  initCommandMenus();
  initPokedexFilters();
  initTeamBuilder(dashboard);
  initBattleSimulator(dashboard);
  initBuildDexFilters();
  initChatComposers();
  initMarketFilters();
  initRewardShopFilters();
  initCollectionFilters();
  initPartyBuilder();
  initBattleLab();
  initSearchStories();
  syncDeviceSaveSnapshot();
  hydrateDeviceSaveInputs();
  initDeviceSaveRestore();
}

function updateCurrentHistoryState(scrollX = window.scrollX, scrollY = window.scrollY) {
  try {
    history.replaceState({
      ...(history.state || {}),
      __moemonSoft: true,
      scrollX,
      scrollY,
    }, '', window.location.href);
  } catch {
    // ignore history failures
  }
}

function isSoftNavigableUrl(url) {
  return url.origin === window.location.origin
    && ['http:', 'https:'].includes(url.protocol)
    && !url.pathname.startsWith('/public/');
}

function buildUrlEncodedFormData(formData) {
  const params = new URLSearchParams();
  formData.forEach((value, key) => {
    params.append(key, String(value));
  });
  return params;
}

function replaceDocumentBody(nextDoc) {
  if (nextDoc.documentElement?.lang) {
    document.documentElement.lang = nextDoc.documentElement.lang;
  }
  if (nextDoc.title) {
    document.title = nextDoc.title;
  }
  document.body.className = nextDoc.body.className;
  document.body.innerHTML = nextDoc.body.innerHTML;
}

function restoreSoftScroll(finalUrl, options = {}) {
  const hash = finalUrl.hash ? decodeURIComponent(finalUrl.hash.slice(1)) : '';
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (hash) {
        const target = document.getElementById(hash);
        if (target) {
          target.scrollIntoView({ block: 'start' });
          return;
        }
      }
      if (typeof options.scrollX === 'number' && typeof options.scrollY === 'number') {
        window.scrollTo(options.scrollX, options.scrollY);
        return;
      }
      window.scrollTo(0, 0);
    });
  });
}

function normalizeReturnHash(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }
  return raw.startsWith('#') ? raw : `#${raw}`;
}

function hardNavigate(url) {
  window.location.assign(url.href);
}

function hardSubmit(form, submitter) {
  form.dataset.softBypass = 'true';
  if (submitter && typeof form.requestSubmit === 'function') {
    form.requestSubmit(submitter);
    return;
  }
  HTMLFormElement.prototype.submit.call(form);
}

async function softNavigate(options) {
  const currentUrl = new URL(window.location.href);
  const previousScrollX = window.scrollX;
  const previousScrollY = window.scrollY;
  const method = (options.method || 'GET').toUpperCase();
  const formData = options.formData || null;
  const submitter = options.submitter || null;
  const controller = new AbortController();
  const requestId = moemonAppState.navigation.requestId + 1;
  moemonAppState.navigation.requestId = requestId;
  if (moemonAppState.navigation.controller) {
    moemonAppState.navigation.controller.abort();
  }
  moemonAppState.navigation.controller = controller;

  let requestUrl = new URL(options.url.href);
  const fetchOptions = {
    method,
    credentials: 'same-origin',
    redirect: 'follow',
    signal: controller.signal,
    keepalive: method !== 'GET',
    headers: {
      'X-Requested-With': 'moemon-soft-nav',
    },
  };

  if (formData) {
    const params = buildUrlEncodedFormData(formData);
    if (method === 'GET') {
      requestUrl.search = params.toString();
    } else {
      fetchOptions.headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
      fetchOptions.body = params.toString();
    }
  }

  captureTabSelections();
  if (!options.skipStateCapture) {
    updateCurrentHistoryState(previousScrollX, previousScrollY);
  }
  if (submitter) {
    submitter.disabled = true;
  }
  document.body.classList.add('soft-loading');

  try {
    const response = await fetch(requestUrl, fetchOptions);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new Error('Soft navigation expected an HTML response.');
    }
    const markup = await response.text();
    if (requestId !== moemonAppState.navigation.requestId) {
      return;
    }
    const parser = new DOMParser();
    const nextDoc = parser.parseFromString(markup, 'text/html');
    const finalUrl = new URL(response.url || requestUrl.href);
    if (options.desiredHash && !finalUrl.hash) {
      finalUrl.hash = options.desiredHash;
    }
    const sameScreen = finalUrl.pathname === currentUrl.pathname && finalUrl.search === currentUrl.search;
    const restoredScroll = options.restoreScroll || (sameScreen ? { scrollX: previousScrollX, scrollY: previousScrollY } : null);
    const historyMode = options.historyMode === 'auto' ? (sameScreen ? 'replace' : 'push') : options.historyMode;
    replaceDocumentBody(nextDoc);
    if (historyMode === 'replace') {
      history.replaceState({
        __moemonSoft: true,
        scrollX: restoredScroll?.scrollX ?? 0,
        scrollY: restoredScroll?.scrollY ?? 0,
      }, '', `${finalUrl.pathname}${finalUrl.search}${finalUrl.hash}`);
    } else {
      history.pushState({
        __moemonSoft: true,
        scrollX: restoredScroll?.scrollX ?? 0,
        scrollY: restoredScroll?.scrollY ?? 0,
      }, '', `${finalUrl.pathname}${finalUrl.search}${finalUrl.hash}`);
    }
    hydrateMoemonPage();
    restoreSoftScroll(finalUrl, restoredScroll || {});
  } catch (error) {
    if (error.name === 'AbortError') {
      return;
    }
    if (options.form) {
      hardSubmit(options.form, submitter);
    } else {
      hardNavigate(options.url);
    }
  } finally {
    if (submitter && submitter.isConnected) {
      submitter.disabled = false;
    }
    document.body.classList.remove('soft-loading');
  }
}

function initSoftNavigation() {
  if (moemonAppState.softNavigationReady) {
    return;
  }
  moemonAppState.softNavigationReady = true;
  updateCurrentHistoryState(window.scrollX, window.scrollY);

  document.addEventListener('click', (event) => {
    const tabButton = event.target.closest('[data-tab-target]');
    if (tabButton) {
      const group = tabButton.closest('[data-tab-group]');
      if (group) {
        const groups = Array.from(document.querySelectorAll('[data-tab-group]'));
        rememberTabSelection(group, tabButton.dataset.tabTarget || '', groups.indexOf(group));
      }
    }
  });

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    const link = event.target.closest('a[href]');
    if (!link) {
      return;
    }
    if (link.dataset.hardNav === 'true' || link.target && link.target !== '_self' || link.hasAttribute('download')) {
      return;
    }
    const url = new URL(link.href, window.location.href);
    if (!isSoftNavigableUrl(url)) {
      return;
    }
    const currentUrl = new URL(window.location.href);
    if (url.pathname === currentUrl.pathname && url.search === currentUrl.search && url.hash) {
      return;
    }
    event.preventDefault();
    softNavigate({
      url,
      method: 'GET',
      historyMode: 'auto',
    });
  });

  document.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    if (form.dataset.softBypass === 'true') {
      delete form.dataset.softBypass;
      return;
    }
    if (form.dataset.hardNav === 'true') {
      return;
    }
    const submitter = event.submitter || null;
    const actionValue = submitter?.getAttribute('formaction') || form.getAttribute('action') || window.location.href;
    const methodValue = submitter?.getAttribute('formmethod') || form.getAttribute('method') || 'GET';
    const targetValue = submitter?.getAttribute('formtarget') || form.getAttribute('target') || '';
    const enctypeValue = submitter?.getAttribute('formenctype') || form.getAttribute('enctype') || 'application/x-www-form-urlencoded';
    if (targetValue && targetValue !== '_self') {
      return;
    }
    if (String(enctypeValue).toLowerCase().includes('multipart/form-data')) {
      return;
    }
    if (form.querySelector('input[type="file"]')) {
      return;
    }
    const url = new URL(actionValue, window.location.href);
    if (!isSoftNavigableUrl(url)) {
      return;
    }
    event.preventDefault();
    const formData = new FormData(form);
    if (submitter?.name) {
      formData.append(submitter.name, submitter.value || '');
    }
    const desiredHash = normalizeReturnHash(formData.get('returnTo'));
    softNavigate({
      url,
      method: methodValue,
      formData,
      form,
      submitter,
      desiredHash,
      historyMode: 'auto',
    });
  });

  let scrollFrame = 0;
  window.addEventListener('scroll', () => {
    if (scrollFrame) {
      return;
    }
    scrollFrame = window.requestAnimationFrame(() => {
      scrollFrame = 0;
      updateCurrentHistoryState(window.scrollX, window.scrollY);
    });
  }, { passive: true });

  window.addEventListener('beforeunload', () => {
    updateCurrentHistoryState(window.scrollX, window.scrollY);
  });

  window.addEventListener('popstate', (event) => {
    softNavigate({
      url: new URL(window.location.href),
      method: 'GET',
      historyMode: 'replace',
      restoreScroll: {
        scrollX: Number(event.state?.scrollX || 0),
        scrollY: Number(event.state?.scrollY || 0),
      },
      skipStateCapture: true,
    });
  });
}

initCommandMenus();
syncDeviceSaveSnapshot();
hydrateDeviceSaveInputs();
initDeviceSaveRestore();
initSoftNavigation();



