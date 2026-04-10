/**
 * ==========================================
 * LOGIQUE PRINCIPALE - APP.JS
 * ==========================================
 */

// Stockage global des données
let allAgents = [];
let allStructures = [];
let structureMap = new Map();

// Initialisation Grist
grist.ready({ requiredAccess: 'full' });

document.addEventListener('DOMContentLoaded', init);

/**
 * Point d'entrée : Chargement des données et rendu
 */
async function init() {
    try {
        console.log("🚀 Initialisation...");
        
        // 1. Récupération des tables
        const [rawAgents, rawStructs] = await Promise.all([
            grist.docApi.fetchTable(TABLE_AGENTS),
            grist.docApi.fetchTable(TABLE_STRUCTURES)
        ]);

        // 2. Transformation
        window.allAgents = window.transformColsToRows(rawAgents);
        window.allStructures = window.transformColsToRows(rawStructs);

        // 3. Mapping des structures pour accès rapide
        window.allStructures.forEach(s => structureMap.set(s.id, s));

        console.log(`Données chargées : ${window.allAgents.length} agents, ${window.allStructures.length} structures.`);

        // 4. Initialisation des composants UI
        initAdminInterface();
        renderOrganigramme();

    } catch (error) {
        console.error("❌ Erreur d'initialisation :", error);
        document.getElementById('organigramme-container').innerHTML = 
            `<div class="fr-alert fr-alert--error"><p>Erreur lors du chargement des données Grist.</p></div>`;
    }
}

/**
 * Gère l'affichage du formulaire et le remplissage du select
 */
function initAdminInterface() {
    const btnShow = document.getElementById('btn-show-form');
    const btnCancel = document.getElementById('btn-cancel');
    const btnSave = document.getElementById('btn-save');
    const form = document.getElementById('form-creation-agent');
    const select = document.getElementById('field-struct');

    if (btnShow) {
        btnShow.onclick = () => {
            form.style.display = 'block';
            populateStructureSelect(select);
        };
    }

    if (btnCancel) {
        btnCancel.onclick = () => form.style.display = 'none';
    }

    if (btnSave) {
        btnSave.onclick = handleSaveAgent;
    }
}

/**
 * Remplit la liste déroulante des bureaux/structures
 */
function populateStructureSelect(selectElement) {
    if (!selectElement || !window.allStructures) return;

    // Tri alphabétique par libellé
    const sorted = [...window.allStructures].sort((a, b) => {
        const labelA = (a[COL_STRUCT_LIBELLE] || "").toString();
        const labelB = (b[COL_STRUCT_LIBELLE] || "").toString();
        return labelA.localeCompare(labelB);
    });

    let html = '<option value="" disabled selected>Choisir une structure...</option>';
    sorted.forEach(s => {
        const name = s[COL_STRUCT_LIBELLE] || s[COL_STRUCT_CODE] || `Bureau ${s.id}`;
        html += `<option value="${s.id}">${name}</option>`;
    });

    selectElement.innerHTML = html;
}

/**
 * Enregistre un nouvel agent dans Grist
 */
async function handleSaveAgent() {
    const btn = document.getElementById('btn-save');
    const data = {
        prenom: document.getElementById('field-prenom').value.trim(),
        nom: document.getElementById('field-nom').value.trim(),
        fct: document.getElementById('field-fct').value.trim(),
        struct: parseInt(document.getElementById('field-struct').value),
        formation: document.getElementById('field-formation').value.trim()
    };

    if (!data.nom || isNaN(data.struct)) {
        alert("⚠️ Le NOM et la STRUCTURE sont obligatoires.");
        return;
    }

    try {
        btn.disabled = true;
        btn.textContent = "Enregistrement...";

        await grist.docApi.applyUserActions([
            ["AddRecord", TABLE_AGENTS, null, {
                [COL_AGENT_PRENOM]: data.prenom,
                [COL_AGENT_NOM]: data.nom,
                [COL_AGENT_FONCTION]: data.fct,
                [COL_AGENT_STRUCT_REF]: data.struct,
                [COL_AGENT_FORMATION]: data.formation
            }]
        ]);

        alert("✅ Agent ajouté avec succès !");
        location.reload();

    } catch (err) {
        console.error("Erreur Grist :", err);
        alert("❌ Erreur : Vérifiez vos droits d'accès (Full Access requis).");
        btn.disabled = false;
        btn.textContent = "Enregistrer";
    }
}

/**
 * Rendu visuel de l'organigramme
 */
function renderOrganigramme() {
    const container = document.getElementById('organigramme-container');
    if (!container) return;
    
    // Nettoyage
    container.innerHTML = "";

    if (window.allAgents.length === 0) {
        container.innerHTML = "<p>Aucun agent trouvé dans la base.</p>";
        return;
    }

    // Ici tu peux insérer ta propre logique de boucle pour créer les cartes d'agents
    // Pour l'exemple, affichons une liste simple
    const list = document.createElement('div');
    list.className = 'fr-grid-row fr-grid-row--gutters';
    
    window.allAgents.forEach(agent => {
        const struct = structureMap.get(agent[COL_AGENT_STRUCT_REF]) || {};
        list.innerHTML += `
            <div class="fr-col-12 fr-col-md-4">
                <div class="fr-card fr-card--sm fr-card--grey">
                    <div class="fr-card__body">
                        <h3 class="fr-card__title">${agent[COL_AGENT_NOM]} ${agent[COL_AGENT_PRENOM]}</h3>
                        <p class="fr-card__desc">${agent[COL_AGENT_FONCTION] || 'Sans fonction'}</p>
                        <p class="fr-card__detail">${struct[COL_STRUCT_LIBELLE] || 'Structure inconnue'}</p>
                    </div>
                </div>
            </div>`;
    });
    
    container.appendChild(list);
}