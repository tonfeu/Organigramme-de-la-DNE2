// ==========================================
// EXPORT PDF LOGIC
// ==========================================

export function initPdfExport(getDataCallback) {
    const btnExport = document.getElementById('btn-export-pdf');
    if (!btnExport) return;

    btnExport.addEventListener('click', () => {
        // État de chargement
        const originalText = btnExport.innerHTML;
        btnExport.innerHTML = '<span class="fr-icon-refresh-line fr-mr-1w" aria-hidden="true"></span>Génération...';
        btnExport.disabled = true;

        const mainContainer = document.querySelector('main');

        // 1. Cloner le conteneur principal
        const mainClone = mainContainer.cloneNode(true);
        mainClone.style.backgroundColor = '#ffffff'; // Fond blanc garanti
        mainClone.style.padding = '20px';

        // Supprimer les éléments interactifs du clone
        const accordionClone = mainClone.querySelector('.fr-accordion');
        const exportRowClone = mainClone.querySelector('.fr-grid-row--right'); // Le bouton PDF
        const dialogsClone = mainClone.querySelectorAll('dialog'); // ATTENTION: Supprimer la modale du cache

        if (accordionClone) accordionClone.remove();
        if (exportRowClone) exportRowClone.remove();
        dialogsClone.forEach(d => d.remove());

        // 2. Désactiver les liens (rendre non-cliquable) et forcer les styles
        const allLinks = mainClone.querySelectorAll('a');
        allLinks.forEach(a => {
            a.removeAttribute('href'); // Plus cliquable
            a.style.textDecoration = 'none';
            a.style.color = 'inherit'; // Hérite de la couleur parente
        });

        // Forcer les styles des tuiles et du header pour le PDF
        const allTiles = mainClone.querySelectorAll('.fr-tile');
        allTiles.forEach(tile => {
            tile.style.backgroundColor = '#ffffff'; // Ou gris très clair
            tile.style.border = '1px solid #dddddd';

            const header = tile.querySelector('.tile-header');
            if (header) {
                header.style.backgroundColor = '#000091'; // Bleu France forcé
                header.style.color = '#ffffff'; // Texte blanc
            }

            const title = tile.querySelector('.fr-tile__title');
            if (title) title.style.color = '#000091';

            const resp = tile.querySelector('.tile-resp-name');
            if (resp) resp.style.color = '#666666';

            // Si c'est le chef (fond bleuté)
            if (tile.classList.contains('tile-chef')) {
                tile.style.backgroundColor = '#e3e3fd';
                tile.style.borderColor = '#000091';
            }
        });

        // 3. Ajouter le titre et la date du jour sur le clone
        const headerDiv = document.createElement('div');
        headerDiv.style.textAlign = 'center';
        headerDiv.style.marginBottom = '3rem';

        const dateStrLocalized = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

        headerDiv.innerHTML = `
            <h1 style="color: #000091; margin-bottom: 0.5rem; font-size: 2rem;">Organigramme du SAAM</h1>
            <p style="color: #666666; font-size: 1.2rem; font-weight: bold; margin: 0;">Mise à jour du ${dateStrLocalized}</p>
        `;
        mainClone.insertBefore(headerDiv, mainClone.firstChild);

        // --- APPLICATION DE RÈGLES CSS SPÉCIFIQUES POUR L'EXPORT PDF ---
        const styleFix = document.createElement('style');
        styleFix.innerHTML = `
            * {
                animation: none !important;
                transition: none !important;
                opacity: 1 !important;
                visibility: visible !important;
            }
            /* Écraser la hauteur fixe de 180px pour le PDF */
            .fr-tile {
                height: auto !important;
                min-height: auto !important;
                padding-bottom: 0px !important;
                margin-bottom: 0.5rem !important;
                background-color: #ffffff !important; /* Fond blanc par défaut pour les tuiles */
                border: 1px solid #dddddd !important;
            }
            /* Réduire le padding interne énorme du DSFR */
            .fr-tile__body {
                padding: 0.5rem !important;
                padding-bottom: 0.25rem !important;
            }
            /* Supprimer le vide inutile poussé par margin-top: auto */
            .tile-resp-container {
                margin-top: 0.25rem !important;
            }
            .fr-tile__title {
                margin-bottom: 0.25rem !important;
                font-size: 0.85rem !important;
                color: #000091 !important; /* Couleur forcée pour le titre */
            }
            .tile-header {
                height: auto !important;
                padding: 0.2rem 0.5rem !important;
                background-color: #000091 !important; /* Bleu France forcé */
                color: #ffffff !important; /* Texte blanc */
            }
            .tile-resp-name {
                color: #666666 !important; /* Couleur forcée pour le nom du responsable */
            }
            /* Si c'est le chef (fond bleuté) */
            .fr-tile.tile-chef {
                background-color: #e3e3fd !important;
                border-color: #000091 !important;
            }
        `;
        mainClone.appendChild(styleFix);

        // --- RÉORGANISATION DE LA GRILLE EN FLEXBOX ---
        // html2canvas gère approximativement le display: grid standard.
        // On réécrit dynamiquement `.main-grid` en colonnes flex, pour assurer
        // une synchronisation parfaite des hauteurs sur chaque ligne.
        const columns = Array.from(mainClone.querySelectorAll('.column-stack'));
        if (columns.length > 0) {
            let maxItems = 0;
            columns.forEach(col => {
                maxItems = Math.max(maxItems, col.querySelectorAll('.fr-tile').length);
            });

            const newGridContainer = document.createElement('div');
            newGridContainer.style.display = 'flex';
            newGridContainer.style.flexDirection = 'column';
            newGridContainer.style.gap = '1rem';
            newGridContainer.style.width = '100%';

            for (let i = 0; i < maxItems; i++) {
                const rowWrapper = document.createElement('div');
                rowWrapper.style.display = 'flex';
                rowWrapper.style.flexDirection = 'row';
                rowWrapper.style.gap = '1.5rem';
                rowWrapper.style.width = '100%';

                columns.forEach(col => {
                    const cell = document.createElement('div');
                    cell.style.flex = '1';
                    cell.style.display = 'flex'; // Important pour que l'enfant s'étire
                    cell.style.flexDirection = 'column';

                    const tiles = Array.from(col.querySelectorAll('.fr-tile'));
                    if (tiles[i]) {
                        const tileClone = tiles[i].cloneNode(true);
                        // On force la tuile à prendre tout l'espace de la div parente
                        tileClone.style.height = '100%';
                        tileClone.style.flex = '1';
                        // On force la compacité
                        tileClone.style.paddingBottom = '0.25rem';
                        tileClone.style.paddingTop = '0.5rem';
                        tileClone.style.marginBottom = '0';
                        cell.appendChild(tileClone);
                    }
                    rowWrapper.appendChild(cell);
                });
                newGridContainer.appendChild(rowWrapper);
            }

            const oldGrid = mainClone.querySelector('.main-grid');
            if (oldGrid) {
                oldGrid.parentNode.replaceChild(newGridContainer, oldGrid);
            }
        }

        // 5. Configuration html2pdf
        const dateFileStr = new Date().toISOString().split('T')[0];
        const opt = {
            margin: 10, // Marges en mm
            filename: `organigramme_saam_${dateFileStr}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 1.5, // Réduire légèrement le scale pour limiter la taille du canvas
                useCORS: true,
                windowWidth: 1400,
                x: 0,
                y: 0
            },
            jsPDF: { unit: 'mm', format: 'a3', orientation: 'landscape' }, // A3 Paysage
            pagebreak: { mode: ['css', 'legacy'] }
        };

        // On lance le worker html2pdf sur l'organigramme principal
        let worker = html2pdf().set(opt).from(mainClone).toPdf();

        // 5. Ajouter la liste de tous les agents sur de nouvelles pages
        const data = typeof getDataCallback === 'function' ? getDataCallback() : null;
        const currentAgents = data && data.agents ? data.agents : [];
        const currentStructures = data && data.structures ? data.structures : [];

        if (currentAgents.length > 0) {

            // Trier les agents par nom
            const sortedAgents = [...currentAgents].sort((a, b) => {
                const nameA = (a.Nom_d_usage_de_l_agent || '').toUpperCase();
                const nameB = (b.Nom_d_usage_de_l_agent || '').toUpperCase();
                return nameA.localeCompare(nameB);
            });

            // html2pdf utilise un jsPDF interne, ce qui casse l'import du plugin jspdf-autotable.
            // On revient sur une génération HTML pure, mais en découpant le tableau intelligemment
            // par paquets de 40 lignes MAXIMUM. Cela évite l'explosion du canvas, et simule
            // parfaitement le comportement d'autotable.

            const tableBody = [];

            sortedAgents.forEach((agent, index) => {
                const nom = agent.Nom_d_usage_de_l_agent || '';
                const prenom = agent.Prenom || '';
                const fonction = agent.Fonction_de_l_agent || '';
                const missions = agent.Missions_du_poste || '';

                let refId = null;
                let rawStruct = '';
                if (agent.Structure_de_l_agent && typeof agent.Structure_de_l_agent === 'object') {
                    refId = agent.Structure_de_l_agent[0];
                    rawStruct = agent.Structure_de_l_agent[1] || '';
                } else if (typeof agent.Structure_de_l_agent === 'number') {
                    refId = agent.Structure_de_l_agent;
                } else {
                    rawStruct = agent.Structure_de_l_agent || '';
                }

                if (currentStructures && currentStructures.length > 0) {
                    let structMatch = null;
                    if (refId) {
                        structMatch = currentStructures.find(s => s.id === refId);
                    }
                    if (!structMatch && rawStruct) {
                        structMatch = currentStructures.find(s =>
                            s.Structure === rawStruct || s.Libelle === rawStruct
                        );
                    }
                    if (structMatch) {
                        rawStruct = structMatch.Structure || structMatch.Libelle || rawStruct;
                    }
                }
                const structure = rawStruct;

                const tel = agent.Tel_ || agent.Fixe || agent.Mobile || '';
                const email = agent.Mail_agent || '';

                tableBody.push([nom, prenom, structure, fonction, missions, tel, email]);
            });

            // On utilise AutoTable pour gérer la grande liste de manière vectorielle.
            // Puisque html2pdf embarque un jsPDF "caché", on doit copier la fonction depuis le CDN global.
            worker = worker.get('pdf').then(pdf => {
                // Injection manuelle de la méthode
                if (typeof pdf.autoTable !== 'function' && window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) {
                    pdf.autoTable = window.jspdf.jsPDF.API.autoTable;
                }

                if (typeof pdf.autoTable === 'function') {
                    pdf.addPage();

                    pdf.setFontSize(18);
                    pdf.setTextColor(0, 0, 145); // Bleu France (#000091)
                    pdf.text("Annuaire complet des agents", 14, 20);

                    pdf.autoTable({
                        startY: 30,
                        head: [['Nom', 'Prénom', 'Structure', 'Fonction', 'Missions du poste', 'Téléphone', 'Email']],
                        body: tableBody,
                        theme: 'striped',
                        headStyles: {
                            fillColor: [246, 246, 246], // #f6f6f6
                            textColor: [0, 0, 145],
                            lineColor: [221, 221, 221],
                            lineWidth: 0.1,
                            fontStyle: 'bold'
                        },
                        styles: {
                            font: 'helvetica',
                            fontSize: 9,
                            textColor: [58, 58, 58],
                            cellPadding: 3,
                            valign: 'middle'
                        },
                        alternateRowStyles: {
                            fillColor: [249, 248, 246] // #f9f8f6
                        },
                        columnStyles: {
                            0: { fontStyle: 'bold' },
                            3: { cellWidth: 35 }, // Réduire la taille des fonctions
                            4: { cellWidth: 85 }, // Augmenter considérablement l'espace des missions
                            6: { textColor: [0, 0, 145] }
                        },
                        margin: { left: 14, right: 14, top: 20, bottom: 20 },
                        rowPageBreak: 'avoid',
                        pageBreak: 'auto'
                    });
                } else {
                    console.error("autoTable n'a pas pu être injecté depuis window.jspdf");
                }
            });
        }

        // Lancement de la sauvegarde finale
        worker.save().then(() => {
            if (document.body.contains(mainClone)) document.body.removeChild(mainClone);
            btnExport.innerHTML = originalText;
            btnExport.disabled = false;
        }).catch(err => {
            if (document.body.contains(mainClone)) document.body.removeChild(mainClone);
            // Log détaillé pour le debug (ex: erreur de canvas lié à une image externe bloquée par CORS)
            console.error("Erreur génération PDF :", err);
            if (err && err.stack) console.error(err.stack);

            btnExport.innerHTML = originalText;
            btnExport.disabled = false;
            alert("Une erreur est survenue lors de la génération du PDF. Consultez la console (F12) pour plus de détails.");
        });
    });
}
