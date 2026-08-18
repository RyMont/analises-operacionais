import { memo, useState, useRef, useEffect } from 'react';
import { Search, Loader2, X, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import api from '../../api/client';
import { normalizeString } from '../../lib/utils';
import type { Colaborador } from '../Colaboradores/ColaboradoresTable';

interface CleanerSidebarProps {
  visibleColaboradores: Colaborador[];
  selectedColaboradorId: string | null;
  onSelectColaborador: (id: string) => void;
  onAddColaborador: (colaborador: Colaborador) => void;
  onMoveColaborador?: (id: string, direction: 'up' | 'down') => void;
  onReorderColaboradores?: (colaboradores: Colaborador[]) => void;
}

const AVATAR_TONES = [
  'from-purple-500 to-indigo-600',
  'from-blue-500 to-teal-600',
  'from-emerald-500 to-green-600',
  'from-amber-500 to-orange-600',
  'from-pink-500 to-red-600',
];

const getAvatarTone = (index: number) => AVATAR_TONES[index % AVATAR_TONES.length];

const getInitials = (name?: string) => {
  if (!name) return 'AP';
  const tokens = name.trim().split(/\s+/);
  if (tokens.length === 1) return tokens[0].substring(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
};

/**
 * Barra lateral com a listagem e busca por Nome ou RE dos colaboradores.
 * 
 * Por que existe: Permite que o usuário filtre rapidamente e selecione 
 * os colaboradores que possuem escalas, reordene-os na grade (subir/descer/arrastar)
 * e pesquise dinamicamente no banco novos nomes sob demanda para adicionar à escala.
 */
export const CleanerSidebar = memo(({ 
  visibleColaboradores, 
  selectedColaboradorId, 
  onSelectColaborador,
  onAddColaborador,
  onMoveColaborador,
  onReorderColaboradores
}: CleanerSidebarProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [directSearchQuery, setDirectSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Colaborador[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [draggedColabId, setDraggedColabId] = useState<string | null>(null);
  const [dragOverColabId, setDragOverColabId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha o painel flutuante se o usuário clicar fora do componente de busca
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filtra os colaboradores por nome ou RE conforme a busca local (na lista da lateral, ignorando acentos)
  const filteredColaboradores = visibleColaboradores.filter((colab) => {
    const term = normalizeString(searchTerm.trim());
    if (!term) return true;
    return (
      normalizeString(colab.nome).includes(term) ||
      normalizeString(colab.re).includes(term)
    );
  });

  // Filtra os resultados da API para não exibir colaboradores que já estão na lateral
  const filteredSearchResults = searchResults.filter(
    c => !visibleColaboradores.some(vc => String(vc.id) === String(c.id))
  );

  // Busca de forma reativa os colaboradores no banco somente quando digita
  const handleSearch = async (val: string) => {
    const term = val.trim();
    if (term.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      setLoadingSearch(true);
      const response = await api.get('/colaboradores/agendamentos/colaboradores-ativos/', {
        params: { busca: term }
      });
      setSearchResults(response.data || []);
    } catch (err) {
      console.error('Erro ao pesquisar colaboradores no backend:', err);
    } finally {
      setLoadingSearch(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedColabId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverColabId !== id) {
      setDragOverColabId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = draggedColabId || e.dataTransfer.getData('text/plain');
    if (sourceId && sourceId !== targetId && onReorderColaboradores) {
      const sourceIndex = visibleColaboradores.findIndex(c => String(c.id) === String(sourceId));
      const targetIndex = visibleColaboradores.findIndex(c => String(c.id) === String(targetId));
      if (sourceIndex !== -1 && targetIndex !== -1) {
        const newList = [...visibleColaboradores];
        const [moved] = newList.splice(sourceIndex, 1);
        newList.splice(targetIndex, 0, moved);
        onReorderColaboradores(newList);
      }
    }
    setDraggedColabId(null);
    setDragOverColabId(null);
  };

  const handleDragEnd = () => {
    setDraggedColabId(null);
    setDragOverColabId(null);
  };

  return (
    <div className="w-full shrink-0 lg:w-[340px] xl:w-[380px] bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-xs shadow-sm space-y-5">
      <div>
        <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100 text-left">Equipe de Apoio</h3>
        <p className="text-xs text-neutral-500 mt-1 text-left">Selecione, adicione ou reordene um colaborador.</p>
      </div>

      {/* Busca direta de novos colaboradores via API */}
      <div ref={containerRef} className="space-y-1.5 text-left relative">
        <span className="block text-[10px] font-bold text-neutral-500 uppercase">Adicionar Colaborador à Agenda</span>
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="text"
            value={directSearchQuery}
            onChange={(e) => {
              const val = e.target.value;
              setDirectSearchQuery(val);
              setShowResults(true);
              handleSearch(val);
            }}
            onFocus={() => setShowResults(true)}
            placeholder="Pesquisar por nome ou RE..."
            className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/50 py-2.5 pl-10 pr-10 text-sm font-medium outline-none focus:border-neutral-900 dark:focus:border-neutral-300 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 transition-colors"
          />
          {loadingSearch && (
            <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 animate-spin" />
          )}
          {!loadingSearch && directSearchQuery && (
            <button
              type="button"
              onClick={() => {
                setDirectSearchQuery('');
                setSearchResults([]);
                setShowResults(false);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-850 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Painel de Resultados Flutuante */}
        {showResults && directSearchQuery.trim().length >= 2 && (
          <div className="absolute left-0 mt-1.5 w-full z-50 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-lg p-2 max-h-60 overflow-y-auto space-y-0.5">
            {loadingSearch && searchResults.length === 0 ? (
              <div className="px-3 py-4 text-xs text-neutral-400 text-center flex items-center justify-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Buscando...</span>
              </div>
            ) : filteredSearchResults.length === 0 ? (
              <div className="px-3 py-4 text-xs text-neutral-400 text-center">
                Nenhum colaborador encontrado ou já adicionado.
              </div>
            ) : (
              filteredSearchResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onAddColaborador(c);
                    setDirectSearchQuery('');
                    setSearchResults([]);
                    setShowResults(false);
                  }}
                  className="w-full text-left flex flex-col px-3 py-2 rounded-lg text-xs cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white transition-colors"
                >
                  <span className="font-bold text-neutral-800 dark:text-neutral-200">{c.nome}</span>
                  <span className="text-[10px] text-neutral-400 font-mono mt-0.5">RE: {c.re} | {c.cargo}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Input de busca local na barra lateral */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
        <input
          type="text"
          placeholder="Filtrar lista..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950/50 py-2.5 pl-10 pr-4 text-sm font-medium outline-none focus:border-neutral-900 dark:focus:border-neutral-300 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400"
        />
      </div>
      
      <div className="flex flex-col gap-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
        {filteredColaboradores.map((colab, index) => {
          const isSelected = colab.id === selectedColaboradorId;
          const isBeingDragged = draggedColabId === String(colab.id);
          const isDragTarget = dragOverColabId === String(colab.id) && !isBeingDragged;

          return (
            <div
              key={colab.id} 
              draggable={!searchTerm.trim()}
              onDragStart={(e) => handleDragStart(e, String(colab.id))}
              onDragOver={(e) => handleDragOver(e, String(colab.id))}
              onDrop={(e) => handleDrop(e, String(colab.id))}
              onDragEnd={handleDragEnd}
              className={`group flex items-center justify-between gap-2 rounded-xl border p-2.5 transition-all duration-150 select-none ${
                isBeingDragged ? 'opacity-30 border-dashed border-primary bg-primary/5' : ''
              } ${
                isDragTarget ? 'ring-2 ring-primary border-primary scale-[1.01] bg-primary/10' : ''
              } ${
                isSelected 
                ? 'border-neutral-900 bg-neutral-900 text-white shadow-md dark:border-white dark:bg-white dark:text-neutral-900' 
                : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 hover:border-neutral-400 dark:hover:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-850'
              }`}
            >
              {/* Área Clicável Principal */}
              <button
                type="button"
                onClick={() => onSelectColaborador(colab.id)}
                className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer focus:outline-none"
              >
                <div 
                  className={`cursor-grab active:cursor-grabbing p-0.5 rounded text-neutral-300 dark:text-neutral-600 group-hover:text-neutral-400 dark:group-hover:text-neutral-300 transition-colors ${
                    isSelected ? 'text-neutral-400 dark:text-neutral-500' : ''
                  }`}
                  title="Arraste para mover para cima ou para baixo"
                >
                  <GripVertical className="h-4 w-4 shrink-0" />
                </div>

                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${getAvatarTone(index)} text-xs font-bold text-white shadow-xs`}>
                  {getInitials(colab.nome)}
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                  <span className="truncate text-xs font-bold leading-tight">{colab.nome}</span>
                  <span className={`truncate text-[10px] font-mono mt-0.5 ${isSelected ? 'text-neutral-300 dark:text-neutral-600' : 'text-neutral-400'}`}>
                    RE: {colab.re} | {colab.cargo}
                  </span>
                </div>
              </button>

              {/* Botões Mover para Cima / Mover para Baixo */}
              <div className="flex flex-col gap-0.5 shrink-0 opacity-70 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveColaborador?.(String(colab.id), 'up');
                  }}
                  disabled={index === 0}
                  title="Mover para cima"
                  className={`p-1 rounded-md transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'hover:bg-neutral-800 dark:hover:bg-neutral-200 text-neutral-300 dark:text-neutral-700'
                      : 'hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100'
                  }`}
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveColaborador?.(String(colab.id), 'down');
                  }}
                  disabled={index === filteredColaboradores.length - 1}
                  title="Mover para baixo"
                  className={`p-1 rounded-md transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed ${
                    isSelected
                      ? 'hover:bg-neutral-800 dark:hover:bg-neutral-200 text-neutral-300 dark:text-neutral-700'
                      : 'hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-100'
                  }`}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
        {filteredColaboradores.length === 0 && (
          <div className="py-6 text-center text-xs text-neutral-400 italic">
            Nenhum colaborador listado
          </div>
        )}
      </div>
    </div>
  );
});

CleanerSidebar.displayName = 'CleanerSidebar';

