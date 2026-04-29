/**
 * ==========================================
 * ÉTAT GLOBAL & PARAMÈTRES
 * ==========================================
 */
// Note : Les constantes TABLE_... et COL_... doivent être définies dans "map.js"
const urlParams = new URLSearchParams(window.location.search);

let state = {
    allAgents: [],
    allStructures: [],
    structureMap: new Map(),
    agentsHierarchyMap: new Map(),
    filters: {
        structureId: urlParams.get('structure') ? parseInt(urlParams.get('structure'), 10) : null,
        textQuery: urlParams.get('q') || ''
    }
};

/**
 * ==========================================
 * INITIALISATION
 * ==========================================
 */
grist.ready({ requiredAccess: 'full' });

document.addEventListener('DOMContentLoaded', async () => {
    await init();
    setupEventListeners();
    setupAdminEvents();
});

async function init() {
    const loading = document.getElementById('loadingMessage');
    try {
        if (loading) loading.style.display = 'block';

        // 1. Récupération des données
        const tables = [TABLE_AGENTS, TABLE_STRUCTURES];
        const data = {};

        await Promise.all(tables.map(async (name) => {
            const result = await grist.docApi.fetchTable(name);
            data[name] = window.transformColsToRows ? window.transformColsToRows(result) : result;
        }));

        // 2. Traitement & Maps de performance
        state.allAgents = window.enrichAgentsData ? window.enrichAgentsData(data[TABLE_AGENTS]) : data[TABLE_AGENTS];
        state.allStructures = data[TABLE_STRUCTURES];
        state.structureMap = window.createStructureMap ? window.createStructureMap(state.allStructures) : new Map(state.allStructures.map(s => [s.id, s]));
        state.agentsHierarchyMap = window.createAgentsHierarchyMap ? window.createAgentsHierarchyMap(state.allAgents) : new Map();

        // 3. Remplissage UI
        populateSelects();
        syncFiltersWithUI();

        // 4. Lancement recherche initiale
        performSearch();

        if (loading) loading.style.display = 'none';
    } catch (e) {
        console.error("ERREUR INIT :", e);
        const area = document.getElementById('resultArea');
        if (area) area.innerHTML = `<div class="fr-alert fr-alert--error">${e.message}</div>`;
    }
}

/**
 * ==========================================
 * MOTEUR DE RECHERCHE & TRI
 * ==========================================
 */
function performSearch() {
    const textQuery = document.getElementById('searchInput')?.value.trim().toLowerCase() || "";
    const structId = parseInt(document.getElementById('select-structure')?.value) || null;

    state.filters = { structureId: structId, textQuery };
    updateURL();

    // Filtrage
    const results = state.allAgents.filter(a => {
        const matchStruct = !structId || a[COL_AGENT_STRUCT_REF] === structId;
        if (!matchStruct) return false;
        if (!textQuery) return true;

        const s = state.structureMap.get(a[COL_AGENT_STRUCT_REF]);
        const searchFields = [
            a[COL_AGENT_NOM], a[COL_AGENT_PRENOM], a[COL_AGENT_FONCTION],
            a['Missions_du_poste'], a['Nom_du_projet'],
            s ? s[COL_STRUCT_LIBELLE] : '', s ? s[COL_STRUCT_CODE] : ''
        ].map(v => safeStr(v).toLowerCase());

        return searchFields.some(f => f.includes(textQuery));
    });

    // Détermination du chef de structure (pour le tri)
    let chefName = "";
    if (structId) {
        const s = state.structureMap.get(structId);
        chefName = s && window.findResponsableName ? safeStr(window.findResponsableName(s, state.agentsHierarchyMap)).toLowerCase() : "";
    }

    renderDispatcher(results, chefName);
}

