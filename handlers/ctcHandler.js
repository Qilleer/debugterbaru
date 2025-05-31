const { 
  getAllGroups,
  addParticipantToGroup,
  isParticipantInGroup
} = require('../whatsappClient');
const { showAddCtcMenu } = require('./menuHandler');
const { 
  safeDeleteMessage, 
  safeEditMessage, 
  createPagination,
  parsePhoneNumbers,
  generateProgressMessage,
  isRateLimitError,
  sleep,
  clearUserFlowState
} = require('../utils/helpers');

// Handle CTC-related callbacks
async function handleCtcCallbacks(query, bot, userStates) {
  const chatId = query.message.chat.id;
  const userId = query.from.id;
  const data = query.data;
  
  try {
    switch(true) {
      case data === 'add_ctc':
        await showAddCtcMenu(chatId, bot, query.message.message_id);
        break;
        
      case data === 'add_ctc_chat':
        await handleAddCtcChat(chatId, userId, bot, userStates);
        break;
        
      case data === 'add_ctc_file':
        await handleAddCtcFile(chatId, userId, bot, userStates);
        break;
        
      case data === 'confirm_ctc_numbers':
        await handleConfirmCtcNumbers(chatId, userId, bot, userStates);
        break;
        
      case data === 'search_ctc_groups':
        await handleSearchCtcGroups(chatId, userId, bot, userStates);
        break;
        
      case data === 'finish_ctc_group_selection':
        await handleFinishCtcGroupSelection(chatId, userId, bot, userStates);
        break;
        
      case data === 'confirm_add_ctc':
        await handleConfirmAddCtc(chatId, userId, bot, userStates);
        break;
        
      case data === 'cancel_ctc_flow':
        await handleCancelCtcFlow(chatId, userId, bot, userStates);
        break;
        
      case data.startsWith('toggle_ctc_group_'):
        const groupId = data.replace('toggle_ctc_group_', '');
        await handleToggleCtcGroupSelection(chatId, userId, groupId, bot, userStates, query.message.message_id);
        break;
        
      case data.startsWith('ctc_groups_page_'):
        const page = parseInt(data.replace('ctc_groups_page_', ''));
        await handleCtcGroupsPage(chatId, userId, page, bot, userStates, query.message.message_id);
        break;
    }
  } catch (err) {
    console.error('Error in CTC callback handler:', err);
    await bot.sendMessage(chatId, '❌ Terjadi error saat memproses add contact.');
  }
}

// Handle CTC-related messages
async function handleCtcMessages(msg, bot, userStates) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const text = msg.text;
  
  // Handle CTC flow input
  if (userStates[userId]?.ctcFlow) {
    const state = userStates[userId].ctcFlow;
    
    if (state.step === 'waiting_search_query') {
      // Delete user's message
      await safeDeleteMessage(bot, chatId, msg.message_id);
      
      state.searchQuery = text.trim();
      state.currentPage = 0;
      state.step = 'select_groups';
      
      const loadingMsg = await bot.sendMessage(chatId, '⏳ Mencari grup...');
      await showCtcGroupsList(chatId, userId, bot, userStates, loadingMsg.message_id);
      return true;
    }
    
    if (state.step === 'waiting_numbers' && state.inputMethod === 'chat') {
      // Delete user's message
      await safeDeleteMessage(bot, chatId, msg.message_id);
      
      // Parse contact numbers
      const { phoneNumbers, errors } = parsePhoneNumbers(text);
      
      if (errors.length > 0) {
        await bot.sendMessage(chatId, `❌ ${errors.join('\n')}\n\nFormat harus 10-15 digit angka saja, tanpa + atau spasi.`);
        return true;
      }
      
      if (phoneNumbers.length === 0) {
        await bot.sendMessage(chatId, '❌ Tidak ada nomor contact yang valid!');
        return true;
      }
      
      state.contactNumbers = phoneNumbers;
      state.step = 'confirm_numbers';
      
      await showConfirmCtcNumbers(chatId, userId, bot, userStates);
      return true;
    }
  }
  
  return false; // Not handled
}

