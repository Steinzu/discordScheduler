const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Get the Discord webhook URL from the environment variable
const webhookUrl = process.env.WEBHOOK_URL;

if (!webhookUrl) {
  console.error('DISCORD_WEBHOOK_URL environment variable not set');
  process.exit(1);
}

// Path to the messages file
const messagesPath = path.join(process.cwd(), 'data', 'messages.json');

// Check if the messages file exists
if (!fs.existsSync(messagesPath)) {
  console.log('No messages file found. Exiting.');
  process.exit(0);
}

// Read and parse the messages file
let messagesData;
try {
  const messagesContent = fs.readFileSync(messagesPath, 'utf8');
  messagesData = JSON.parse(messagesContent);
} catch (error) {
  console.error('Error reading or parsing messages file:', error);
  process.exit(1);
}

// Get unsent messages that are scheduled for now or earlier
const now = new Date();
const messages = messagesData.messages || [];
const messagesToSend = messages.filter(message => 
  !message.sent && new Date(message.scheduledTime) <= now
);

console.log(`Found ${messagesToSend.length} messages to send`);

// Function to send a message to Discord webhook
async function sendMessage(message) {
  try {
    await axios.post(webhookUrl, {
      content: message.content
    });
    console.log(`Sent message ID: ${message.id}`);
    return true;
  } catch (error) {
    console.error(`Error sending message ID ${message.id}:`, error.response?.data || error.message);
    return false;
  }
}

// Process all messages that need to be sent
async function processMessages() {
  for (const message of messagesToSend) {
    const success = await sendMessage(message);
    if (success) {
      // Mark message as sent
      message.sent = true;
    }
  }

  // Save the updated messages back to the file
  fs.writeFileSync(messagesPath, JSON.stringify({ messages }, null, 2));
}

// Run the process
processMessages()
  .then(() => console.log('Finished processing messages'))
  .catch(error => console.error('Error processing messages:', error));
