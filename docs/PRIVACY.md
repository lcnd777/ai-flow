# Confidentialité

- **Stocké localement** (`storage.local` du navigateur, sur cet appareil uniquement) :
  - pourcentages, dates de reset et libellés de quota ;
  - diagnostics : statut et code HTTP, jamais de réponse brute ;
  - réglages ;
  - reprises de travail que tu enregistres volontairement ;
  - relances programmées (URL de la conversation et message choisi) ;
  - un identifiant d'organisation Claude et une empreinte courte du compte Codex, pour ne jamais mélanger deux comptes.
- **Jamais stocké** : mot de passe, cookie, jeton de session, contenu de conversation.
- **Jamais transmis** à un serveur AI Flow : il n'y en a pas. Les seules requêtes réseau sont les lectures de quota, faites par ton propre onglet vers la plateforme elle-même.
- **Transfert** : seul le texte que tu sélectionnes (au clic sur « Transférer ») ou que tu écris est utilisé. La copie passe par ton presse-papiers, et rien n'est envoyé à l'autre IA sans ton action.
- **App Mac** : elle reçoit seulement l'heure de fin du maintien éveillé et le texte des notifications. Le lien local `aiflow://` ne sort pas du Mac.
- **Effacement** : Paramètres › Données (relevés, historique). Les reprises se suppriment depuis le tableau de bord. Désinstaller l'extension efface tout.