// Handle CTC via chat input
async function handleAddCtcChat(chatId, userId, bot, userStates) {
  // Check if WhatsApp is connected
  if (!userStates[userId]?.whatsapp?.isConnected) {
    await bot.sendMessage(chatId, '❌ WhatsApp belum terhubung! Login dulu ya.');
    return;
  }
  
  // Initialize CTC flow state
  userStates[userId].ctcFlow = {
    inputMethod: 'chat',
    step: 'waiting_numbers',
    contactNumbers: [],
    selectedGroups: [],
    currentPage: 0,
    searchQuery: '',
    groups: []
  };
  
  const message = `📝 *Input Nomor Contact*\n\n`;
  const instructions = `💬 Ketik nomor contact yang mau di-add ke grup:\n\n`;
  const format = `**Format:**\n62812345\n6213456\n62987654\n\n*(Satu nomor per baris, tanpa + atau spasi)*`;
  
  await bot.sendMessage(chatId, message + instructions + format, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Batal', callback_data: 'cancel_ctc_flow' }]
      ]
    }
  });
}

// Handle CTC via file input
async function handleAddCtcFile(chatId, userId, bot, userStates) {
  // Check if WhatsApp is connected
  if (!userStates[userId]?.whatsapp?.isConnected) {
    await bot.sendMessage(chatId, '❌ WhatsApp belum terhubung! Login dulu ya.');
    return;
  }
  
  // Initialize CTC flow state
  userStates[userId].ctcFlow = {
    inputMethod: 'file',
    step: 'waiting_file',
    contactNumbers: [],
    selectedGroups: [],
    currentPage: 0,
    searchQuery: '',
    groups: []
  };
  
  const message = `📄 *Upload File TXT*\n\n`;
  const instructions = `📤 Upload file .txt yang berisi nomor contact:\n\n`;
  const format = `**Format dalam file:**\n62812345\n6213456\n62987654\n\n*(Satu nomor per baris, tanpa + atau spasi)*`;
  
  await bot.sendMessage(chatId, message + instructions + format, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Batal', callback_data: 'cancel_ctc_flow' }]
      ]
    }
  });
}

// Show confirm CTC numbers - EXPORT FUNCTION
async function showConfirmCtcNumbers(chatId, userId, bot, userStates) {
  const state = userStates[userId].ctcFlow;
  
  let message = `✅ *Nomor Contact Berhasil Diparse*\n\n`;
  message += `📊 Total: ${state.contactNumbers.length} nomor\n\n`;
  message += `📝 **Daftar Nomor:**\n`;
  
  state.contactNumbers.forEach((number, index) => {
    message += `${index + 1}. ${number}\n`;
    if (index >= 19) { // Limit tampilan 20 nomor pertama
      message += `... dan ${state.contactNumbers.length - 20} nomor lainnya\n`;
      return false;
    }
  });
  
  message += `\n💬 Lanjut ke pemilihan grup?`;
  
  await bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Lanjut Pilih Grup', callback_data: 'confirm_ctc_numbers' }],
        [{ text: '❌ Batal', callback_data: 'cancel_ctc_flow' }]
      ]
    }
  });
}