function renderDispatcher(results, chefName) {
    const container = document.getElementById('resultArea');
    if (!container) return;

    if (results.length === 0) {
        container.innerHTML = `<div class="fr-alert fr-alert--warning"><p>Aucun agent trouvé.</p></div>`;
        return;
    }

    // Cas 1 : Vue par Structure (Regroupement par Pôle)
    if (state.filters.structureId && !state.filters.textQuery) {
        const groups = {};
        results.forEach(a => {
            const pole = safeStr(a['Pole_ou_section_'] || a['pole_ou_section_']).trim() || "Direction / Transverse";
            if (!groups[pole]) groups[pole] = [];
            groups[pole].push(a);
        });

        const sortedGroups = Object.keys(groups).sort().map(key => ({
            name: key === "Direction / Transverse" ? "" : key,
            agents: groups[key].sort((a, b) => getPoleScore(b) - getPoleScore(a) || safeStr(a[COL_AGENT_NOM]).localeCompare(safeStr(b[COL_AGENT_NOM])))
        }));

        renderGroupedResults(sortedGroups);
    } 
    // Cas 2 : Recherche textuelle ou Vue globale (Liste Plate)
    else {
        results.sort((a, b) => getRoleScore(b, chefName) - getRoleScore(a, chefName) || safeStr(a[COL_AGENT_NOM]).localeCompare(safeStr(b[COL_AGENT_NOM])));
        renderFlatResults(results);
    }
}

/**
 * ==========================================
 * ACTIONS & LOGIQUE UI
 * ==========================================
 */
function setupEventListeners() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const selectStruct = document.getElementById('select-structure');

    if (searchBtn) searchBtn.onclick = performSearch;
    if (searchInput) searchInput.oninput = debounce(performSearch, 300);
    if (selectStruct) selectStruct.onchange = performSearch;
}

window.executeTransfer = async function(agentId, uniqueId, agentName) {
    const selectEl = document.getElementById(`select-transfer-${uniqueId}`);
    const newStructId = parseInt(selectEl?.value);

    if (!newStructId || !confirm(`Transférer ${agentName} ?`)) return;

    try {
        await grist.docApi.applyUserActions([
            ["UpdateRecord", TABLE_AGENTS, agentId, { [COL_AGENT_STRUCT_REF]: newStructId }]
        ]);
        const agent = state.allAgents.find(a => a.id === agentId);
        if (agent) agent[COL_AGENT_STRUCT_REF] = newStructId;
        performSearch();
    } catch (err) {
        alert("Erreur lors du transfert : " + err.message);
    }
};

window.deleteAgent = async function(agentId, agentName) {
    if (!confirm(`Supprimer définitivement ${agentName} ?`)) return;
    try {
        await grist.docApi.applyUserActions([["RemoveRecord", TABLE_AGENTS, agentId]]);
        state.allAgents = state.allAgents.filter(a => a.id !== agentId);
        performSearch();
    } catch (err) {
        alert("Erreur de suppression.");
    }
};

/**
 * ==========================================
 * RENDU HTML (TEMPLATES)
 * ==========================================
 */
function renderFlatResults(agents) {
    let html = `<div class="fr-grid-row fr-grid-row--gutters">`;
    agents.forEach(a => html += generateAgentCardHtml(a));
    html += `</div>`;
    document.getElementById('resultArea').innerHTML = html;
}

function renderGroupedResults(groups) {
    let html = '';
    groups.forEach(g => {
        if (g.name) {
            html += `<div class="fr-col-12 fr-mt-4w"><h3 class="fr-h5" style="border-bottom:2px solid var(--background-action-high-blue-france)">${safeHtml(g.name)}</h3></div>`;
        }
        html += `<div class="fr-grid-row fr-grid-row--gutters">`;
        g.agents.forEach(a => html += generateAgentCardHtml(a));
        html += `</div>`;
    });
    document.getElementById('resultArea').innerHTML = html;
}

