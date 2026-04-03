/**
 * ============================================================
 * SEARCH.JS - MOTEUR DE RECHERCHE ET GESTION DES AGENTS
 * ============================================================
 */

// --- VARIABLES GLOBALES ---
let allAgents = [];      // Liste complète des agents
let allStructures = [];  // Liste complète des structures
let structureMap = new Map(); // Pour trouver une structure par son ID rapidement

// --- 1. INITIALISATION GRIST ---
grist.ready({ 
  requiredAccess: 'full' // Nécessaire pour ajouter/supprimer des records
});

/**
 * Fonction de démarrage au chargement de la page
 */
async function init() {
    try {
        console.log("Démarrage du moteur de recherche...");
        document.getElementById('loadingMessage').style.display = 'block';

        // Récupération des données depuis Grist (Tables définies dans map.js)
        const [agentsData, structsData] = await Promise.all([
            grist.docApi.fetchTable(TABLE_AGENTS),
            grist.docApi.fetchTable(TABLE_STRUCTURES)
        ]);

        // Transformation des données (Colonnes -> Lignes) via les fonctions de map.js
        allAgents = window.transformColsToRows(agentsData);
        allStructures = window.transformColsToRows(structsData);
        
        // Création d'une map pour les performances
        structureMap = new Map(allStructures.map(s => [s.id, s]));

        console.log(`Données : ${allAgents.length} agents, ${allStructures.length} structures.`);

        // Configuration de l'interface
        setupUI();
        populateStructureSelect(); // Remplit le menu de recherche
        populateAdminSelect();    // Remplit le menu du formulaire d'ajout

        document.getElementById('loadingMessage').style.display = 'none';

    } catch (e) {
        console.error("ERREUR INITIALISATION :", e);
        document.getElementById('resultArea').innerHTML = `<div class="fr-alert fr-alert--error">${e.message}</div>`;
    }
}

// --- 2. LOGIQUE DE RECHERCHE ---

/**
 * Configure les écouteurs d'événements (clics, frappe clavier)
 */
function setupUI() {
    // Recherche automatique pendant la frappe (avec un petit délai 'debounce')
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', window.debounce(performSearch, 300));
    }

    // Recherche automatique au changement de structure
    const select = document.getElementById('select-structure');
    if (select) {
        select.addEventListener('change', performSearch);
    }
}

/**
 * Fonction principale de filtrage et d'affichage
 */
function performSearch() {
    const textQuery = document.getElementById('searchInput').value.trim().toLowerCase();
    const structId = parseInt(document.getElementById('select-structure').value);

    // Filtrage des agents selon les deux critères
    const results = allAgents.filter(a => {
        const matchStruct = !structId || a[COL_AGENT_STRUCT_REF] === structId;
        
        const nom = (a[COL_AGENT_NOM] || "").toLowerCase();
        const prenom = (a[COL_AGENT_PRENOM] || "").toLowerCase();
        const fct = (a[COL_AGENT_FONCTION] || "").toLowerCase();
        const matchText = !textQuery || nom.includes(textQuery) || prenom.includes(textQuery) || fct.includes(textQuery);

        return matchStruct && matchText;
    });

    renderResults(results);
}

/**
 * Affiche les cartes des agents dans la zone de résultats
 */
function renderResults(agents) {
    const container = document.getElementById('resultArea');
    if (agents.length === 0) {
        container.innerHTML = '<p class="fr-mt-2w">Aucun résultat trouvé.</p>';
        return;
    }

    let html = '<div class="fr-grid-row fr-grid-row--gutters">';
    agents.forEach(agent => {
        html += generateAgentCardHtml(agent); // Utilise la fonction de création de carte
    });
    html += '</div>';
    container.innerHTML = html;
}

// --- 3. ACTIONS ADMINISTRATION (AJOUT, SUPPR, TRANSFERT) ---

/**
 * Affiche ou masque le formulaire d'ajout d'un nouvel agent
 */
window.toggleAddForm = function() {
    const form = document.getElementById('form-creation-agent');
    if (form) {
        form.style.display = (form.style.display === 'none' || form.style.display === '') ? 'block' : 'none';
    }
};

/**
 * Enregistre un nouvel agent dans Grist
 */
window.saveNewAgent = async function() {
    const fields = {
        prenom: document.getElementById('field-prenom').value.trim(),
        nom: document.getElementById('field-nom').value.trim(),
        fct: document.getElementById('field-fct').value.trim(),
        struct: parseInt(document.getElementById('field-struct').value)
    };

    if (!fields.nom || !fields.struct) {
        alert("⚠️ Le NOM et la STRUCTURE sont obligatoires.");
        return;
    }

    try {
        await grist.docApi.applyUserActions([
            ["AddRecord", TABLE_AGENTS, null, {
                [COL_AGENT_PRENOM]: fields.prenom,
                [COL_AGENT_NOM]: fields.nom,
                [COL_AGENT_FONCTION]: fields.fct,
                [COL_AGENT_STRUCT_REF]: fields.struct
            }]
        ]);
        alert("✅ Agent ajouté !");
        location.reload(); // Rafraîchit la page pour voir le nouvel agent
    } catch (err) {
        alert("❌ Erreur : Vérifiez vos droits d'accès Grist.");
    }
};

/**
 * Supprime un agent (Action irréversible)
 */
window.deleteAgent = async function(id, name) {
    if (!confirm(`❌ Supprimer définitivement ${name} ?`)) return;

    try {
        await grist.docApi.applyUserActions([["RemoveRecord", TABLE_AGENTS, id]]);
        alert("Agent supprimé.");
        location.reload();
    } catch (e) {
        alert("Erreur lors de la suppression.");
    }
};

/**
 * Transfère un agent vers une autre structure
 */
window.executeTransfer = async function(agentId, uniqueId, agentName) {
    const selectEl = document.getElementById(`select-transfer-${uniqueId}`);
    const newStructId = parseInt(selectEl.value);

    if (!newStructId) {
        alert("Sélectionnez une structure de destination.");
        return;
    }

    try {
        await grist.docApi.applyUserActions([
            ["UpdateRecord", TABLE_AGENTS, agentId, { [COL_AGENT_STRUCT_REF]: newStructId }]
        ]);
        alert(`✅ ${agentName} a été transféré.`);
        location.reload();
    } catch (e) {
        alert("Erreur lors du transfert.");
    }
};

// --- 4. FONCTIONS DE REMPLISSAGE DES MENUS ---

function populateStructureSelect() {
    const select = document.getElementById('select-structure');
    if (!select) return;
    
    allStructures
        .sort((a, b) => (a[COL_STRUCT_LIBELLE] || "").localeCompare(b[COL_STRUCT_LIBELLE] || ""))
        .forEach(s => {
            const opt = new Option(s[COL_STRUCT_LIBELLE] || s[COL_STRUCT_CODE], s.id);
            select.appendChild(opt);
        });
}

function populateAdminSelect() {
    const select = document.getElementById('field-struct');
    if (!select) return;
    
    let html = '<option value="" disabled selected>Choisir une structure...</option>';
    allStructures.forEach(s => {
        html += `<option value="${s.id}">${s[COL_STRUCT_LIBELLE] || "Sans nom"}</option>`;
    });
    select.innerHTML = html;
}

/**
 * Gère l'ouverture/fermeture du petit bandeau gris d'administration sur chaque carte
 */
window.toggleMgmt = function(adminId) {
    const panel = document.getElementById(adminId);
    if (panel) {
        panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'flex' : 'none';
    }
};

// --- LANCEMENT ---
document.addEventListener('DOMContentLoaded', init);