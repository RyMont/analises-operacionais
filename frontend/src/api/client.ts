import axios from 'axios';

/**
 * Cliente Axios configurado para se comunicar com o backend Django.
 * 
 * Por que existe: Centraliza as requisições HTTP da aplicação, configurando
 * automaticamente o envio de credenciais (cookies de sessão) e o tratamento
 * de proteção CSRF (Cross-Site Request Forgery) exigido pelo Django.
 */
/**
 * Obtém dinamicamente a porta do backend com base na porta em que o frontend está rodando.
 * Se o frontend estiver rodando na porta de teste (5174), usa o backend de teste na 8001.
 * Caso contrário, assume a porta de produção (8000).
 */
export const getBackendPort = (): string => {
  return window.location.port === '5174' ? '8001' : '8000';
};

const api = axios.create({
  // Por que existe: Obtém dinamicamente o IP ou host que está acessando o frontend para direcionar as requisições de API ao backend correto.
  baseURL: `http://${window.location.hostname}:${getBackendPort()}`,
  withCredentials: true,            // Envia cookies (sessão de login) em todas as requisições
  xsrfCookieName: window.location.port === '5174' ? 'csrftoken_teste' : 'csrftoken', // Evita colisão com os cookies de produção
  xsrfHeaderName: 'X-CSRFToken',    // Header HTTP que o Django espera para o token CSRF
});

// Por que existe: Intercepta a requisição antes de ser enviada para tratar possíveis erros de configuração.
api.interceptors.request.use((config) => {
  return config;
}, (error) => {
  console.error('[API Request Error]', error);
  return Promise.reject(error);
});

// Por que existe: Monitora respostas de erro de rede e CORS, fornecendo dicas detalhadas
// no console do navegador do cliente caso ocorra uma falha de conexão.
api.interceptors.response.use((response) => {
  return response;
}, (error) => {
  console.error('[API Response Error]', {
    message: error.message,
    code: error.code,
    config: error.config,
    response: error.response
  });

  if (error.code === 'ERR_NETWORK') {
    console.error(
      '💡 DICA DE REDE/CORS:\n' +
      'Se você vir esta mensagem, a requisição ao backend falhou.\n' +
      '1. Verifique se o servidor Django no backend está rodando com: python manage.py runserver 0.0.0.0:8001\n' +
      '2. Se o backend estiver rodando, o Firewall do Windows da máquina servidora está bloqueando conexões na porta 8001.\n' +
      '3. Certifique-se de que ambas as máquinas estão conectadas na mesma rede local e o IP acessado é o correto.'
    );
  }
  return Promise.reject(error);
});

export default api;
