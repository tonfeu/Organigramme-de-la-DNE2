/**
 * ==========================================
 * LOGIQUE DE RECHERCHE - SEARCH.JS
 * ==========================================
 */

let allAgents = [];
let allStructures = [];
let structureMap = new Map();

grist.ready({ requiredAccess: 'full' });

document.addEventListener('DOMContentLoaded', initSearch);

async function initSearch() {
    const loading = document.getElementById('loading-message');
    if (loading) loading.style.display = 'block';

    try {
        const [rawAgents, rawStructs] = await Promise.all([
            grist.docApi.fetchTable(TABLE_AGENTS),
            grist.docApi.fetchTable(TABLE_STRUCTURES)
        ]);

        window.allAgents = window.transformColsToRows(rawAgents);
        window.allStructures = window.transformColsToRows(rawStructs);

        window.allStructures.forEach(s => structureMap.set(s.id, s));

        populateFilters();
        setupEventListeners();
        performSearch(); // Premier affichage (tout)

    } catch (e) {
        console.error("Erreur chargement recherche:", e);
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function populateFilters() {
    const select = document.getElementById('search-struct');
    if (!select) return;

    const sorted = [...window.allStructures].sort((a, b) => 
        (a[COL_STRUCT_LIBELLE] || "").localeCompare(b[COL_STRUCT_LIBELLE] || "")
    );

    sorted.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s[COL_STRUCT_LIBELLE] || s[COL_STRUCT_CODE];
        select.appendChild(opt);
    });
}

function setupEventListeners() {
    const input = document.getElementById('search-input');
    const select = document.getElementById('search-struct');
    const btn = document.getElementById('btn-search-trigger');

    if (input) input.oninput = performSearch;
    if (select) select.onchange = performSearch;
    if (btn) btn.onclick = performSearch;
}

function performSearch() {
    const query = document.getElementById('search-input').value.toLowerCase().trim();
    const structId = document.getElementById('search-struct').value;
    const resultsArea = document.getElementById('search-results-area');
    const countArea = document.getElementById('result-count');

    const filtered = window.allAgents.filter(agent => {
        const matchesText = !query || 
            (agent[COL_AGENT_NOM] || "").toLowerCase().includes(query) ||
            (agent[COL_AGENT_PRENOM] || "").toLowerCase().includes(query) ||
            (agent[COL_AGENT_FONCTION] || "").toLowerCase().includes(query);
        
        const matchesStruct = !structId || agent[COL_AGENT_STRUCT_REF] == structId;

        return matchesText && matchesStruct;
    });

    // Affichage
    countArea.textContent = `${filtered.length} agent(s) trouvé(s)`;
    resultsArea.innerHTML = filtered.map(agent => {
        const s = structureMap.get(agent[COL_AGENT_STRUCT_REF]) || {};
        return `
            <div class="fr-col-12 fr-col-md-4">
                <div class="fr-card fr-card--sm fr-card--grey">
                    <div class="fr-card__body">
                        <h3 class="fr-card__title">${agent[COL_AGENT_NOM]} ${agent[COL_AGENT_PRENOM]}</h3>
                        <p class="fr-card__desc">${agent[COL_AGENT_FONCTION] || ''}</p>
                        <p class="fr-card__detail">${s[COL_STRUCT_LIBELLE] || ''}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}