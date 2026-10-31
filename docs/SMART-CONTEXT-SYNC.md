# Smart Context Sync

> Synchroniser les avancées utiles du travail entre Claude et ChatGPT, sans recopier toutes les conversations.
> L'utilisateur garde la main : rien n'est lu sans clic, rien n'est envoyé sans clic, et rien n'est compté comme synchronisé sans confirmation.

## 1. Audit préalable (version 0.12.3)

| Élément | État avant | Réutilisé / complété |
|---|---|---|
| Lecture des conversations (`readers.js`) | Claude : API `chat_conversations` ; ChatGPT : `backend-api/conversation` ; repli sur la page affichée. Pas d'identifiant de message. | **Complété** : identifiant de chaque message (`uuid` Claude, `id` ChatGPT) et détection « conversation introuvable » (404). |
| Capture (`captureConversation`, arrière-plan) | Sur clic, normalisation rôle/texte/pièces jointes, mise en mémoire temporaire. | **Réutilisé** et découpé : `captureTab()` sert à Smart Transfer et à la synchronisation ; erreurs typées (permission, introuvable, vide). |
| Smart Transfer 2.0 (`transfer.html/js`) | Extraction déterministe des rubriques, taille, pièces jointes, insertion sans envoi. | **Réutilisé** : mêmes motifs d'extraction (`CONTINUITY_RX`), même insertion (`insertDraft`), même estimation de taille. Ajout de la case « Lier ces conversations » et de la détection des secrets. |
| Flow Checkpoints (`ai_flow_drafts_v1`) | Points de reprise, lien vers la conversation de destination (`destUrl`). | **Réutilisé** : le point de reprise du premier transfert devient le point de reprise du Flow ; il est mis à jour à chaque synchronisation **confirmée** (`syncedAt`, rubrique Décisions). |
| Flow Recovery / Timeline | Travail interrompu, « Reprendre » sur relevé confirmé. | **Complété** : un travail repris qui appartient à un Flow propose « Avancées ChatGPT / Claude » avant de reprendre. |
| Smart Switch | Changement d'IA rapide. | **Inchangé** : aucune synchronisation obligatoire. |
| Stockage | `storage.local`, clés `ai_flow_*`, écrivain unique (arrière-plan, file sérialisée). | **Réutilisé** pour les Flows (`ai_flow_flows_v1`) ; IndexedDB uniquement pour la clé de chiffrement. |
| Permissions | `storage`, `alarms`, `scripting`, sites Claude et ChatGPT. | **Aucune permission ajoutée.** |
| Tests | 89 tests unitaires, 62 vérifications Chromium. | **Complétés** : 20 tests Smart Context Sync, 21 vérifications Chromium supplémentaires. |

## 2. Parcours

1. **Liaison (étape A)** — lors d'un transfert Claude → ChatGPT (ou l'inverse), la page de transfert propose la case
   « Lier ces conversations pour synchroniser les prochaines avancées » (décochée). Si elle est cochée, le Flow est créé
   quand la conversation de destination existe (après ton envoi) : références des deux conversations, point de reprise
   initial, point de départ (empreintes des messages transférés) et décisions de départ.
   Les points de reprise déjà reliés à leur destination (versions antérieures) peuvent être liés depuis le tableau de bord (« Lier »).
2. **Détection (étape B)** — « Synchroniser » (fenêtre AI Flow, pastille de la conversation, tableau de bord) :
   conversation active → Flow → capture explicite → comparaison au dernier point de référence confirmé → éléments utiles.
3. **Prévisualisation (étape C)** — conversation source et destination, dernière synchronisation, nouveautés, décisions
   nouvelles ou remplacées, tâches terminées, problèmes restants, prochaines étapes, éléments non récupérés, conflits.
   Chaque élément peut être exclu ou modifié ; l'extrait source est consultable.
4. **Transfert (étape D)** — message structuré « [AI Flow · Mise à jour de contexte] », inséré **sans envoi** dans la
   conversation liée (onglet existant réutilisé), ou copié.