// Handle confirm CTC numbers
async function handleConfirmCtcNumbers(chatId, userId, bot, userStates) {
  const state = userStates[userId].ctcFlow;
  
  if (!state || state.contactNumbers.length === 0) {
    await bot.sendMessage(chatId, '❌ Tidak ada nomor contact yang valid!');
    return;
  }
  
  const loadingMsg = await bot.sendMessage(chatId, '⏳ Mengambil daftar grup...');
  
  try {
    const groups = await getAllGroups(userId);
    
    if (!groups || groups.length === 0) {
      await safeEditMessage(bot, chatId, loadingMsg.message_id, '❌ Tidak ada grup yang ditemukan!', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🏠 Menu Utama', callback_data: 'main_menu' }]
          ]
        }
      });
      return;
    }
    
    state.groups = groups;
    state.step = 'select_groups';
    
    await showCtcGroupsList(chatId, userId, bot, userStates, loadingMsg.message_id);
    
  } catch (err) {
    console.error('Error getting groups:', err);
    await safeEditMessage(bot, chatId, loadingMsg.message_id, `❌ Error mengambil daftar grup: ${err.message}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏠 Menu Utama', callback_data: 'main_menu' }]
        ]
      }
    });
  }
}

// Show CTC groups list with pagination
async function showCtcGroupsList(chatId, userId, bot, userStates, messageId) {
  const state = userStates[userId].ctcFlow;
  const groupsPerPage = 8;
  
  // Filter groups by search query
  let filteredGroups = state.groups;
  if (state.searchQuery) {
    filteredGroups = state.groups.filter(group => 
      group.name.toLowerCase().includes(state.searchQuery.toLowerCase())
    );
  }
  
  const pagination = createPagination(state.currentPage, filteredGroups.length, groupsPerPage);
  const pageGroups = filteredGroups.slice(pagination.startIndex, pagination.endIndex);
  
  let message = `📋 *Pilih Grup untuk Add Contact*\n\n`;
  
  if (state.searchQuery) {
    message += `🔍 Pencarian: "${state.searchQuery}"\n`;
    message += `📊 Hasil: ${filteredGroups.length} grup\n\n`;
  }
  
  message += `📄 Halaman ${pagination.currentPage + 1} dari ${pagination.totalPages}\n`;
  message += `✅ Terpilih: ${state.selectedGroups.length} grup\n`;
  message += `📞 Contact: ${state.contactNumbers.length} nomor\n\n`;
  
  const keyboard = [];
  
  // Groups buttons
  pageGroups.forEach(group => {
    const isSelected = state.selectedGroups.includes(group.id);
    const icon = isSelected ? '✅' : '⭕';
    const adminStatus = group.isAdmin ? '👑' : '👤';
    
    keyboard.push([{
      text: `${icon} ${adminStatus} ${group.name}`,
      callback_data: `toggle_ctc_group_${group.id}`
    }]);
  });
  
  // Navigation buttons
  const navButtons = [];
  if (pagination.hasPrev) {
    navButtons.push({ text: '◀️ Prev', callback_data: `ctc_groups_page_${pagination.currentPage - 1}` });
  }
  if (pagination.hasNext) {
    navButtons.push({ text: 'Next ▶️', callback_data: `ctc_groups_page_${pagination.currentPage + 1}` });
  }
  if (navButtons.length > 0) {
    keyboard.push(navButtons);
  }
  
  // Action buttons
  keyboard.push([{ text: '🔍 Cari Grup', callback_data: 'search_ctc_groups' }]);
  
  if (state.selectedGroups.length > 0) {
    keyboard.push([{ text: '✅ Selesai', callback_data: 'finish_ctc_group_selection' }]);
  }
  
  keyboard.push([{ text: '❌ Batal', callback_data: 'cancel_ctc_flow' }]);
  
  await safeEditMessage(bot, chatId, messageId, message, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });
}

// Handle group selection toggle
async function handleToggleCtcGroupSelection(chatId, userId, groupId, bot, userStates, messageId) {
  const state = userStates[userId].ctcFlow;
  
  if (!state || state.step !== 'select_groups') return;
  
  const index = state.selectedGroups.indexOf(groupId);
  if (index > -1) {
    state.selectedGroups.splice(index, 1);
  } else {
    state.selectedGroups.push(groupId);
  }
  
  await showCtcGroupsList(chatId, userId, bot, userStates, messageId);
}

// Handle groups page navigation
async function handleCtcGroupsPage(chatId, userId, page, bot, userStates, messageId) {
  const state = userStates[userId].ctcFlow;
  
  if (!state || state.step !== 'select_groups') return;
  
  state.currentPage = page;
  await showCtcGroupsList(chatId, userId, bot, userStates, messageId);
}

// Handle search groups
async function handleSearchCtcGroups(chatId, userId, bot, userStates) {
  const state = userStates[userId].ctcFlow;
  
  if (!state || state.step !== 'select_groups') return;
  
  state.step = 'waiting_search_query';
  
  await bot.sendMessage(chatId, '🔍 *Cari Grup*\n\nKetik nama grup yang mau dicari:', {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '❌ Batal', callback_data: 'cancel_ctc_flow' }]
      ]
    }
  });
}

// Handle finish group selection
async function handleFinishCtcGroupSelection(chatId, userId, bot, userStates) {
  const state = userStates[userId].ctcFlow;
  
  if (!state || state.selectedGroups.length === 0) return;
  
  const selectedGroupNames = state.selectedGroups.map(groupId => {
    const group = state.groups.find(g => g.id === groupId);
    return group ? group.name : 'Unknown';
  });
  
  let message = `🔍 *Konfirmasi Add Contact*\n\n`;
  message += `📞 **Contact yang akan di-add:**\n`;
  message += `Total: ${state.contactNumbers.length} nomor\n\n`;
  
  // Show first 5 numbers as preview
  state.contactNumbers.slice(0, 5).forEach((number, index) => {
    message += `${index + 1}. ${number}\n`;
  });
  
  if (state.contactNumbers.length > 5) {
    message += `... dan ${state.contactNumbers.length - 5} nomor lainnya\n`;
  }
  
  message += `\n📂 **Grup tujuan (${state.selectedGroups.length}):**\n`;
  selectedGroupNames.forEach((name, index) => {
    message += `${index + 1}. ${name}\n`;
  });
  message += `\n⚠️ Proses ini tidak bisa dibatalkan!`;
  
  await bot.sendMessage(chatId, message, {
    parse_mode: 'Markdown',
    reply_markup: {
      inline_keyboard: [
        [{ text: '✅ Lanjutkan Add Contact', callback_data: 'confirm_add_ctc' }],
        [{ text: '❌ Batal', callback_data: 'cancel_ctc_flow' }]
      ]
    }
  });
}

// Handle confirm add CTC
async function handleConfirmAddCtc(chatId, userId, bot, userStates) {
  const state = userStates[userId].ctcFlow;
  
  if (!state || state.selectedGroups.length === 0 || state.contactNumbers.length === 0) return;
  
  const loadingMsg = await bot.sendMessage(chatId, '⏳ Memulai proses add contact...');
  
  try {
    let statusMessage = '';
    let successCount = 0;
    let failCount = 0;
    let totalOperations = state.selectedGroups.length * state.contactNumbers.length;
    let currentOperation = 0;
    
    for (const groupId of state.selectedGroups) {
      const group = state.groups.find(g => g.id === groupId);
      const groupName = group?.name || 'Unknown';
      
      statusMessage += `\n📂 **${groupName}:**\n`;
      
      for (const contactNumber of state.contactNumbers) {
        currentOperation++;
        
        try {
          // Check if participant is already in group
          const isInGroup = await isParticipantInGroup(userId, groupId, contactNumber);
          
          if (isInGroup) {
            statusMessage += `   ℹ️ ${contactNumber} sudah ada di grup\n`;
          } else {
            // Add participant
            await addParticipantToGroup(userId, groupId, contactNumber);
            statusMessage += `   ✅ Added ${contactNumber}\n`;
            successCount++;
          }
          
          // Update progress
          const progressMsg = generateProgressMessage(currentOperation, totalOperations, statusMessage, 'Add Contact');
          await safeEditMessage(bot, chatId, loadingMsg.message_id, progressMsg);
          
          // Delay to avoid rate limit
          await sleep(3000);
          
        } catch (err) {
          failCount++;
          statusMessage += `   ❌ Error ${contactNumber}: ${err.message}\n`;
          console.error(`Error adding contact ${contactNumber} to ${groupId}:`, err);
          
          // If rate limit, wait longer
          if (isRateLimitError(err)) {
            await sleep(10000);
          }
        }
      }
    }
    
    // Final result
    let finalMessage = `🎉 *Proses Add Contact Selesai!*\n\n`;
    finalMessage += `✅ Berhasil: ${successCount}\n`;
    finalMessage += `❌ Gagal: ${failCount}\n\n`;
    finalMessage += `*Detail:*\n${statusMessage}`;
    
    await safeEditMessage(bot, chatId, loadingMsg.message_id, finalMessage, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '📞 Add CTC Lagi', callback_data: 'add_ctc' }],
          [{ text: '🏠 Menu Utama', callback_data: 'main_menu' }]
        ]
      }
    });
    
  } catch (err) {
    console.error('Error in add contact process:', err);
    await safeEditMessage(bot, chatId, loadingMsg.message_id, `❌ Error dalam proses add contact: ${err.message}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🏠 Menu Utama', callback_data: 'main_menu' }]
        ]
      }
    });
  }
  
  // Clear CTC flow state
  clearUserFlowState(userStates, userId, 'ctc');
}

// Handle cancel CTC flow
async function handleCancelCtcFlow(chatId, userId, bot, userStates) {
  // Clear CTC flow state
  clearUserFlowState(userStates, userId, 'ctc');
  
  await bot.sendMessage(chatId, '✅ Proses add contact dibatalkan!');
  await showAddCtcMenu(chatId, bot);
}

module.exports = {
  handleCtcCallbacks,
  handleCtcMessages,
  showConfirmCtcNumbers // Export function ini juga
};
