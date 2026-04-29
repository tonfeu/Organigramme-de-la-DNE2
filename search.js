// ==========================================
// PARAMÈTRES
// ==========================================
// Note: La configuration experte Grist (Noms des colonnes) a été centralisée dans "map.js"

// Récupération des paramètres URL (Filtre structure ou recherche texte)
const urlParams = new URLSearchParams(window.location.search);
const structFilterId = urlParams.get('structure'); // ID numérique de la structure
const textFilterQuery = urlParams.get('q'); // Requête texte libre

// Données globales
let allAgents = [];
let allStructures = [];
let structureMap = new Map(); // pour les perfs de recherche
let agentsHierarchyMap = new Map(); //  pour la hiéarchie

// ==========================================
// INITIALISATION
// ==========================================
grist.ready({ 
  requiredAccess: 'full',
  onRecords: function(records) {
    // Cette fonction optionnelle peut aider à stabiliser la connexion
  }
});
document.addEventListener('DOMContentLoaded', init);

async function init() {
    try {
        console.log("Initialisation page recherche (Interne Grist)...");
        document.getElementById('loadingMessage').style.display = 'block';

        // 2. Récupération directe via Grist Plugin API
        const tables = [TABLE_AGENTS, TABLE_STRUCTURES];
        const data = {};

        await Promise.all(tables.map(async (name) => {
            const result = await grist.docApi.fetchTable(name);
            data[name] = window.transformColsToRows(result);
        }));

        allAgents = window.enrichAgentsData(data[TABLE_AGENTS]); // Noms pré-calculés
        agentsHierarchyMap = window.createAgentsHierarchyMap(allAgents);
        allStructures = data[TABLE_STRUCTURES];
        structureMap = window.createStructureMap(allStructures);

        console.log(`Données chargées : ${allAgents.length} agents, ${allStructures.length} structures.`);

        // 3. Configuration de l'interface
        setupUI();
        populateStructureSelect();

        // 4. Application des filtres initiaux (si présents dans l'URL)
        if (structFilterId) {
            const select = document.getElementById('select-structure');
            if (select) select.value = structFilterId;
        }

        if (textFilterQuery) {
            document.getElementById('searchInput').value = textFilterQuery;
        }

        // Lancement de la recherche si un filtre est actif
        if (structFilterId || textFilterQuery) {
            performSearch();
        } else {
            // Affichage initial vide (ou message d'accueil)
            document.getElementById('loadingMessage').style.display = 'none';
        }

    } catch (e) {
        console.error("ERREUR :", e);
        document.getElementById('resultArea').innerHTML = `<div class="fr-alert fr-alert--error">${e.message}</div>`;
    }

    function prepareAddForm() {
    const select = document.getElementById('new-agent-struct');
    if (!select) return;
    
    // On réutilise allStructures pour remplir le select du formulaire
    select.innerHTML = '<option value="" disabled selected>Choisir une structure...</option>' + 
        allStructures.map(s => `<option value="${s.id}">${safeStr(s[COL_STRUCT_LIBELLE])}</option>`).join('');

    // Si on est admin, on affiche le bouton "Ajouter"
    if (grist.getAccessLevel() === 'full') {
        document.getElementById('admin-add-section').style.display = 'block';
    }
}
}

// ==========================================
// LOGIQUE UI (Evénements)
// ==========================================

// Bascule l'ouverture/fermeture des détails d'un agent
window.toggleAgent = function (id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('open');
};

function setupUI() {
    // Bouton de recherche manuel
    document.getElementById('searchBtn').addEventListener('click', performSearch);

    // Recherche en direct pendant la frappe (Debouncée pour éviter les lags)
    const debouncedSearch = window.debounce(performSearch, 300);
    document.getElementById('searchInput').addEventListener('input', debouncedSearch);

    // Changement dans le select (lance la recherche directement)
    const select = document.getElementById('select-structure');
    if (select) {
        select.addEventListener('change', performSearch);
    }

    // Masquage de l'ancienne bannière de filtre (obsolète)
    const filterBanner = document.getElementById('filter-banner');
    if (filterBanner) filterBanner.style.display = 'none';
}

