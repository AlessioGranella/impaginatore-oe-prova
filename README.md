# OpenEconomics Layout Designer — versione di prova (senza server)

Strumento di OpenEconomics per impaginare bilanci di sostenibilità e brochure con il design system OE, partendo dal Word.
Brand disponibili: OpenEconomics, Civiqa, T33 (cambiano logo e colori; regole e caratteri restano quelli del DS).
Questa è la **versione di prova**: gira tutta nel browser, senza accesso e senza server, pubblicata su
GitHub Pages. La versione completa, con server, è in un repository privato (`impaginatore-oe`) e andrà
sui server di OpenEconomics.

**Apri:** https://alessiogranella.github.io/impaginatore-oe-prova/ (meglio con Chrome o Edge)

## Come si usa

1. Al primo accesso scrivi il tuo nome: firma le versioni e i commenti.
2. **Nuovo documento** apre un wizard in tre passi:
   1. **tipo**: bilancio di sostenibilità (A4 verticale o orizzontale) o brochure (orizzontale 303 × 177 mm);
   2. **brand**: OpenEconomics, Civiqa o T33;
   3. **Word e foto**: il .docx del testo e, se ci sono, le foto. L'impaginazione arriva in pochi secondi.
3. Clicchi un testo, una foto o un box nell'anteprima e lo modifichi nel pannello a destra. Il testo cambia subito nella pagina; la
   reimpaginazione avviene dietro (due anteprime che si scambiano), quindi la pagina non si ricarica e resti nel punto in cui scrivi.
4. **Salva versione** crea una versione (si possono guardare e ripristinare nella scheda Versioni).
5. **PDF** → si apre la stampa del browser: scegli «Salva come PDF» e lascia attiva «Grafica di sfondo».

### Brochure

Modello ricalcato sulle brochure OE in `OpenEconomics/Contesto/` (OpenEconomics, Externalytics, Sonar): copertina con foto, indice,
pagine di apertura con foto, una pagina per ogni sezione, chiusura con sedi e contatti. Ogni sezione ha un **tipo di pagina**:
testo (voci in griglia), card, colore (foto al vivo e testo bianco), prodotto (cerchio a destra con foto o mockup), numeri,
griglia (progetti), citazione. Il tool lo sceglie in base al contenuto del Word; si cambia dal pannello della pagina.

Come leggere il Word: «Titolo» = copertina; Titolo 1 = apertura; Titolo 2 = pagina; un Titolo 3 subito sotto il Titolo 2 diventa il
titolo grande (il Titolo 2 va nella chip). Titoli 3 seguiti da testo = voci, card o griglia; tabelle titolo · testo = card o griglia;
tabelle con una colonna di numeri = pagina dei numeri; «Citazione in evidenza:» = citazione.

Se il contenuto non entra nella pagina l'anteprima lo segnala (bordo tratteggiato e avviso «pagina troppo piena»).

### Commenti su una frase

Selezioni una frase nella pagina → **Commenta** (come in Acrobat): il commento resta legato a quella frase, che appare evidenziata.
Con @ si cita un collega. Dalla stessa barra, **Chiedi una modifica** apre l'AI su quella frase.

### Chiedi all'AI

Scheda «Chiedi all'AI»: scrivi cosa cambiare («accorcia questa sezione», «fai diventare questa pagina a card») e Claude
(`claude-opus-5-5`) modifica il documento. Il bersaglio è il punto selezionato (o il documento intero). Il risultato va nella
bozza: si annulla con ⌘Z, diventa versione solo con «Salva versione». Le modifiche vengono controllate prima di applicarle
(`src/local/ai.ts`: tipi, id, solo grassetto e a capo, solo immagini già presenti).
Serve una chiave API di Anthropic, inserita da ciascuno nel proprio browser (resta in localStorage, va solo ad api.anthropic.com).
Nella versione con server la chiave starà sul server.

### Foto

Insieme al Word puoi caricare le foto (anche tutte insieme), oppure aggiungerle dopo con **Aggiungi foto**.
Il tool le sistema da solo e alla fine mostra dove ha messo ogni foto e perché:

1. una riga nel Word come `[Foto: nome-file.jpg]` mette quella foto esattamente lì;
2. un nome di file che richiama un titolo («copertina.jpg», «ambiente.jpg») porta la foto in copertina o in quel capitolo/sezione;
3. altrimenti il tool guarda la foto: quelle **con un soggetto** (es. un animale su fondo sfocato) vanno in copertina e nelle aperture dei capitoli, quelle **d'ambiente** (paesaggi, texture) in fondo alle sezioni, distribuite lungo il documento. È la regola fotografica del Report OE.

Il ritaglio si centra sul soggetto trovato. L'analisi avviene nel browser (le foto non vanno da nessuna parte);
sull'archivio OE riconosce correttamente 30 foto su 34. Le foto troppo piccole per la stampa vengono segnalate.

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

## Il regista: impaginazione delle pagine interne

Il tool non chiede più un Word simile al modello. Pochi punti fissi danno la riconoscibilità:
copertina e aperture con foto, sommario/indice, tipografia, colori e marchio del brand, numeri di pagina.
Il resto lo decide `src/local/regista.ts` in base al contenuto, seguendo regole di ritmo:

- **Bilancio**: ogni sezione riceve una modalità (testo a colonne, colonna con margine, dato in apertura,
  card, citazione grande, numeri chiave, tutta larghezza). Mai la stessa tre volte di fila; dopo circa due
  pagine fitte arriva una pagina che respira; le foto d'ambiente vanno in posti distanziati. Dopo la prima
  anteprima le sezioni che lasciano pagine quasi vuote si compattano da sole.
- **Brochure**: ogni sezione diventa una o più pagine. Il testo che non entra va nella pagina dopo, mai
  tagliato (stima in fase di import, poi misura nell'anteprima e divisione automatica). Fondi alternati
  (bianco, puntini, colore), card, griglie, numeri, citazioni, pagina prodotto per «sottotitolo + testo + 2-4 punti».
- **Import tollerante**: titoli riconosciuti anche senza stili (numerazione 1. / 1.1 / 1.1.1, righe brevi
  in grassetto o in maiuscolo), elenchi con trattini, citazioni tra virgolette, tabelle di numeri o anni.
- «Un'altra impaginazione» propone una variante con lo stesso contenuto; le scelte fatte a mano
  nell'Inspector restano («Lascia scegliere al tool» le riconsegna al regista).
- Nessun asset grafico si deforma: marchi, icone e loghi a misura fissa restano in proporzione.
