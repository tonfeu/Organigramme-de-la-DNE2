/**
 * ==========================================
 * CONFIGURATION GRIST (MAPPING DES COLONNES)
 * ==========================================
 * Centralisation des noms de tables et colonnes pour faciliter la maintenance.
 */

// NOMS DES TABLES
const TABLE_AGENTS = 'Base_Agent';
const TABLE_STRUCTURES = 'Structures';
const TABLE_CONFIG_LOGO = 'Config_Logo';

// COLONNES CONFIGURATION LOGO
const COL_CONFIG_TEXTE_LOGO = 'Texte_Logo';
const COL_CONFIG_MASQUER_LOGO = 'Masquer_Logo';

// COLONNES AGENTS
const COL_AGENT_NOM = 'Nom_d_usage_de_l_agent';
const COL_AGENT_PRENOM = 'Prenom';
const COL_AGENT_FONCTION = 'Fonction_de_l_agent';
const COL_AGENT_STRUCT_REF = 'Structure_de_l_agent';
const COL_AGENT_STRUCT_SUP = 'Structure_superieur_hierarchique';
const COL_AGENT_MAIL = 'Mail_agent';
const COL_AGENT_TEL = 'Telephone_agent';
const COL_AGENT_PHOTO = 'Photo_agent';
const COL_AGENT_MISSIONS = 'Missions_de_l_agent';
const COL_AGENT_CHEF = 'Est_Chef';
const COL_AGENT_ORDRE = 'Ordre_affichage';
const COL_AGENT_FORMATION = 'Formations';

// COLONNES STRUCTURES (BUREAUX)
const COL_STRUCT_CODE = 'Code_Structure';
const COL_STRUCT_LIBELLE = 'Libelle';
const COL_STRUCT_SIGLE = 'Sigle_Structure';
const COL_STRUCT_ID_PARENT = 'Parent_ID';

/**
 * Transforme les données Grist (format colonnes) en tableau d'objets (format lignes).
 */
window.transformColsToRows = function(gristData) {
    const keys = Object.keys(gristData);
    if (keys.length === 0) return [];
    const numRows = gristData[keys[0]].length;
    const rows = [];
    for (let i = 0; i < numRows; i++) {
        const row = {};
        keys.forEach(key => {
            row[key] = gristData[key][i];
        });
        rows.push(row);
    }
    return rows;
};

/**
 * GESTION DES ACTIONS AGENTS (GLOBAL)
 */
window.toggleMgmt = function(id) {
    const menu = document.getElementById(`mgmt-menu-${id}`);
    if (menu) menu.classList.toggle('is-active');
};

window.deleteAgent = async function(id, name) {
    if (confirm(`⚠️ Supprimer définitivement ${name} ?`)) {
        try {
            await grist.docApi.deleteRecords(TABLE_AGENTS, [id]);
            location.reload();
        } catch (e) {
            alert("Erreur lors de la suppression. Vérifiez vos droits d'accès.");
        }
    }
};