// Remplit le menu déroulant des structures
function populateStructureSelect() {
    const select = document.getElementById('select-structure');
    if (!select) return;

    // Création des options : "Code - Libellé" si le code existe, sinon juste "Libellé"
    const options = allStructures.map(struct => {
        const code = safeStr(struct['Structure']).trim();
        const libelle = safeStr(struct['Libelle']).trim();
        let label = libelle;

        // Evite la répétition si Code == Libellé (ex: "SAAM" - "SAAM")
        if (code && code.toLowerCase() !== libelle.toLowerCase()) {
            label = `${code} - ${libelle}`;
        }
        return { id: struct.id, label: label };
    });

    // Tri alphabétique sur le label affiché
    options.sort((a, b) => a.label.localeCompare(b.label, 'fr', { sensitivity: 'base' }));

    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.id;
        option.textContent = opt.label;
        select.appendChild(option);
    });
}

// ==========================================
// MOTEUR DE RECHERCHE
// ==========================================

function performSearch() {
    const textQuery = document.getElementById('searchInput').value.trim().toLowerCase();
    const select = document.getElementById('select-structure');
    const structIdVal = select ? select.value : null;
    const structId = structIdVal ? parseInt(structIdVal, 10) : null;Z

    // Si aucun critère, on nettoie l'affichage et l'URL
    if (!textQuery && !structId) {
        document.getElementById('resultArea').innerHTML = '';
        document.getElementById('page-title').innerText = 'Moteur de recherche';

        const qs = new URLSearchParams(window.location.search);
        qs.delete('structure');
        qs.delete('q');
        const queryString = qs.toString();
        const newUrl = queryString ? `?${queryString}` : window.location.pathname;
        window.history.replaceState({}, '', newUrl);
        return;
    }

    document.getElementById('loadingMessage').style.display = 'block';

    // Mise à jour de l'URL sans rechargement
    const qs = new URLSearchParams(window.location.search);
    if (structId) qs.set('structure', structId);
    else qs.delete('structure');

    if (textQuery) qs.set('q', textQuery);
    else qs.delete('q');

    const queryString = qs.toString();
    const newUrl = queryString ? `?${queryString}` : window.location.pathname;
    window.history.replaceState({}, '', newUrl);

    // FILTRAGE DES AGENTS
    const results = allAgents.filter(a => {
        // 1. Filtre par Structure (si sélectionné)
        if (structId !== null && a['Structure_de_l_agent'] !== structId) {
            return false;
        }

        // 2. Filtre par Texte (si saisi)
        // Recherche sur Nom, Prénom et Fonction
        if (textQuery) {
            const nom = safeStr(a['Nom_d_usage_de_l_agent']).toLowerCase();
            const prenom = safeStr(a['Prenom']).toLowerCase();
            const fct = safeStr(a['Fonction_de_l_agent']).toLowerCase();
            const missions = safeStr(a['Missions_du_poste'] || a['missions_du_poste']).toLowerCase();
            const projet = safeStr(a['nom_du_projet'] || a['Nom_du_projet']).toLowerCase();

            // Recherche aussi sur le libellé et code de la structure via la Map O(1)
            let structLibelle = '';
            let structCode = '';
            const sId = a['Structure_de_l_agent'];
            if (sId) {
                const s = structureMap.get(sId);
                if (s) {
                    structLibelle = safeStr(s['Libelle']).toLowerCase();
                    structCode = safeStr(s['Structure']).toLowerCase();
                }
            }

            return nom.includes(textQuery) ||
                prenom.includes(textQuery) ||
                fct.includes(textQuery) ||
                missions.includes(textQuery) ||
                projet.includes(textQuery) ||
                structLibelle.includes(textQuery) ||
                structCode.includes(textQuery);
        }

        return true;
    });

    // Construction du titre de la page (Feedback utilisateur)
    let title = `${results.length} résultat(s)`;
    let description = 'Recherchez un agent ou un bureau.';

    if (structId) {
        const s = allStructures.find(st => st.id === structId);
        if (s) {
            const code = safeStr(s['Structure']).trim();
            const libelle = safeStr(s['Libelle']).trim();
            let label = (code && code.toLowerCase() !== libelle.toLowerCase()) ? `${code} - ${libelle}` : libelle;
            title = `Structure : ${label}`;

            // Récupération de la description de la structure
            const descStruct = safeHtml(s['Description_Structure'] || s['description_structure']);
            if (descStruct) {
                description = descStruct;
            }

            if (textQuery) title += ` (recherche "${textQuery}")`;
        }
    } else if (textQuery) {
        title += ` pour "${textQuery}"`;
    }

    // ==========================================
    // TRI DES RÉSULTATS (Hiérarchique + Pôle)
    // ==========================================

    // Fonction utilitaire pour normaliser
    const norm = str => safeStr(str).toLowerCase().trim();

    // Récupération du nom du chef de la structure filtrée (si filtre actif)
    let chefNameNormalized = "";
    if (structId) {
        const s = structureMap.get(structId); // Optim O(1)
        if (s) {
            const chefName = window.findResponsableName(s, agentsHierarchyMap);
            if (chefName) chefNameNormalized = norm(chefName);
        }
    }

    // CAS SPÉCIAL : Affichage par Structure (sans recherche texte) -> REGROUPEMENT PAR PÔLE
    if (structId && !textQuery) {
        // 1. Regroupement
        const groups = {};
        results.forEach(a => {
            const pole = safeStr(a['Pole_ou_section_'] || a['pole_ou_section_']).trim();
            if (!groups[pole]) groups[pole] = [];
            groups[pole].push(a);
        });

        // 2. Tri des clés de groupe (Vide en premier, puis alphabétique)
        const sortedKeys = Object.keys(groups).sort((k1, k2) => {
            if (!k1) return -1; // Vide en premier
            if (!k2) return 1;
            return k1.localeCompare(k2);
        });

        // 3. Tri interne à chaque groupe et construction de l'objet final
        const sortedGroups = [];
        sortedKeys.forEach(key => {
            const groupAgents = groups[key];
            groupAgents.sort((a, b) => {
                // Utilisation du score "Pôle" si on est dans un pôle nommé, sinon score "Structure"
                const scoreA = key ? getPoleScore(a) : getRoleScore(a, chefNameNormalized);
                const scoreB = key ? getPoleScore(b) : getRoleScore(b, chefNameNormalized);

                if (scoreA !== scoreB) return scoreB - scoreA;
                return norm(a['Nom_d_usage_de_l_agent']).localeCompare(norm(b['Nom_d_usage_de_l_agent']));
            });
            sortedGroups.push({ name: key, agents: groupAgents });
        });

        // 4. Rendu Groupé
        renderGroupedResults(sortedGroups, title, description);

    } else {
        // CAS STANDARD : Recherche texte OU Vue globale -> Liste plate triée
        results.sort((a, b) => {
            const scoreA = getRoleScore(a, chefNameNormalized);
            const scoreB = getRoleScore(b, chefNameNormalized);

            if (scoreA !== scoreB) return scoreB - scoreA;
            return norm(a['Nom_d_usage_de_l_agent']).localeCompare(norm(b['Nom_d_usage_de_l_agent']));
        });

        document.getElementById('page-title').innerText = title;
        document.getElementById('page-desc').innerHTML = description;
        renderResults(results, title);
    }

    document.getElementById('loadingMessage').style.display = 'none';
}

