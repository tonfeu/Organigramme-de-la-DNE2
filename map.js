/**
 * ==========================================
 * CONFIGURATION GRIST (MAPPING DES COLONNES)
 * ==========================================
 * 👉 Cette section centralise tous les noms de tables et colonnes.
 * 👉 Si une colonne change dans Grist, il suffit de modifier ici.
 */

// ======================
// NOMS DES TABLES
// ======================
const TABLE_AGENTS = 'Base_Agent';          // Table contenant les agents
const TABLE_STRUCTURES = 'Structures';      // Table contenant les structures
const TABLE_CONFIG_LOGO = 'Config_Logo';    // Table de configuration du logo

// ======================
//  CONFIGURATION LOGO
// ======================
const COL_CONFIG_TEXTE_LOGO = 'Texte_Logo';   // Texte affiché dans le logo
const COL_CONFIG_MASQUER_LOGO = 'Masquer_Logo'; // Permet de cacher le logo

// ======================
//  COLONNES AGENTS (ANNUAIRE)
// ======================
const COL_AGENT_NOM = 'Nom_d_usage_de_l_agent'; // Nom de famille
const COL_AGENT_PRENOM = 'Prenom';              // Prénom
const COL_AGENT_FONCTION = 'Fonction_de_l_agent'; // Poste occupé
const COL_AGENT_STRUCT_REF = 'Structure_de_l_agent'; // Structure d'appartenance
const COL_AGENT_STRUCT_SUP = 'Structure_superieur_hierarchique'; // Structure supérieure
const COL_AGENT_MAIL = 'Mail_agent'; // Email personnel
const COL_AGENT_MAIL_GEN = 'Mail_generique'; // Email générique
const COL_AGENT_TEL = 'Tel_'; // Téléphone fixe
const COL_AGENT_TEL_PORT = 'Tel_PORT'; // Téléphone portable
const COL_AGENT_SITE = 'Site'; // Site web
const COL_AGENT_BUREAU = 'Bureau'; // Bureau physique
const COL_AGENT_TELETRAVAIL = 'Jour_s_de_teletravail'; // Télétravail
const COL_AGENT_MISSIONS = 'Missions_du_poste'; // Missions
const COL_AGENT_PROJET = 'nom_du_projet'; // Projet
const COL_AGENT_ROLE_PROJET = 'Role_chef_projet_ou_participnt'; // Rôle dans projet
const COL_AGENT_POLE = 'Pole_ou_section_'; // Pôle
const COL_AGENT_DESC_POLE = 'Description_pole'; // Description pôle
const COL_AGENT_SECTEUR = 'Secteur_ou_cellule_'; // Secteur
const COL_AGENT_DESC_SECTEUR = 'Description_secteur'; // Description secteur

// ======================
// COLONNES STRUCTURES
// ======================
const COL_STRUCT_CODE = 'Structure'; // Code unique
const COL_STRUCT_LIBELLE = 'Libelle'; // Nom de la structure
const COL_STRUCT_POSITION = 'Code_Position'; // Position dans l’organigramme
const COL_STRUCT_STYLE = 'Style_Special'; // Style visuel
const COL_STRUCT_DESC = 'Description_Structure'; // Description
const COL_STRUCT_RESP = 'Responsable_Manuel'; // Responsable manuel
const COL_STRUCT_CHEF_SUP = 'Superieur_hierarchique'; // Supérieur hiérarchique


/**
 * ==========================================
 * UTILITAIRES COMMUNS & LOGIQUE MÉTIER
 * ==========================================
 * 👉 Fonctions globales utilisées dans tout le projet
 */

// ======================
// 🛡️ Sécurité & Formatage
// ======================

// Évite null/undefined dans l'affichage
window.safeStr = function (val, def = "") {
    return val === null || val === undefined ? def : String(val);
};

// Protection XSS (sécurité HTML)
window.escapeHtml = function (unsafe) {
    if (unsafe === null || unsafe === undefined) return "";
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

// Combine sécurité + formatage
window.safeHtml = function (val, def = "") {
    return window.escapeHtml(window.safeStr(val, def));
};

// ======================
//  Recherche optimisée
// ======================

// Normalise texte (minuscules + sans accents)
window.normalizeString = function (str) {
    if (!str) return "";
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

// Transforme colonnes Grist → lignes exploitables
window.transformColsToRows = function (cols) {
    if (!cols || !cols.id) return [];
    const rows = [];
    for (let i = 0; i < cols.id.length; i++) {
        let r = {};
        for (const k in cols) r[k] = cols[k][i];
        rows.push(r);
    }
    return rows;
};

// ======================
//  Optimisation des données
// ======================

// Ajoute un cache pour recherche rapide du nom complet (et inversé pour recherche par nom)
window.enrichAgentsData = function (agentsArray) {
    agentsArray.forEach(agent => {
        const nom = safeStr(agent[COL_AGENT_NOM]);
        const prenom = safeStr(agent[COL_AGENT_PRENOM]);

        agent._fullname = normalizeString(`${prenom} ${nom}`);
        agent._fullnameReverse = normalizeString(`${nom} ${prenom}`);
    });
    return agentsArray;
};

// Map des structures (accès ultra rapide)
window.createStructureMap = function (structuresArray) {
    const map = new Map();
    structuresArray.forEach(s => map.set(s.id, s));
    return map;
};

// Map hiérarchique des agents
window.createAgentsHierarchyMap = function (agentsArray) {
    const map = new Map();
    agentsArray.forEach(a => {
        const sup = safeStr(a[COL_AGENT_STRUCT_SUP]).trim();
        if (sup) {
            map.set(sup, a);
        }
    });
    return map;
};

// ======================
//  Gestion hiérarchie
// ======================

// Trouve le responsable d’une structure
window.findResponsableName = function (structObject, agentsHierarchyMap) {
    if (!structObject) return null;

    // 1. Responsable manuel prioritaire
    const manualChef = safeStr(structObject[COL_STRUCT_RESP]).trim();
    if (manualChef) return manualChef;

    // 2. Sinon calcul automatique
    const codeStruct = safeStr(structObject[COL_STRUCT_CODE]).trim();
    if (!codeStruct || !agentsHierarchyMap) return null;

    const temoin = agentsHierarchyMap.get(codeStruct);
    if (temoin) return safeStr(temoin[COL_STRUCT_CHEF_SUP]);

    return null;
};

// ======================
//  Optimisation UX
// ======================

// Anti-spam de la recherche
window.debounce = function (func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};

// ======================
// 📋 Copier dans le presse-papier
// ======================

window.copyToClipboard = function (text, btnElement) {
    if (!navigator.clipboard) {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            showCopyTooltip(btnElement);
        } catch (err) {
            console.error('Erreur lors de la copie', err);
        }
        document.body.removeChild(textArea);
        return;
    }

    navigator.clipboard.writeText(text).then(() => {
        showCopyTooltip(btnElement);
    }).catch(err => {
        console.error('Erreur lors de la copie', err);
    });
};

// Tooltip visuel après copie (pas de dépendance externe, simple et efficace)
function showCopyTooltip(element) {
    if (element.querySelector('.copy-tooltip')) return;

    const tooltip = document.createElement('span');
    tooltip.className = 'copy-tooltip';
    tooltip.innerHTML = '<span class="fr-icon-check-line fr-icon--sm fr-mr-1v"></span> Copié !';

    element.style.position = 'relative';
    element.appendChild(tooltip);

    setTimeout(() => {
        if (tooltip.parentNode) {
            tooltip.parentNode.removeChild(tooltip);
        }
    }, 2000);
}