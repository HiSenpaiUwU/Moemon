import {
  createAdmin,
  listUsers,
  adminGrantCash,
  adminGrantItem,
  adminGrantMonster,
  adminSetMonsterLevel,
  adminAdjustMonsterBonusStat,
  adminSetRunWave,
  adminSetRole,
  adminUnlockMode,
  adminClearRun,
} from '../core.js';

function usage() {
  console.log(`Moemon admin commands

Commands:
  create-admin <email> <password> [username]
  list-users
  grant-cash <userId> <amount>
  grant-item <userId> <itemSlug> <quantity>
  grant-monster <userId> <speciesSlugOrId> [level]
  set-monster-level <userId> <collectionId> <level>
  adjust-monster-stat <userId> <collectionId> <hp|atk|def|spa|spd|spe> <amount>
  set-run-wave <userId> <wave>
  set-role <userId> <player|admin>
  unlock-mode <userId> <classic|endless|challenge>
  clear-run <userId>`);
}

function firstAdminId() {
  const admin = listUsers(200).find((user) => user.role === 'admin');
  if (!admin) {
    throw new Error('No admin exists yet. Run create-admin first.');
  }
  return admin.id;
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help') {
    usage();
    return;
  }

  if (command === 'create-admin') {
    const [email, password, username] = args;
    if (!email || !password) {
      usage();
      process.exit(1);
    }
    const user = createAdmin(email, password, username || 'Administrator');
    console.log(`Admin ready: #${user.id} ${user.username} <${user.email}>`);
    return;
  }

  if (command === 'list-users') {
    listUsers(100).forEach((user) => {
      console.log(`#${user.id}\t${user.username}\t${user.email}\t${user.role}\t$${user.cash}`);
    });
    return;
  }

  const adminId = firstAdminId();

  if (command === 'grant-cash') {
    const [userId, amount] = args;
    adminGrantCash(adminId, Number(userId), Number(amount));
    console.log('Cash granted.');
    return;
  }

  if (command === 'grant-item') {
    const [userId, itemSlug, quantity] = args;
    adminGrantItem(adminId, Number(userId), itemSlug, Number(quantity));
    console.log('Item granted.');
    return;
  }

  if (command === 'grant-monster') {
    const [userId, speciesSlug, level] = args;
    adminGrantMonster(adminId, Number(userId), speciesSlug, Number(level || 8));
    console.log('Monster granted.');
    return;
  }

  if (command === 'set-monster-level') {
    const [userId, collectionId, level] = args;
    adminSetMonsterLevel(adminId, Number(userId), Number(collectionId), Number(level || 1));
    console.log('Monster level updated.');
    return;
  }

  if (command === 'adjust-monster-stat') {
    const [userId, collectionId, statKey, amount] = args;
    adminAdjustMonsterBonusStat(adminId, Number(userId), Number(collectionId), statKey, Number(amount || 0));
    console.log('Monster bonus stat updated.');
    return;
  }

  if (command === 'set-run-wave') {
    const [userId, wave] = args;
    adminSetRunWave(adminId, Number(userId), Number(wave || 1));
    console.log('Run wave updated.');
    return;
  }

  if (command === 'set-role') {
    const [userId, role] = args;
    adminSetRole(adminId, Number(userId), role);
    console.log('Role updated.');
    return;
  }

  if (command === 'unlock-mode') {
    const [userId, mode] = args;
    adminUnlockMode(adminId, Number(userId), mode);
    console.log('Mode unlocked.');
    return;
  }

  if (command === 'clear-run') {
    const [userId] = args;
    adminClearRun(adminId, Number(userId));
    console.log('Active run cleared.');
    return;
  }

  usage();
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
