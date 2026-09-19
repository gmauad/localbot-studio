const { REST, Routes, Client, GatewayIntentBits, ApplicationCommandOptionType } = require('discord.js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// ============================================================
// COMANDOS
// ============================================================
const commands = [
  {
    name: 'chat',
    description: 'Chat with LLM',
    options: [
      {
        name: 'message',
        description: 'Message to send to LLM',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ]
  },
  {
    name: 'request',
    description: 'Make a request to the LLM without context',
    options: [
      {
        name: 'message',
        description: 'Message to send to LLM',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ]
  },
  {
    name: 'config',
    description: 'Configure LLM',
    options: [
      {
        name: 'message',
        description: 'Message to send to LLM',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ]
  },
  {
    name: 'prompt',
    description: 'View LLM configuration',
  },
  {
    name: 'reset',
    description: 'Reset LLM context chat',
  },
  {
    name: 'help',
    description: 'Give name of commands and their description',
  },
  {
    name: 'directresponse',
    description: 'Set the bot to always respond to messages',
    options: [
      {
        name: 'value',
        description: 'Set the value of alwaysRespond',
        type: ApplicationCommandOptionType.Boolean,
        required: true,
      },
    ]
  },
  {
    name: 'scan',
    description: 'Escaneia mensagens de um canal e constrói perfis dos usuários (só owner)',
    options: [
    {
      name: 'canal',
      description: 'Canal a ser escaneado',
      type: ApplicationCommandOptionType.Channel,
      required: true
    },
    {
      name: 'limite',
      description: 'Quantidade de mensagens a processar',
      type: ApplicationCommandOptionType.Integer,
      required: true,
      choices: [
         { name: '100 mensagens', value: 100 },
         { name: '500 mensagens', value: 500 },
         { name: '1000 mensagens', value: 1000 }
        ]
    }
    ]
   }
  
];

// ============================================================
// REGISTRO
// ============================================================
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    if (!process.env.TOKEN) {
      console.error('[ERRO] TOKEN não encontrado no .env');
      process.exit(1);
    }
    if (!process.env.CLIENT_ID) {
      console.error('[ERRO] CLIENT_ID não encontrado no .env');
      process.exit(1);
    }

    console.log('Started refreshing application (/) commands.');

    // Registro GLOBAL — pode demorar até 1h pro Discord propagar
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();