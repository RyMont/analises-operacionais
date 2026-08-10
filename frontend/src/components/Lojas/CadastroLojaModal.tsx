import React, { useState, useEffect, useRef } from 'react';
import { X, Loader2, AlertCircle, MapPin, Search } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../api/client';
import type { Loja, Responsavel } from './LojasTable';
import FormField from '../ui/form-field';
import SearchableSelect from '../ui/searchable-select';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

interface CadastroLojaModalProps {
  loja: Loja | null;
  coordenadores: Responsavel[];
  supervisores: Responsavel[];
  onClose: () => void;
  onSaveSuccess: () => void;
  onAddCoordenador: (nome: string) => Promise<string | undefined>;
  onAddSupervisor: (nome: string) => Promise<string | undefined>;
}

/**
 * Modal de cadastro e edição de Lojas do Grupo.
 * 
 * Por que existe: Apresenta o formulário de criação e edição com abas de forma limpa,
 * utilizando um único objeto de estado (formData) e campos gerados dinamicamente para
 * otimizar o tamanho do arquivo e a legibilidade.
 */
export default function CadastroLojaModal({
  loja,
  coordenadores,
  supervisores,
  onClose,
  onSaveSuccess,
  onAddCoordenador,
  onAddSupervisor,
}: CadastroLojaModalProps) {
  // Controle de Abas
  const [activeTab, setActiveTab] = useState<'geral' | 'localizacao' | 'responsaveis' | 'integracoes'>('geral');
  const modalRef = useRef<HTMLDivElement>(null);
  useOnClickOutside(modalRef, onClose);

  // Estado único para todos os campos do formulário
  const [formData, setFormData] = useState<Partial<Loja>>({});

  // Controle de envio e erro
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Inicializa ou limpa formulário dependendo do modo (criar ou editar)
  useEffect(() => {
    setFormData(loja || { status: 'ATIVA', dispensa_gestao_pessoas: false });
    setActiveTab('geral');
    setErrorMsg(null);
  }, [loja]);

  // Atualizador genérico para os campos do formulário
  const handleChange = (field: keyof Loja, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Refs do mapa e do PIN
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerInstanceRef = useRef<any>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  /**
   * Converte o nome de um estado brasileiro retornado pela API para a sigla UF correspondente de 2 letras.
   * Por que existe: Necessário para manter a integridade dos dados no banco do Django que usa apenas UFs de 2 caracteres.
   */
  const translateStateToUF = (stateName: string): string => {
    if (!stateName) return '';
    const cleaned = stateName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const mapping: Record<string, string> = {
      'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM', 'bahia': 'BA',
      'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES', 'goias': 'GO',
      'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG',
      'para': 'PA', 'paraiba': 'PB', 'parana': 'PR', 'pernambuco': 'PE', 'piaui': 'PI',
      'rio de janeiro': 'RJ', 'rio grande do norte': 'RN', 'rio grande do sul': 'RS',
      'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC', 'sao paulo': 'SP',
      'sergipe': 'SE', 'tocantins': 'TO'
    };
    if (stateName.length === 2) return stateName.toUpperCase();
    return mapping[cleaned] || '';
  };

  /**
   * Realiza geocodificação reversa a partir da latitude e longitude do PIN.
   * Por que existe: Permite que ao arrastar o marcador no mapa, o endereço (rua, bairro, cep, etc.) seja atualizado automaticamente para o usuário.
   */
  const handleReverseGeocode = async (lat: number, lon: number) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18`, {
        headers: {
          'User-Agent': 'SistemaAnalisesOperacionais/1.0 (suporte@grupo.com)'
        }
      });
      const data = await response.json();
      if (data && data.address) {
        const addr = data.address;
        
        const ruaName = addr.road || addr.suburb || addr.pedestrian || '';
        const num = addr.house_number ? `, ${addr.house_number}` : '';
        const ruaCompleta = ruaName ? `${ruaName}${num}` : '';
        
        const bairro = addr.suburb || addr.neighbourhood || addr.city_district || '';
        const municipio = addr.city || addr.town || addr.village || addr.municipality || '';
        const ufCode = addr.state ? translateStateToUF(addr.state) : '';
        const cep = addr.postcode || '';

        setFormData(prev => ({
          ...prev,
          rua: ruaCompleta || prev.rua,
          bairro: bairro || prev.bairro,
          municipio: municipio || prev.municipio,
          uf: ufCode || prev.uf,
          cep: cep || prev.cep
        }));
        toast.success('Endereço atualizado com base no PIN!');
      }
    } catch (err) {
      console.error('Erro no reverse geocoding:', err);
      toast.error('Não foi possível obter o endereço para essa coordenada.');
    }
  };

  /**
   * Realiza geocodificação direta buscando o endereço informado no formulário.
   * Por que existe: Permite localizar o endereço no mapa colocando o PIN e preenchendo as coordenadas automaticamente a partir do endereço de texto.
   */
  const handleGeocodeAddress = async () => {
    if (!formData.rua && !formData.municipio) {
      toast.error('Preencha pelo menos a rua ou o município para buscar no mapa.');
      return;
    }
    setGeoLoading(true);
    try {
      const ruaLimpa = formData.rua ? formData.rua.split(',')[0].trim() : '';
      const textoBusca = `${ruaLimpa}${formData.bairro ? ', ' + formData.bairro : ''}${formData.municipio ? ', ' + formData.municipio : ''}${formData.uf ? ', ' + formData.uf : ''}, Brasil`;
      
      const response = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(textoBusca)}&format=json&limit=1`, {
        headers: {
          'User-Agent': 'SistemaAnalisesOperacionais/1.0 (suporte@grupo.com)'
        }
      });
      const data = await response.json();
      
      if (data && Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        
        setFormData(prev => ({ ...prev, latitude: lat, longitude: lon }));
        
        const map = mapInstanceRef.current;
        if (map) {
          map.flyTo([lat, lon], 16);
        }
        toast.success('Endereço localizado com sucesso no mapa!');
      } else {
        toast.error('Endereço não localizado. Tente refinar a busca ou clique manualmente no mapa.');
      }
    } catch (err) {
      console.error('Erro ao geolocalizar endereço:', err);
      toast.error('Erro de comunicação ao geolocalizar o endereço.');
    } finally {
      setGeoLoading(false);
    }
  };

  /**
   * Inicializa o mapa do Leaflet e adiciona eventos de movimentação do marcador e clique para posicionamento.
   * Por que existe: Controla a inicialização e o cleanup das instâncias do Leaflet somente na aba correspondente, evitando vazamento de memória e erros de rendering no modal.
   */
  useEffect(() => {
    const L = (window as any).L;
    if (!L || activeTab !== 'localizacao' || !mapDivRef.current) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerInstanceRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      if (mapInstanceRef.current || !mapDivRef.current) return;

      const lat = formData.latitude ? parseFloat(String(formData.latitude)) : null;
      const lng = formData.longitude ? parseFloat(String(formData.longitude)) : null;
      
      const hasCoords = lat !== null && !isNaN(lat) && lng !== null && !isNaN(lng);
      const startCenter = hasCoords ? [lat, lng] : [-15.78, -47.93];
      const startZoom = hasCoords ? 15 : 4;

      const map = L.map(mapDivRef.current, {
        zoomControl: false
      }).setView(startCenter, startZoom);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      L.control.zoom({
        position: 'topright'
      }).addTo(map);

      if (hasCoords) {
        const marker = L.marker([lat, lng], {
          draggable: true,
          icon: L.divIcon({
            html: `<div style="display: flex; align-items: center; justify-content: center;"><svg style="width: 32px; height: 32px; color: #ea580c; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.15));" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`,
            className: '',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          })
        }).addTo(map);

        marker.on('dragend', async () => {
          const newPos = marker.getLatLng();
          setFormData(prev => ({ ...prev, latitude: newPos.lat, longitude: newPos.lng }));
          await handleReverseGeocode(newPos.lat, newPos.lng);
        });

        markerInstanceRef.current = marker;
      }

      map.on('click', async (e: any) => {
        const clickLatLng = e.latlng;
        setFormData(prev => ({ ...prev, latitude: clickLatLng.lat, longitude: clickLatLng.lng }));
        
        let marker = markerInstanceRef.current;
        if (!marker) {
          marker = L.marker(clickLatLng, {
            draggable: true,
            icon: L.divIcon({
              html: `<div style="display: flex; align-items: center; justify-content: center;"><svg style="width: 32px; height: 32px; color: #ea580c; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.15));" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`,
              className: '',
              iconSize: [32, 32],
              iconAnchor: [16, 32]
            })
          }).addTo(map);

          marker.on('dragend', async () => {
            const newPos = marker.getLatLng();
            setFormData(prev => ({ ...prev, latitude: newPos.lat, longitude: newPos.lng }));
            await handleReverseGeocode(newPos.lat, newPos.lng);
          });

          markerInstanceRef.current = marker;
        } else {
          marker.setLatLng(clickLatLng);
        }

        await handleReverseGeocode(clickLatLng.lat, clickLatLng.lng);
      });

      mapInstanceRef.current = map;
      
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
      
      // Re-calcula após a transição de largura do modal terminar (300ms)
      setTimeout(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 400);
    }, 150);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerInstanceRef.current = null;
      }
    };
  }, [activeTab]);

  /**
   * Sincroniza o marcador e centralização do mapa se as coordenadas forem alteradas via campos de entrada manuais.
   * Por que existe: Mantém o estado visual do mapa sempre sincronizado caso as coordenadas sofram alterações diretas no input.
   */
  useEffect(() => {
    const L = (window as any).L;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    const lat = formData.latitude ? parseFloat(String(formData.latitude)) : null;
    const lng = formData.longitude ? parseFloat(String(formData.longitude)) : null;

    if (lat !== null && !isNaN(lat) && lng !== null && !isNaN(lng)) {
      let marker = markerInstanceRef.current;
      if (!marker) {
        marker = L.marker([lat, lng], {
          draggable: true,
          icon: L.divIcon({
            html: `<div style="display: flex; align-items: center; justify-content: center;"><svg style="width: 32px; height: 32px; color: #ea580c; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.15));" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg></div>`,
            className: '',
            iconSize: [32, 32],
            iconAnchor: [16, 32]
          })
        }).addTo(map);

        marker.on('dragend', async () => {
          const newPos = marker.getLatLng();
          setFormData(prev => ({ ...prev, latitude: newPos.lat, longitude: newPos.lng }));
          await handleReverseGeocode(newPos.lat, newPos.lng);
        });

        markerInstanceRef.current = marker;
      } else {
        const currLatLng = marker.getLatLng();
        if (Math.abs(currLatLng.lat - lat) > 0.0001 || Math.abs(currLatLng.lng - lng) > 0.0001) {
          marker.setLatLng([lat, lng]);
        }
      }
    } else {
      if (markerInstanceRef.current) {
        markerInstanceRef.current.remove();
        markerInstanceRef.current = null;
      }
    }
  }, [formData.latitude, formData.longitude]);

  // Handler rápido para adicionar coordenador dinamicamente
  const handleAddCoordenadorClick = async () => {
    const nome = prompt('Digite o nome do novo Coordenador:');
    if (!nome || !nome.trim()) return;
    const newId = await onAddCoordenador(nome.trim());
    if (newId) {
      handleChange('coordenador', newId);
    }
  };

  // Handler rápido para adicionar supervisor dinamicamente
  const handleAddSupervisorClick = async () => {
    const nome = prompt('Digite o nome do novo Supervisor:');
    if (!nome || !nome.trim()) return;
    const newId = await onAddSupervisor(nome.trim());
    if (newId) {
      handleChange('supervisor', newId);
    }
  };

  // Salva o cadastro de criação ou edição
  const handleSaveLoja = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setActionLoading(true);

    const payload = {
      nome_referencia: formData.nome_referencia || '',
      cliente: formData.cliente || '',
      quadro: formData.quadro || null,
      status: formData.status || 'ATIVA',
      centro_de_custo: formData.centro_de_custo || '',
      codigo_loja: formData.codigo_loja ? parseInt(String(formData.codigo_loja)) : null,
      dispensa_gestao_pessoas: formData.dispensa_gestao_pessoas || false,

      cnpj: formData.cnpj || '',
      cep: formData.cep || '',
      rua: formData.rua || '',
      bairro: formData.bairro || '',
      municipio: formData.municipio || '',
      uf: formData.uf || null,
      sub_regiao: formData.sub_regiao || '',
      latitude: formData.latitude !== undefined && formData.latitude !== null ? parseFloat(String(formData.latitude)) : null,
      longitude: formData.longitude !== undefined && formData.longitude !== null ? parseFloat(String(formData.longitude)) : null,
      coordenador: formData.coordenador || null,
      supervisor: formData.supervisor || null,

      nome_totvs: formData.nome_totvs || '',
      nome_geovictoria: formData.nome_geovictoria || '',
      nome_gestao: formData.nome_gestao || '',
      nome_financeiro: formData.nome_financeiro || '',
      nome_findme: formData.nome_findme || '',
      nome_metricas: formData.nome_metricas || '',
    };

    try {
      if (loja) {
        await api.patch(`/lojas/${loja.id}/editar/`, payload);
        toast.success('Loja atualizada com sucesso!');
      } else {
        await api.post('/lojas/nova/', payload);
        toast.success('Loja cadastrada com sucesso!');
      }
      onSaveSuccess();
    } catch (err: any) {
      console.error('Erro ao salvar loja:', err);
      setErrorMsg(
        err.response?.data?.errors
          ? JSON.stringify(err.response.data.errors)
          : 'Erro ao processar requisição.'
      );
      toast.error('Erro ao salvar loja.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
      <div ref={modalRef} className={`bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl shadow-xs shadow-xl w-full transition-all duration-300 overflow-hidden animate-scale-in ${
        activeTab === 'localizacao' ? 'max-w-4xl' : 'max-w-xl'
      }`}>
        {/* Header do Modal */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850">
          <h3 className="font-bold text-lg text-neutral-900 dark:text-neutral-100">
            {loja ? 'Editar Loja' : 'Cadastrar Nova Loja'}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Abas do Modal */}
        <div className="flex border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-850 px-4">
          {(['geral', 'localizacao', 'responsaveis', 'integracoes'] as const).map(
            (tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-[11px] font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                  activeTab === tab
                    ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                    : 'border-transparent text-neutral-400 hover:text-neutral-600'
                }`}
              >
                {tab === 'geral' && 'Geral'}
                {tab === 'localizacao' && 'Localização'}
                {tab === 'responsaveis' && 'Responsáveis'}
                {tab === 'integracoes' && 'Integrações'}
              </button>
            )
          )}
        </div>

        <form onSubmit={handleSaveLoja} className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-red-700 dark:text-red-300 rounded-md text-xs flex gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Conteúdo da Aba Geral */}
          {activeTab === 'geral' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <FormField
                  label="Nome de Referência *"
                  value={formData.nome_referencia || ''}
                  onChange={(val) => handleChange('nome_referencia', val)}
                  placeholder="Ex: Loja São Paulo Centro"
                  required
                />
              </div>

              <FormField
                label="Cliente / Regional *"
                value={formData.cliente || ''}
                onChange={(val) => handleChange('cliente', val)}
                placeholder="Ex: Grupo Norte"
                required
              />

              <FormField
                label="Código Loja (Numérico)"
                value={formData.codigo_loja !== undefined && formData.codigo_loja !== null ? String(formData.codigo_loja) : ''}
                onChange={(val) => handleChange('codigo_loja', val)}
                placeholder="Ex: 104"
                type="number"
              />

              <FormField
                label="Centro de Custo *"
                value={formData.centro_de_custo || ''}
                onChange={(val) => handleChange('centro_de_custo', val)}
                placeholder="Ex: 20100"
                required
              />

              <FormField
                label="Quadro Estimado"
                value={formData.quadro || ''}
                onChange={(val) => handleChange('quadro', val)}
                placeholder="Ex: 12"
              />

              <FormField
                label="CNPJ"
                value={formData.cnpj || ''}
                onChange={(val) => handleChange('cnpj', val)}
                placeholder="Ex: 00.000.000/0000-00"
              />

              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                  Status
                </label>
                <SearchableSelect
                  options={[
                    { value: 'ATIVA', label: 'Ativa' },
                    { value: 'INATIVA', label: 'Inativa' },
                  ]}
                  value={formData.status || 'ATIVA'}
                  onChange={(val) => handleChange('status', val)}
                  placeholder="Selecione o status..."
                />
              </div>
            </div>
          )}

          {/* Conteúdo da Aba Localização */}
          {activeTab === 'localizacao' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Coluna da Esquerda: Endereço */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="CEP"
                    value={formData.cep || ''}
                    onChange={(val) => handleChange('cep', val)}
                    placeholder="Ex: 01000-000"
                  />

                  <div>
                    <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                      UF
                    </label>
                    <SearchableSelect
                      options={[
                        'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
                        'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
                        'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO', 'BR'
                      ].map((state) => ({ value: state, label: state }))}
                      value={formData.uf || ''}
                      onChange={(val) => handleChange('uf', val)}
                      placeholder="Selecione a UF"
                    />
                  </div>
                </div>

                <FormField
                  label="Rua / Endereço"
                  value={formData.rua || ''}
                  onChange={(val) => handleChange('rua', val)}
                  placeholder="Ex: Av. Paulista, 1000"
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    label="Bairro"
                    value={formData.bairro || ''}
                    onChange={(val) => handleChange('bairro', val)}
                    placeholder="Ex: Bela Vista"
                  />

                  <FormField
                    label="Município"
                    value={formData.municipio || ''}
                    onChange={(val) => handleChange('municipio', val)}
                    placeholder="Ex: São Paulo"
                  />
                </div>

                <FormField
                  label="Sub-Região"
                  value={formData.sub_regiao || ''}
                  onChange={(val) => handleChange('sub_regiao', val)}
                  placeholder="Ex: São Paulo - Capital"
                />
              </div>

              {/* Coluna da Direita: Geolocalização & Mapa */}
              <div className="flex flex-col h-full border-t md:border-t-0 md:border-l border-neutral-200 dark:border-neutral-800 pt-6 md:pt-0 md:pl-6">
                <div className="flex items-center justify-between mb-3 shrink-0">
                  <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-neutral-500" />
                    Geolocalização & Mapa
                  </h4>
                  <button
                    type="button"
                    onClick={handleGeocodeAddress}
                    disabled={geoLoading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-750 text-neutral-700 dark:text-neutral-300 rounded-lg text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {geoLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Search className="h-3 w-3" />
                    )}
                    Buscar no Mapa
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-3 shrink-0">
                  <FormField
                    label="Latitude"
                    value={formData.latitude !== undefined && formData.latitude !== null ? String(formData.latitude) : ''}
                    onChange={(val) => handleChange('latitude', val ? parseFloat(val) : null)}
                    placeholder="Ex: -23.5505"
                    type="number"
                    step="any"
                  />
                  <FormField
                    label="Longitude"
                    value={formData.longitude !== undefined && formData.longitude !== null ? String(formData.longitude) : ''}
                    onChange={(val) => handleChange('longitude', val ? parseFloat(val) : null)}
                    placeholder="Ex: -46.6333"
                    type="number"
                    step="any"
                  />
                </div>

                <div className="relative flex-1 flex flex-col min-h-[220px]">
                  <div
                    ref={mapDivRef}
                    className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 overflow-hidden relative z-10 flex-1"
                    style={{ minHeight: '220px', height: '100%' }}
                  />
                  <p className="text-[10px] text-neutral-400 mt-1.5 leading-relaxed shrink-0">
                    * Você pode clicar no mapa ou arrastar o PIN vermelho para ajustar as coordenadas exatas da filial. O endereço se atualizará automaticamente com a nova posição do PIN.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Conteúdo da Aba Responsáveis */}
          {activeTab === 'responsaveis' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                  Coordenador
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      options={[
                        { value: '', label: 'Sem Coordenador' },
                        ...coordenadores.map((c) => ({ value: c.id, label: c.nome })),
                      ]}
                      value={formData.coordenador || ''}
                      onChange={(val) => handleChange('coordenador', val)}
                      placeholder="Sem Coordenador"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCoordenadorClick}
                    className="px-3 py-2 border border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 rounded-lg text-sm font-bold transition-colors cursor-pointer shrink-0"
                    title="Cadastrar Novo Coordenador"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-600 uppercase mb-1">
                  Supervisor
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <SearchableSelect
                      options={[
                        { value: '', label: 'Sem Supervisor' },
                        ...supervisores.map((s) => ({ value: s.id, label: s.nome })),
                      ]}
                      value={formData.supervisor || ''}
                      onChange={(val) => handleChange('supervisor', val)}
                      placeholder="Sem Supervisor"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddSupervisorClick}
                    className="px-3 py-2 border border-neutral-200 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 rounded-lg text-sm font-bold transition-colors cursor-pointer"
                    title="Cadastrar Novo Supervisor"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Conteúdo da Aba Integrações */}
          {activeTab === 'integracoes' && (
            <div className="grid grid-cols-2 gap-4">
              <FormField
                label="Nome TOTVS"
                value={formData.nome_totvs || ''}
                onChange={(val) => handleChange('nome_totvs', val)}
                placeholder="Ex: FILIAL SAO PAULO"
              />

              <FormField
                label="Nome GeoVictoria"
                value={formData.nome_geovictoria || ''}
                onChange={(val) => handleChange('nome_geovictoria', val)}
                placeholder="Ex: SP Centro"
              />

              <FormField
                label="Nome Gestão"
                value={formData.nome_gestao || ''}
                onChange={(val) => handleChange('nome_gestao', val)}
                placeholder="Ex: São Paulo"
              />

              <FormField
                label="Nome Financeiro"
                value={formData.nome_financeiro || ''}
                onChange={(val) => handleChange('nome_financeiro', val)}
                placeholder="Ex: SP FIN"
              />

              <FormField
                label="Nome FindMe"
                value={formData.nome_findme || ''}
                onChange={(val) => handleChange('nome_findme', val)}
                placeholder="Ex: SP FM"
              />

              <FormField
                label="Nome Métricas"
                value={formData.nome_metricas || ''}
                onChange={(val) => handleChange('nome_metricas', val)}
                placeholder="Ex: SP MET"
              />

              <div className="col-span-2 flex items-center gap-2.5 pt-2">
                <input
                  type="checkbox"
                  id="dispensa_gestao"
                  checked={formData.dispensa_gestao_pessoas || false}
                  onChange={(e) => handleChange('dispensa_gestao_pessoas', e.target.checked)}
                  className="rounded border-neutral-200 dark:border-neutral-800 text-primary focus:ring-primary h-4 w-4"
                />
                <label
                  htmlFor="dispensa_gestao"
                  className="text-sm text-neutral-700 select-none"
                >
                  Dispensar esta loja do controle de Gestão de Pessoas
                </label>
              </div>
            </div>
          )}

          {/* Botões de Ação do Modal */}
          <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 rounded-full text-xs font-bold text-neutral-700 dark:text-neutral-300 text-sm font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={actionLoading}
              className="px-6 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-full text-xs font-bold hover:bg-neutral-850 dark:hover:bg-neutral-100 shadow-xs disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {actionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar Loja
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
