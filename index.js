const TelegramBot = require('node-telegram-bot-api');
const { restoreAllSessions } = require('./whatsappClient');
const { handleAuthCallbacks, handleAuthMessages } = require('./handlers/authHandler');
const { handleAdminCallbacks, handleAdminMessages } = require('./handlers/adminHandler');
const { handleGroupCallbacks, handleGroupMessages } = require('./handlers/groupHandler');
const { showMainMenu } = require('./handlers/menuHandler');
const { isOwner } = require('./utils/helpers');
const config = require('./config');

// Bot instance & user states
const bot = new TelegramBot(config.telegram.token, { polling: true });
const userStates = {};

// Initialize bot - restore sessions on startup
async function initializeBot() {
  console.log('🔄 Restoring existing sessions...');
  
  try {
    const restoredSessions = await restoreAllSessions(bot);
    
    if (restoredSessions.length > 0) {
      console.log(`✅ Restored ${restoredSessions.length} sessions:`, restoredSessions);
      
      // Notify owners about restored sessions
      for (const ownerId of config.telegram.owners) {
        try {
          await bot.sendMessage(
            ownerId, 
            `🚀 *Bot Started!*\n\n✅ Restored ${restoredSessions.length} WhatsApp session(s)\n\nBot siap digunakan!`,
            { parse_mode: 'Markdown' }
          );
        } catch (err) {
          console.warn(`Could not notify owner ${ownerId}:`, err.message);
        }
      }
    } else {
      console.log('ℹ️ No existing sessions found');
    }
  } catch (err) {
    console.error('❌ Error restoring sessions:', err.message);
  }
}

// Handle /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  if (!isOwner(userId)) {
    await bot.sendMessage(chatId, '❌ Lu bukan owner bot ini bro!');
    return;
  }
  
  await showMainMenu(chatId, bot, userStates);
});

// Handle callback queries
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  
  if (!isOwner(userId)) {
    try {
      await bot.answerCallbackQuery(query.id, { 
        text: '❌ Lu bukan owner!', 
        show_alert: true 
      });
    } catch (err) {
      console.warn(`Failed to answer callback query: ${err.message}`);
    }
    return;
  }
  
  try {
    // Route callbacks to appropriate handlers
    if (data.startsWith('login') || data.startsWith('cancel_login') || data.startsWith('logout')) {
      await handleAuthCallbacks(query, bot, userStates);
    }
    else if (data.startsWith('admin_') || data.startsWith('add_promote') || data.startsWith('demote_') || 
             data.startsWith('toggle_group_') || data.startsWith('groups_page_') || data.startsWith('search_') ||
             data.startsWith('finish_') || data.startsWith('confirm_') || data.startsWith('cancel_admin') ||
             data.startsWith('start_search') || data.startsWith('toggle_demote')) {
      await handleAdminCallbacks(query, bot, userStates);
    }
    else if (data.startsWith('rename_') || data.startsWith('select_base_') || data.startsWith('confirm_rename')) {
      await handleGroupCallbacks(query, bot, userStates);
    }
    else if (data === 'main_menu') {
      await showMainMenu(chatId, bot, userStates, query.message.message_id);
    }
    else if (data === 'auto_accept' || data === 'toggle_auto_accept') {
      await handleAuthCallbacks(query, bot, userStates);
    }
    else if (data === 'status') {
      await handleAuthCallbacks(query, bot, userStates);
    }
    
  } catch (err) {
    console.error('Error handling callback:', err);
    try {
      await bot.sendMessage(chatId, '❌ Terjadi error saat memproses perintah. Coba lagi ya!');
    } catch (sendErr) {
      console.error('Failed to send error message:', sendErr.message);
    }
  }
  
  // Answer callback query with error handling
  try {
    await bot.answerCallbackQuery(query.id);
  } catch (err) {
    console.warn(`Failed to answer callback query: ${err.message}`);
  }
});

// Handle text messages
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) return;
  if (!isOwner(userId)) return;
  
  try {
    // Route messages to appropriate handlers
    let handled = false;
    
    // Try auth handler first
    handled = await handleAuthMessages(msg, bot, userStates);
    
    // If not handled by auth, try admin handler
    if (!handled) {
      handled = await handleAdminMessages(msg, bot, userStates);
    }
    
    // If not handled by admin, try group handler
    if (!handled) {
      handled = await handleGroupMessages(msg, bot, userStates);
    }
    
    // If no handler processed it, ignore
    if (!handled) {
      console.log(`[DEBUG] Unhandled message from ${userId}: ${text}`);
    }
    
  } catch (err) {
    console.error('Error handling message:', err);
    try {
      await bot.sendMessage(chatId, '❌ Terjadi error. Coba lagi ya!');
    } catch (sendErr) {
      console.error('Failed to send error message:', sendErr.message);
    }
  }
});

// Global error handlers
bot.on('error', (error) => {
  console.error('Telegram Bot Error:', error);
});

bot.on('polling_error', (error) => {
  console.error('Telegram Polling Error:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

// Export userStates for whatsappClient
module.exports = { userStates };

// Initialize bot with session restore
initializeBot().then(() => {
  console.log('✅ Bot started! Send /start to begin.');
}).catch(err => {
  console.error('❌ Bot initialization failed:', err);
});