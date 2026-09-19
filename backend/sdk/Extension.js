class Extension {
  constructor({ id, name, version, description }) {
    if (!id || !name) {
      throw new Error("❌ Toda extensão precisa ter um 'id' e um 'name'.");
    }
    
    this.id = id;
    this.name = name;
    this.version = version || '1.0.0';
    this.description = description || 'Sem descrição.';
    
    // O que vai pro cérebro da IA
    this.systemPromptInject = '';

    // Comandos de barra do Discord (/comando)
    this.slashCommands = [];

    // Eventos do Discord (messageCreate, voiceStateUpdate, etc)
    this.events = {};
    
    // Configurações personalizadas que a extensão pode precisar
    this.configs = {}; 
    
    // Prompt que muda dependendo de quem fala (ex: Memórias daquele usuário específico)
    this.getDynamicPrompt = (userId) => { return ""; };
  }

  /**
   * Ciclo de Vida: Antes de enviar pro Discord.
   * Ideal para ler tags como <BUSCAR> ou <CRIAR_IMAGEM> e rodar APIs externas.
   */
  async onBeforeSend({ rawContent, contextId, userId, helpers, ultimaImagemEnviada }) {
    return null; // Por padrão, não faz nada e deixa o texto passar
  }

  /**
   * Ciclo de Vida: Executado assim que o bot liga e carrega a extensão.
   */
  onLoad() {
    // Pode ser sobrescrito para conectar em bancos de dados, etc.
  }
}

module.exports = Extension;