const Extension = require('../sdk/Extension');

class VoiceTTSExtension extends Extension {
  constructor() {
    super({
      id: 'voice_tts',
      name: 'Text-To-Speech',
      version: '1.0.0',
      icon: 'volume',
      description: 'Síntese de voz para as respostas do bot na call.'
    });
  }
}

module.exports = new VoiceTTSExtension();