// Score pour le tri hierarchique global (Chef de Structure vs autres)
function getRoleScore(agent, chefNameNormalized) {
    const nom = safeStr(agent['Nom_d_usage_de_l_agent']);
    const prenom = safeStr(agent['Prenom']);
    const fullname = safeStr(prenom + " " + nom).toLowerCase().trim();
    const fullnameRev = safeStr(nom + " " + prenom).toLowerCase().trim();
    const fct = safeStr(agent['Fonction_de_l_agent']).toLowerCase();

    // 1. Est-ce le CHEF (Défini dans Structures) ?
    if (chefNameNormalized && (fullname.includes(chefNameNormalized) || fullnameRev.includes(chefNameNormalized))) {
        return 4;
    }

    // 2. Est-ce un ADJOINT ?
    if (fct.includes('adj') || fct.includes('second')) {
        return 3;
    }

    // 3. Est-ce un SECRÉTAIRE / ASSISTANT ?
    if (fct.includes('secre') || fct.includes('assist')) {
        return 2;
    }

    return 1;
}

// Score pour le tri interne aux Pôles/Sections (Détection mots-clés)
function getPoleScore(agent) {
    const fct = safeStr(agent['Fonction_de_l_agent']).toLowerCase();

    // CAS DU CHEF : Contient "chef" MAIS PAS "adjoint"
    const isChefKeyword = fct.includes('chef') || fct.includes('responsable') || fct.includes('dirigeant') || fct.includes('tête');
    const isAdjointKeyword = fct.includes('adj') || fct.includes('second');

    if (isChefKeyword && !isAdjointKeyword) {
        return 4;
    }

    // 2. Est-ce un ADJOINT ?
    if (isAdjointKeyword) {
        return 3;
    }

    // 3. Est-ce un SECRÉTAIRE / ASSISTANT ?
    if (fct.includes('secré') || fct.includes('assist') || fct.includes('secretaire')) {
        return 2;
    }

    return 1;
}

