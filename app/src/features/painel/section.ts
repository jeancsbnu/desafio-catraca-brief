// Seção "Painel" da página de gestão (spec 5.1 e 5.6): a cada renderização lê os números do
// instante (sem cache). Uma falha no cálculo vira o aviso de painel indisponível, sem nenhum
// número, e um log de erro; o resto da página (dados do evento, check-in) continua respondendo.
import type { Db } from '../../db/pool.js';
import type { ManagementSection, ManagementSectionContext } from '../eventos/public.js';
import { loadEventPanel } from './metrics.js';
import { PANEL_ERROR_LOG, PANEL_SECTION_NAME, PANEL_SECTION_ORDER, type EventPanel } from './types.js';
import { panelContent, panelUnavailableContent } from './view.js';

export type PanelLoader = (db: Db, eventId: string) => Promise<EventPanel>;

export interface PanelSectionOptions {
  /** Padrão: loadEventPanel (o parâmetro existe para os testes). */
  load?: PanelLoader;
}

/** Seção painel (ordem 200). A F04 só a chama com um evento já verificado como do organizador logado. */
export function createPanelSection(options: PanelSectionOptions = {}): ManagementSection {
  const load = options.load ?? loadEventPanel;
  return {
    name: PANEL_SECTION_NAME,
    order: PANEL_SECTION_ORDER,
    async render(context: ManagementSectionContext) {
      const eventId = context.event.id;
      try {
        return panelContent(await load(context.db, eventId));
      } catch (err) {
        context.request.log.error({ eventId, err }, PANEL_ERROR_LOG);
        return panelUnavailableContent();
      }
    },
  };
}