function generateAgentCardHtml(agent) {
    const uid = `agent-${agent.id}`;
    const nomComplet = `${safeHtml(agent[COL_AGENT_PRENOM] || '')} ${safeHtml(agent[COL_AGENT_NOM] || '')}`;
    const s = state.structureMap.get(agent[COL_AGENT_STRUCT_REF]);
    
    return `
    <div class="fr-col-12 fr-col-md-6">
        <div class="agent-accordion" id="${uid}">
            <div class="agent-header" onclick="window.toggleAgent('${uid}')">
                <div class="agent-info">
                    <div style="font-weight:700;">${nomComplet} 
                        <button class="fr-btn fr-btn--tertiary-no-outline fr-icon-edit-line" onclick="event.stopPropagation(); window.toggleMgmt('${uid}-admin')"></button>
                    </div>
                    <div style="font-size:0.85rem; color:#666;">${safeHtml(agent[COL_AGENT_FONCTION] || 'Agent')}</div>
                    ${s ? `<span class="fr-badge fr-badge--sm fr-badge--info fr-mt-1w">${safeHtml(s[COL_STRUCT_CODE])}</span>` : ''}
                </div>
                <span class="fr-icon-arrow-down-s-line agent-arrow"></span>
            </div>
            <div id="${uid}-admin" class="admin-panel" style="display:none; flex-direction:column; background:#f6f6f6; padding:1rem; gap:1rem; border-bottom:1px solid #ddd;">
                <div style="display:flex; gap:0.5rem; align-items:flex-end;">
                    <div class="fr-select-group" style="flex-grow:1; margin-bottom:0;">
                        <label class="fr-label" style="font-size:0.7rem;">TRANSFÉRER VERS :</label>
                        <select class="fr-select fr-select--sm" id="select-transfer-${uid}" onclick="event.stopPropagation()">
                            ${state.allStructures.map(st => `<option value="${st.id}">${safeHtml(st[COL_STRUCT_LIBELLE])}</option>`).join('')}
                        </select>
                    </div>
                    <button class="fr-btn fr-btn--sm fr-icon-checkbox-circle-line" onclick="event.stopPropagation(); window.executeTransfer(${agent.id}, '${uid}', '${nomComplet.replace(/'/g, "\\'")}')"></button>
                </div>
                <button class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-delete-line" onclick="event.stopPropagation(); window.deleteAgent(${agent.id}, '${nomComplet.replace(/'/g, "\\'")}')">Supprimer</button>
            </div>
            <div class="agent-details" style="padding:1rem; font-size:0.9rem;">
                <div><strong>Email :</strong> ${agent[COL_AGENT_MAIL] ? `<a href="mailto:${agent[COL_AGENT_MAIL].toLowerCase()}">${agent[COL_AGENT_MAIL].toLowerCase()}</a>` : '-'}</div>
            </div>
        </div>
    </div>`;
}

/**
 * ==========================================
 * FONCTIONS UTILITAIRES (HELPERS)
 * ==========================================
 */
function safeStr(val) { return val ? String(val).trim() : ""; }
function safeHtml(val) { 
    const txt = safeStr(val);
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return txt.replace(/[&<>"']/g, m => map[m]);
}

function debounce(fn, delay) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

function getRoleScore(agent, chefName) {
    const fct = safeStr(agent[COL_AGENT_FONCTION]).toLowerCase();
    const full = `${safeStr(agent[COL_AGENT_PRENOM])} ${safeStr(agent[COL_AGENT_NOM])}`.toLowerCase();
    if (chefName && full.includes(chefName)) return 4;
    if (fct.includes('adj') || fct.includes('second')) return 3;
    if (fct.includes('secre') || fct.includes('assist')) return 2;
    return 1;
}

function getPoleScore(agent) {
    const fct = safeStr(agent[COL_AGENT_FONCTION]).toLowerCase();
    if ((fct.includes('chef') || fct.includes('resp')) && !fct.includes('adj')) return 4;
    if (fct.includes('adj')) return 3;
    return 1;
}

window.toggleAgent = (id) => document.getElementById(id)?.classList.toggle('open');
window.toggleMgmt = (id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = (el.style.display === 'none' || el.style.display === '') ? 'flex' : 'none';
};

function updateURL() {
    const qs = new URLSearchParams();
    if (state.filters.structureId) qs.set('structure', state.filters.structureId);
    if (state.filters.textQuery) qs.set('q', state.filters.textQuery);
    const newUrl = qs.toString() ? `?${qs.toString()}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);
}

function populateSelects() {
    const mainSelect = document.getElementById('select-structure');
    if (!mainSelect) return;
    const options = state.allStructures.map(s => `<option value="${s.id}">${safeHtml(s[COL_STRUCT_LIBELLE])}</option>`).sort();
    mainSelect.innerHTML = '<option value="">Toutes les structures</option>' + options.join('');
}

function syncFiltersWithUI() {
    if (state.filters.structureId) document.getElementById('select-structure').value = state.filters.structureId;
    if (state.filters.textQuery) document.getElementById('searchInput').value = state.filters.textQuery;
}