# 🎄 Carte de Noël animée

Un petit site pour créer et envoyer des cartes de vœux de Noël animées à ses proches.

- **Création** : destinataire, message (avec un bouton « Inspire-moi »), signature, 4 ambiances
  (Nuit étoilée, Rouge velours, Forêt enneigée, Givre), 5 illustrations animées
  (sapin, étoile, flocon, cadeau, bougie) et une boîte à musique optionnelle. Un aperçu en 3D se met à jour en direct.
- **Lecture** : une enveloppe flotte sous la neige. On brise le sceau de cire, le rabat s'ouvre, la lettre sort,
  puis la carte s'ouvre comme un livre. Une pluie d'étincelles accompagne le message, qui s'écrit à la machine.
  Il y a aussi des étoiles filantes et des aurores, et la neige suit le mouvement de la souris.

Tout tient dans trois fichiers statiques (`index.html`, `style.css`, `app.js`), sans dépendance ni serveur :
le contenu de la carte est encodé dans le lien lui-même (`…/#c=…`). La musique est synthétisée dans le navigateur
(Web Audio), donc il n'y a aucun fichier son.

## Tester en local

```bash
python3 -m http.server 8000
```

Puis ouvrir <http://localhost:8000>.

## Mettre en ligne gratuitement (GitHub Pages)

1. Fusionner ces fichiers sur la branche `main`.
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, choisir `main` et `/ (root)`.
3. Le site sera disponible après une minute environ, à l'adresse `https://<ton-pseudo>.github.io/no-l/`.

Les liens de cartes générés depuis cette adresse peuvent ensuite être envoyés par WhatsApp, SMS ou e-mail.
