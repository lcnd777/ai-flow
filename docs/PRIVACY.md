# Confidentialité

- **Stocké localement** (`storage.local` du navigateur, sur cet appareil uniquement) :
  - pourcentages, dates de reset et libellés de quota ;
  - diagnostics : statut et code HTTP, jamais de réponse brute ;
  - réglages ;
  - historique de consommation des 7 derniers jours (pourcentages horodatés uniquement) ;
  - points de reprise que tu enregistres volontairement (ils peuvent contenir des extraits de conversation que tu as relus) ;
  - travaux interrompus par une limite : titre et lien de la conversation, sans son contenu ;
  - relances programmées (URL de la conversation et message choisi) ;
  - un identifiant d'organisation Claude et une empreinte courte du compte Codex, pour ne jamais mélanger deux comptes.
- **Jamais stocké** : mot de passe, cookie, jeton de session.
- **Contenu des conversations** : lu uniquement sur ton clic (« Transférer cette conversation », « Point de reprise »), pour l’onglet affiché seulement. Il reste en mémoire de la page de transfert et n’est conservé que si tu enregistres un point de reprise. AI Flow ne parcourt jamais tes autres conversations.
- **Jamais transmis** à un serveur AI Flow : il n'y en a pas. Les seules requêtes réseau sont les lectures de quota, faites par ton propre onglet vers la plateforme elle-même.
- **Transfert** : le message est copié dans ton presse-papiers et, si tu le choisis, inséré dans la zone de saisie de l’autre IA, **sans jamais être envoyé** à ta place.
- **App Mac** : elle reçoit l’heure de fin du maintien éveillé, le texte des notifications et, pour la barre de menus, un résumé des quotas (pourcentages, dates de reset, état). Aucun contenu de conversation. Le lien local `aiflow://` ou `aiflow-dev://` ne sort pas du Mac.
- **Pièces jointes** : seuls leurs noms sont lus (pour te signaler qu’elles ne sont pas transférées) ; leur contenu n’est jamais récupéré.
- **Effacement** : Paramètres › Données (relevés, historique). Les reprises se suppriment depuis le tableau de bord. Désinstaller l'extension efface tout.