// ==========================================
// RENDU DES RÉSULTATS
// ==========================================

function renderGroupedResults(groups, title, description) {
    const container = document.getElementById('resultArea');
    document.getElementById('page-title').innerText = title;
    document.getElementById('page-desc').innerHTML = description;

    if (groups.length === 0 || groups.every(g => g.agents.length === 0)) {
        container.innerHTML = `<div class="fr-alert fr-alert--warning fr-mt-2w"><p>Aucun agent trouvé.</p></div>`;
        return;
    }

    let html = '';

    groups.forEach(group => {
        // En-tête de groupe (Sauf pour le groupe vide "Direction/Transverse")
        if (group.name) {
            html += `
             <div class="fr-col-12 fr-mt-4w fr-mb-2w">
                <h3 class="fr-h5" style="border-bottom: 2px solid var(--background-action-high-blue-france); padding-bottom: 0.5rem;">
                    ${safeHtml(group.name)}
                </h3>
             </div>`;
        }

        html += `<div class="fr-grid-row fr-grid-row--gutters">`;

        // Utilisation de la logique de rendu par carte existante
        group.agents.forEach(agent => {
            html += generateAgentCardHtml(agent);
        });

        html += `</div>`;
    });

    container.innerHTML = html;
}

// Génère le HTML d'une carte agent (Factorisé)
function generateAgentCardHtml(agent) {
    // 1. Préparation des données de l'agent
    const nom = `${safeHtml(agent[COL_AGENT_PRENOM] || '')} ${safeHtml(agent[COL_AGENT_NOM] || '')}`;
    const fct = safeHtml(agent[COL_AGENT_FONCTION] || 'Non renseignée');
    const mailAgent = safeHtml(agent[COL_AGENT_MAIL] || '');
    
    // Récupération du code de la structure actuelle
    const structId = agent[COL_AGENT_STRUCT_REF];
    const struct = structureMap.get(structId); 
    const structCode = struct ? safeHtml(struct[COL_STRUCT_CODE]) : '';

    // Génération d'un ID unique pour isoler les éléments de cette carte
    const uniqueId = `agent-${Math.floor(Math.random() * 1000000)}`;

    // 2. Préparation de la liste des structures pour le transfert (triée par nom)
    const optionsStructures = allStructures
        .slice() // Copie pour ne pas modifier l'original
        .sort((a, b) => (a[COL_STRUCT_LIBELLE] || "").localeCompare(b[COL_STRUCT_LIBELLE] || ""))
        .map(s => `<option value="${s.id}">${safeHtml(s[COL_STRUCT_LIBELLE] || s[COL_STRUCT_CODE])}</option>`)
        .join('');

    // 3. Retour du template HTML
    return `
    <div class="fr-col-12 fr-col-md-6">
        <div class="agent-accordion" id="${uniqueId}">
            <div class="agent-header" onclick="window.toggleAgent('${uniqueId}')">
                <div class="agent-info">
                    <div style="font-weight:700; font-size:0.95rem; margin-bottom:0.1rem; color: var(--text-default-grey);">
                        ${nom}
                        <button class="fr-btn fr-btn--tertiary-no-outline fr-icon-edit-line" 
                                onclick="event.stopPropagation(); window.toggleMgmt('${uniqueId}-admin')" 
                                style="margin-left: 8px; padding: 0.2rem; height: 1.5rem; min-height: 1.5rem;" 
                                title="Modifier ou Transférer"></button>
                    </div>
                    <div style="font-size:0.8rem; color: var(--text-mention-grey);">${fct}</div>
                    ${structCode ? `<div class="fr-badge fr-badge--sm fr-badge--info fr-mb-1v fr-mt-1w">${structCode}</div>` : ''}
                </div>
                <span class="fr-icon-arrow-down-s-line agent-arrow"></span>
            </div>

            <div id="${uniqueId}-admin" style="display:none; background: #f0f0f0; padding: 1rem; border-bottom: 1px solid #ddd; border-top: 1px solid #ddd;">
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    
                    <div style="display: flex; gap: 0.5rem; align-items: flex-end;">
                        <div class="fr-select-group" style="margin-bottom: 0; flex-grow: 1;">
                            <label class="fr-label" style="font-size: 0.75rem; font-weight: bold;">TRANSFÉRER VERS :</label>
                            <select class="fr-select fr-select--sm" id="select-transfer-${uniqueId}" onclick="event.stopPropagation()">
                                <option value="" selected disabled>Choisir un bureau...</option>
                                ${optionsStructures}
                            </select>
                        </div>
                        <button class="fr-btn fr-btn--sm fr-icon-checkbox-circle-line" 
                                style="background-color: var(--background-action-high-blue-france);"
                                onclick="event.stopPropagation(); window.executeTransfer(${agent.id}, '${uniqueId}', '${nom.replace(/'/g, "\\'")}')"
                                title="Valider le transfert"></button>
                    </div>

                    <div style="text-align: right; border-top: 1px path solid #e5e5e5; pt-1w;">
                        <button class="fr-btn fr-btn--sm fr-btn--secondary fr-icon-delete-line fr-btn--icon-left" 
                                style="color: var(--text-default-error); box-shadow: inset 0 0 0 1px var(--text-default-error);"
                                onclick="event.stopPropagation(); window.deleteAgent(${agent.id}, '${nom.replace(/'/g, "\\'")}')">
                            Supprimer l'agent
                        </button>
                    </div>
                </div>
            </div>

            <div class="agent-details">
                <div class="details-grid" style="padding: 1rem;">
                    <div class="detail-item">
                        <span class="detail-label" style="font-size: 0.7rem; text-transform: uppercase; color: #666;">Fonction</span>
                        <div class="detail-value" style="font-weight: 500;">${fct}</div>
                    </div>
                    <div class="detail-item" style="grid-column: span 2; margin-top: 0.5rem;">
                        <span class="detail-label" style="font-size: 0.7rem; text-transform: uppercase; color: #666;">Email</span>
                        <div class="detail-value">
                             ${mailAgent ? `
                                <button onclick="event.stopPropagation(); copyToClipboard('${mailAgent.toLowerCase()}', this)" 
                                        style="background:none; border:none; padding:0; color:var(--text-action-high-blue-france); cursor:pointer; text-decoration:underline; font-size: 0.9rem;">
                                    ${mailAgent.toLowerCase()}
                                </button>` : '-'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

function renderResults(agents, title) {
    const container = document.getElementById('resultArea');

    if (agents.length === 0) {
        container.innerHTML = `
            <div class="fr-alert fr-alert--warning fr-mt-2w">
                <p>Aucun agent trouvé correspondant à vos critères.</p>
            </div>`;
        return;
    }

    let html = `<h2 class="fr-h6 fr-mb-2w fr-mt-2w">${safeHtml(title)}</h2>`;
    html += `<div class="fr-grid-row fr-grid-row--gutters">`;

    agents.forEach(agent => {
        // Appelle la fonction de génération de carte qui contient maintenant le bouton
        html += generateAgentCardHtml(agent);
    });

    html += `</div>`;
    container.innerHTML = html;
}

// Fonction pour afficher/cacher le panneau de gestion
window.toggleMgmt = function(adminId) {
    const panel = document.getElementById(adminId);
    if (panel) {
        // Alterne entre 'none' et 'flex'
        const isHidden = (panel.style.display === 'none' || panel.style.display === '');
        panel.style.display = isHidden ? 'flex' : 'none';
        console.log("Bascule du panneau :", adminId, isHidden ? "Affiché" : "Caché");
    }
};

async function deleteAgent(agentId, agentName) {
    if (!agentId) {
        console.error("ID de l'agent manquant");
        return;
    }

    const confirmation = confirm(`Confirmer la suppression définitive de : ${agentName} ?`);
    if (!confirmation) return;

    try {
        console.log(`Tentative de suppression de l'ID: ${agentId} sur la table: ${TABLE_AGENTS}`);
        
        // Nouvelle méthode : Envoi d'une action brute à Grist
        await grist.docApi.applyUserActions([
            ["RemoveRecord", TABLE_AGENTS, agentId]
        ]);

        console.log("Suppression réussie côté Grist");

        // Mise à jour de l'affichage local
        allAgents = allAgents.filter(a => a.id !== agentId);
        
        // On force le rendu pour faire disparaître la carte
        if (typeof performSearch === 'function') {
            performSearch();
        } else {
            // Si performSearch n'est pas accessible, on vide juste la zone et on recharge
            document.getElementById('resultArea').innerHTML = "";
            location.reload(); 
        }

        alert("Agent supprimé.");
    } catch (error) {
        console.error("Détails de l'erreur Grist:", error);
        alert(`Erreur : ${error.message}\n\nAssurez-vous que le widget est bien en 'Access Level: Full' dans les paramètres Grist.`);
    }
}
// Fonction pour transférer un agent
window.executeTransfer = async function(agentId, uniqueId, agentName) {
    const selectEl = document.getElementById(`select-transfer-${uniqueId}`);
    const newStructureId = parseInt(selectEl.value);

    if (!newStructureId) {
        alert("Veuillez sélectionner un bureau de destination.");
        return;
    }

    if (!confirm(`Confirmer le transfert de ${agentName} ?`)) return;

    try {
        await grist.docApi.applyUserActions([
            ["UpdateRecord", TABLE_AGENTS, agentId, {
                [COL_AGENT_STRUCT_REF]: newStructureId 
            }]
        ]);

        alert("Transfert réussi.");
        
        // Mise à jour locale pour éviter de tout recharger
        const agent = allAgents.find(a => a.id === agentId);
        if (agent) agent[COL_AGENT_STRUCT_REF] = newStructureId;
        
        performSearch(); // Rafraîchit l'affichage
    } catch (error) {
        console.error("Erreur transfert:", error);
        alert("Erreur lors du transfert. Vérifiez vos droits d'accès.");
    }
};
// ==========================================
// GESTION DE L'INTERFACE (UI) & ACTIONS
// ==========================================

