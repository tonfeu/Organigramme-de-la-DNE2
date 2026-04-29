/**
 * ==========================================
 * ÉTAT GLOBAL & PARAMÈTRES
 * ==========================================
 */
let state = {
    agents: [],
    structures: [],
    structureMap: new Map(),
    hierarchyMap: new Map()
};

// Initialisation Grist
grist.ready({ requiredAccess: 'full' });

// Démarrage
document.addEventListener('DOMContentLoaded', init);

/**
 * ==========================================
 * INITIALISATION PRINCIPALE
 * ==========================================
 */
async function init() {
    try {
        console.log("🚀 Initialisation de l'Organigramme...");

        // 1. Chargement des données
        const tables = [TABLE_AGENTS, TABLE_STRUCTURES, TABLE_CONFIG_LOGO];
        const rawData = {};

        await Promise.all(tables.map(async (name) => {
            try {
                const result = await grist.docApi.fetchTable(name);
                rawData[name] = window.transformColsToRows ? window.transformColsToRows(result) : result;
            } catch (err) {
                console.warn(`Table ${name} indisponible.`);
                rawData[name] = [];
            }
        }));

        // 2. Traitement des données
        state.agents = window.enrichAgentsData ? window.enrichAgentsData(rawData[TABLE_AGENTS]) : rawData[TABLE_AGENTS];
        state.structures = rawData[TABLE_STRUCTURES];
        state.structureMap = window.createStructureMap ? window.createStructureMap(state.structures) : new Map(state.structures.map(s => [s.id, s]));
        state.hierarchyMap = window.createAgentsHierarchyMap ? window.createAgentsHierarchyMap(state.agents) : new Map();

        // 3. Rendu Interface
        applyLogoConfig(rawData[TABLE_CONFIG_LOGO]);
        renderOrganigramme();
        initQuickSearch();
        setupAdminSystem(); // Appelé directement ici au lieu du setInterval

        // Exposition pour modules externes (PDF, etc.)
        window.getOrganigrammeData = () => ({ agents: state.agents, structures: state.structures });

    } catch (e) {
        console.error("ERREUR CRITIQUE :", e);
        const grid = document.querySelector('.main-grid');
        if(grid) grid.innerHTML = `<div class="fr-alert fr-alert--error">${e.message}</div>`;
    }
}

/**
 * ==========================================
 * RENDU VISUEL
 * ==========================================
 */
function renderOrganigramme() {
    // Rendu des zones TOP
    const zones = {
        'top-left': 'TOP_LEFT',
        'top-center': 'TOP_CENTER',
        'top-right': 'TOP_RIGHT'
    };

    Object.entries(zones).forEach(([id, pos]) => {
        const container = document.getElementById(id);
        if (!container) return;
        const structs = getStructuresByPos(pos);
        structs.forEach((s, i) => createDsfrTile(container, s, id === 'top-center' && i === 0 ? 'tile-chef' : ''));
    });

    // Rendu des Colonnes (1 à 5)
    for (let i = 1; i <= 5; i++) {
        const col = document.getElementById(`col-${i}`);
        if (!col) continue;
        
        getStructuresByPos(`COL${i}_HEAD`).forEach(s => createDsfrTile(col, s, 'tile-head'));
        getStructuresByPos(`COL${i}_SUB`).forEach(s => createDsfrTile(col, s));
    }
}

function createDsfrTile(container, struct, extraClass = '') {
    const code = safeHtml(struct[COL_STRUCT_CODE]);
    const libelle = safeHtml(struct[COL_STRUCT_LIBELLE] || "Sans nom");
    const resp = safeHtml(window.findResponsableName(struct, state.hierarchyMap));
    
    if (safeStr(struct[COL_STRUCT_STYLE]).toLowerCase().includes('pointill')) extraClass += ' tile-dashed';

    const tile = document.createElement('div');
    tile.className = `fr-tile fr-enlarge-link fr-tile--no-icon ${extraClass}`;
    tile.innerHTML = `
        ${code ? `<div class="tile-header">${code}</div>` : ''}
        <div class="fr-tile__body">
            <div class="fr-tile__content">
                <h3 class="fr-tile__title"><a href="#">${libelle}</a></h3>
            </div>
            ${resp ? `<div class="tile-resp-container"><div class="tile-separator"></div><span class="tile-resp-name">${resp}</span></div>` : ''}
        </div>`;

    tile.querySelector('a').onclick = (e) => { e.preventDefault(); openModalForStructure(struct.id); };
    container.appendChild(tile);
}

/**
 * ==========================================
 * MODALE & DÉTAILS
 * ==========================================
 */
