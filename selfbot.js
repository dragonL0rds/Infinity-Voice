const WebSocket = require('ws');
const axios = require('axios');
const { config } = require('dotenv');
const { setIntervalAsync } = require('set-interval-async');

// Load environment variables from .env file
config();

const status = 'dnd'; // online/dnd/idle
const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const SELF_MUTE = process.env.SELF_MUTE === 'true';
const SELF_DEAF = process.env.SELF_DEAF === 'true';
const usertoken = process.env.TOKEN;

if (!usertoken) {
  console.error('[ERROR] Please add a token inside Secrets.');
  process.exit(1);
}

const headers = { Authorization: usertoken, 'Content-Type': 'application/json' };

async function validateToken() {
  try {
    const response = await axios.get('https://canary.discordapp.com/api/v9/users/@me', { headers });
    if (response.status !== 200) {
      throw new Error('Invalid token');
    }
    const userinfo = response.data;
    return {
      username: userinfo.username,
      discriminator: userinfo.discriminator,
      userid: userinfo.id
    };
  } catch (error) {
    console.error(`[ERROR] ${error.message}`);
    process.exit(1);
  }
}

async function joiner(token, status) {
  const ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json');

  ws.on('open', () => {
    ws.on('message', async (data) => {
      const start = JSON.parse(data);

      // Check if we received the expected start message
      if (start.d && start.d.heartbeat_interval) {
        const heartbeat = start.d.heartbeat_interval / 1000; // Convert milliseconds to seconds

        const auth = {
          op: 2,
          d: {
            token: token,
            properties: {
              $os: 'Windows 10',
              $browser: 'Google Chrome',
              $device: 'Windows'
            },
            presence: {
              status: status,
              afk: false
            }
          }
        };

        const vc = {
          op: 4,
          d: {
            guild_id: GUILD_ID,
            channel_id: CHANNEL_ID,
            self_mute: SELF_MUTE,
            self_deaf: SELF_DEAF
          }
        };

        ws.send(JSON.stringify(auth));
        ws.send(JSON.stringify(vc));
        ws.send(JSON.stringify({ op: 1, d: null })); // Send initial heartbeat

        setIntervalAsync(async () => {
          ws.send(JSON.stringify({ op: 1, d: null })); // Send heartbeat
        }, heartbeat * 1000); // Convert seconds to milliseconds
      } else {
        console.error('Unexpected WebSocket message received:', start);
      }
    });
  });

  ws.on('close', () => {
    console.log('Connection closed, reconnecting...');
    joiner(token, status); // Reconnect on close
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error: ${error.message}`);
  });
}

async function runJoiner() {
  const { username, discriminator, userid } = await validateToken();
  console.log(`Logged in as ${username}#${discriminator} (${userid}).`);
  await joiner(usertoken, status);
}

runJoiner();