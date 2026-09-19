const Extension = require('../sdk/Extension');

class VoiceSTTExtension extends Extension {
  constructor() {
    super({
      id: 'voice_stt',
      name: 'Speech-to-Text',
      version: '1.0.0',
      icon: 'microphone',
      description: 'Transcrição de voz local via Whisper. Processa o áudio dos usuários na call.'
    });
  }
}

module.exports = new VoiceSTTExtension();