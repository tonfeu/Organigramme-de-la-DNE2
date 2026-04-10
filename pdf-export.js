/**
 * ==========================================
 * EXPORT PDF - PDF-EXPORT.JS
 * ==========================================
 */

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('btn-export-pdf');
    if (btn) {
        btn.onclick = exportToPdf;
    }
});

async function exportToPdf() {
    const element = document.getElementById('organigramme-container');
    const btn = document.getElementById('btn-export-pdf');

    if (!element) return;

    const opt = {
        margin:       [10, 10, 10, 10],
        filename:     'Organigramme_DNE.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };

    try {
        btn.disabled = true;
        btn.textContent = "Génération...";
        
        // Utilisation de la librairie html2pdf chargée dans index.html
        await html2pdf().set(opt).from(element).save();
        
    } catch (err) {
        console.error("Erreur PDF:", err);
        alert("Une erreur est survenue lors de l'export.");
    } finally {
        btn.disabled = false;
        btn.textContent = "Export PDF";
    }
}