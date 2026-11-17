# Impaginatore OE — versione di prova (senza server)

Strumento di OpenEconomics per impaginare documenti con il design system OE partendo dal Word.
Questa è la **versione di prova**: gira tutta nel browser, senza accesso e senza server, pubblicata su
GitHub Pages. La versione completa, con server, è in un repository privato (`impaginatore-oe`) e andrà
sui server di OpenEconomics.

**Apri:** https://alessiogranella.github.io/impaginatore-oe-prova/ (meglio con Chrome o Edge)

## Come si usa

1. Al primo accesso scrivi il tuo nome: firma le versioni e i commenti.
2. **Nuovo documento da Word** → carichi il .docx e scegli A4 verticale o orizzontale. L'impaginazione arriva in pochi secondi.
3. Clicchi un testo, una foto o un box nell'anteprima e lo modifichi nel pannello a destra. L'anteprima si aggiorna da sola.
4. **Salva versione** crea una versione (si possono guardare e ripristinare nella scheda Versioni).
5. **PDF** → si apre la stampa del browser: scegli «Salva come PDF» e lascia attiva «Grafica di sfondo».

### Lavorare in più persone

I documenti restano **nel browser di chi li crea**. Per passarli ai colleghi si usa il file `.oe`
(menu **File** dentro il documento), che contiene versioni, commenti e immagini:

- **Scarica il file .oe** e mettilo nella cartella condivisa del team (Drive, OneDrive, SharePoint);
- su Chrome/Edge puoi anche **collegare il documento a un file** della cartella condivisa: ogni «Salva versione» lo aggiorna da solo;
- chi riceve il file lo apre con **Apri un file .oe**. Se il file ha versioni nuove il documento si aggiorna; se avete salvato entrambi, il file si apre come documento a parte, così nessuno perde lavoro. I commenti si uniscono sempre.

## Differenze rispetto alla versione con server

| | Versione di prova | Versione con server |
|---|---|---|
| Accesso | solo il nome | email e password (poi login aziendale) |
| Documenti | nel browser + file .oe condiviso | archivio comune |
| @menzioni | evidenziate, senza notifica | notifica nell'app e via email |
| PDF | stampa del browser (RGB, anche con abbondanze 3 mm) | un clic, anche CMYK FOGRA39 |
| Foto | caricate dal computer | anche archivio foto OE e generazione AI |
| Icone del DS | sì | sì |
| Illustrazioni pixel OE | no (archivio non pubblico) | sì |

## Sviluppo

```bash
npm install
npm run dev      # http://localhost:5181 — usa il design system in ../../design-system
npm run build    # cartella dist/
```

- Il codice dell'interfaccia è lo stesso della versione con server; cambia solo lo strato dei dati
  (`src/local/`): archivio nel browser (IndexedDB), import del Word (`docx.ts`), motore di
  impaginazione (`engine.ts`, stesso `report.css` del server) e file `.oe` (`file.ts`).
- L'impaginazione in pagine la fa [Vivliostyle](https://vivliostyle.org) dentro un iframe (`viewer.html`, `src/viewer/`).
- Ogni push su `main` pubblica il sito con GitHub Actions; il workflow scarica il design system dal suo
  repository pubblico.
- Pagina esclusa dai motori di ricerca (`noindex` + `robots.txt`).

Licenza AGPL-3.0, la stessa di Vivliostyle che il tool incorpora. Logo, font e icone sono del design system OpenEconomics.