window.openModalForStructure = function (structId) {
    const struct = state.structureMap.get(structId);
    if (!struct) return;

    const respName = window.findResponsableName(struct, state.hierarchyMap);
    let respAgent = null;
    
    if (respName) {
        const target = window.normalizeString(respName);
        respAgent = state.agents.find(a => (a._fullname?.includes(target)) || (a._fullnameReverse?.includes(target)));
    }

    let html = '';
    if (respName) {
        const email = safeHtml(respAgent?.[COL_AGENT_MAIL] || "").toLowerCase();
        html = `
        <div class="fr-card fr-card--no-border fr-mb-2w">
            <div class="fr-card__body"><div class="fr-card__content">
                <h3 class="fr-card__title"><span class="fr-icon-user-star-line fr-mr-1w"></span>${safeHtml(respName)}</h3>
                <p class="fr-card__desc text-bold">${safeHtml(respAgent?.[COL_AGENT_FONCTION] || "Responsable")}</p>
                <div class="fr-card__start">
                    <ul class="fr-badges-group">
                        ${email ? `<li><button onclick="copyToClipboard('${email}', this)" class="fr-badge fr-badge--info copy-btn">${email}</button></li>` : ''}
                        ${respAgent?.['Tel_PORT'] ? `<li><span class="fr-badge fr-badge--info">Mob. : ${respAgent['Tel_PORT']}</span></li>` : ''}
                    </ul>
                </div>
            </div></div>
        </div>`;
    } else {
        html = `<div class="fr-alert fr-alert--warning"><p>Aucun responsable identifié.</p></div>`;
    }

    html += `<div class="fr-grid-row fr-grid-row--center fr-mt-3w">
                <a href="search.html?structure=${structId}" class="fr-btn fr-btn--secondary">Voir toute l'équipe</a>
             </div>`;

    document.getElementById('modal-title').innerText = struct[COL_STRUCT_LIBELLE];
    document.getElementById('modal-body').innerHTML = html;
    document.getElementById('dsfr-hidden-modal-btn').click();
};

/**
 * ==========================================
 * ADMINISTRATION (AJOUT AGENT)
 * ==========================================
 */
function setupAdminSystem() {
    const btnShow = document.getElementById('btn-show-form');
    if (!btnShow) return; // Sécurité si l'élément n'est pas dans le DOM

    const formZone = document.getElementById('form-creation-agent');
    const structSelect = document.getElementById('field-struct');
    const btnSave = document.getElementById('btn-save');

    btnShow.onclick = () => {
        formZone.style.display = 'block';
        // Auto-remplissage des structures au premier clic
        if (structSelect.options.length <= 1) fillStructureSelect(structSelect);
    };

    document.getElementById('btn-cancel').onclick = () => formZone.style.display = 'none';

    btnSave.onclick = async () => {
        const payload = {
            prenom: document.getElementById('field-prenom').value.trim(),
            nom: document.getElementById('field-nom').value.trim(),
            fct: document.getElementById('field-fct').value.trim(),
            struct: parseInt(structSelect.value)
        };

        if (!payload.nom || isNaN(payload.struct)) return alert("Nom et Structure obligatoires.");

        try {
            btnSave.disabled = true;
            await grist.docApi.applyUserActions([
                ["AddRecord", TABLE_AGENTS, null, {
                    [COL_AGENT_PRENOM]: payload.prenom,
                    [COL_AGENT_NOM]: payload.nom,
                    [COL_AGENT_FONCTION]: payload.fct,
                    [COL_AGENT_STRUCT_REF]: payload.struct
                }]
            ]);
            alert("✅ Agent ajouté !");
            location.reload();
        } catch (err) {
            alert("Erreur lors de l'enregistrement.");
            btnSave.disabled = false;
        }
    };
}

function fillStructureSelect(selectEl) {
    const sorted = [...state.structures].sort((a, b) => 
        safeStr(a[COL_STRUCT_LIBELLE]).localeCompare(safeStr(b[COL_STRUCT_LIBELLE]))
    );
    sorted.forEach(s => {
        const opt = new Option(s[COL_STRUCT_LIBELLE], s.id);
        selectEl.add(opt);
    });
}

/**
 * ==========================================
 * HELPERS & CONFIG
 * ==========================================
 */
function getStructuresByPos(code) {
    return state.structures.filter(s => safeStr(s[COL_STRUCT_POSITION]) === code);
}

function applyLogoConfig(config) {
    if (!config?.[0]) return;
    const row = config[0];
    const logo = document.querySelector('.fr-header__logo');
    if (!logo) return;

    if (row[COL_CONFIG_MASQUER_LOGO]) return logo.style.display = 'none';
    const text = safeStr(row[COL_CONFIG_TEXTE_LOGO]);
    if (text) {
        const p = logo.querySelector('.fr-logo');
        if (p) p.innerHTML = safeHtml(text).replace(/\n/g, '<br>');
    }
}

// Utilitaires de sécurité
function safeStr(v) { return v ? String(v).trim() : ""; }
function safeHtml(v, fallback = "") { 
    if(!v) return fallback;
    return String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); 
}