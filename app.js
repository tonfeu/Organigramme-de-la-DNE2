// ==========================================
// INITIALISATION
// ==========================================
// Ce fichier gère toute la logique métier de l'organigramme DNE :
// - Récupération des données depuis Grist
// - Transformation et optimisation des données
// - Rendu dynamique de l'interface
// - Gestion des interactions utilisateur (recherche, modale, etc.)

// Note : Les constantes (noms de colonnes, tables, etc.) sont définies dans utils.js

// Initialisation du plugin Grist avec accès en lecture
grist.ready({ 
  requiredAccess: 'full',
  onRecords: function(records) {
    // Cette fonction optionnelle peut aider à stabiliser la connexion
  }
});



// Lancement de la fonction principale après chargement du DOM
document.addEventListener('DOMContentLoaded', init);

// Variables globales (cache des données)
let allAgents = [];              // Liste complète des agents
let allStructures = [];          // Liste des structures (bureaux)
let structureMap = new Map();    // Accès rapide aux structures (O(1))
let agentsHierarchyMap = new Map(); // Accès rapide à la hiérarchie des agents

/**
 * Fonction principale d'initialisation
 * - Charge les données
 * - Prépare les structures
 * - Lance le rendu de l'interface
 */
async function init() {
    try {
        console.log("Chargement Organigramme ...");

        // ==========================================
        // 1. RÉCUPÉRATION DES DONNÉES GRIST
        // ==========================================
        const tables = [TABLE_AGENTS, TABLE_STRUCTURES, TABLE_CONFIG_LOGO];
        const data = {};

        // Chargement parallèle des tables
        await Promise.all(tables.map(async (name) => {
            try {
                const result = await grist.docApi.fetchTable(name);

                // Transformation colonnes -> lignes
                data[name] = window.transformColsToRows(result);
            } catch (err) {
                console.warn(`Table ${name} non trouvée ou inaccessible.`, err);

                // Fallback si la table n'existe pas
                data[name] = [];
            }

            
        }));




        // ==========================================
        // 2. PRÉPARATION ET OPTIMISATION DES DONNÉES
        // ==========================================

        // Enrichissement des agents (normalisation des noms, etc.)
        allAgents = window.enrichAgentsData(data[TABLE_AGENTS]);

        // Création d'un index pour la hiérarchie (recherche rapide)
        agentsHierarchyMap = window.createAgentsHierarchyMap(allAgents);

        // Structures (bureaux)
        allStructures = data[TABLE_STRUCTURES];

        // Index des structures (accès rapide par ID)
        structureMap = window.createStructureMap(allStructures);

        
        console.log("Agents :", allAgents);
        console.log("Structures :", allStructures);

        // ==========================================
        // 3. CONFIGURATION DU LOGO
        // ==========================================
        applyLogoConfig(data[TABLE_CONFIG_LOGO]);

        // ==========================================
        // 4. RENDU DE L'INTERFACE
        // ==========================================

        renderTopZone();   // Zone supérieure (direction, cabinet...)
        renderColumns();   // Colonnes principales
        initQuickSearch(); // Recherche rapide

        // ==========================================
        // 5. EXPOSITION DES DONNÉES (POUR PDF / AUTRES MODULES)
        // ==========================================
        window.getOrganigrammeData = () => ({
            agents: allAgents,
            structures: allStructures
        });

    } catch (e) {
        console.error("ERREUR :", e);

        // Affichage d'une erreur dans l'interface
        document.querySelector('.main-grid').innerHTML =
            `<div class="fr-alert fr-alert--error">${e.message}</div>`;
    }
} 



// ==========================================
// CONFIGURATION LOGO
// ==========================================
/**
 * Applique la configuration du logo depuis Grist
 * - Masquage du logo
 * - Personnalisation du texte
 */
function applyLogoConfig(configData) {

    // Si aucune configuration, on ne fait rien
    if (!configData || configData.length === 0) return;

    // On prend la première ligne de config
    const configRow = configData[0];

    const logoContainer = document.querySelector('.fr-header__logo');
    if (!logoContainer) return;

    // 1. Masquer le logo
    if (configRow[COL_CONFIG_MASQUER_LOGO]) {
        logoContainer.style.display = 'none';
        return;
    }

    // 2. Modifier le texte du logo
    const customText = safeStr(configRow[COL_CONFIG_TEXTE_LOGO]).trim();

    if (customText) {
        const pLogo = logoContainer.querySelector('.fr-logo');

        if (pLogo) {
            // Sécurisation HTML + gestion des retours à la ligne
            pLogo.innerHTML = safeHtml(customText).replace(/\n/g, '<br>');
        }
    }
}

// ==========================================
// RENDU VISUEL (GRILLE)
// ==========================================

// Affiche la zone supérieure (DG, cabinet, etc.)
function renderTopZone() {

    // Zone gauche
    const left = document.getElementById('top-left');
    if (left) getStructuresByPos('TOP_LEFT')
        .forEach(s => createDsfrTile(left, s));

    // Zone centrale (chef)
    const center = document.getElementById('top-center');
    const centerStructs = getStructuresByPos('TOP_CENTER');

    if (center && centerStructs.length > 0)
        createDsfrTile(center, centerStructs[0], 'tile-chef');

    // Zone droite
    const right = document.getElementById('top-right');
    if (right) getStructuresByPos('TOP_RIGHT')
        .forEach(s => createDsfrTile(right, s));
}

