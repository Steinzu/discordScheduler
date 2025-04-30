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

if (!githubToken) {
  console.error('GHUB_TOKEN environment variable not set');
  process.exit(1);
}

if (!repo) {
  console.error('GITHUB_REPOSITORY environment variable not set');
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
console.log(`Current time: ${now.toISOString()}`);
const messages = messagesData.messages || [];
console.log(`Total messages in file: ${messages.length}`);

const messagesToSend = messages.filter(message => {
  const scheduledTime = new Date(message.scheduledTime);
  const shouldSend = scheduledTime <= now;
  console.log(`Message ${message.id} scheduled for ${scheduledTime.toISOString()} - ${shouldSend ? 'SENDING' : 'SKIPPING'}`);
  return shouldSend;
});

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
    
    console.log(`Successfully sent message ID: ${message.id}`);
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
        console.log(`Removing message ID ${message.id} from messages array at index ${index}`);
        messages.splice(index, 1);
        messagesSent = true;
      } else {
        console.error(`Could not find message ID ${message.id} in messages array!`);
      }
    }
  }

  if (messagesSent) {
    console.log(`Writing ${messages.length} remaining messages to file`);
    fs.writeFileSync(messagesPath, JSON.stringify({ messages }, null, 2));
    console.log('File written successfully');

    try {
      await commitChanges();
      console.log('Changes committed to GitHub successfully');
    } catch (error) {
      console.error('Failed to commit changes to GitHub:', error);
    }
  } else {
    console.log('No messages were sent, no need to update file');
  }
}

async function commitChanges() {
  try {
    // Re-read the file to make sure we have the latest content
    const fileContent = fs.readFileSync(messagesPath, 'utf8');
    const content = Buffer.from(fileContent).toString('base64');
    
    console.log(`Getting SHA for messages.json in repo ${repo}`);
    const fileInfoResponse = await axios.get(
      `https://api.github.com/repos/${repo}/contents/data/messages.json?ref=gh-pages`,
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    const sha = fileInfoResponse.data.sha;
    console.log(`Current file SHA: ${sha}`);

    console.log('Committing changes to GitHub...');
    const response = await axios.put(
      `https://api.github.com/repos/${repo}/contents/data/messages.json`,
      {
        message: 'Remove sent messages',
        content,
        sha,
        branch: 'gh-pages'
      },
      {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    console.log(`GitHub API response status: ${response.status}`);
    
    if (response.status >= 200 && response.status < 300) {
      console.log('Successfully committed changes to GitHub');
    } else {
      console.error('Unexpected status code from GitHub API:', response.status);
    }
  } catch (error) {
    console.error('Error committing changes:');
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response headers:', error.response.headers);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('No response received:', error.request);
    } else {
      console.error('Error message:', error.message);
    }
    console.error('Error stack:', error.stack);
    throw error; // Rethrow to be caught by the caller
  }
}

processMessages()
  .then(() => console.log('Finished processing messages'))
  .catch(error => {
    console.error('Error processing messages:', error);
    process.exit(1);
  });
