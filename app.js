/**
 * ==========================================
 * INITIALISATION & LOGIQUE MÉTIER - app.js
 * ==========================================
 */

// Initialisation du plugin Grist
grist.ready({ 
    requiredAccess: 'full'
});

// Variables globales (cache des données)
let allAgents = [];
let allStructures = [];
let structureMap = new Map();
let agentsHierarchyMap = new Map();

// Lancement au chargement du DOM
document.addEventListener('DOMContentLoaded', init);

/**
 * Fonction principale d'initialisation
 */
async function init() {
    try {
        console.log("🚀 Chargement de l'Organigramme DNE...");

        // 1. RÉCUPÉRATION DES DONNÉES
        const tables = [TABLE_AGENTS, TABLE_STRUCTURES, TABLE_CONFIG_LOGO];
        const data = {};

        await Promise.all(tables.map(async (name) => {
            try {
                const result = await grist.docApi.fetchTable(name);
                data[name] = window.transformColsToRows(result);
            } catch (err) {
                console.warn(`⚠️ Table ${name} inaccessible.`, err);
                data[name] = [];
            }
        }));

        // 2. PRÉPARATION DES DONNÉES
        allAgents = window.enrichAgentsData(data[TABLE_AGENTS]);
        agentsHierarchyMap = window.createAgentsHierarchyMap(allAgents);
        
        allStructures = data[TABLE_STRUCTURES];
        structureMap = window.createStructureMap(allStructures);

        // 3. CONFIGURATION UI
        applyLogoConfig(data[TABLE_CONFIG_LOGO]);
        renderTopZone();   
        renderColumns();   
        initQuickSearch(); 

        // 4. EXPOSITION POUR MODULES EXTERNES (PDF, etc.)
        window.getOrganigrammeData = () => ({
            agents: allAgents,
            structures: allStructures,
            structureMap: structureMap
        });

    } catch (e) {
        console.error("❌ ERREUR CRITIQUE :", e);
        const grid = document.querySelector('.main-grid');
        if (grid) grid.innerHTML = `<div class="fr-alert fr-alert--error"><p>${e.message}</p></div>`;
    }
}

/**
 * Applique la personnalisation du logo (Texte / Visibilité)
 */
function applyLogoConfig(configData) {
    if (!configData || configData.length === 0) return;
    const configRow = configData[0];
    const logoContainer = document.querySelector('.fr-header__logo');
    if (!logoContainer) return;

    if (configRow[COL_CONFIG_MASQUER_LOGO]) {
        logoContainer.style.display = 'none';
        return;
    }

    const customText = window.safeStr(configRow[COL_CONFIG_TEXTE_LOGO]).trim();
    if (customText) {
        const pLogo = logoContainer.querySelector('.fr-logo');
        if (pLogo) pLogo.innerHTML = window.safeHtml(customText).replace(/\n/g, '<br>');
    }
}

/**
 * RENDU VISUEL : Zone Supérieure
 */
function renderTopZone() {
    const zones = {
        'top-left': 'TOP_LEFT',
        'top-center': 'TOP_CENTER',
        'top-right': 'TOP_RIGHT'
    };

    Object.entries(zones).forEach(([id, pos]) => {
        const container = document.getElementById(id);
        if (!container) return;
        
        const structs = getStructuresByPos(pos);
        structs.forEach(s => {
            const extraClass = (id === 'top-center') ? 'tile-chef' : '';
            createDsfrTile(container, s, extraClass);
        });
    });
}

/**
 * RENDU VISUEL : Colonnes 1 à 5
 */
function renderColumns() {
    for (let i = 1; i <= 5; i++) { 
        const container = document.getElementById(`col-${i}`);
        if (!container) continue;

        // Têtes de colonnes
        getStructuresByPos(`COL${i}_HEAD`).forEach(s => createDsfrTile(container, s, 'tile-head'));
        // Sous-services
        getStructuresByPos(`COL${i}_SUB`).forEach(s => createDsfrTile(container, s));
    }
}

/**
 * Génère une tuile DSFR pour une structure
 */
function createDsfrTile(container, struct, extraClass = '') {
    const codeBureau = window.safeHtml(struct[COL_STRUCT_CODE]).trim();
    const libelle = window.safeHtml(struct[COL_STRUCT_LIBELLE], "Sans nom");
    const resp = window.safeHtml(window.findResponsableName(struct, agentsHierarchyMap));
    const specialStyle = window.safeStr(struct[COL_STRUCT_STYLE]).toLowerCase();

    if (specialStyle.includes('pointill')) extraClass += ' tile-dashed';

    const div = document.createElement('div');
    div.className = `fr-tile fr-enlarge-link fr-tile--no-icon ${extraClass}`;

    div.innerHTML = `
        ${codeBureau ? `<div class="tile-header">${codeBureau}</div>` : ''}
        <div class="fr-tile__body">
            <div class="fr-tile__content">
                <h3 class="fr-tile__title">
                    <a href="#">${libelle}</a>
                </h3>
            </div>
            ${resp ? `<div class="tile-resp-container">
                        <div class="tile-separator"></div>
                        <span class="tile-resp-name">${resp}</span>
                      </div>` : ''}
        </div>
    `;

    div.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        openModalForStructure(struct.id);
    });

    container.appendChild(div);
}

/**
 * MODALE : Détails de la structure et du responsable
 */
