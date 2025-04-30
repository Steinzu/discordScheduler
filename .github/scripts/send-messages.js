const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Get the Discord webhook URL from the environment variable
const webhookUrl = process.env.WEBHOOK_URL;
const githubToken = process.env.GHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;

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

// Get messages that are scheduled for now or earlier
const now = new Date();
const messages = messagesData.messages || [];
const messagesToSend = messages.filter(message => 
  new Date(message.scheduledTime) <= now
);

console.log(`Found ${messagesToSend.length} messages to send`);

// Function to send a message to Discord webhook
async function sendMessage(message) {
  try {
    // Handle both old format (string content) and new format (messageData object)
    const payload = message.messageData || { content: message.content };
    
    // Remove any timestamp from embeds to prevent "Today at XX:XX" display
    if (payload.embeds && payload.embeds.length > 0) {
      for (const embed of payload.embeds) {
        if (embed.timestamp) {
          delete embed.timestamp;
        }
      }
    }
    
    // Validate that there's actual content
    if (!payload.content?.trim() && 
        (!payload.embeds || 
         payload.embeds.length === 0 || 
         (!payload.embeds[0].description?.trim() && 
          !payload.embeds[0].title?.trim() && 
          !payload.embeds[0].fields?.length))) {
      console.error(`Error sending message ID ${message.id}: Cannot send an empty message (code: 50006)`);
      return false;
    }
    
    const response = await axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    });
    
    console.log(`Sent message ID: ${message.id}`);
    return true;
  } catch (error) {
    // Specific error handling
    if (error.response?.data?.code === 50006) {
      console.error(`Error sending message ID ${message.id}: Cannot send an empty message (code: 50006)`);
    } else {
      console.error(`Error sending message ID ${message.id}:`, error.response?.data || error.message);
    }
    return false;
  }
}

async function processMessages() {
  let messagesSent = false;
  
  for (const message of messagesToSend) {
    const success = await sendMessage(message);
    if (success) {
      const index = messages.findIndex(m => m.id === message.id);
      if (index !== -1) {
        messages.splice(index, 1);
        messagesSent = true;
      }
    }
  }

  if (messagesSent) {
    fs.writeFileSync(messagesPath, JSON.stringify({ messages }, null, 2));

    if (githubToken && repo) {
      await commitChanges();
    }
  }
}

async function commitChanges() {
  try {
    const fileContent = fs.readFileSync(messagesPath, 'utf8');
    const content = Buffer.from(fileContent).toString('base64');
    
    const fileInfoResponse = await axios.get(
      `https://api.github.com/repos/${repo}/contents/data/messages.json`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    await axios.put(
      `https://api.github.com/repos/${repo}/contents/data/messages.json`,
      {
        message: 'Remove sent messages',
        content,
        sha: fileInfoResponse.data.sha,
        branch: 'gh-pages'
      },
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    console.log('Successfully committed changes to GitHub');
  } catch (error) {
    console.error('Error committing changes:', error.response?.data || error.message);
  }
}

processMessages()
  .then(() => console.log('Finished processing messages'))
  .catch(error => console.error('Error processing messages:', error));
