const { safeEditMessage } = require('../utils/helpers');

// Show main menu
async function showMainMenu(chatId, bot, userStates, messageId = null) {
  const isConnected = userStates[chatId]?.whatsapp?.isConnected || false;
  
  const menuText = `👋 *Welcome to Auto Accept Bot!*\n\nStatus: ${isConnected ? '✅ Connected' : '❌ Disconnected'}\n\nPilih menu:`;
  const keyboard = {
    inline_keyboard: [
      [{ text: '🔑 Login WhatsApp', callback_data: 'login' }],
      [{ text: '🤖 Auto Accept Settings', callback_data: 'auto_accept' }],
      [{ text: '👥 Admin Management', callback_data: 'admin_management' }],
      [{ text: '✏️ Rename Groups', callback_data: 'rename_groups' }],
      [{ text: '🔄 Status', callback_data: 'status' }],
      [{ text: '🚪 Logout', callback_data: 'logout' }]
    ]
  };
  
  if (messageId) {
    await safeEditMessage(bot, chatId, messageId, menuText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } else {
    await bot.sendMessage(chatId, menuText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
}

// Show Admin Management Menu
async function showAdminManagementMenu(chatId, bot, messageId = null) {
  const menuText = `👥 *Admin Management*\n\nPilih aksi yang ingin dilakukan:`;
  const keyboard = {
    inline_keyboard: [
      [{ text: '➕ Add & Promote Admin', callback_data: 'add_promote_admin' }],
      [{ text: '➖ Demote Admin', callback_data: 'demote_admin' }],
      [{ text: '🏠 Menu Utama', callback_data: 'main_menu' }]
    ]
  };
  
  if (messageId) {
    await safeEditMessage(bot, chatId, messageId, menuText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  } else {
    await bot.sendMessage(chatId, menuText, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
}

module.exports = {
  showMainMenu,
  showAdminManagementMenu
};