// Affiche/Masque le formulaire d'ajout (utilisé par le bouton "Nouvel Agent")
window.toggleForm = function() {
    const form = document.getElementById('form-creation-agent');
    if (form) {
        const isHidden = (form.style.display === 'none' || form.style.display === '');
        form.style.display = isHidden ? 'block' : 'none';
    }
};

// Gère l'ouverture des accordéons d'agents
window.toggleAgent = function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('open');
};

// Action : Transférer un agent
window.executeTransfer = async function(agentId, uniqueId, agentName) {
    const selectEl = document.getElementById(`select-transfer-${uniqueId}`);
    const newStructureId = selectEl ? parseInt(selectEl.value) : null;

    if (!newStructureId) {
        alert("Veuillez sélectionner un bureau dans la liste.");
        return;
    }

    if (!confirm(`Transférer ${agentName} ?`)) return;

    try {
        await grist.docApi.applyUserActions([
            ["UpdateRecord", TABLE_AGENTS, agentId, {
                [COL_AGENT_STRUCT_REF]: newStructureId 
            }]
        ]);
        alert("Transfert réussi !");
        location.reload(); 
    } catch (error) {
        console.error("Erreur transfert:", error);
        alert("Erreur : Vérifiez vos droits d'accès.");
    }
};

// ==========================================
// LOGIQUE ADMINISTRATION (AJOUT AGENT)
// ==========================================