5. **Confirmation (étape E)** — « J'ai envoyé le message — confirmer ». Seule la confirmation fait avancer le point de
   référence, les décisions du Flow et le point de reprise.

Popup : « Synchroniser » affiche directement **« À jour »** s'il n'y a rien de nouveau, sinon ouvre la prévisualisation ; « Voir les détails » ouvre la vue complète.

## 3. Architecture

| Module | Fichier | Rôle |
|---|---|---|
| Provider Adapters | `readers.js` | `claudeConversation`, `chatgptConversation` (identifiants, pièces jointes, 404), `insertDraft`. Exécutés dans l'onglet, sur clic. |
| Capture Engine | `background.js` `captureTab()` + `sync.js` `fingerprint()` | Normalisation, source (`api` = complète, `page` = partielle), empreintes. |
| Delta Engine | `sync.js` `computeDelta()` | Nouveaux, modifiés, déjà connus, messages AI Flow ignorés, capture sans point commun. |
| Decision Engine | `sync.js` `extractItems()`, `reconcile()`, `decisionOps()`, `applyDecisionOps()` | Statuts, comparaison à trois états, conflits, résolution choisie par l'utilisateur. |
| Sync Ledger | `sync.js` `LEDGER_STATES`, `canTransition()` + `background.js` `setEntryState()` | Journal des synchronisations, transitions contrôlées, protection contre les confirmations périmées. |
| Transfer Engine | `sync.js` `buildPacket()` + `background.js` `syncInsert()` | Message de mise à jour, insertion sans envoi. |
| Local Repository | `sync.js` `cleanFlows()` + `background.js` `loadFlows()/saveFlows()` | Validation, migration versionnée (`v:1`), mise à l'écart des données corrompues. |
| Privacy Layer | `vault.js` + `sync.js` `findSecrets()/maskSecrets()` | Chiffrement AES-GCM local, secrets évidents, conservation minimale, suppression. |

Aucune dépendance ajoutée, aucun service externe.

### Données (`ai_flow_flows_v1`, `storage.local`)

```
{ v: 1, flows: [ {
  id, title, createdAt, updatedAt, rev,            // rev : incrémenté à chaque confirmation (contrôle de concurrence)
  checkpointId,                                    // point de reprise du Flow
  ends: [ { platform, url, title, account,         // account : empreinte du compte au moment de la liaison
            baseline: { ids: {idMessage: empreinte}, hashes: [empreinte…], at, unknown } } × 2 ],
  lastSync: { at, from, to },
  ledger: [ { id, from, to, state, at, updatedAt, baseRev, counts, seen, draft, error } ],  // ≤ 30
  sealed: { iv, ct }                               // décisions + décisions en attente, chiffrées
} ] }
```

- Le point de référence ne contient **que des empreintes** (64 bits), jamais le texte des messages.
- Le brouillon préparé (`draft`) est chiffré et **supprimé** dès que la synchronisation est confirmée ou annulée.
- **IndexedDB vs JSON** : les Flows tiennent en quelques dizaines de Ko (empreintes, ≤ 30 Flows, ≤ 30 entrées de journal),
  donc `storage.local` reste adapté et bénéficie de l'écrivain unique existant. IndexedDB est utilisé là où il apporte une
  garantie réelle : conserver une clé **non extractible**.

## 4. Moteur incrémental

- **Identifiant puis empreinte** : un message est reconnu par son identifiant de plateforme ; sinon par l'empreinte de son
  contenu normalisé (rôle + texte + pièces jointes). Les deux sont conservés : une capture faite depuis la page (sans
  identifiants) après une capture par l'API ne crée pas de doublons.