// Affiche les colonnes principales (1 à 5)
function renderColumns() {
    for (let i = 1; i <= 5; i++) { 
        const container = document.getElementById(`col-${i}`);
        if (!container) continue;

        // Tête de colonne
        const heads = getStructuresByPos(`COL${i}_HEAD`);
        if (heads.length > 0)
            createDsfrTile(container, heads[0], 'tile-head');

        // Sous-structures
        const subs = getStructuresByPos(`COL${i}_SUB`);
        subs.forEach(sub => createDsfrTile(container, sub));
    }
}

/**
 * Création d'une tuile DSFR représentant une structure
 */
function createDsfrTile(container, struct, extraClass = '') {

    // Données sécurisées
    const codeBureau = window.safeHtml(struct[COL_STRUCT_CODE]).trim();
    const libelle = window.safeHtml(struct[COL_STRUCT_LIBELLE], "Sans nom");
    const resp = window.safeHtml(window.findResponsableName(struct, agentsHierarchyMap));
    const specialStyle = window.safeStr(struct[COL_STRUCT_STYLE]).toLowerCase();

    // Style particulier (pointillé)
    if (specialStyle.includes('pointill')) {
        extraClass += ' tile-dashed';
    }

    const div = document.createElement('div');

    // Classe DSFR + custom
    div.className = `fr-tile fr-enlarge-link fr-tile--no-icon ${extraClass}`;

    // Header (code bureau)
    const headerHtml = codeBureau
        ? `<div class="tile-header">${codeBureau}</div>`
        : '';

    // Bloc responsable
    let respHtml = '';
    if (resp) {
        respHtml = `
        <div class="tile-resp-container">
            <div class="tile-separator"></div>
            <span class="tile-resp-name">${resp}</span>
        </div>`;
    }

    // HTML final de la tuile
    div.innerHTML = `
        ${headerHtml}
        <div class="fr-tile__body">
            <div class="fr-tile__content">
                <h3 class="fr-tile__title">
                    <a href="#">${libelle}</a>
                </h3>
            </div>
            ${respHtml}
        </div>
    `;

    // Gestion du clic -> ouverture modale
    div.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        openModalForStructure(struct.id);
    });

    container.appendChild(div);
}

// ==========================================
// MODALE DE DÉTAIL
// ==========================================

/**
 * Ouvre la modale pour une structure donnée
 */
window.openModalForStructure = function (structId) {
    if (!structId) return;
    const struct = allStructures.find(s => s.id === structId);
    if (!struct) return;

    const title = safeStr(struct[COL_STRUCT_LIBELLE]);
    const respNameRaw = findResponsableName(struct, agentsHierarchyMap);
    const respName = safeHtml(respNameRaw);

    // Recherche des détails de l'agent responsable (via cache normalisé)
    let respAgent = null;
    if (respNameRaw) {
        const target = window.normalizeString(respNameRaw);
        respAgent = allAgents.find(a =>
            (a._fullname && a._fullname.includes(target)) ||
            (a._fullnameReverse && a._fullnameReverse.includes(target))
        );
    }

    let htmlContent = '';

    // ==========================================
    // 1. CARTE RESPONSABLE
    // ==========================================
    if (respNameRaw) {

        const fct = respAgent ? safeHtml(respAgent[COL_AGENT_FONCTION]) : "Responsable";
        const emailAgent = respAgent ? safeHtml(respAgent[COL_AGENT_MAIL]) : "";
        const emailGeneric = respAgent ? safeHtml(respAgent['Mail_generique']) : "";
        const tel = respAgent ? safeHtml(respAgent[COL_AGENT_TEL]) : "";
        const mobile = respAgent ? safeHtml(respAgent['Tel_PORT']) : "";

        htmlContent += `
        <div class="fr-card fr-card--no-border fr-mb-2w">
            <div class="fr-card__body">
                <div class="fr-card__content">
                    <h3 class="fr-card__title">
                        <span class="fr-icon-user-star-line fr-mr-1w"></span>
                        ${respName}
                    </h3>
                    <p class="fr-card__desc text-bold">${fct}</p>
                    <div class="fr-card__start">
                        <ul class="fr-badges-group">

                             ${emailAgent ? `<li><button onclick="copyToClipboard('${emailAgent.toLowerCase()}', this)" class="fr-badge fr-badge--info fr-badge--no-icon copy-btn">${emailAgent.toLowerCase()}</button></li>` : ''}

                             ${emailGeneric ? `<li><button onclick="copyToClipboard('${emailGeneric.toLowerCase()}', this)" class="fr-badge fr-badge--purple-glycine fr-badge--no-icon copy-btn">Générique : ${emailGeneric.toLowerCase()}</button></li>` : ''}

                             ${tel ? `<li><button onclick="copyToClipboard('${tel}', this)" class="fr-badge fr-badge--info fr-badge--no-icon copy-btn">Fixe : ${tel}</button></li>` : ''}

                             ${mobile ? `<li><button onclick="copyToClipboard('${mobile}', this)" class="fr-badge fr-badge--info fr-badge--no-icon copy-btn">Mob. : ${mobile}</button></li>` : ''}

                        </ul>
                    </div>
                </div>
            </div>
        </div>
        `;
    } else {
        htmlContent += `
            <div class="fr-alert fr-alert--warning fr-mb-2w">
                <p>Aucun responsable identifié pour ce service.</p>
            </div>
        `;
    }

    // ==========================================
    // 2. LIEN VERS PAGE DÉTAIL
    // ==========================================
    htmlContent += `
        <div class="fr-grid-row fr-grid-row--center fr-mt-3w">
            <a href="search.html?structure=${structId}" class="fr-btn fr-btn--secondary">
                Voir toute l'équipe
            </a>
        </div>
    `;

    // Injection dans la modale
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-body').innerHTML = htmlContent;

    // Ouverture via DSFR
    document.getElementById('dsfr-hidden-modal-btn').click();
};