window.openModalForStructure = function (structId) {
    const struct = allStructures.find(s => s.id === structId);
    if (!struct) return;

    const respNameRaw = window.findResponsableName(struct, agentsHierarchyMap);
    
    // Recherche de l'agent responsable dans le cache pour les infos de contact
    let respAgent = null;
    if (respNameRaw) {
        const target = window.normalizeString(respNameRaw);
        respAgent = allAgents.find(a => 
            (a._fullname && a._fullname.includes(target)) || 
            (a._fullnameReverse && a._fullnameReverse.includes(target))
        );
    }

    let htmlContent = '';
    if (respNameRaw) {
        const fct = respAgent ? window.safeHtml(respAgent[COL_AGENT_FONCTION]) : "Responsable";
        const email = respAgent ? window.safeHtml(respAgent[COL_AGENT_MAIL]) : "";
        const tel = respAgent ? window.safeHtml(respAgent[COL_AGENT_TEL]) : "";

        htmlContent = `
            <div class="fr-card fr-card--no-border fr-mb-2w">
                <div class="fr-card__body">
                    <div class="fr-card__content">
                        <h3 class="fr-card__title"><span class="fr-icon-user-star-line fr-mr-1w"></span>${window.safeHtml(respNameRaw)}</h3>
                        <p class="fr-card__desc text-bold">${fct}</p>
                        <div class="fr-card__start">
                            <ul class="fr-badges-group">
                                ${email ? `<li><button onclick="copyToClipboard('${email}', this)" class="fr-badge fr-badge--info">${email.toLowerCase()}</button></li>` : ''}
                                ${tel ? `<li><span class="fr-badge fr-badge--success">📞 ${tel}</span></li>` : ''}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>`;
    } else {
        htmlContent = `<div class="fr-alert fr-alert--warning"><p>Aucun responsable listé.</p></div>`;
    }

    htmlContent += `
        <div class="fr-grid-row fr-grid-row--center fr-mt-3w">
            <a href="search.html?structure=${structId}" class="fr-btn fr-btn--secondary">Voir toute l'équipe</a>
        </div>`;

    document.getElementById('modal-title').innerText = struct[COL_STRUCT_LIBELLE];
    document.getElementById('modal-body').innerHTML = htmlContent;
    document.getElementById('dsfr-hidden-modal-btn').click();
};

/**
 * UTILITAIRES DE RECHERCHE & FILTRE
 */
function getStructuresByPos(code) {
    return allStructures.filter(s => window.safeStr(s[COL_STRUCT_POSITION]).trim() === code);
}

function initQuickSearch() {
    const select = document.getElementById('quick-select-structure');
    if (!select) return;

    // Population du select triée par libellé
    allStructures
        .map(s => ({ id: s.id, label: s[COL_STRUCT_LIBELLE] || s[COL_STRUCT_CODE] }))
        .sort((a, b) => a.label.localeCompare(b.label))
        .forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.id;
            el.textContent = opt.label;
            select.appendChild(el);
        });

    const btn = document.getElementById('quick-search-btn');
    const input = document.getElementById('quick-search-input');

    const doSearch = () => {
        const params = new URLSearchParams();
        if (select.value) params.set('structure', select.value);
        if (input.value.trim()) params.set('q', input.value.trim());
        window.location.href = `search.html?${params.toString()}`;
    };

    if (btn) btn.onclick = doSearch;
    if (input) input.onkeypress = (e) => { if (e.key === 'Enter') doSearch(); };
}

/**
 * ADMINISTRATION : Ajout rapide d'agent
 */
const adminInitInterval = setInterval(() => {
    const btnShow = document.getElementById('btn-show-form');
    if (btnShow && allStructures.length > 0) {
        setupAdminEvents();
        populateAdminSelect();
        clearInterval(adminInitInterval);
    }
}, 500);

function setupAdminEvents() {
    document.getElementById('btn-show-form').onclick = () => document.getElementById('form-creation-agent').style.display = 'block';
    document.getElementById('btn-cancel').onclick = () => document.getElementById('form-creation-agent').style.display = 'none';
    document.getElementById('btn-save').onclick = handleSaveAgent;
}

function populateAdminSelect() {
    const select = document.getElementById('field-struct');
    if (!select) return;
    select.innerHTML = '<option value="" disabled selected>Choisir une structure...</option>' + 
        allStructures.map(s => `<option value="${s.id}">${s[COL_STRUCT_LIBELLE] || s[COL_STRUCT_CODE]}</option>`).join('');
}

async function handleSaveAgent() {
    const data = {
        prenom: document.getElementById('field-prenom').value.trim(),
        nom: document.getElementById('field-nom').value.trim(),
        fct: document.getElementById('field-fct').value.trim(),
        struct: parseInt(document.getElementById('field-struct').value),
        form: document.getElementById('field-formation').value.trim()
    };

    if (!data.nom || isNaN(data.struct)) return alert("⚠️ Nom et Structure obligatoires.");

    try {
        await grist.docApi.applyUserActions([
            ["AddRecord", TABLE_AGENTS, null, {
                [COL_AGENT_PRENOM]: data.prenom,
                [COL_AGENT_NOM]: data.nom,
                [COL_AGENT_FONCTION]: data.fct,
                [COL_AGENT_STRUCT_REF]: data.struct,
                "Formations": data.form 
            }]
        ]);
        alert("✅ Agent ajouté !");
        location.reload();
    } catch (err) {
        alert("❌ Erreur : " + err.message);
    }
}