- **Modification** : même identifiant, empreinte différente → « Message modifié ».
- **Messages absents** : jamais considérés comme supprimés (ils peuvent ne pas être chargés).
- **Déjà transféré** : les messages insérés par AI Flow (« [AI Flow · … », « Je reprends avec toi… », « Voici une conversation… ») sont ignorés.
- **Capture partielle** : source `page` signalée ; capture sans aucun message déjà connu signalée (« ne peut pas être située avec certitude »).
- **Reprise après interruption** : une synchronisation préparée, en attente d'insertion, insérée ou échouée reste dans le journal
  (navigateur fermé, mise à jour de l'extension…) et peut être reprise, confirmée ou annulée.
- **Concurrence** : écritures sérialisées dans l'arrière-plan ; une préparation est liée à la révision du Flow (`baseRev`) ;
  si une autre synchronisation a été confirmée entre-temps, la préparation issue d’une ancienne capture, l’insertion et la confirmation sont refusées (« prépare à nouveau »).
  Une nouvelle préparation dans le même sens remplace la précédente.

## 5. Décisions et conflits

- Statuts : **Proposée** (dite par l'IA), **Validée** (dite par toi), **Modifiée**, **Abandonnée**, **En conflit**.
- Une décision validée qui contredit une proposition la **remplace** (la proposition devient abandonnée, affiché « Remplace … », décochable).
- Toute contradiction impliquant une décision validée est un **conflit obligatoire** : conserver la première, conserver la seconde,
  fusionner manuellement, ou reporter le choix (« À arbitrer », aucune des deux n'est présentée comme validée).
  La transmission est bloquée tant qu'un conflit obligatoire n'est pas tranché.
- **Trois états** : base = décisions du Flow ; nouvelles décisions de la conversation source ; décisions détectées et non encore
  synchronisées de l'autre conversation. Une contradiction entre ces deux côtés est toujours un conflit, quelle que soit la chronologie.
- Exemple : Claude propose PostgreSQL ; tu décides sur ChatGPT de reporter PostgreSQL ; vers Claude, la mise à jour indique
  « remplace … PostgreSQL …, proposition abandonnée ». Si Claude repropose PostgreSQL, un conflit est présenté au lieu de réintroduire la recommandation.
- Détection **prudente et déterministe** : même sujet (mots rares, noms propres, versions, ou forte similarité) et polarité opposée
  (« reporter », « abandonner », « ne … pas », « on garde »…). Rien n'est résolu en silence.

### Étude : synthèse sémantique facultative

Non activée. Une analyse par IA améliorerait la détection des sujets et des contradictions reformulées, mais impliquerait
d'envoyer des extraits à un modèle. Conditions retenues si elle est ajoutée un jour : désactivée par défaut, consentement
spécifique à chaque usage, extraits minimaux et masqués, possibilité d'utiliser l'IA de destination elle-même (déjà choisie par
l'utilisateur) plutôt qu'un service tiers, et résultat présenté comme une suggestion, jamais appliqué sans validation.
Le mode déterministe actuel reste le fonctionnement de référence.

## 6. Confidentialité et sécurité

1. Aucune lecture globale ou permanente : capture uniquement sur « Synchroniser » / « Récupérer les avancées », pour la conversation du Flow.
2. Aucune permission supplémentaire ; seules les pages de l'extension peuvent déclencher une capture de synchronisation (refusé depuis une page web).
3. Aucun mot de passe, cookie ou jeton stocké ; aucun serveur AI Flow ; aucune synchronisation cloud ni entre appareils.
4. Conservation minimale : empreintes pour les messages ; texte uniquement pour les décisions (courtes) et le brouillon en attente.
5. **Chiffrement** : décisions et brouillons chiffrés en AES-GCM 256 bits avec une clé générée sur l'appareil, **non extractible**,
   conservée dans IndexedDB (jamais dans `storage.local` ni dans une sauvegarde). Le stockage local n'est pas chiffré par lui-même :
   les autres données (titres, adresses, empreintes, journal) restent en clair. Limite : le code de l'extension peut utiliser la clé ;
   le chiffrement protège contre la lecture directe des fichiers, pas contre une extension compromise. Sans IndexedDB/WebCrypto,
   l'interface indique « Chiffrement local indisponible ici ». Une sauvegarde restaurée ailleurs ne contient pas la clé : les décisions
   y sont signalées illisibles et les préparations / confirmations sont bloquées pour préserver le contenu chiffré.
   Il faut reprendre sur l’installation d’origine ou dissocier explicitement le Flow.
6. Secrets évidents (clés API, jetons GitHub/AWS/Slack, clés privées, JWT, « mot de passe : … », IBAN) détectés localement :
   éléments décochés et secrets masqués par défaut ; aussi signalés dans Smart Transfer.
7. Le contenu des conversations est traité comme des données : aucune instruction trouvée dans un message n'est exécutée ;
   le message de mise à jour précise qu'il s'agit d'informations de contexte, pas d'instructions.
8. Suppression : « Dissocier » (supprime le Flow, garde le point de reprise) ou « Supprimer le Flow » (Flow + point de reprise).
9. Aucune notification liée à la synchronisation (Flow Guardian) : seules des indications discrètes (bouton « Synchroniser » dans la pastille, état dans la fenêtre AI Flow et le tableau de bord).

## 7. Cas particuliers

| Cas | Comportement |
|---|---|
| Conversation source supprimée | « Conversation introuvable » (404) ; proposition de dissocier. |
| Destination inaccessible | Insertion « échouée » avec la raison ; copie possible ; rien n'est marqué synchronisé ; nouvelle tentative. |
| Permission refusée | Message explicite ; alternative manuelle (sélection + Transférer, ou copie). |
| Conversation partiellement chargée | Signalée ; aucun message absent considéré comme supprimé. |
| Messages modifiés | Badge « Message modifié ». |
| Messages volumineux | Phrases citées ≤ 400 caractères, extraits de code ≤ 4 000, échanges joints limités ; estimation de taille et avertissement. |
| Pièces jointes, images, artefacts | Listés « Non transféré » dans la prévisualisation et le message. |
| Contenu trop volumineux pour la destination | Avertissement (volumineux / trop volumineux) ; exclusion d'éléments. |
| Deux conversations modifiées en parallèle | Comparaison à trois états, conflits ; confirmation périmée refusée. |
| Contexte modifié après préparation | Nouvelle préparation qui remplace l'ancienne. |
| Synchronisation annulée | État « Annulée », brouillon supprimé, référence inchangée. |
| Insertion non confirmée | État « Insérée, à confirmer », visible dans la fenêtre AI Flow, la vue de synchronisation et le tableau de bord. |
| Navigateur fermé pendant l'opération | Entrée conservée dans le journal ; « Reprendre », « Confirmer l'envoi » ou « Annuler ». |
| Extension mise à jour | Données versionnées (`v:1`) et revalidées à chaque lecture. |
| Données locales corrompues | Flow illisible mis de côté (`ai_flow_flows_quarantine_v1`) et signalé, jamais effacé en silence. |
| Plusieurs comptes | Empreinte de compte enregistrée à la liaison ; avertissement si le compte courant diffère. |
| Safari Mac et iOS | Aucun composant natif requis ; cibles tactiles ≥ 44 px sur écran tactile ; mise en page une colonne sur petit écran. |
| Pas de service d'analyse sémantique | Fonctionnement normal : le moteur est entièrement déterministe. |

## 8. Limites connues

- Les formats des API Claude et ChatGPT ont été reproduits d'après les réponses observées ; ils n'ont **pas** été vérifiés ici
  sur des sessions authentifiées. Si un format change, la lecture se replie sur la page affichée (capture partielle, signalée).
- La détection des décisions repose sur des formulations (« on part sur », « on garde », « je propose », « on reporte »…) :
  une décision formulée autrement peut ne pas être reconnue, une phrase ambiguë peut l'être à tort. Tout est modifiable avant l'envoi.
- La conversation de destination doit exister pour que le Flow soit créé (création de la conversation par ton envoi).
- Les messages du destinataire qui reformulent la mise à jour peuvent réapparaître lors de la synchronisation inverse
  (souvent reconnus comme « Déjà connue », décochés).