// ==========================================
// UTILITAIRES
// ==========================================

// Filtrer les structures par position
function getStructuresByPos(code) {
    return allStructures.filter(s =>
        window.safeStr(s[COL_STRUCT_POSITION]).trim() === code
    );
}

// ==========================================
// RECHERCHE RAPIDE
// ==========================================
function initQuickSearch() {

    const select = document.getElementById('quick-select-structure');
    if (!select) return;

    // Création des options du select
    const options = allStructures.map(struct => {

        const code = window.safeStr(struct['Structure']).trim();
        const libelle = window.safeStr(struct[COL_STRUCT_LIBELLE]).trim();

        let label = libelle;

        if (code && code.toLowerCase() !== libelle.toLowerCase()) {
            label = `${code} - ${libelle} `;
        }

        return { id: struct.id, label: label };
    });

    // Tri alphabétique
    options.sort((a, b) =>
        a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' })
    );

    // Injection dans le select
    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.id;
        option.textContent = opt.label;
        select.appendChild(option);
    });

    // Gestion des événements
    const btn = document.getElementById('quick-search-btn');
    const input = document.getElementById('quick-search-input');

    if (btn) {

        btn.addEventListener('click', triggerQuickSearch);

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') triggerQuickSearch();
        });

        function triggerQuickSearch() {

            const structId = select.value;
            const query = input.value.trim();

            const params = new URLSearchParams();

            if (structId) params.set('structure', structId);
            if (query) params.set('q', query);

            const queryString = params.toString();

            // Redirection vers page de recherche
            window.location.href = queryString
                ? `search.html?${queryString}`
                : 'search.html';
        }
    }
}



function setupAdminEvents() {
    const btnShow = document.getElementById('btn-show-form');
    const btnCancel = document.getElementById('btn-cancel');
    const btnSave = document.getElementById('btn-save');

    if (btnShow) {
        btnShow.onclick = () => {
            document.getElementById('form-creation-agent').style.display = 'block';
        };
    }

    if (btnCancel) {
        btnCancel.onclick = () => {
            document.getElementById('form-creation-agent').style.display = 'none';
        };
    }

    if (btnSave) {
        btnSave.onclick = async () => {
            await handleSaveAgent();
        };
    }
}

const populateAdminSelect = () => {
    const select = document.getElementById('field-struct');
    if (!select || !window.allStructures || allStructures.length === 0) return;

    let html = '<option value="" disabled selected>Choisir une structure...</option>';
    const sorted = [...window.allStructures].sort((a, b) => {
        const labelA = (a[COL_STRUCT_LIBELLE] || "").toString();
        const labelB = (b[COL_STRUCT_LIBELLE] || "").toString();
        return labelA.localeCompare(labelB);
    });

    sorted.forEach(s => {
        const label = s[COL_STRUCT_LIBELLE] || s[COL_STRUCT_CODE] || "Sans nom";
        html += `<option value="${s.id}">${label}</option>`;
    });
    select.innerHTML = html;
};

async function handleSaveAgent() {
    const data = {
        prenom: document.getElementById('field-prenom').value.trim(),
        nom: document.getElementById('field-nom').value.trim(),
        fct: document.getElementById('field-fct').value.trim(),
        struct: parseInt(document.getElementById('field-struct').value),
        form: document.getElementById('field-formation').value.trim()
    };

    if (!data.nom || isNaN(data.struct)) {
        alert("⚠️ Le NOM et la STRUCTURE sont obligatoires.");
        return;
    }

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
        alert("✅ Agent ajouté avec succès !");
        location.reload(); 
    } catch (err) {
        console.error("Erreur Grist:", err);
        alert("❌ Erreur : Vérifiez vos droits et les noms de colonnes.");
    }
}

const adminInitInterval = setInterval(() => {
    if (document.getElementById('btn-show-form')) {
        setupAdminEvents();
        if (window.allStructures && window.allStructures.length > 0) {
            populateAdminSelect();
            clearInterval(adminInitInterval);
            console.log("🚀 Admin Panel prêt !");
        }
    }
}, 500);