// Branchement des boutons du panneau d'admin
function setupAdminEvents() {
    const btnShow = document.getElementById('btn-show-form');
    const btnCancel = document.getElementById('btn-cancel');
    const btnSave = document.getElementById('btn-save');

    if (btnShow) btnShow.onclick = window.toggleForm;
    
    if (btnCancel) {
        btnCancel.onclick = () => {
            document.getElementById('form-creation-agent').style.display = 'none';
        };
    }

    if (btnSave) btnSave.onclick = handleSaveAgent;
}

// Remplit le menu déroulant des structures
const populateAdminSelect = () => {
    const select = document.getElementById('field-struct');
    if (!select || !window.allStructures || allStructures.length === 0) return;

    let html = '<option value="" disabled selected>Choisir une structure...</option>';
    allStructures.forEach(s => {
        const label = s[COL_STRUCT_LIBELLE] || s[COL_STRUCT_CODE] || "Bureau";
        html += `<option value="${s.id}">${label}</option>`;
    });
    select.innerHTML = html;
};

// Sauvegarde effective dans Grist
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
        alert("❌ Erreur : vérifiez les noms de colonnes Grist (ex: 'Formations').");
    }
}

// Initialisation automatique
const adminInitInterval = setInterval(() => {
    if (document.getElementById('btn-show-form') && window.allStructures) {
        setupAdminEvents();
        populateAdminSelect();
        clearInterval(adminInitInterval);
    }
}, 500);